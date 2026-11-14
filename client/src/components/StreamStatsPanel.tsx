import { useEffect, useState } from "react";
import { SocketEvents } from "@discord-clone/shared";
import { getSocket } from "../socket/socket";
import { useVoiceStore, type RemoteStreamStats } from "../store/voiceStore";
import { getReceivedStreamStats, getScreenShareStats, refreshScreenShare } from "../webrtc/useVoiceChannel";
import type { ReceivedStreamStats, ScreenShareStats } from "../webrtc/SfuMediaManager";

/** Plain-language advice from the numbers, or null when everything is fine. */
function adviceFor(stats: ScreenShareStats, targetFps: number, own: boolean): string | null {
  const who = own ? "Компютърът ти" : "Компютърът на стриймъра";
  const capFps = stats.captureFps ?? 0;
  const where = stats.desktop === false ? "браузъра" : "ШмиркаТа";
  // Encoding on the processor although the GPU could do it — the usual reason for "cpu".
  const softwareEncoder = !stats.hardware && stats.codec !== "" && stats.fps > 0;
  if (softwareEncoder && stats.encoderPref === "cpu" && stats.limitation === "cpu") {
    return own
      ? "Избрал си кодиране с процесора и той не смогва. Смени на „Видеокарта“ в Настройки → Стрийм → Кодиране."
      : "Стриймърът е избрал кодиране с процесора и той не смогва — да смени на „Видеокарта“ (Настройки → Стрийм → Кодиране).";
  }
  if (softwareEncoder && stats.encoderPref !== "cpu" && (stats.limitation === "cpu" || stats.fps < targetFps * 0.75)) {
    const twoGpus = `Ако компютърът има 2 видеокарти: Windows Настройки → Дисплей → Графика → ${where} → „Висока производителност“ и рестарт на ${where}.`;
    return own
      ? `Видеото се кодира на процесора — видеокартата не се ползва. Натисни 🔄 Освежи енкодера. ${twoGpus}`
      : `Стриймът се кодира на процесора му, не на видеокартата (${stats.desktop ? "в приложението" : "в браузър"}). Да натисне 🔄 Освежи енкодера в 📊. ${twoGpus}`;
  }
  if (stats.limitation === "cpu") {
    return own
      ? "Компютърът не смогва да кодира стрима. Избери Light (720p) в Настройки → Screen Share Quality или затвори тежки програми."
      : `${who} не смогва да кодира стрима (процесор/видеокарта).`;
  }
  // At 6+ Mbps "bandwidth" just means the browser is still probing for more — not a weak link.
  if (stats.limitation === "bandwidth" && stats.kbps > 0 && stats.kbps < 6000) {
    return own
      ? "Твоят upload е тесен. Избери Light (720p), за да има повече бит за всеки кадър."
      : "Upload-ът на стриймъра е тесен.";
  }
  if (!stats.audio) {
    return own
      ? "Стриймът е БЕЗ звук. В десктоп приложението избери отново екрана/прозореца; в браузър трябва да отметнеш „Share audio“."
      : "Този стрийм е без звук.";
  }
  // The capture itself gives few frames: the game draws that many, or the picture stands still
  // (screen capture only sends a frame when something changes) — not an encoder/network problem.
  if (capFps > 0 && capFps < targetFps * 0.75 && stats.fps >= capFps - 3) {
    return own
      ? `Заснемането дава само ${capFps} кадъра/сек — играта рисува толкова (fps лимит/V-Sync 30?) или картината стои на едно място (тогава се пращат по-малко кадри, това е нормално).`
      : `Още при заснемането идват само ${capFps} кадъра/сек — играта му рисува толкова или картината стои (при неподвижен екран се пращат по-малко кадри — нормално).`;
  }
  if (capFps > 0 && capFps - stats.fps > 6 && stats.fps < targetFps * 0.75) {
    return own
      ? `Заснемат се ${capFps} кадъра/сек, но енкодерът пуска само ${stats.fps}. Натисни 🔄 Освежи енкодера или избери Light (720p).`
      : `Заснемат се ${capFps} кадъра/сек, но енкодерът му пуска само ${stats.fps} — не смогва да кодира.`;
  }
  if (stats.fps > 0 && stats.fps < targetFps * 0.75) {
    return own
      ? `Излизат само ${stats.fps} кадъра/сек при цел ${targetFps}. Най-често видеокартата е на 100% от играта: ограничи fps на играта (напр. 120 или V-Sync) и я пусни на borderless/windowed fullscreen.`
      : `Излизат само ${stats.fps} кадъра/сек при цел ${targetFps}. Най-често видеокартата на стриймъра е на 100% от играта — да ограничи fps на играта и да е на borderless.`;
  }
  return null;
}

