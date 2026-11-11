import { useEffect, useState } from "react";
import { SocketEvents } from "@discord-clone/shared";
import { getSocket } from "../socket/socket";
import { useVoiceStore, type RemoteStreamStats } from "../store/voiceStore";
import { getScreenShareStats } from "../webrtc/useVoiceChannel";
import type { ScreenShareStats } from "../webrtc/SfuMediaManager";

/** Plain-language advice from the numbers, or null when everything is fine. */
function adviceFor(stats: ScreenShareStats, targetFps: number, own: boolean): string | null {
  const who = own ? "Компютърът ти" : "Компютърът на стриймъра";
  if (stats.limitation === "cpu") {
    return own
      ? "Компютърът не смогва да кодира стрима. Избери Light (720p) в Настройки → Screen Share Quality или затвори тежки програми."
      : `${who} не смогва да кодира стрима (процесор/видеокарта).`;
  }
  if (stats.limitation === "bandwidth") {
    return own
      ? "Твоят upload е тесен. Избери Light (720p), за да има повече бит за всеки кадър."
      : "Upload-ът на стриймъра е тесен.";
  }
  if (stats.fps > 0 && stats.fps < targetFps * 0.75) {
    return `Излизат само ${stats.fps} кадъра/сек при цел ${targetFps}. Често това значи, че играта или екранът дават малко кадри (напр. заключен fps или прозорец на заден план).`;
  }
  return null;
}

const LIMIT_TEXT: Record<ScreenShareStats["limitation"], string> = {
  none: "няма",
  cpu: "процесор",
  bandwidth: "мрежа (upload)",
  other: "друго",
};

function StatsPill({ title, stats, own }: { title: string; stats: RemoteStreamStats; own: boolean }) {
  const [open, setOpen] = useState(false);
  const targetFps = stats.targetFps;
  const advice = adviceFor(stats, targetFps, own);
  const level = stats.limitation === "cpu" || stats.limitation === "bandwidth" ? "bad" : advice ? "warn" : "";

  return (
    <div className="stream-stats">
      <button className="stream-stats-pill" onClick={() => setOpen((o) => !o)} title="Диагностика на стрима">
        <span className={`dot ${level}`} />
        <span>
          {title ? `${title}: ` : ""}
          {stats.height}p · {stats.fps} fps · {(stats.kbps / 1000).toFixed(1)} Mbps
        </span>
      </button>
      {open && (
        <div className="stream-stats-body">
          <dl>
            <dt>Резолюция</dt>
            <dd>
              {stats.width}×{stats.height}
            </dd>
            <dt>Кадри/сек</dt>
            <dd>
              {stats.fps} (цел {targetFps})
            </dd>
            <dt>Битрейт</dt>
            <dd>{(stats.kbps / 1000).toFixed(2)} Mbps</dd>
            <dt>Кодек</dt>
            <dd>
              {stats.codec || "?"} {stats.hardware ? "· видеокарта" : "· процесор"}
            </dd>
            <dt>Ограничение</dt>
            <dd>{LIMIT_TEXT[stats.limitation]}</dd>
          </dl>
          {advice && <div className="stream-stats-tip">{advice}</div>}
        </div>
      )}
      {!open && advice && <div className="stream-stats-tip" style={{ margin: "0 8px 8px" }}>{advice}</div>}
    </div>
  );
}

/**
 * Live numbers about screen shares in the call: your own (measured here and shared with the room)
 * and everyone else's (reported by them), so anyone watching can see what the stream is doing.
 */
export default function StreamStatsPanel() {
  const isScreenSharing = useVoiceStore((s) => s.isScreenSharing);
  const mode = useVoiceStore((s) => s.screenShareMode);
  const activeVoiceChannelId = useVoiceStore((s) => s.activeVoiceChannelId);
  const remote = useVoiceStore((s) => s.remoteStreamStats);
  const peers = useVoiceStore((s) => s.peers);
  const [own, setOwn] = useState<ScreenShareStats | null>(null);

  useEffect(() => {
    if (!isScreenSharing || !activeVoiceChannelId) {
      setOwn(null);
      return;
    }
    let cancelled = false;
    const targetFps = mode === "smooth" ? 60 : 30;
    async function poll() {
      try {
        const next = await getScreenShareStats();
        if (cancelled) return;
        setOwn(next);
        // Share the numbers with everyone in the call (older clients ignore the event).
        getSocket()?.emit(SocketEvents.VoiceStreamStats, {
          voiceChannelId: activeVoiceChannelId,
          stats: next ? { ...next, targetFps } : null,
        });
      } catch {
        // stats are best-effort
      }
    }
    const id = setInterval(poll, 2000);
    void poll();
    return () => {
      cancelled = true;
      clearInterval(id);
      getSocket()?.emit(SocketEvents.VoiceStreamStats, { voiceChannelId: activeVoiceChannelId, stats: null });
    };
  }, [isScreenSharing, activeVoiceChannelId, mode]);

  const ownStats: RemoteStreamStats | null = own && isScreenSharing ? { ...own, targetFps: mode === "smooth" ? 60 : 30 } : null;
  const others = Array.from(remote.entries()).filter(([socketId]) => peers.has(socketId));
  if (!ownStats && others.length === 0) return null;

  return (
    <div className="stream-stats-stack">
      {ownStats && <StatsPill title={others.length > 0 ? "Ти" : ""} stats={ownStats} own />}
      {others.map(([socketId, stats]) => (
        <StatsPill key={socketId} title={peers.get(socketId)?.username ?? ""} stats={stats} own={false} />
      ))}
    </div>
  );
}
