import { useEffect, useRef, useState } from "react";
import { tr } from "../i18n";
import { cloudinaryMp4, formatDuration } from "../utils/attachments";

const SPEEDS = [1, 1.5, 2];

/** A voice message: play/pause, the recorded waveform (click to jump), time and speed. */
export function VoiceMessage({ url, durationMs, peaks }: { url: string; durationMs: number; peaks: number[] }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0); // 0..1
  const [speed, setSpeed] = useState(1);
  const bars = peaks.length ? peaks : new Array(40).fill(0.3);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    let raf = 0;
    const tick = () => {
      const dur = Number.isFinite(a.duration) && a.duration > 0 ? a.duration : durationMs / 1000;
      setPos(dur ? Math.min(a.currentTime / dur, 1) : 0);
      if (!a.paused) raf = requestAnimationFrame(tick);
    };
    const onPlay = () => {
      setPlaying(true);
      raf = requestAnimationFrame(tick);
    };
    const onPause = () => {
      setPlaying(false);
      cancelAnimationFrame(raf);
      tick();
    };
    const onEnded = () => {
      setPlaying(false);
      setPos(0);
    };
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    a.addEventListener("ended", onEnded);
    return () => {
      cancelAnimationFrame(raf);
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
      a.removeEventListener("ended", onEnded);
    };
  }, [durationMs]);

  function toggle() {
    const a = audioRef.current;
    if (!a) return;
    // Only one voice message at a time.
    document.querySelectorAll<HTMLAudioElement>("audio.voice-msg-audio").forEach((o) => o !== a && o.pause());
    if (a.paused) void a.play().catch(() => {});
    else a.pause();
  }

  function seek(e: React.MouseEvent<HTMLDivElement>) {
    const a = audioRef.current;
    if (!a) return;
    const r = e.currentTarget.getBoundingClientRect();
    const frac = Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1);
    const dur = Number.isFinite(a.duration) && a.duration > 0 ? a.duration : durationMs / 1000;
    a.currentTime = frac * dur;
    setPos(frac);
    if (a.paused) void a.play().catch(() => {});
  }

  function cycleSpeed() {
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  }

  const shown = playing || pos > 0 ? pos * durationMs : durationMs;
  return (
    <div className="voice-msg">
      <audio ref={audioRef} className="voice-msg-audio" src={url} preload="metadata" />
      <button className="voice-msg-play" onClick={toggle} aria-label={playing ? tr("Пауза", "Pause") : tr("Пусни", "Play")}>
        {playing ? "❚❚" : "▶"}
      </button>
      <div className="voice-msg-wave" onClick={seek} title={tr("Цъкни, за да прескочиш", "Click to jump")}>
        {bars.map((p, i) => (
          <span
            key={i}
            className={i / bars.length < pos ? "played" : ""}
            style={{ height: `${Math.max(12, Math.round(p * 100))}%` }}
          />
        ))}
      </div>
      <span className="voice-msg-time">{formatDuration(shown)}</span>
      <button className="voice-msg-speed" onClick={cycleSpeed} title={tr("Скорост", "Speed")}>
        {speed}×
      </button>
    </div>
  );
}

/** A stream clip: the MP4 Cloudinary makes of it (plays everywhere, seekable), else the original. */
export function ChatVideo({ url }: { url: string }) {
  const mp4 = cloudinaryMp4(url);
  return (
    <div className="chat-video">
      <video controls preload="metadata" playsInline>
        {mp4 && mp4 !== url && <source src={mp4} type="video/mp4" />}
        <source src={url} />
      </video>
      <a className="chat-video-download" href={mp4 ?? url} target="_blank" rel="noreferrer" download>
        ⬇ {tr("Свали", "Download")}
      </a>
    </div>
  );
}
