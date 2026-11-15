/**
 * Minimal WebM (Matroska) writer for clips: H.264 video (+ optional Opus audio) from WebCodecs.
 * Everything is in memory, so every element gets its real size and the file knows its duration.
 */

export interface MuxChunk {
  /** Microseconds, same clock for audio and video. */
  ts: number;
  key: boolean;
  data: Uint8Array;
}

export interface MuxInput {
  width: number;
  height: number;
  /** avcC box contents (VideoEncoder decoderConfig.description). */
  avcC: Uint8Array;
  video: MuxChunk[];
  audio?: { sampleRate: number; channels: number; chunks: MuxChunk[] };
}

const enc = new TextEncoder();

function concat(parts: Uint8Array[]): Uint8Array {
  let len = 0;
  for (const p of parts) len += p.length;
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function idBytes(id: number): Uint8Array {
  const out: number[] = [];
  for (let v = id; v > 0; v = Math.floor(v / 256)) out.unshift(v & 0xff);
  return Uint8Array.from(out);
}

/** EBML size as an 8-byte vint (simple and always big enough). */
function sizeBytes(size: number): Uint8Array {
  const out = new Uint8Array(8);
  out[0] = 0x01;
  let v = size;
  for (let i = 7; i >= 1; i--) {
    out[i] = v & 0xff;
    v = Math.floor(v / 256);
  }
  return out;
}

function el(id: number, ...children: Uint8Array[]): Uint8Array {
  const body = concat(children);
  return concat([idBytes(id), sizeBytes(body.length), body]);
}

function uint(id: number, value: number): Uint8Array {
  const bytes: number[] = [];
  let v = Math.max(0, Math.floor(value));
  do {
    bytes.unshift(v & 0xff);
    v = Math.floor(v / 256);
  } while (v > 0);
  return el(id, Uint8Array.from(bytes));
}

function float(id: number, value: number): Uint8Array {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setFloat64(0, value);
  return el(id, b);
}

function str(id: number, value: string): Uint8Array {
  return el(id, enc.encode(value));
}

function opusHead(channels: number, sampleRate: number): Uint8Array {
  const b = new Uint8Array(19);
  b.set(enc.encode("OpusHead"), 0);
  const dv = new DataView(b.buffer);
  dv.setUint8(8, 1); // version
  dv.setUint8(9, channels);
  dv.setUint16(10, 312, true); // pre-skip
  dv.setUint32(12, sampleRate, true);
  dv.setInt16(16, 0, true); // gain
  dv.setUint8(18, 0); // mapping family
  return b;
}

function simpleBlock(track: number, relMs: number, key: boolean, data: Uint8Array): Uint8Array {
  const head = new Uint8Array(4);
  head[0] = 0x80 | track;
  new DataView(head.buffer).setInt16(1, relMs);
  head[3] = key ? 0x80 : 0;
  return el(0xa3, head, data);
}

export function muxWebm(input: MuxInput): Uint8Array {
  const t0 = input.video[0]?.ts ?? 0;
  const ms = (ts: number) => Math.max(0, Math.round((ts - t0) / 1000));
  const lastVideo = input.video[input.video.length - 1]?.ts ?? t0;
  const lastAudio = input.audio?.chunks[input.audio.chunks.length - 1]?.ts ?? t0;
  const durationMs = ms(Math.max(lastVideo, lastAudio)) + 17;

  const header = el(
    0x1a45dfa3,
    uint(0x4286, 1),
    uint(0x42f7, 1),
    uint(0x42f2, 4),
    uint(0x42f3, 8),
    str(0x4282, "webm"),
    uint(0x4287, 4),
    uint(0x4285, 2),
  );

  const info = el(0x1549a966, uint(0x2ad7b1, 1_000_000), float(0x4489, durationMs), str(0x4d80, "Shmirka"), str(0x5741, "Shmirka"));

  const tracks: Uint8Array[] = [
    el(
      0xae,
      uint(0xd7, 1),
      uint(0x73c5, 1),
      uint(0x83, 1),
      str(0x86, "V_MPEG4/ISO/AVC"),
      el(0x63a2, input.avcC),
      el(0xe0, uint(0xb0, input.width), uint(0xba, input.height)),
    ),
  ];
  if (input.audio && input.audio.chunks.length) {
    tracks.push(
      el(
        0xae,
        uint(0xd7, 2),
        uint(0x73c5, 2),
        uint(0x83, 2),
        str(0x86, "A_OPUS"),
        el(0x63a2, opusHead(input.audio.channels, input.audio.sampleRate)),
        uint(0x56bb, 80_000_000),
        el(0xe1, float(0xb5, input.audio.sampleRate), uint(0x9f, input.audio.channels)),
      ),
    );
  }

  // Interleave by time; a new cluster at every video keyframe (and before relative times overflow).
  const blocks = [
    ...input.video.map((c) => ({ track: 1, ...c })),
    ...(input.audio?.chunks ?? []).map((c) => ({ track: 2, ...c, key: true })),
  ].sort((a, b) => a.ts - b.ts || a.track - b.track);

  const clusters: Uint8Array[] = [];
  let clusterStart = -1;
  let current: Uint8Array[] = [];
  const flush = () => {
    if (clusterStart >= 0 && current.length) clusters.push(el(0x1f43b675, uint(0xe7, clusterStart), ...current));
    current = [];
  };
  for (const b of blocks) {
    const t = ms(b.ts);
    if (clusterStart < 0 || (b.track === 1 && b.key) || t - clusterStart > 30_000) {
      flush();
      clusterStart = t;
    }
    current.push(simpleBlock(b.track, t - clusterStart, b.key, b.data));
  }
  flush();

  const segment = el(0x18538067, info, el(0x1654ae6b, ...tracks), ...clusters);
  return concat([header, segment]);
}