const COLLAPSED_KEY = "streamStatsCollapsed";

const LIMIT_TEXT: Record<ScreenShareStats["limitation"], string> = {
  none: "няма",
  cpu: "процесор",
  bandwidth: "мрежа (upload)",
  other: "друго",
};

/**
 * The same stream as it arrives HERE — where stutter comes from: few frames sent (the streamer),
 * packets lost on the way (network), or frames dropped by this PC (decoding/showing).
 */
function ViewerSide({ userId, senderFps, senderCaptureFps }: { userId: string; senderFps: number; senderCaptureFps: number }) {
  const [rx, setRx] = useState<ReceivedStreamStats | null>(null);
  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const next = await getReceivedStreamStats(userId);
        if (!cancelled) setRx(next);
      } catch {
        // best-effort
      }
    }
    void poll();
    const id = setInterval(poll, 2000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [userId]);

  if (!rx) return null;
  let verdict: string;
  let bad = true;
  if (rx.lossPercent >= 2 || rx.freezes > 0) {
    verdict = "Губят се пакети по пътя до теб — мрежата (твоят download/Wi-Fi или пътят до сървъра) насича картината.";
  } else if (rx.droppedFrames >= 4) {
    verdict = "Кадрите стигат, но този компютър ги изпуска при показване — затвори тежки програми / провери драйвера на видеокартата.";
  } else if (senderFps > 0 && senderFps < 45 && senderCaptureFps > 0 && senderFps >= senderCaptureFps - 3) {
    verdict = `Стигат всички кадри. Стриймърът праща ${senderFps}/сек, защото толкова дава заснемането — играта рисува толкова или картината стои.`;
  } else if (senderFps > 0 && senderFps < 45) {
    verdict = `Стигат всички кадри, но стриймърът праща само ${senderFps}/сек — насичането е от неговата страна.`;
  } else {
    verdict = "При теб пристига чисто — без загуби и изпуснати кадри.";
    bad = false;
  }
  return (
    <div className="stream-stats-viewer">
      <div className="stream-stats-subtitle">При теб (зрител)</div>
      <dl>
        <dt>Кадри/сек</dt>
        <dd>
          {rx.fps} {rx.width ? `· ${rx.width}×${rx.height}` : ""}
        </dd>
        <dt>Загубени пакети</dt>
        <dd>{rx.lossPercent}%</dd>
        <dt>Изпуснати кадри</dt>
        <dd>{rx.droppedFrames} (за 2 сек)</dd>
        <dt>Замръзвания</dt>
        <dd>{rx.freezes}</dd>
        <dt>Jitter</dt>
        <dd>{rx.jitterMs} ms</dd>
        {rx.decoder && (
          <>
            <dt>Декодер</dt>
            <dd>{rx.decoder}</dd>
          </>
        )}
      </dl>
      <div className={`stream-stats-tip ${bad ? "" : "ok"}`}>{verdict}</div>
    </div>
  );
}

/** New encoder for the running share (same capture) — viewers keep watching. */
function RefreshEncoderButton() {
  const [state, setState] = useState<"idle" | "busy" | "done" | "fail">("idle");
  async function run() {
    setState("busy");
    const ok = await refreshScreenShare().catch(() => false);
    setState(ok ? "done" : "fail");
    setTimeout(() => setState("idle"), 2500);
  }
  return (
    <button
      className="stream-stats-refresh"
      disabled={state === "busy"}
      onClick={() => void run()}
      title="Пуска нов енкодер за същата картина — ако играта ти засича, докато стриймваш. Зрителите не спират да гледат."
    >
      {state === "busy" ? "Освежавам…" : state === "done" ? "✓ Освежено" : state === "fail" ? "Не стана" : "🔄 Освежи енкодера"}
    </button>
  );
}

