import { useEffect, useState } from "react";
import { SocketEvents } from "@discord-clone/shared";
import { getSocket } from "../socket/socket";
import { useVoiceStore, type RemoteStreamStats } from "../store/voiceStore";
import { getReceivedStreamStats, getScreenShareStats, refreshScreenShare } from "../webrtc/useVoiceChannel";
import type { ReceivedStreamStats, ScreenShareStats } from "../webrtc/SfuMediaManager";
import { tr } from "../i18n";

/** Plain-language advice from the numbers, or null when everything is fine. */
function adviceFor(stats: ScreenShareStats, targetFps: number, own: boolean): string | null {
  const who = own ? tr("Компютърът ти", "Your PC") : tr("Компютърът на стриймъра", "The streamer's PC");
  const capFps = stats.captureFps ?? 0;
  const where = stats.desktop === false ? tr("браузъра", "the browser") : "ШмиркаТа";
  // Encoding on the processor although the GPU could do it — the usual reason for "cpu".
  const softwareEncoder = !stats.hardware && stats.codec !== "" && stats.fps > 0;
  if (softwareEncoder && stats.encoderPref === "cpu" && stats.limitation === "cpu") {
    return own
      ? tr("Избрал си кодиране с процесора и той не смогва. Смени на „Видеокарта“ в Настройки → Стрийм → Кодиране.", "You chose processor encoding and it can't keep up. Switch to \"Graphics card\" in Settings → Streaming → Encoding.")
      : tr("Стриймърът е избрал кодиране с процесора и той не смогва — да смени на „Видеокарта“ (Настройки → Стрийм → Кодиране).", "The streamer chose processor encoding and it can't keep up — they should switch to \"Graphics card\" (Settings → Streaming → Encoding).");
  }
  if (softwareEncoder && stats.encoderPref !== "cpu" && (stats.limitation === "cpu" || stats.fps < targetFps * 0.75)) {
    const twoGpus = tr(`Ако компютърът има 2 видеокарти: Windows Настройки → Дисплей → Графика → ${where} → „Висока производителност“ и рестарт на ${where}.`, `If the PC has 2 graphics cards: Windows Settings → Display → Graphics → ${where} → "High performance" and restart ${where}.`);
    return own
      ? tr(`Видеото се кодира на процесора — видеокартата не се ползва. Натисни 🔄 Освежи енкодера. ${twoGpus}`, `The video is encoded on the processor — the graphics card isn't used. Press 🔄 Refresh encoder. ${twoGpus}`)
      : tr(`Стриймът се кодира на процесора му, не на видеокартата (${stats.desktop ? "в приложението" : "в браузър"}). Да натисне 🔄 Освежи енкодера в 📊. ${twoGpus}`, `The stream is encoded on their processor, not the graphics card (${stats.desktop ? "in the app" : "in a browser"}). They should press 🔄 Refresh encoder in 📊. ${twoGpus}`);
  }
  if (stats.limitation === "cpu") {
    return own
      ? tr("Компютърът не смогва да кодира стрима. Избери Light (720p) в Настройки → Screen Share Quality или затвори тежки програми.", "The PC can't keep up encoding the stream. Pick Light (720p) in Settings → Streaming → Quality or close heavy programs.")
      : tr(`${who} не смогва да кодира стрима (процесор/видеокарта).`, `${who} can't keep up encoding the stream (processor/graphics card).`);
  }
  // Packets lost on the way up — the viewers see smears/freezes; the bitrate is already cut.
  if (stats.lossLimited || (stats.sendLossPercent ?? 0) >= 4) {
    const cap = stats.capKbps ? ` ${(stats.capKbps / 1000).toFixed(1)} Mbps` : "";
    return own
      ? tr(`Връзката ти губи пакети при качване (${stats.sendLossPercent ?? 0}%) — свалих битрейта автоматично до${cap}. Кабел вместо Wi-Fi, спрян ъплоуд на заден план (Steam, OneDrive) или Light/Standard качество помагат.`, `Your connection loses packets on upload (${stats.sendLossPercent ?? 0}%) — the bitrate was lowered automatically to${cap}. A cable instead of Wi-Fi, stopping background uploads (Steam, OneDrive) or Light/Standard quality help.`)
      : tr(`Връзката на стриймъра губи пакети при качване (${stats.sendLossPercent ?? 0}%) — битрейтът му е свален автоматично до${cap}. Кабел вместо Wi-Fi би помогнал.`, `The streamer's connection loses packets on upload (${stats.sendLossPercent ?? 0}%) — their bitrate was lowered automatically to${cap}. A cable instead of Wi-Fi would help.`);
  }
  // At 6+ Mbps "bandwidth" just means the browser is still probing for more — not a weak link.
  if (stats.limitation === "bandwidth" && stats.kbps > 0 && stats.kbps < 6000) {
    return own
      ? tr("Твоят upload е тесен. Избери Light (720p), за да има повече бит за всеки кадър.", "Your upload is narrow. Pick Light (720p) so each frame gets more bits.")
      : tr("Upload-ът на стриймъра е тесен.", "The streamer's upload is narrow.");
  }
  if (!stats.audio) {
    return own
      ? tr("Стриймът е БЕЗ звук. В десктоп приложението избери отново екрана/прозореца; в браузър трябва да отметнеш „Share audio“.", "The stream has NO sound. In the desktop app pick the screen/window again; in a browser tick \"Share audio\".")
      : tr("Този стрийм е без звук.", "This stream has no sound.");
  }
  // The capture itself gives few frames: the game draws that many, or the picture stands still
  // (screen capture only sends a frame when something changes) — not an encoder/network problem.
  if (capFps > 0 && capFps < targetFps * 0.75 && stats.fps >= capFps - 3) {
    return own
      ? tr(`Заснемането дава само ${capFps} кадъра/сек — играта рисува толкова (fps лимит/V-Sync 30?) или картината стои на едно място (тогава се пращат по-малко кадри, това е нормално).`, `Capture only gives ${capFps} fps — the game draws that many (fps cap / V-Sync 30?) or the picture is still (then fewer frames are sent, that's normal).`)
      : tr(`Още при заснемането идват само ${capFps} кадъра/сек — играта му рисува толкова или картината стои (при неподвижен екран се пращат по-малко кадри — нормално).`, `Capture already gives only ${capFps} fps — their game draws that many or the picture is still (a still screen sends fewer frames — normal).`);
  }
  if (capFps > 0 && capFps - stats.fps > 6 && stats.fps < targetFps * 0.75) {
    return own
      ? tr(`Заснемат се ${capFps} кадъра/сек, но енкодерът пуска само ${stats.fps}. Натисни 🔄 Освежи енкодера или избери Light (720p).`, `${capFps} fps are captured, but the encoder only outputs ${stats.fps}. Press 🔄 Refresh encoder or pick Light (720p).`)
      : tr(`Заснемат се ${capFps} кадъра/сек, но енкодерът му пуска само ${stats.fps} — не смогва да кодира.`, `${capFps} fps are captured, but their encoder only outputs ${stats.fps} — it can't keep up.`);
  }
  if (stats.fps > 0 && stats.fps < targetFps * 0.75) {
    return own
      ? tr(`Излизат само ${stats.fps} кадъра/сек при цел ${targetFps}. Най-често видеокартата е на 100% от играта: ограничи fps на играта (напр. 120 или V-Sync) и я пусни на borderless/windowed fullscreen.`, `Only ${stats.fps} fps go out of a target ${targetFps}. Usually the graphics card is at 100% from the game: cap the game's fps (e.g. 120 or V-Sync) and run it borderless/windowed fullscreen.`)
      : tr(`Излизат само ${stats.fps} кадъра/сек при цел ${targetFps}. Най-често видеокартата на стриймъра е на 100% от играта — да ограничи fps на играта и да е на borderless.`, `Only ${stats.fps} fps go out of a target ${targetFps}. Usually the streamer's graphics card is at 100% from the game — they should cap the game's fps and use borderless.`);
  }
  return null;
}

