import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { create } from "zustand";
import { tr } from "../i18n";
import { getMusicVideoContainer, setMusicVideoRect } from "../music/musicPlayerEngine";
import { useMusicStore } from "../store/musicStore";
import { useVoiceStore } from "../store/voiceStore";

/** 📺 in the music player: watch the synced YouTube video together (each person opens it for themselves). */
export const useMusicVideoStore = create<{ open: boolean; toggle: () => void; close: () => void }>((set) => ({
  open: false,
  toggle: () => set((s) => ({ open: !s.open })),
  close: () => set({ open: false }),
}));

const POS_KEY = "musicVideoWindow";
const HEADER = 30;
const SIZES = [360, 560, 800];

function loadPos(): { x: number; y: number; w: number } {
  try {
    const p = JSON.parse(localStorage.getItem(POS_KEY) ?? "null");
    if (p && typeof p.x === "number" && typeof p.y === "number" && typeof p.w === "number") return p;
  } catch {
    /* default */
  }
  return { x: Math.max(20, window.innerWidth - 600), y: 80, w: 560 };
}

function clamp(p: { x: number; y: number; w: number }) {
  const w = Math.min(Math.max(p.w, 280), window.innerWidth - 20);
  const h = (w * 9) / 16 + HEADER;
  return {
    w,
    x: Math.min(Math.max(p.x, 0), Math.max(0, window.innerWidth - w)),
    y: Math.min(Math.max(p.y, 0), Math.max(0, window.innerHeight - h)),
  };
}

export default function MusicVideoWindow() {
  const open = useMusicVideoStore((s) => s.open);
  const close = useMusicVideoStore((s) => s.close);
  const inVoice = useVoiceStore((s) => !!s.activeVoiceChannelId);
  const item = useMusicStore((s) => {
    const st = s.state;
    return st && st.currentIndex < st.queue.length ? st.queue[st.currentIndex] : null;
  });
  const isYouTube = !!item && item.source !== "subsonic";
  const visible = open && inVoice;
  const [pos, setPos] = useState(() => clamp(loadPos()));
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  // Leaving voice closes it.
  useEffect(() => {
    if (!inVoice) close();
  }, [inVoice, close]);

  // Put the (never-moved) YouTube box exactly over our window body.
  useLayoutEffect(() => {
    if (visible && isYouTube) setMusicVideoRect({ x: pos.x, y: pos.y + HEADER, w: pos.w, h: (pos.w * 9) / 16 });
    else setMusicVideoRect(null);
  }, [visible, isYouTube, pos]);
  useEffect(() => () => setMusicVideoRect(null), []);

  useEffect(() => {
    localStorage.setItem(POS_KEY, JSON.stringify(pos));
  }, [pos]);

  useEffect(() => {
    const onResize = () => setPos((p) => clamp(p));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  if (!visible) return null;

  const h = (pos.w * 9) / 16;
  return (
    <div className="music-video-window" style={{ left: pos.x, top: pos.y, width: pos.w, height: h + HEADER }}>
      <div
        className="music-video-header"
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest("button")) return;
          drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          setPos((p) => clamp({ ...p, x: e.clientX - drag.current!.dx, y: e.clientY - drag.current!.dy }));
        }}
        onPointerUp={() => (drag.current = null)}
      >
        <span className="music-video-title" title={item?.title ?? ""}>
          📺 {isYouTube ? item!.title : tr("Гледаме заедно", "Watch together")}
        </span>
        {SIZES.map((w, i) => (
          <button
            key={w}
            className={Math.abs(pos.w - w) < 2 ? "on" : ""}
            onClick={() => setPos((p) => clamp({ ...p, w }))}
            title={tr("Размер", "Size")}
          >
            {["S", "M", "L"][i]}
          </button>
        ))}
        <button
          onClick={() => void getMusicVideoContainer()?.requestFullscreen().catch(() => {})}
          disabled={!isYouTube}
          title={tr("Цял екран (Esc за изход)", "Fullscreen (Esc to exit)")}
        >
          ⛶
        </button>
        <button onClick={close} title={tr("Затвори (музиката продължава)", "Close (the music keeps playing)")}>
          ✕
        </button>
      </div>
      {!isYouTube && (
        <div className="music-video-empty">
          {tr(
            "Пусни YouTube линк в музикалния плейър — видеото върви синхронно при всички, които са отворили 📺.",
            "Paste a YouTube link into the music player — the video plays in sync for everyone who opened 📺.",
          )}
        </div>
      )}
    </div>
  );
}
