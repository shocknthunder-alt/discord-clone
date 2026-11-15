/**
 * "Clip the last 30 seconds" of a stream we're watching.
 *
 * One MediaRecorder runs while we watch, cutting a piece every second and forcing a keyframe
 * every second. WebM from Chrome is a header followed by clusters (each starting at a keyframe),
 * so a clip = the header + everything from the first cluster inside the last 30 s. Pieces older
 * than ~40 s are dropped, so memory stays at roughly 40 s × the recording bitrate.
 */

const CLIP_SECONDS = 30;
const KEEP_SECONDS = CLIP_SECONDS + 10;
const CLUSTER_ID = [0x1f, 0x43, 0xb6, 0x75];

function pickMime(): string | undefined {
  // H.264 first: Chromium hands it to the GPU when it can (VP8 would be software encoding).
  for (const m of [
    "video/webm;codecs=h264,opus",
    "video/webm;codecs=avc1,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=vp9,opus",
    "video/webm",
  ]) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return undefined;
}

/** Offset of the first Cluster element at or after `from`, or -1. */
function findCluster(bytes: Uint8Array, from = 0): number {
  for (let i = from; i + 4 < bytes.length; i++) {
    if (bytes[i] === CLUSTER_ID[0] && bytes[i + 1] === CLUSTER_ID[1] && bytes[i + 2] === CLUSTER_ID[2] && bytes[i + 3] === CLUSTER_ID[3]) {
      // The size field follows (live recordings use "unknown size" 0x01FFFFFFFFFFFFFF). Requiring a
      // valid EBML length marker makes a false match inside frame data practically impossible.
      const sizeByte = bytes[i + 4];
      if (sizeByte !== 0) return i;
    }
  }
  return -1;
}

export class ClipBuffer {
  private recorder: MediaRecorder | null = null;
  private header: Uint8Array | null = null;
  private headerParts: Blob[] = [];
  private pieces: { at: number; blob: Blob }[] = [];
  private startedAt = 0;
  mimeType = "video/webm";

  constructor(private stream: MediaStream) {}

  start() {
    if (this.recorder || typeof MediaRecorder === "undefined") return;
    if (this.stream.getVideoTracks().length === 0) return;
    const mime = pickMime();
    try {
      this.recorder = new MediaRecorder(this.stream, {
        ...(mime ? { mimeType: mime } : {}),
        videoBitsPerSecond: 6_000_000,
        audioBitsPerSecond: 128_000,
        // Chromium 121+: a keyframe (= a new cluster) every second, so any second can start a clip.
        videoKeyFrameIntervalDuration: 1000,
      } as MediaRecorderOptions);
    } catch (err) {
      console.warn("clip buffer: MediaRecorder unavailable", err);
      this.recorder = null;
      return;
    }
    this.mimeType = this.recorder.mimeType || mime || "video/webm";
    this.recorder.ondataavailable = (e) => void this.onPiece(e.data);
    this.recorder.onerror = () => this.stop();
    this.startedAt = Date.now();
    this.recorder.start(1000);
  }

  private async onPiece(blob: Blob) {
    if (!blob.size) return;
    if (!this.header) {
      // Everything before the first cluster is the header (EBML + segment info + tracks).
      this.headerParts.push(blob);
      const bytes = new Uint8Array(await new Blob(this.headerParts).arrayBuffer());
      const at = findCluster(bytes);
      if (at < 0) return;
      this.header = bytes.slice(0, at);
      this.headerParts = [];
      this.pieces.push({ at: Date.now(), blob: new Blob([bytes.slice(at)]) });
      return;
    }
    const now = Date.now();
    this.pieces.push({ at: now, blob });
    while (this.pieces.length && now - this.pieces[0].at > KEEP_SECONDS * 1000) this.pieces.shift();
  }

  /** Seconds currently available (up to 30). */
  available(): number {
    if (!this.header || !this.pieces.length) return 0;
    return Math.min(CLIP_SECONDS, Math.round((Date.now() - Math.max(this.startedAt, this.pieces[0].at - 1000)) / 1000));
  }

  /** The last ~30 s as a playable WebM (null if nothing is buffered yet). */
  async clip(): Promise<{ blob: Blob; seconds: number } | null> {
    if (!this.header || !this.pieces.length) return null;
    const since = Date.now() - CLIP_SECONDS * 1000;
    const recent = this.pieces.filter((p) => p.at >= since);
    // The piece holding the moment 30 s ago (its cluster may start inside it).
    const firstIdx = this.pieces.indexOf(recent[0] ?? this.pieces[this.pieces.length - 1]);
    const take = this.pieces.slice(Math.max(0, firstIdx - 1));
    const bytes = new Uint8Array(await new Blob(take.map((p) => p.blob)).arrayBuffer());
    const at = findCluster(bytes);
    if (at < 0) return null;
    const blob = new Blob([this.header as BlobPart, bytes.slice(at)], { type: this.mimeType.split(";")[0] });
    const seconds = Math.round((Date.now() - take[0].at) / 1000) + 1;
    return { blob, seconds: Math.min(seconds, CLIP_SECONDS + 2) };
  }

  stop() {
    const r = this.recorder;
    this.recorder = null;
    if (r && r.state !== "inactive") {
      try {
        r.stop();
      } catch {
        /* already stopped */
      }
    }
    this.pieces = [];
    this.header = null;
    this.headerParts = [];
  }
}
