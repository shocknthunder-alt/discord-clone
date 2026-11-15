/// <reference lib="webworker" />
/**
 * Clip buffer worker: encodes the watched stream with WebCodecs (H.264 on the GPU when it can,
 * a keyframe every second) and keeps the last ~35 s of encoded chunks. "clip" muxes the last
 * N seconds, starting at a keyframe, into a WebM.
 */
import { muxWebm, type MuxChunk } from "./webmMux";

const KEEP_US = 35_000_000;
const KEY_EVERY_US = 1_000_000;

const ctx = self as unknown as DedicatedWorkerGlobalScope;

let stopped = false;
let video: (MuxChunk & { w: number; h: number })[] = [];
let audio: MuxChunk[] = [];
let avcC: Uint8Array | null = null;
let audioInfo: { sampleRate: number; channels: number } | null = null;
let venc: VideoEncoder | null = null;
let aenc: AudioEncoder | null = null;
let encW = 0;
let encH = 0;
let lastKey = -Infinity;
let videoOffset: number | null = null;
let audioOffset: number | null = null;

const nowUs = () => performance.now() * 1000;

function prune() {
  const newest = video.length ? video[video.length - 1].ts : 0;
  const cut = newest - KEEP_US;
  // Keep from a keyframe so the oldest part is still decodable.
  let i = 0;
  while (i < video.length && video[i].ts < cut) i++;
  while (i > 0 && !video[i]?.key) i--;
  if (i > 0) video = video.slice(i);
  const firstTs = video[0]?.ts ?? newest;
  if (audio.length && audio[0].ts < firstTs - 1_000_000) audio = audio.filter((c) => c.ts >= firstTs - 1_000_000);
}

async function pickCodec(w: number, h: number): Promise<VideoEncoderConfig | null> {
  for (const codec of ["avc1.640034", "avc1.4d0034", "avc1.42003e", "avc1.42002a"]) {
    for (const hardwareAcceleration of ["prefer-hardware", "no-preference"] as const) {
      const cfg: VideoEncoderConfig = {
        codec,
        width: w,
        height: h,
        bitrate: 6_000_000,
        framerate: 60,
        latencyMode: "realtime",
        hardwareAcceleration,
        avc: { format: "avc" },
      };
      try {
        const r = await VideoEncoder.isConfigSupported(cfg);
        if (r.supported) return cfg;
      } catch {
        /* next */
      }
    }
  }
  return null;
}

async function configureVideo(w: number, h: number) {
  if (venc) {
    try {
      venc.close();
    } catch {
      /* closed */
    }
  }
  venc = null;
  video = [];
  avcC = null;
  lastKey = -Infinity;
  const cfg = await pickCodec(w, h);
  if (!cfg) throw new Error("no H.264 encoder");
  const W = w;
  const H = h;
  venc = new VideoEncoder({
    output: (chunk, meta) => {
      const desc = meta?.decoderConfig?.description;
      if (desc) {
        const view = desc instanceof ArrayBuffer ? new Uint8Array(desc) : new Uint8Array((desc as ArrayBufferView).buffer, (desc as ArrayBufferView).byteOffset, (desc as ArrayBufferView).byteLength);
        avcC = view.slice();
      }
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      video.push({ ts: chunk.timestamp, key: chunk.type === "key", data, w: W, h: H });
      prune();
    },
    error: (e) => console.warn("clip video encoder", e),
  });
  venc.configure(cfg);
  encW = w;
  encH = h;
}

async function readVideo(stream: ReadableStream<VideoFrame>) {
  const reader = stream.getReader();
  let configuring: Promise<void> | null = null;
  while (!stopped) {
    const { value: frame, done } = await reader.read();
    if (done || !frame) break;
    try {
      const w = frame.displayWidth & ~1;
      const h = frame.displayHeight & ~1;
      if (!w || !h) continue;
      if (w !== encW || h !== encH) {
        if (!configuring) configuring = configureVideo(w, h).finally(() => (configuring = null));
        await configuring.catch(() => {});
      }
      if (!venc || venc.state !== "configured" || venc.encodeQueueSize > 8) continue; // drop when behind
      if (videoOffset === null) videoOffset = nowUs() - frame.timestamp;
      const ts = frame.timestamp + videoOffset;
      const key = ts - lastKey >= KEY_EVERY_US;
      if (key) lastKey = ts;
      const f = new VideoFrame(frame, { timestamp: ts });
      venc.encode(f, { keyFrame: key });
      f.close();
    } catch (err) {
      console.warn("clip frame", err);
    } finally {
      frame.close();
    }
  }
  reader.releaseLock();
}

