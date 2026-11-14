import { useRef, useState, type ReactNode } from "react";
import { useStreamFrameStore } from "../store/streamFrameStore";
import { STREAM_FRAMES } from "./streamFrames";

interface Props {
  children: ReactNode;
  caption: string;
  onStop: () => void;
  /** Max height as % of the viewport — smaller when several streams share the panel. */
  maxVh?: number;
}

const WIDTH_KEY = "streamFrameWidth";
const MIN_WIDTH = 320;

function loadWidth(): number | null {
  const n = Number(localStorage.getItem(WIDTH_KEY));
  return Number.isFinite(n) && n >= MIN_WIDTH ? n : null;
}

/** Wraps the watched stream in the viewer's chosen frame (video behind, art in front). */
export default function StreamFrame({ children, caption, onStop, maxVh = 76 }: Props) {
  const frameId = useStreamFrameStore((s) => s.frameId);
  const setFrameId = useStreamFrameStore((s) => s.setFrameId);
  const index = Math.max(0, STREAM_FRAMES.findIndex((f) => f.id === frameId));
  const frame = STREAM_FRAMES[index]!;
  const { l, t, w, h } = frame.screen;
  const rootRef = useRef<HTMLDivElement>(null);
  // Width the viewer dragged the stream to (null = automatic size). Remembered.
  const [customWidth, setCustomWidth] = useState<number | null>(loadWidth);
  const [resizing, setResizing] = useState(false);
  const aspect = 1100 / (frame.height ?? 625);

  function startResize(e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    const root = rootRef.current;
    if (!root) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = root.getBoundingClientRect().width;
    const maxW = root.parentElement?.getBoundingClientRect().width ?? window.innerWidth;
    setResizing(true);
    const move = (ev: PointerEvent) => {
      // The frame is centred, so it grows on both sides: twice the pointer's travel. Dragging
      // down counts too (converted through the frame's aspect ratio) — whichever is larger.
      const grow = Math.max((ev.clientX - startX) * 2, (ev.clientY - startY) * 2 * aspect);
      const next = Math.round(Math.min(maxW, Math.max(MIN_WIDTH, startW + grow)));
      setCustomWidth(next);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setResizing(false);
      setCustomWidth((cur) => {
        if (cur) localStorage.setItem(WIDTH_KEY, String(cur));
        return cur;
      });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function resetSize() {
    localStorage.removeItem(WIDTH_KEY);
    setCustomWidth(null);
  }

  return (
    <div
      ref={rootRef}
      className={`tv stream-frame frame-${frame.id} ${resizing ? "resizing" : ""}`}
      style={{
        ...(frame.height ? { aspectRatio: `1100 / ${frame.height}` } : {}),
        width: customWidth ? `min(100%, ${customWidth}px)` : `min(100%, 1100px, calc(${maxVh}vh * 1100 / ${frame.height ?? 625}))`,
      }}
    >
      <div
        className={`tv-screen ${frame.crt ? "crt" : ""}`}
        style={{ left: `${l}%`, top: `${t}%`, width: `${w}%`, height: `${h}%`, ...(frame.clip ? { clipPath: frame.clip } : {}) }}
      >
        {children}
      </div>
      <frame.Art />
      <div className="stream-frame-buttons">
        <button
          className="stop-watching-button"
          onClick={() => setFrameId(STREAM_FRAMES[(index + 1) % STREAM_FRAMES.length]!.id)}
          title="Change the stream frame"
        >
          🎬 {frame.name}
        </button>
        <button className="stop-watching-button danger" onClick={onStop} title="Stop watching this stream">
          Stop Watching
        </button>
      </div>
      <div className="tv-caption">{caption}</div>
      <div
        className="stream-resize-handle"
        onPointerDown={startResize}
        onDoubleClick={resetSize}
        title="Влачи, за да смениш размера · двоен клик = автоматичен размер"
      />
    </div>
  );
}
