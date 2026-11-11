// AI noise suppression (RNNoise, a small recurrent neural network trained to separate speech from
// everything else — keyboard, fans, breathing, room noise). It runs in an AudioWorklet, i.e. on the
// audio thread, so it keeps working while the window is in the background.
//
// The WASM build comes from @jitsi/rnnoise-wasm (Apache-2.0), loaded lazily: the ~2 MB module is only
// fetched the first time someone joins a call with the feature turned on.

export const RNNOISE_PROCESSOR_NAME = "shmirka-rnnoise";

// RNNoise works on 10 ms frames of 48 kHz mono audio: 480 samples, scaled to the 16-bit range.
const PROCESSOR_SOURCE = `
const FRAME = 480;
class RnnoiseProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ready = false;
    this.enabled = true;
    this.inBuf = new Float32Array(FRAME);
    this.inFill = 0;
    this.ring = new Float32Array(4096);
    this.ringRead = 0;
    this.ringWrite = FRAME; // 480 samples of silence up front: 10 ms of latency that guarantees no underrun
    try {
      const m = createRNNWasmModuleSync();
      this.m = m;
      this.ptr = m._malloc(FRAME * 4);
      this.idx = this.ptr >> 2;
      this.state = m._rnnoise_create();
      this.ready = true;
    } catch (e) {
      this.port.postMessage({ error: String(e) });
    }
    this.port.onmessage = (e) => {
      if (typeof e.data.enabled === "boolean") this.enabled = e.data.enabled;
    };
  }
  denoiseFrame() {
    const heap = this.m.HEAPF32;
    for (let i = 0; i < FRAME; i++) heap[this.idx + i] = this.inBuf[i] * 32768;
    this.m._rnnoise_process_frame(this.state, this.ptr, this.ptr);
    const size = this.ring.length;
    for (let i = 0; i < FRAME; i++) {
      this.ring[this.ringWrite] = heap[this.idx + i] / 32768;
      this.ringWrite = (this.ringWrite + 1) % size;
    }
  }
  process(inputs, outputs) {
    const input = inputs[0] && inputs[0][0];
    const output = outputs[0] && outputs[0][0];
    if (!output) return true;
    if (!input) { output.fill(0); return true; }
    if (!this.ready || !this.enabled) { output.set(input); return true; }
    const size = this.ring.length;
    for (let i = 0; i < input.length; i++) {
      this.inBuf[this.inFill++] = input[i];
      if (this.inFill === FRAME) { this.denoiseFrame(); this.inFill = 0; }
    }
    for (let i = 0; i < output.length; i++) {
      output[i] = this.ring[this.ringRead];
      this.ringRead = (this.ringRead + 1) % size;
    }
    return true;
  }
}
registerProcessor("${RNNOISE_PROCESSOR_NAME}", RnnoiseProcessor);
`;

let sourcePromise: Promise<string> | null = null;

/** Full worklet module source (WASM glue + processor), or rejects if it can't be loaded. */
export function loadRnnoiseWorkletSource(): Promise<string> {
  if (!sourcePromise) {
    sourcePromise = import("@jitsi/rnnoise-wasm/dist/rnnoise-sync.js?raw")
      .then((mod) => {
        // The glue is an ES module that exports its factory; inside a worklet we just need the function.
        const glue = (mod.default as string)
          .replace(/import\.meta\.url/g, '""')
          .replace(/export default createRNNWasmModuleSync;?/, "");
        return glue + "\n" + PROCESSOR_SOURCE;
      })
      .catch((err) => {
        sourcePromise = null; // allow a retry on the next join
        throw err;
      });
  }
  return sourcePromise;
}