function StatsPill({ title, stats, own, userId }: { title: string; stats: RemoteStreamStats; own: boolean; userId?: string }) {
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
              {stats.captureHeight && stats.captureHeight > stats.height + 8
                ? ` (заснето ${stats.captureWidth}×${stats.captureHeight} — смалено от енкодера)`
                : ""}
            </dd>
            <dt>Кадри/сек</dt>
            <dd>
              {stats.fps} (цел {targetFps})
            </dd>
            {!!stats.captureFps && (
              <>
                <dt>Заснемане</dt>
                <dd>{stats.captureFps} кадъра/сек</dd>
              </>
            )}
            <dt>Битрейт</dt>
            <dd>{(stats.kbps / 1000).toFixed(2)} Mbps</dd>
            <dt>Кодек</dt>
            <dd title={stats.encoder || undefined}>
              {stats.codec || "?"} {stats.hardware ? "· видеокарта" : "· процесор"}
            </dd>
            {stats.encoder && (
              <>
                <dt>Енкодер</dt>
                <dd>{stats.encoder}</dd>
              </>
            )}
            {stats.encoderPref && (
              <>
                <dt>Избрано</dt>
                <dd>
                  {stats.encoderPref === "cpu" ? "процесор" : "видеокарта"} ·{" "}
                  {stats.desktop ? "приложение" : "браузър"}
                </dd>
              </>
            )}
            {stats.gpu && (
              <>
                <dt>Видеокарта</dt>
                <dd>{stats.gpu}</dd>
              </>
            )}
            <dt>Звук</dt>
            <dd>{stats.audio ? "има" : "няма"}</dd>
            <dt>Ограничение</dt>
            <dd>{LIMIT_TEXT[stats.limitation]}</dd>
          </dl>
          {advice && <div className="stream-stats-tip">{advice}</div>}
          {own && <RefreshEncoderButton />}
          {!own && userId && <ViewerSide userId={userId} senderFps={stats.fps} senderCaptureFps={stats.captureFps ?? 0} />}
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
  // Collapsed into a small tab at the right edge by default; remembered.
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSED_KEY) !== "0");
  const setCollapsedPersist = (value: boolean) => {
    setCollapsed(value);
    localStorage.setItem(COLLAPSED_KEY, value ? "1" : "0");
  };

  useEffect(() => {
    if (!isScreenSharing || !activeVoiceChannelId) {
      setOwn(null);
      return;
    }
    let cancelled = false;
    const targetFps = 60;
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

  const ownStats: RemoteStreamStats | null = own && isScreenSharing ? { ...own, targetFps: 60 } : null;
  const others = Array.from(remote.entries()).filter(([socketId]) => peers.has(socketId));
  if (!ownStats && others.length === 0) return null;

  // Worst state of all streams, for the dot on the collapsed tab.
  const all = [...(ownStats ? [{ s: ownStats, own: true }] : []), ...others.map(([, s]) => ({ s, own: false }))];
  const levelOf = (s: RemoteStreamStats, isOwn: boolean) =>
    s.limitation === "cpu" || (s.limitation === "bandwidth" && s.kbps > 0 && s.kbps < 6000)
      ? 2
      : adviceFor(s, s.targetFps, isOwn)
        ? 1
        : 0;
  const worst = Math.max(...all.map(({ s, own: o }) => levelOf(s, o)));

  if (collapsed) {
    return (
      <button
        className="stream-stats-tab"
        onClick={() => setCollapsedPersist(false)}
        title="Диагностика на стрийма — покажи"
      >
        <span className={`dot ${worst === 2 ? "bad" : worst === 1 ? "warn" : ""}`} />
        📊 {all.length > 1 ? all.length : ""}
      </button>
    );
  }

  return (
    <div className="stream-stats-stack">
      <button className="stream-stats-collapse" onClick={() => setCollapsedPersist(true)} title="Скрий диагностиката">
        Скрий ⟩
      </button>
      {ownStats && <StatsPill title={others.length > 0 ? "Ти" : ""} stats={ownStats} own />}
      {others.map(([socketId, stats]) => (
        <StatsPill
          key={socketId}
          title={peers.get(socketId)?.username ?? ""}
          stats={stats}
          own={false}
          userId={peers.get(socketId)?.userId ?? undefined}
        />
      ))}
    </div>
  );
}
