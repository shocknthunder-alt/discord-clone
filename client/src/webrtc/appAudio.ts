// Desktop app only: turns the raw PCM the native shell captures for the shared window/screen
// (16-bit stereo 48 kHz, see desktop/appAudio.js) into a MediaStreamTrack that can be added to the
// screen-share stream next to the video.

const WORKLET_SOURCE = `
class PcmPlayer extends AudioWorkletProcessor {
  constructor() {
    super();
    this.capacity = sampleRate * 2; // 2 s ring buffer per channel
    this.left = new Float32Array(this.capacity);
    this.right = new Float32Array(this.capacity);
    this.read = 0;
    this.write = 0;
    this.size = 0;
    this.maxLatency = Math.round(sampleRate * 0.25);
    this.port.onmessage = (e) => {
      const pcm = new Int16Array(e.data);
      for (let i = 0; i + 1 < pcm.length; i += 2) {
        this.left[this.write] = pcm[i] / 32768;
        this.right[this.write] = pcm[i + 1] / 32768;
        this.write = (this.write + 1) % this.capacity;
        if (this.size < this.capacity) this.size++;
        else this.read = (this.read + 1) % this.capacity;
      }
      // Never drift: if the sender got ahead, drop the oldest audio instead of adding delay.
      if (this.size > this.maxLatency) {
        const drop = this.size - Math.round(this.maxLatency / 2);
        this.read = (this.read + drop) % this.capacity;
        this.size -= drop;
      }
    };
  }
  process(inputs, outputs) {
    const out = outputs[0];
    const l = out[0];
    const r = out[1] || out[0];
    for (let i = 0; i < l.length; i++) {
      if (this.size > 0) {
        l[i] = this.left[this.read];
        r[i] = this.right[this.read];
        this.read = (this.read + 1) % this.capacity;
        this.size--;
      } else {
        l[i] = 0;
        r[i] = 0;
      }
    }
    return true;
  }
}
registerProcessor("shmirka-pcm-player", PcmPlayer);
`;

let context: AudioContext | null = null;
let unsubscribe: (() => void) | null = null;

/** Starts feeding the native capture into a new audio track. Resolves null if it can't be set up. */
export async function startNativeAppAudio(): Promise<MediaStreamTrack | null> {
  const desktop = window.shmirkaDesktop;
  if (!desktop || typeof desktop.onAppAudio !== "function") return null;
  releaseLocal();
  try {
    const ctx = new AudioContext({ sampleRate: 48000 });
    const url = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: "application/javascript" }));
    try {
      await ctx.audioWorklet.addModule(url);
    } finally {
      URL.revokeObjectURL(url);
    }
    const node = new AudioWorkletNode(ctx, "shmirka-pcm-player", { numberOfInputs: 0, outputChannelCount: [2] });
    const destination = ctx.createMediaStreamDestination();
    node.connect(destination);
    context = ctx;
    unsubscribe = desktop.onAppAudio((data) => {
      // Copy into a fresh ArrayBuffer and hand it over to the audio thread.
      const copy = data.slice().buffer;
      node.port.postMessage(copy, [copy]);
    });
    return destination.stream.getAudioTracks()[0] ?? null;
  } catch (err) {
    console.warn("native app audio unavailable", err);
    stopNativeAppAudio();
    return null;
  }
}

// Tears down the page side only (the shell keeps capturing) — used when (re)starting.
function releaseLocal() {
  unsubscribe?.();
  unsubscribe = null;
  void context?.close();
  context = null;
}

/** Stops the page side and tells the shell to stop capturing. */
export function stopNativeAppAudio() {
  releaseLocal();
  // Older installed desktop shells don't have this method; never let that break leaving a call.
  try {
    window.shmirkaDesktop?.stopAppAudio?.();
  } catch {
    // ignore
  }
}