const COLLAPSED_KEY = "streamStatsCollapsed";

const LIMIT_TEXT = (): Record<ScreenShareStats["limitation"], string> => ({
  none: tr("няма", "none"),
  cpu: tr("процесор", "processor"),
  bandwidth: tr("мрежа (upload)", "network (upload)"),
  other: tr("друго", "other"),
});

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
    verdict = tr("Губят се пакети по пътя до теб — мрежата (твоят download/Wi-Fi или пътят до сървъра) насича картината.", "Packets are lost on the way to you — the network (your download/Wi-Fi or the route to the server) makes the picture stutter.");
  } else if (rx.droppedFrames >= 4) {
    verdict = tr("Кадрите стигат, но този компютър ги изпуска при показване — затвори тежки програми / провери драйвера на видеокартата.", "Frames arrive, but this PC drops them when showing — close heavy programs / check the graphics driver.");
  } else if (senderFps > 0 && senderFps < 45 && senderCaptureFps > 0 && senderFps >= senderCaptureFps - 3) {
    verdict = tr(`Стигат всички кадри. Стриймърът праща ${senderFps}/сек, защото толкова дава заснемането — играта рисува толкова или картината стои.`, `All frames arrive. The streamer sends ${senderFps}/s because that's what capture gives — the game draws that many or the picture is still.`);
  } else if (senderFps > 0 && senderFps < 45) {
    verdict = tr(`Стигат всички кадри, но стриймърът праща само ${senderFps}/сек — насичането е от неговата страна.`, `All frames arrive, but the streamer only sends ${senderFps}/s — the stutter is on their side.`);
  } else {
    verdict = tr("При теб пристига чисто — без загуби и изпуснати кадри.", "It arrives clean here — no losses or dropped frames.");
    bad = false;
  }
  return (
    <div className="stream-stats-viewer">
      <div className="stream-stats-subtitle">{tr("При теб (зрител)", "On your side (viewer)")}</div>
      <dl>
        <dt>{tr("Кадри/сек", "Frames/s")}</dt>
        <dd>
          {rx.fps} {rx.width ? `· ${rx.width}×${rx.height}` : ""}
        </dd>
        <dt>{tr("Загубени пакети", "Packet loss")}</dt>
        <dd>{rx.lossPercent}%</dd>
        <dt>{tr("Изпуснати кадри", "Dropped frames")}</dt>
        <dd>{rx.droppedFrames} ({tr("за 2 сек", "per 2 s")})</dd>
        <dt>{tr("Замръзвания", "Freezes")}</dt>
        <dd>{rx.freezes}</dd>
        <dt>Jitter</dt>
        <dd>{rx.jitterMs} ms</dd>
        {rx.decoder && (
          <>
            <dt>{tr("Декодер", "Decoder")}</dt>
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
      title={tr("Пуска нов енкодер за същата картина — ако играта ти засича, докато стриймваш. Зрителите не спират да гледат.", "Starts a new encoder for the same picture — if your game stutters while streaming. Viewers keep watching.")}
    >
      {state === "busy" ? tr("Освежавам…", "Refreshing…") : state === "done" ? tr("✓ Освежено", "✓ Refreshed") : state === "fail" ? tr("Не стана", "Failed") : tr("🔄 Освежи енкодера", "🔄 Refresh encoder")}
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
      <button className="stream-stats-pill" onClick={() => setOpen((o) => !o)} title={tr("Диагностика на стрийма", "Stream diagnostics")}>
        <span className={`dot ${level}`} />
        <span>
          {title ? `${title}: ` : ""}
          {stats.height}p · {stats.fps} fps · {(stats.kbps / 1000).toFixed(1)} Mbps
        </span>
      </button>
      {open && (
        <div className="stream-stats-body">
          <dl>
            <dt>{tr("Резолюция", "Resolution")}</dt>
            <dd>
              {stats.width}×{stats.height}
              {stats.captureHeight && stats.captureHeight > stats.height + 8
                ? ` (${tr("заснето", "captured")} ${stats.captureWidth}×${stats.captureHeight} — ${tr("смалено от енкодера", "scaled down by the encoder")})`
                : ""}
            </dd>
            <dt>{tr("Кадри/сек", "Frames/s")}</dt>
            <dd>
              {stats.fps} ({tr("цел", "target")} {targetFps})
            </dd>
            {!!stats.captureFps && (
              <>
                <dt>{tr("Заснемане", "Capture")}</dt>
                <dd>{stats.captureFps} {tr("кадъра/сек", "fps")}</dd>
              </>
            )}
            <dt>{tr("Битрейт", "Bitrate")}</dt>
            <dd>
              {(stats.kbps / 1000).toFixed(2)} Mbps
              {stats.capKbps ? ` (${tr("таван", "ceiling")} ${(stats.capKbps / 1000).toFixed(1)}${stats.lossLimited ? tr(" — свален заради загуби", " — lowered for losses") : ""})` : ""}
            </dd>
            {stats.sendLossPercent !== undefined && (
              <>
                <dt>{tr("Загуби при качване", "Upload loss")}</dt>
                <dd>{stats.sendLossPercent}%</dd>
              </>
            )}
            <dt>{tr("Кодек", "Codec")}</dt>
            <dd title={stats.encoder || undefined}>
              {stats.codec || "?"} {stats.hardware ? tr("· видеокарта", "· graphics card") : tr("· процесор", "· processor")}
            </dd>
            {stats.encoder && (
              <>
                <dt>{tr("Енкодер", "Encoder")}</dt>
                <dd>{stats.encoder}</dd>
              </>
            )}
            {stats.encoderPref && (
              <>
                <dt>{tr("Избрано", "Chosen")}</dt>
                <dd>
                  {stats.encoderPref === "cpu" ? tr("процесор", "processor") : tr("видеокарта", "graphics card")} ·{" "}
                  {stats.desktop ? tr("приложение", "app") : tr("браузър", "browser")}
                </dd>
              </>
            )}
            {stats.gpu && (
              <>
                <dt>{tr("Видеокарта", "Graphics card")}</dt>
                <dd>{stats.gpu}</dd>
              </>
            )}
            <dt>{tr("Звук", "Sound")}</dt>
            <dd>{stats.audio ? tr("има", "yes") : tr("няма", "no")}</dd>
            <dt>{tr("Ограничение", "Limited by")}</dt>
            <dd>{LIMIT_TEXT()[stats.limitation]}</dd>
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
        title={tr("Диагностика на стрийма — покажи", "Stream diagnostics — show")}
      >
        <span className={`dot ${worst === 2 ? "bad" : worst === 1 ? "warn" : ""}`} />
        📊 {all.length > 1 ? all.length : ""}
      </button>
    );
  }

  return (
    <div className="stream-stats-stack">
      <button className="stream-stats-collapse" onClick={() => setCollapsedPersist(true)} title={tr("Скрий диагностиката", "Hide diagnostics")}>
        {tr("Скрий", "Hide")} ⟩
      </button>
      {ownStats && <StatsPill title={others.length > 0 ? tr("Ти", "You") : ""} stats={ownStats} own />}
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
