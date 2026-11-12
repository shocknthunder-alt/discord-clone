import type { ReactNode } from "react";
import { useStreamFrameStore } from "../store/streamFrameStore";
import { STREAM_FRAMES } from "./streamFrames";

interface Props {
  children: ReactNode;
  caption: string;
  onStop: () => void;
  /** Max height as % of the viewport — smaller when several streams share the panel. */
  maxVh?: number;
}

/** Wraps the watched stream in the viewer's chosen frame (video behind, art in front). */
export default function StreamFrame({ children, caption, onStop, maxVh = 76 }: Props) {
  const frameId = useStreamFrameStore((s) => s.frameId);
  const setFrameId = useStreamFrameStore((s) => s.setFrameId);
  const index = Math.max(0, STREAM_FRAMES.findIndex((f) => f.id === frameId));
  const frame = STREAM_FRAMES[index]!;
  const { l, t, w, h } = frame.screen;

  return (
    <div
      className={`tv stream-frame frame-${frame.id}`}
      style={{
        ...(frame.height ? { aspectRatio: `1100 / ${frame.height}` } : {}),
        width: `min(100%, 1100px, calc(${maxVh}vh * 1100 / ${frame.height ?? 625}))`,
      }}
    >
      <div
        className={`tv-screen ${frame.crt ? "crt" : ""}`}
        style={{ left: `${l}%`, top: `${t}%`, width: `${w}%`, height: `${h}%` }}
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
    </div>
  );
}
