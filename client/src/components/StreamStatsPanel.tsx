import { useEffect, useState } from "react";
import { useVoiceStore } from "../store/voiceStore";
import { getScreenShareStats } from "../webrtc/useVoiceChannel";
import type { ScreenShareStats } from "../webrtc/SfuMediaManager";

/** Plain-language advice from the numbers, or null when everything is fine. */
function adviceFor(stats: ScreenShareStats, targetFps: number): string | null {
  if (stats.limitation === "cpu") {
    return "Компютърът не смогва да кодира стрима. Избери Light (720p) в Настройки → Screen Share Quality или затвори тежки програми.";
  }
  if (stats.limitation === "bandwidth") {
    return "Твоят upload е тесен. Избери Light (720p), за да има повече бит за всеки кадър.";
  }
  if (stats.fps > 0 && stats.fps < targetFps * 0.75) {
    return `Излизат само ${stats.fps} кадъра/сек при цел ${targetFps}. Често това значи, че играта или екранът дават малко кадри (напр. заключен fps или прозорец на заден план).`;
  }
  return null;
}

/** For the person streaming: a small pill with live numbers about the outgoing screen share. */
export default function StreamStatsPanel() {
  const isScreenSharing = useVoiceStore((s) => s.isScreenSharing);
  const mode = useVoiceStore((s) => s.screenShareMode);
  const [stats, setStats] = useState<ScreenShareStats | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!isScreenSharing) {
      setStats(null);
      return;
    }
    let cancelled = false;
    async function poll() {
      try {
        const next = await getScreenShareStats();
        if (!cancelled) setStats(next);
      } catch {
        // stats are best-effort
      }
    }
    const id = setInterval(poll, 1500);
    void poll();
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [isScreenSharing]);

  if (!isScreenSharing || !stats) return null;

  const targetFps = mode === "smooth" ? 60 : 30;
  const advice = adviceFor(stats, targetFps);
  const level = stats.limitation === "cpu" || stats.limitation === "bandwidth" ? "bad" : advice ? "warn" : "";
  const limitText: Record<ScreenShareStats["limitation"], string> = {
    none: "няма",
    cpu: "процесор",
    bandwidth: "мрежа (upload)",
    other: "друго",
  };

  return (
    <div className="stream-stats">
      <button className="stream-stats-pill" onClick={() => setOpen((o) => !o)} title="Диагностика на стрима">
        <span className={`dot ${level}`} />
        <span>
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
            <dd>{limitText[stats.limitation]}</dd>
          </dl>
          {advice && <div className="stream-stats-tip">{advice}</div>}
        </div>
      )}
      {!open && advice && <div className="stream-stats-tip" style={{ margin: "0 8px 8px" }}>{advice}</div>}
    </div>
  );
}
