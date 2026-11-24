/**
 * "Clip the last 30 seconds" of a stream we're watching.
 *
 * A worker (clipWorker.ts) re-encodes the stream with WebCodecs — H.264 on the GPU when possible,
 * with a keyframe every second that WE request (MediaRecorder ignored that request, so its clips
 * could start only a few seconds back) — and keeps ~35 s of encoded data (~25 MB at 6 Mbps).
 * A clip is muxed into a WebM starting at the keyframe nearest to "30 s ago".
 */

export const CLIP_SECONDS = 30;

declare const MediaStreamTrackProcessor: {
  new (init: { track: MediaStreamTrack }): { readable: ReadableStream };
};

export function clipsSupported(): boolean {
  return typeof window !== "undefined" && "MediaStreamTrackProcessor" in window && "VideoEncoder" in window && typeof Worker !== "undefined";
}

/**
 * One audio track for the clip: the stream's own sound (the game) + the voices of the call,
 * mixed in WebAudio. Voices come and go (people join/leave, mute) — re-checked every 2 s.
 */
class ClipAudioMix {
  private ctx: AudioContext;
  private dest: MediaStreamAudioDestinationNode;
  private bus: GainNode;
  private sources = new Map<string, { node: MediaStreamAudioSourceNode; gain: GainNode }>();
  private timer: ReturnType<typeof setInterval>;

  constructor(
    private stream: MediaStream,
    private voices: () => MediaStreamTrack[],
  ) {
    this.ctx = new AudioContext({ sampleRate: 48000 });
    this.dest = this.ctx.createMediaStreamDestination();
    this.dest.channelCount = 2;
    // Several loud voices + a loud game would clip; a gentle limiter keeps the sum clean.
    const limiter = this.ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 6;
    limiter.ratio.value = 8;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.2;
    this.bus = this.ctx.createGain();
    this.bus.connect(limiter).connect(this.dest);
    this.sync();
    this.timer = setInterval(() => this.sync(), 2000);
  }

  get track(): MediaStreamTrack {
    return this.dest.stream.getAudioTracks()[0];
  }

  resume() {
    if (this.ctx.state === "suspended") void this.ctx.resume().catch(() => {});
  }

  private sync() {
    this.resume();
    const want = new Map<string, { track: MediaStreamTrack; level: number }>();
    for (const t of this.stream.getAudioTracks()) if (t.readyState === "live") want.set(t.id, { track: t, level: 1 });
    for (const t of this.voices()) if (t.readyState === "live" && !want.has(t.id)) want.set(t.id, { track: t, level: 1.1 });
    for (const [id, s] of this.sources) {
      if (want.has(id)) continue;
      s.node.disconnect();
      s.gain.disconnect();
      this.sources.delete(id);
    }
    for (const [id, { track, level }] of want) {
      if (this.sources.has(id)) continue;
      try {
        const node = this.ctx.createMediaStreamSource(new MediaStream([track]));
        const gain = this.ctx.createGain();
        gain.gain.value = level;
        node.connect(gain).connect(this.bus);
        this.sources.set(id, { node, gain });
      } catch (err) {
        console.warn("clip audio source", err);
      }
    }
  }

  stop() {
    clearInterval(this.timer);
    for (const s of this.sources.values()) {
      s.node.disconnect();
      s.gain.disconnect();
    }
    this.sources.clear();
    this.dest.stream.getTracks().forEach((t) => t.stop());
    void this.ctx.close().catch(() => {});
  }
}

export class ClipBuffer {
  private worker: Worker | null = null;
  private tracks: MediaStreamTrack[] = [];
  private mix: ClipAudioMix | null = null;
  private nextId = 1;
  private pending = new Map<number, (r: { blob: Blob; seconds: number } | null) => void>();

  /** `voices`: the call's voice tracks to mix in (asked again every 2 s); none = stream sound only. */
  constructor(
    private stream: MediaStream,
    private voices?: () => MediaStreamTrack[],
  ) {}

  start() {
    if (this.worker || !clipsSupported()) return;
    const videoTrack = this.stream.getVideoTracks()[0];
    if (!videoTrack) return;
    try {
      // Clones: reading frames here must never disturb the <video> showing the stream.
      const v = videoTrack.clone();
      let a: MediaStreamTrack | null = null;
      if (this.voices) {
        try {
          this.mix = new ClipAudioMix(this.stream, this.voices);
          a = this.mix.track;
        } catch (err) {
          console.warn("clip audio mix unavailable", err);
          this.mix = null;
        }
      }
      if (!a) {
        const audioTrack = this.stream.getAudioTracks()[0];
        a = audioTrack ? audioTrack.clone() : null;
      }
      this.tracks = a ? [v, a] : [v];
      const video = new MediaStreamTrackProcessor({ track: v }).readable;
      const audio = a ? new MediaStreamTrackProcessor({ track: a }).readable : undefined;
      this.worker = new Worker(new URL("./clipWorker.ts", import.meta.url), { type: "module" });
      this.worker.onmessage = (e: MessageEvent) => {
        const m = e.data as { type: string; id: number; buffer: ArrayBuffer | null; seconds?: number };
        if (m.type !== "clip") return;
        const done = this.pending.get(m.id);
        this.pending.delete(m.id);
        done?.(m.buffer ? { blob: new Blob([m.buffer], { type: "video/webm" }), seconds: m.seconds ?? CLIP_SECONDS } : null);
      };
      this.worker.postMessage({ type: "start", video, audio }, audio ? [video, audio] : [video]);
    } catch (err) {
      console.warn("clip buffer unavailable", err);
      this.stop();
    }
  }

  /** The last ~30 s as a playable WebM (null if nothing is buffered yet). */
  clip(): Promise<{ blob: Blob; seconds: number } | null> {
    const w = this.worker;
    if (!w) return Promise.resolve(null);
    this.mix?.resume();
    const id = this.nextId++;
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      w.postMessage({ type: "clip", id, seconds: CLIP_SECONDS });
      setTimeout(() => {
        if (this.pending.delete(id)) resolve(null);
      }, 10_000);
    });
  }

  stop() {
    this.worker?.postMessage({ type: "stop" });
    this.worker = null;
    this.tracks.forEach((t) => t.stop());
    this.tracks = [];
    this.mix?.stop();
    this.mix = null;
    this.pending.forEach((r) => r(null));
    this.pending.clear();
  }
}
