// Builds a Web Audio processing chain for the local mic — highpass filter + a noise gate —
// and produces a second MediaStream carrying the *processed* output, which is what actually
// gets sent to the SFU. The raw getUserMedia stream is left completely alone (still used for
// local self-speaking-indicator detection, and muting still works by disabling its track,
// which correctly propagates silence through this graph too — see controls.destroy below).
//
// The gate runs inside an AudioWorklet, i.e. on the audio thread. The previous version measured
// the level from requestAnimationFrame, which the browser stops while the window is in the
// background (minimised, behind a fullscreen game) — the gate then froze open and every breath
// and keystroke went out. The worklet also delays the audio by a few ms ("lookahead") so the gate
// is already open when a word starts, which lets the threshold be stricter without clipping words.

export interface MicProcessingOptions {
  highpassEnabled: boolean;
  noiseGateEnabled: boolean;
  noiseGateSensitivity: number; // 0-100, see devicePrefs.ts
}

export interface MicProcessingHandle {
  outputTrack: MediaStreamTrack;
  setHighpassEnabled: (enabled: boolean) => void;
  setNoiseGateEnabled: (enabled: boolean) => void;
  setNoiseGateSensitivity: (sensitivity: number) => void;
  destroy: () => void;
}

// sensitivity 0 -> -30dB (only loud, clearly-intentional speech opens the gate)
// sensitivity 100 -> -60dB (opens easily, picks up quieter speech too)
function sensitivityToThresholdDb(sensitivity: number): number {
  const clamped = Math.min(Math.max(sensitivity, 0), 100);
  return -60 + ((100 - clamped) / 100) * 30;
}

// The gate closes this far BELOW the level that opened it (hysteresis): speech has to be
// clearly above the threshold to open, but may trail off quietly without being chopped, while
// breathing hovering around the threshold doesn't make the gate flutter.
const CLOSE_BELOW_OPEN_DB = 6;

const GATE_WORKLET_SOURCE = `
class GateProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.enabled = true;
    this.openDb = -40;
    this.closeDb = -46;
    this.isOpen = false;
    this.holdLeft = 0;
    this.gain = 1;
    this.power = 0;
    // 20 ms level window, 5 ms attack, 80 ms release, 200 ms hold, 25 ms lookahead.
    this.levelCoef = Math.exp(-1 / (sampleRate * 0.02));
    this.attackCoef = 1 - Math.exp(-1 / (sampleRate * 0.005));
    this.releaseCoef = 1 - Math.exp(-1 / (sampleRate * 0.08));
    this.holdSamples = Math.round(sampleRate * 0.2);
    this.delay = new Float32Array(Math.round(sampleRate * 0.025) + 1);
    this.pos = 0;
    this.port.onmessage = (e) => {
      const m = e.data;
      if (typeof m.enabled === "boolean") this.enabled = m.enabled;
      if (typeof m.openDb === "number") this.openDb = m.openDb;
      if (typeof m.closeDb === "number") this.closeDb = m.closeDb;
    };
  }
  process(inputs, outputs) {
    const input = inputs[0] && inputs[0][0];
    const output = outputs[0] && outputs[0][0];
    if (!output) return true;
    if (!input) { output.fill(0); return true; }
    const n = input.length;
    const len = this.delay.length;
    for (let i = 0; i < n; i++) {
      const x = input[i];
      // Level is measured on the live (undelayed) signal...
      this.power = this.power * this.levelCoef + x * x * (1 - this.levelCoef);
      const db = this.power > 1e-12 ? 10 * Math.log10(this.power) : -120;
      if (!this.isOpen) {
        if (db > this.openDb) { this.isOpen = true; this.holdLeft = this.holdSamples; }
      } else if (db > this.closeDb) {
        this.holdLeft = this.holdSamples;
      } else if (--this.holdLeft <= 0) {
        this.isOpen = false;
      }
      const target = !this.enabled || this.isOpen ? 1 : 0;
      this.gain += (target - this.gain) * (target === 1 ? this.attackCoef : this.releaseCoef);
      // ...but applied to the delayed one, so the gate is open before the word reaches the output.
      this.delay[this.pos] = x;
      this.pos = (this.pos + 1) % len;
      output[i] = this.delay[this.pos] * this.gain;
    }
    return true;
  }
}
registerProcessor("shmirka-gate", GateProcessor);
`;

export function startMicProcessing(rawStream: MediaStream, options: MicProcessingOptions): MicProcessingHandle {
  const audioContext = new AudioContext();
  if (audioContext.state === "suspended") void audioContext.resume();
  const source = audioContext.createMediaStreamSource(rawStream);

  const highpass = audioContext.createBiquadFilter();
  highpass.type = "highpass";
  highpass.frequency.value = 100;

  const destination = audioContext.createMediaStreamDestination();

  let highpassEnabled = options.highpassEnabled;
  let noiseGateEnabled = options.noiseGateEnabled;
  let thresholdDb = sensitivityToThresholdDb(options.noiseGateSensitivity);
  let gateNode: AudioWorkletNode | null = null;
  let destroyed = false;

  function pushGateSettings() {
    gateNode?.port.postMessage({
      enabled: noiseGateEnabled,
      openDb: thresholdDb,
      closeDb: thresholdDb - CLOSE_BELOW_OPEN_DB,
    });
  }

  // The highpass is a real bypass (reconnected in/out of the chain), not just a flag, since
  // a disabled BiquadFilterNode still processes audio — only unrouting it is a true no-op.
  // Until the gate worklet has loaded (a few ms) — or if it can't load — audio flows straight
  // through ungated, so the mic is never silent.
  function connectGraph() {
    source.disconnect();
    highpass.disconnect();
    gateNode?.disconnect();
    const head: AudioNode = highpassEnabled ? highpass : source;
    if (highpassEnabled) source.connect(highpass);
    if (gateNode) {
      head.connect(gateNode);
      gateNode.connect(destination);
    } else {
      head.connect(destination);
    }
  }
  connectGraph();

  const moduleUrl = URL.createObjectURL(new Blob([GATE_WORKLET_SOURCE], { type: "application/javascript" }));
  audioContext.audioWorklet
    .addModule(moduleUrl)
    .then(() => {
      if (destroyed) return;
      gateNode = new AudioWorkletNode(audioContext, "shmirka-gate", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        channelCount: 1,
        channelCountMode: "explicit",
      });
      pushGateSettings();
      connectGraph();
    })
    .catch((err) => console.warn("noise gate unavailable — mic is sent ungated", err))
    .finally(() => URL.revokeObjectURL(moduleUrl));

  const outputTrack = destination.stream.getAudioTracks()[0];

  return {
    outputTrack,
    setHighpassEnabled: (enabled) => {
      highpassEnabled = enabled;
      connectGraph();
    },
    setNoiseGateEnabled: (enabled) => {
      noiseGateEnabled = enabled;
      pushGateSettings();
    },
    setNoiseGateSensitivity: (sensitivity) => {
      thresholdDb = sensitivityToThresholdDb(sensitivity);
      pushGateSettings();
    },
    destroy: () => {
      destroyed = true;
      source.disconnect();
      highpass.disconnect();
      gateNode?.disconnect();
      void audioContext.close();
    },
  };
}
