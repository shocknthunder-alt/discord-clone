import { useCallback, useEffect, useRef, useState } from "react";

interface Props {
  buffer: AudioBuffer;
  /** Selection in seconds. */
  start: number;
  end: number;
  maxLength: number;
  onChange: (start: number, end: number) => void;
  /** 0-100, for the preview. */
  volume: number;
}

const HEIGHT = 120;
const HANDLE_GRAB_PX = 8;
const MIN_LEN = 0.1;

/** Min/max sample per bucket of a mono mix — what the waveform draws. Computed once per file. */
function buildPeaks(buffer: AudioBuffer, buckets: number): Float32Array {
  const peaks = new Float32Array(buckets * 2);
  const chans = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
  const per = buffer.length / buckets;
  for (let b = 0; b < buckets; b++) {
    let min = 1;
    let max = -1;
    const from = Math.floor(b * per);
    const to = Math.min(buffer.length, Math.floor((b + 1) * per));
    for (let i = from; i < to; i++) {
      let v = 0;
      for (const ch of chans) v += ch[i]!;
      v /= chans.length;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    peaks[b * 2] = min;
    peaks[b * 2 + 1] = max;
  }
  return peaks;
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, "0")}`;

/**
 * Waveform with a draggable start/end selection (max `maxLength` s), wheel zoom around the
 * pointer, a scroll slider when zoomed, and a preview of the selection with a moving playhead.
 */
export default function WaveformTrimmer({ buffer, start, end, maxLength, onChange, volume }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const duration = buffer.duration;
  const [width, setWidth] = useState(500);
  // Visible window [viewStart, viewStart + viewLen] in seconds.
  const [viewLen, setViewLen] = useState(duration);
  const [viewStart, setViewStart] = useState(0);
  const [playhead, setPlayhead] = useState<number | null>(null);
  const playRef = useRef<{ ctx: AudioContext; src: AudioBufferSourceNode; raf: number } | null>(null);
  // High-resolution peaks once; drawing picks from them for the visible window.
  const peaksRef = useRef<{ peaks: Float32Array; buckets: number } | null>(null);
  if (!peaksRef.current) {
    const buckets = Math.min(200_000, Math.max(2000, Math.round(duration * 400)));
    peaksRef.current = { peaks: buildPeaks(buffer, buckets), buckets };
  }

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.max(200, Math.round(el.clientWidth))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const clampView = useCallback(
    (s: number, len: number) => {
      const l = Math.min(duration, Math.max(0.25, len));
      return { s: Math.min(Math.max(0, s), duration - l), l };
    },
    [duration],
  );

  const xToTime = (x: number) => viewStart + (x / width) * viewLen;
  const timeToX = (t: number) => ((t - viewStart) / viewLen) * width;

  // ── draw ──
  useEffect(() => {
    const canvas = canvasRef.current;
    const pk = peaksRef.current;
    if (!canvas || !pk) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = HEIGHT * dpr;
    const g = canvas.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, width, HEIGHT);
    const css = getComputedStyle(canvas);
    const accent = css.getPropertyValue("--accent").trim() || "#c9a25a";

    // selection background
    const sx = timeToX(start);
    const ex = timeToX(end);
    g.fillStyle = "rgba(255,255,255,0.08)";
    g.fillRect(sx, 0, ex - sx, HEIGHT);

    // waveform
    const mid = HEIGHT / 2;
    for (let x = 0; x < width; x++) {
      const t0 = xToTime(x);
      const t1 = xToTime(x + 1);
      const b0 = Math.floor((t0 / duration) * pk.buckets);
      const b1 = Math.max(b0 + 1, Math.floor((t1 / duration) * pk.buckets));
      let min = 1;
      let max = -1;
      for (let b = Math.max(0, b0); b < Math.min(pk.buckets, b1); b++) {
        min = Math.min(min, pk.peaks[b * 2]!);
        max = Math.max(max, pk.peaks[b * 2 + 1]!);
      }
      if (max < min) continue;
      const inSel = t0 >= start && t0 <= end;
      g.fillStyle = inSel ? accent : "rgba(255,255,255,0.35)";
      const y1 = mid - max * mid * 0.95;
      const y2 = mid - min * mid * 0.95;
      g.fillRect(x, y1, 1, Math.max(1, y2 - y1));
    }

    // handles
    for (const [x, label] of [
      [sx, "◀"],
      [ex, "▶"],
    ] as const) {
      if (x < -2 || x > width + 2) continue;
      g.fillStyle = "#fff";
      g.fillRect(x - 1, 0, 2, HEIGHT);
      g.fillStyle = accent;
      g.fillRect(x - 6, 0, 12, 14);
      g.fillStyle = "#000";
      g.font = "9px sans-serif";
      g.textAlign = "center";
      g.fillText(label, x, 10);
    }

    // playhead
    if (playhead !== null) {
      const px = timeToX(playhead);
      g.fillStyle = "#ff4d6d";
      g.fillRect(px - 1, 0, 2, HEIGHT);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, viewStart, viewLen, start, end, playhead, buffer]);

  // ── pointer: drag a handle, or sweep a new selection ──
  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const sx = timeToX(start);
    const ex = timeToX(end);
    const mode: "start" | "end" | "new" =
      Math.abs(x - sx) <= HANDLE_GRAB_PX ? "start" : Math.abs(x - ex) <= HANDLE_GRAB_PX ? "end" : "new";
    const anchor = xToTime(x);
    e.currentTarget.setPointerCapture(e.pointerId);
    const canvas = e.currentTarget;

    const apply = (clientX: number) => {
      const t = Math.min(duration, Math.max(0, xToTime(clientX - rect.left)));
      if (mode === "start") {
        let s = Math.min(t, end - MIN_LEN);
        if (end - s > maxLength) s = end - maxLength;
        onChange(Math.max(0, s), end);
      } else if (mode === "end") {
        let en = Math.max(t, start + MIN_LEN);
        if (en - start > maxLength) en = start + maxLength;
        onChange(start, Math.min(duration, en));
      } else {
        let s = Math.min(anchor, t);
        let en = Math.max(anchor, t);
        if (en - s > maxLength) {
          if (t >= anchor) en = s + maxLength;
          else s = en - maxLength;
        }
        if (en - s >= MIN_LEN) onChange(s, en);
      }
    };
    apply(e.clientX);
    const move = (ev: PointerEvent) => apply(ev.clientX);
    const up = () => {
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
    };
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
  }

  // ── wheel: zoom around the pointer; shift/horizontal wheel pans ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const frac = (e.clientX - rect.left) / rect.width;
      if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        const delta = ((e.deltaX || e.deltaY) / rect.width) * viewLen;
        const v = clampView(viewStart + delta, viewLen);
        setViewStart(v.s);
        return;
      }
      const factor = e.deltaY > 0 ? 1.25 : 0.8;
      const pivot = viewStart + frac * viewLen;
      const len = Math.min(duration, Math.max(0.25, viewLen * factor));
      const v = clampView(pivot - frac * len, len);
      setViewLen(v.l);
      setViewStart(v.s);
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [viewStart, viewLen, duration, clampView]);

  function zoom(factor: number) {
    const centre = (start + end) / 2;
    const len = Math.min(duration, Math.max(0.25, viewLen * factor));
    const v = clampView(centre - len / 2, len);
    setViewLen(v.l);
    setViewStart(v.s);
  }

  function zoomToSelection() {
    const pad = Math.max(0.2, (end - start) * 0.15);
    const v = clampView(start - pad, end - start + pad * 2);
    setViewLen(v.l);
    setViewStart(v.s);
  }

  // ── preview the selection ──
  function stopPreview() {
    const p = playRef.current;
    if (!p) return;
    cancelAnimationFrame(p.raf);
    try {
      p.src.stop();
    } catch {
      // already stopped
    }
    void p.ctx.close();
    playRef.current = null;
    setPlayhead(null);
  }

  function preview() {
    if (playRef.current) return stopPreview();
    const ctx = new AudioContext();
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = volume / 100;
    src.connect(gain).connect(ctx.destination);
    const begun = ctx.currentTime;
    src.start(0, start, end - start);
    src.onended = () => stopPreview();
    const tick = () => {
      if (!playRef.current) return;
      setPlayhead(start + (ctx.currentTime - begun));
      playRef.current.raf = requestAnimationFrame(tick);
    };
    playRef.current = { ctx, src, raf: requestAnimationFrame(tick) };
  }

  useEffect(() => () => stopPreview(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const zoomed = viewLen < duration - 0.01;

  return (
    <div className="wf">
      <div className="wf-canvas-wrap" ref={wrapRef}>
        <canvas
          ref={canvasRef}
          className="wf-canvas"
          style={{ width: "100%", height: HEIGHT }}
          onPointerDown={onPointerDown}
          title="Влачи дръжките или маркирай ново парче · колелце = zoom · Shift+колелце = местене"
        />
      </div>
      {zoomed && (
        <input
          type="range"
          className="wf-scroll"
          min={0}
          max={Math.max(0, duration - viewLen)}
          step={0.01}
          value={viewStart}
          onChange={(e) => setViewStart(Number(e.target.value))}
          aria-label="Местене по вълната"
        />
      )}
      <div className="wf-bar">
        <button className="sb-btn" onClick={preview}>
          {playRef.current ? "■ Спри" : "▶ Чуй избраното"}
        </button>
        <span className="wf-time">
          {fmt(start)} → {fmt(end)} · <strong>{(end - start).toFixed(2)} сек</strong>
        </span>
        <span className="wf-spacer" />
        <button className="sb-btn" onClick={() => zoom(1.6)} title="Отдалечи">
          −
        </button>
        <button className="sb-btn" onClick={() => zoom(0.6)} title="Приближи">
          +
        </button>
        <button className="sb-btn" onClick={zoomToSelection} title="Приближи до избраното">
          ⤢
        </button>
      </div>
      <div className="wf-fine">
        <label>
          Начало
          <input
            type="range"
            min={0}
            max={duration}
            step={0.01}
            value={start}
            onChange={(e) => {
              const s = Math.min(Number(e.target.value), end - MIN_LEN);
              onChange(s, Math.min(end, s + maxLength));
            }}
          />
        </label>
        <label>
          Край
          <input
            type="range"
            min={0}
            max={duration}
            step={0.01}
            value={end}
            onChange={(e) => {
              const en = Math.max(Number(e.target.value), start + MIN_LEN);
              onChange(Math.max(start, en - maxLength), en);
            }}
          />
        </label>
      </div>
    </div>
  );
}

/** The selected part as a mono 16-bit WAV, with 8 ms fades so the cut edges don't click. */
export function encodeSelectionWav(buffer: AudioBuffer, start: number, end: number): Blob {
  const rate = buffer.sampleRate;
  const from = Math.floor(start * rate);
  const to = Math.min(buffer.length, Math.floor(end * rate));
  const n = Math.max(0, to - from);
  const chans = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
  const fade = Math.min(Math.floor(rate * 0.008), Math.floor(n / 4));
  const out = new DataView(new ArrayBuffer(44 + n * 2));
  const str = (o: number, s: string) => [...s].forEach((ch, i) => out.setUint8(o + i, ch.charCodeAt(0)));
  str(0, "RIFF");
  out.setUint32(4, 36 + n * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  out.setUint32(16, 16, true);
  out.setUint16(20, 1, true); // PCM
  out.setUint16(22, 1, true); // mono
  out.setUint32(24, rate, true);
  out.setUint32(28, rate * 2, true);
  out.setUint16(32, 2, true);
  out.setUint16(34, 16, true);
  str(36, "data");
  out.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    let v = 0;
    for (const ch of chans) v += ch[from + i]!;
    v /= chans.length;
    if (i < fade) v *= i / fade;
    if (i > n - fade) v *= (n - i) / fade;
    out.setInt16(44 + i * 2, Math.max(-1, Math.min(1, v)) * 0x7fff, true);
  }
  return new Blob([out.buffer], { type: "audio/wav" });
}
