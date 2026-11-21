import { useEffect, useState } from "react";
import { SocketEvents } from "@discord-clone/shared";
import { getMusicDuration } from "../music/musicPlayerEngine";
import { useMusicStore } from "../store/musicStore";
import { useVoiceStore } from "../store/voiceStore";
import { getSocket } from "../socket/socket";
import { tr } from "../i18n";

function fmt(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

function seek(positionSeconds: number) {
  const voiceChannelId = useVoiceStore.getState().activeVoiceChannelId;
  if (voiceChannelId) getSocket()?.emit(SocketEvents.MusicSeek, { voiceChannelId, positionSeconds });
}

/**
 * Where the shared song is (everyone's player follows the server's position) + a slider and
 * ±10 s buttons to move it for the whole channel.
 */
export default function MusicProgress() {
  const state = useMusicStore((s) => s.state);
  const item = state && state.currentIndex < state.queue.length ? state.queue[state.currentIndex] : null;
  const [, tick] = useState(0);
  // While the slider is held: the spot under the finger, sent on release.
  const [dragValue, setDragValue] = useState<number | null>(null);

  useEffect(() => {
    if (!item) return;
    const t = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(t);
  }, [item]);

  useEffect(() => setDragValue(null), [item?.id]);

  if (!state || !item) return null;

  const duration = getMusicDuration();
  const live = state.isPlaying ? state.positionSeconds + (Date.now() - state.updatedAt) / 1000 : state.positionSeconds;
  const position = duration > 0 ? Math.min(live, duration) : live;
  const shown = dragValue ?? position;

  function commit() {
    if (dragValue === null) return;
    seek(dragValue);
    setDragValue(null);
  }

  function jump(delta: number) {
    const to = Math.max(0, position + delta);
    // Past the end = the next song, not a stuck player.
    if (duration > 0 && to >= duration - 1) seek(Math.max(0, duration - 1));
    else seek(to);
  }

  // How much of the song is behind us — painted into the bar's track (see .music-seek in index.css).
  const pct = duration > 0 ? Math.min(100, (shown / duration) * 100) : 0;

  // The song bar is the big, coloured, full-width one; the volume below is small and grey with a 🔊
  // label — people used to grab the volume thinking it was the song.
  return (
    <div className="music-progress">
      <input
        className="music-seek"
        type="range"
        min={0}
        max={duration > 0 ? Math.floor(duration) : 1}
        step={1}
        value={duration > 0 ? Math.floor(shown) : 0}
        disabled={duration <= 0}
        style={{ "--fill": `${pct}%` } as React.CSSProperties}
        onChange={(e) => setDragValue(Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
        title={duration > 0 ? tr("Премести песента за всички", "Move the song for everyone") : tr("Дължината още не е известна", "Length not known yet")}
        aria-label={tr("Позиция в песента", "Song position")}
      />
      <div className="music-progress-row">
        <span className="music-progress-time">{fmt(shown)}</span>
        <span className="music-progress-jumps">
          <button className="music-progress-jump" onClick={() => jump(-10)} title={tr("10 секунди назад", "Back 10 seconds")}>
            −10{tr("с", "s")}
          </button>
          <button className="music-progress-jump" onClick={() => jump(10)} title={tr("10 секунди напред", "Forward 10 seconds")}>
            +10{tr("с", "s")}
          </button>
        </span>
        <span className="music-progress-time end">{duration > 0 ? fmt(duration) : "--:--"}</span>
      </div>
    </div>
  );
}
