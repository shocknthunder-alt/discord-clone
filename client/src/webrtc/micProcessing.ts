// Builds a Web Audio processing chain for the local mic — highpass filter + a noise gate —
// and produces a second MediaStream carrying the *processed* output, which is what actually
// gets sent to the SFU. The raw getUserMedia stream is left completely alone (still used for
// local self-speaking-indicator detection, and muting still works by disabling its track,
// which correctly propagates silence through this graph too — see controls.destroy below).

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

// Fast attack (don't clip the start of a word), slow-ish release (don't chop trailing
// syllables or chatter mid-sentence pauses) — the same shape as a hardware noise gate.
const ATTACK_SECONDS = 0.01;
const RELEASE_SECONDS = 0.25;
const ANALYSER_FFT_SIZE = 1024;

export function startMicProcessing(rawStream: MediaStream, options: MicProcessingOptions): MicProcessingHandle {
  const audioContext = new AudioContext();
  if (audioContext.state === "suspended") void audioContext.resume();
  const source = audioContext.createMediaStreamSource(rawStream);

  const highpass = audioContext.createBiquadFilter();
  highpass.type = "highpass";
  highpass.frequency.value = 100;

  const gateGain = audioContext.createGain();
  gateGain.gain.value = 1;

  const analyser = audioContext.createAnalyser();
  analyser.fftSize = ANALYSER_FFT_SIZE;
  const timeDomainData = new Uint8Array(analyser.fftSize);

  const destination = audioContext.createMediaStreamDestination();

  let highpassEnabled = options.highpassEnabled;
  let noiseGateEnabled = options.noiseGateEnabled;
  let thresholdDb = sensitivityToThresholdDb(options.noiseGateSensitivity);

  // The highpass is a real bypass (reconnected in/out of the chain), not just a flag, since
  // a disabled BiquadFilterNode still processes audio — only unrouting it is a true no-op.
  function connectGraph() {
    source.disconnect();
    highpass.disconnect();
    if (highpassEnabled) {
      source.connect(highpass);
      highpass.connect(analyser);
      highpass.connect(gateGain);
    } else {
      source.connect(analyser);
      source.connect(gateGain);
    }
  }
  connectGraph();
  gateGain.connect(destination);

  let rafId: number;
  function tick() {
    if (noiseGateEnabled) {
      analyser.getByteTimeDomainData(timeDomainData);
      let sumSquares = 0;
      for (let i = 0; i < timeDomainData.length; i++) {
        const normalized = (timeDomainData[i] - 128) / 128;
        sumSquares += normalized * normalized;
      }
      const rms = Math.sqrt(sumSquares / timeDomainData.length);
      const db = rms > 0 ? 20 * Math.log10(rms) : -100;
      const target = db > thresholdDb ? 1 : 0;
      const now = audioContext.currentTime;
      gateGain.gain.setTargetAtTime(target, now, target === 1 ? ATTACK_SECONDS : RELEASE_SECONDS);
    } else if (gateGain.gain.value !== 1) {
      gateGain.gain.setTargetAtTime(1, audioContext.currentTime, ATTACK_SECONDS);
    }
    rafId = requestAnimationFrame(tick);
  }
  tick();

  const outputTrack = destination.stream.getAudioTracks()[0];

  return {
    outputTrack,
    setHighpassEnabled: (enabled) => {
      highpassEnabled = enabled;
      connectGraph();
    },
    setNoiseGateEnabled: (enabled) => {
      noiseGateEnabled = enabled;
    },
    setNoiseGateSensitivity: (sensitivity) => {
      thresholdDb = sensitivityToThresholdDb(sensitivity);
    },
    destroy: () => {
      cancelAnimationFrame(rafId);
      source.disconnect();
      highpass.disconnect();
      analyser.disconnect();
      gateGain.disconnect();
      void audioContext.close();
    },
  };
}