async function readAudio(stream: ReadableStream<AudioData>) {
  const reader = stream.getReader();
  while (!stopped) {
    const { value: data, done } = await reader.read();
    if (done || !data) break;
    try {
      if (!aenc) {
        const cfg: AudioEncoderConfig = { codec: "opus", sampleRate: 48000, numberOfChannels: Math.min(data.numberOfChannels, 2), bitrate: 128_000 };
        if (data.sampleRate !== 48000 || !(await AudioEncoder.isConfigSupported(cfg)).supported) {
          data.close();
          reader.releaseLock();
          return; // no audio in clips — video still works
        }
        audioInfo = { sampleRate: 48000, channels: cfg.numberOfChannels };
        aenc = new AudioEncoder({
          output: (chunk) => {
            const bytes = new Uint8Array(chunk.byteLength);
            chunk.copyTo(bytes);
            audio.push({ ts: chunk.timestamp, key: true, data: bytes });
          },
          error: (e) => console.warn("clip audio encoder", e),
        });
        aenc.configure(cfg);
      }
      if (audioOffset === null) audioOffset = nowUs() - data.timestamp;
      if (data.numberOfChannels > 2) {
        data.close();
        continue;
      }
      // Re-stamp onto the shared clock (copy is cheap: ~10 ms of samples).
      const frames = data.numberOfFrames;
      const ch = data.numberOfChannels;
      const buf = new Float32Array(frames * ch);
      for (let c = 0; c < ch; c++) data.copyTo(buf.subarray(c * frames, (c + 1) * frames), { planeIndex: c, format: "f32-planar" });
      const restamped = new AudioData({
        format: "f32-planar",
        sampleRate: data.sampleRate,
        numberOfFrames: frames,
        numberOfChannels: ch,
        timestamp: data.timestamp + audioOffset,
        data: buf,
      });
      if (aenc.encodeQueueSize < 50) aenc.encode(restamped);
      restamped.close();
    } catch (err) {
      console.warn("clip audio", err);
    } finally {
      try {
        data.close();
      } catch {
        /* closed */
      }
    }
  }
  reader.releaseLock();
}

function makeClip(seconds: number): { buffer: ArrayBuffer; seconds: number } | null {
  if (!video.length || !avcC) return null;
  const newest = video[video.length - 1].ts;
  const from = newest - seconds * 1_000_000;
  // The first keyframe at/after `from` (or the earliest one we have).
  let start = video.findIndex((c) => c.key && c.ts >= from);
  if (start < 0) start = video.findIndex((c) => c.key);
  if (start < 0) return null;
  const v = video.slice(start);
  const { w, h } = v[0];
  const sameSize = v.filter((c) => c.w === w && c.h === h);
  const t0 = sameSize[0].ts;
  const a = audioInfo ? audio.filter((c) => c.ts >= t0 && c.ts <= newest) : [];
  const bytes = muxWebm({
    width: w,
    height: h,
    avcC,
    video: sameSize,
    audio: audioInfo && a.length ? { ...audioInfo, chunks: a } : undefined,
  });
  return { buffer: bytes.buffer as ArrayBuffer, seconds: Math.round((newest - t0) / 1_000_000) };
}

ctx.onmessage = (e: MessageEvent) => {
  const msg = e.data as
    | { type: "start"; video: ReadableStream<VideoFrame>; audio?: ReadableStream<AudioData> }
    | { type: "clip"; seconds: number; id: number }
    | { type: "stop" };
  if (msg.type === "start") {
    void readVideo(msg.video);
    if (msg.audio) void readAudio(msg.audio);
  } else if (msg.type === "clip") {
    try {
      const c = makeClip(msg.seconds);
      if (c) ctx.postMessage({ type: "clip", id: msg.id, buffer: c.buffer, seconds: c.seconds }, [c.buffer]);
      else ctx.postMessage({ type: "clip", id: msg.id, buffer: null });
    } catch (err) {
      console.warn("clip mux", err);
      ctx.postMessage({ type: "clip", id: msg.id, buffer: null });
    }
  } else if (msg.type === "stop") {
    stopped = true;
    try {
      venc?.close();
      aenc?.close();
    } catch {
      /* closed */
    }
    video = [];
    audio = [];
    ctx.close();
  }
};
