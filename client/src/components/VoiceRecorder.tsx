import { useEffect, useRef, useState } from "react";
import { tr } from "../i18n";
import { isCloudinaryConfigured, uploadMediaToCloudinary } from "../api/cloudinary";
import { getPreferredMicDeviceId } from "../webrtc/devicePrefs";
import { encodePeaks, formatDuration } from "../utils/attachments";
import { useHotkeyTarget } from "../hotkeys/hotkeys";
import { showHotkeyToast } from "../hotkeys/HotkeyToast";

const MAX_MS = 120_000;
const BARS = 48;

function pickMime(): string | undefined {
  for (const m of ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/webm", "audio/mp4"]) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return undefined;
}

/** Shrinks the recorded loudness samples to BARS bars, scaled so the loudest bar is full height. */
function toBars(levels: number[]): number[] {
  if (levels.length === 0) return [];
  const out: number[] = [];
  for (let i = 0; i < BARS; i++) {
    const from = Math.floor((i * levels.length) / BARS);
    const to = Math.max(from + 1, Math.floor(((i + 1) * levels.length) / BARS));
    let max = 0;
    for (let j = from; j < to && j < levels.length; j++) max = Math.max(max, levels[j]);
    out.push(max);
  }
  const top = Math.max(...out, 0.0001);
  return out.map((v) => v / top);
}

/**
 * 🎤 next to the message box: click to record (up to 2 min), then ✕ to throw away or ➤ to send.
 * `send` gets the attachment string for the message's imageUrl.
 */
export default function VoiceRecorder({ send }: { send: (imageUrl: string) => void }) {
  const [state, setState] = useState<"idle" | "recording" | "uploading">("idle");
  const [elapsed, setElapsed] = useState(0);
  const [live, setLive] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<{
    recorder: MediaRecorder;
    stream: MediaStream;
    ctx: AudioContext;
    levels: number[];
    startedAt: number;
    timer: ReturnType<typeof setInterval>;
    sendOnStop: boolean;
  } | null>(null);

  useEffect(() => () => stop(false), []);

  // ⌨️ Hotkey: first press starts recording, the next one sends; "discard" throws it away.
  const usable = isCloudinaryConfigured() && typeof MediaRecorder !== "undefined";
  useHotkeyTarget(
    "voice-message",
    () => {
      if (state === "idle") {
        showHotkeyToast(tr("🎤 Записвам… (същият клавиш праща)", "🎤 Recording… (same key sends)"));
        void start();
      } else if (state === "recording") {
        showHotkeyToast(tr("➤ Пратено", "➤ Sent"));
        stop(true);
      }
    },
    usable,
  );
  useHotkeyTarget(
    "voice-message-cancel",
    () => {
      if (state !== "recording") return;
      showHotkeyToast(tr("✕ Гласовото съобщение е отказано", "✕ Voice message discarded"));
      stop(false);
    },
    usable,
  );

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 5000);
    return () => clearTimeout(t);
  }, [error]);

  if (!isCloudinaryConfigured() || typeof MediaRecorder === "undefined") return null;

  async function start() {
    setError(null);
    let stream: MediaStream;
    try {
      const inputDeviceId = getPreferredMicDeviceId();
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          ...(inputDeviceId ? { deviceId: { ideal: inputDeviceId } } : {}),
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch {
      setError(tr("Няма достъп до микрофона.", "No access to the microphone."));
      return;
    }
    const mime = pickMime();
    const recorder = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: 32_000 });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);

    // Loudness every 50 ms → the waveform.
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    const levels: number[] = [];
    const startedAt = Date.now();
    const timer = setInterval(() => {
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      levels.push(Math.sqrt(sum / buf.length));
      const ms = Date.now() - startedAt;
      setElapsed(ms);
      setLive(levels.slice(-30));
      if (ms >= MAX_MS) stop(true);
    }, 50);

    recorder.onstop = async () => {
      const r = rec.current;
      rec.current = null;
      clearInterval(timer);
      stream.getTracks().forEach((t) => t.stop());
      void ctx.close();
      const durationMs = Date.now() - startedAt;
      if (!r?.sendOnStop || durationMs < 700) {
        setState("idle");
        return;
      }
      setState("uploading");
      try {
        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        const { url } = await uploadMediaToCloudinary(blob);
        send(`${url}#voice=${durationMs}.${encodePeaks(toBars(levels))}`);
      } catch (err) {
        console.error("voice message upload failed", err);
        setError(tr("Качването не успя.", "Upload failed."));
      }
      setState("idle");
    };

    rec.current = { recorder, stream, ctx, levels, startedAt, timer, sendOnStop: false };
    recorder.start(1000);
    setElapsed(0);
    setLive([]);
    setState("recording");
  }

  function stop(sendIt: boolean) {
    const r = rec.current;
    if (!r) return;
    r.sendOnStop = sendIt;
    if (r.recorder.state !== "inactive") r.recorder.stop();
  }

  if (state === "recording") {
    const top = Math.max(...live, 0.02);
    return (
      <div className="voice-rec-bar">
        <span className="voice-rec-dot" />
        <span className="voice-rec-time">{formatDuration(elapsed)}</span>
        <div className="voice-rec-live">
          {live.map((v, i) => (
            <span key={i} style={{ height: `${Math.max(10, Math.round((v / top) * 100))}%` }} />
          ))}
        </div>
        <button type="button" className="voice-rec-cancel" onClick={() => stop(false)} title={tr("Откажи", "Discard")}>
          ✕
        </button>
        <button type="button" className="voice-rec-send" onClick={() => stop(true)} title={tr("Прати", "Send")}>
          ➤
        </button>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        className="voice-rec-button"
        disabled={state === "uploading"}
        onClick={() => void start()}
        title={tr("Гласово съобщение (до 2 мин)", "Voice message (up to 2 min)")}
        aria-label={tr("Гласово съобщение", "Voice message")}
      >
        {state === "uploading" ? "⏳" : "🎤"}
      </button>
      {error && <span className="voice-rec-error">{error}</span>}
    </>
  );
}
