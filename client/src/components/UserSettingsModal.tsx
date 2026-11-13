import { useEffect, useRef, useState, type ReactNode } from "react";
import { updateProfile } from "../api/auth.api";
import { isCloudinaryConfigured, uploadImageToCloudinary } from "../api/cloudinary";
import { useAuthStore } from "../store/authStore";
import { STREAM_FRAMES } from "./streamFrames";
import { useStreamFrameStore } from "../store/streamFrameStore";
import { THEMES, applyTheme, getStoredThemeId } from "../theme/themes";
import { useVoiceStore } from "../store/voiceStore";
import {
  getAutoGainControlEnabled,
  getEchoCancellationEnabled,
  getHighpassFilterEnabled,
  getNoiseGateEnabled,
  getAiNoiseSuppressionEnabled,
  getNoiseGateSensitivity,
  getNoiseSuppressionEnabled,
  getPreferredMicDeviceId,
  listMicDevices,
  listSpeakerDevices,
  setPreferredMicDeviceId,
  supportsOutputDeviceSelection,
} from "../webrtc/devicePrefs";
import { useVoiceChannel } from "../webrtc/useVoiceChannel";
import { useEscapeKey } from "../hooks/useEscapeKey";
import { useAppPrefs } from "../utils/appPrefs";
import "./settings.css";

// A short, readable label for a KeyboardEvent.code — covers the keys people actually bind
// PTT to (modifiers, function keys, mouse-adjacent keys like CapsLock); falls back to the
// raw code for anything else rather than guessing at every possible layout.
function describeKeyCode(code: string): string {
  const known: Record<string, string> = {
    ControlLeft: "Ляв Ctrl",
    ControlRight: "Десен Ctrl",
    AltLeft: "Ляв Alt",
    AltRight: "Десен Alt",
    ShiftLeft: "Ляв Shift",
    ShiftRight: "Десен Shift",
    CapsLock: "Caps Lock",
    Space: "Интервал",
    Tab: "Tab",
    Backquote: "`",
  };
  return known[code] ?? code.replace(/^Key/, "").replace(/^Digit/, "");
}

type Section = "profile" | "voice" | "stream" | "chat" | "notifications" | "appearance" | "accessibility";

const NAV: { group: string; items: { id: Section; icon: string; label: string }[] }[] = [
  { group: "Потребител", items: [{ id: "profile", icon: "👤", label: "Моят профил" }] },
  {
    group: "Приложение",
    items: [
      { id: "voice", icon: "🎙️", label: "Глас и видео" },
      { id: "stream", icon: "📺", label: "Стрийм" },
      { id: "chat", icon: "💬", label: "Чат" },
      { id: "notifications", icon: "🔔", label: "Известия" },
      { id: "appearance", icon: "🎨", label: "Външен вид" },
      { id: "accessibility", icon: "♿", label: "Достъпност" },
    ],
  },
];

const TITLES: Record<Section, string> = {
  profile: "Моят профил",
  voice: "Глас и видео",
  stream: "Стрийм",
  chat: "Чат",
  notifications: "Известия",
  appearance: "Външен вид",
  accessibility: "Достъпност",
};

/* ───────────── building blocks ───────────── */

function Card({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="set-card">
      <h3 className="set-card-title">{title}</h3>
      {hint && <p className="set-card-hint">{hint}</p>}
      <div className="set-card-body">{children}</div>
    </section>
  );
}

/** A row with a label (+ optional description) and an on/off switch. */
function Toggle({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <label className={`set-toggle ${disabled ? "disabled" : ""}`}>
      <span className="set-toggle-text">
        <span className="set-toggle-label">{label}</span>
        {hint && <span className="set-toggle-hint">{hint}</span>}
      </span>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="set-switch" aria-hidden />
    </label>
  );
}

/** Big selectable option (radio) with a title and a line of description. */
function Choice({
  name,
  checked,
  title,
  hint,
  onSelect,
}: {
  name: string;
  checked: boolean;
  title: string;
  hint: string;
  onSelect: () => void;
}) {
  return (
    <label className={`set-choice ${checked ? "selected" : ""}`}>
      <input type="radio" name={name} checked={checked} onChange={onSelect} />
      <span className="set-choice-title">{title}</span>
      <span className="set-choice-hint">{hint}</span>
    </label>
  );
}

/** Live input level of the chosen microphone — start/stop so it doesn't hold the mic. */
function MicTest({ deviceId }: { deviceId: string }) {
  const [running, setRunning] = useState(false);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!running) return;
    let raf = 0;
    let ctx: AudioContext | null = null;
    let stream: MediaStream | null = null;
    let cancelled = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: deviceId ? { deviceId: { exact: deviceId } } : true });
        if (cancelled) return;
        ctx = new AudioContext();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        ctx.createMediaStreamSource(stream).connect(analyser);
        const data = new Float32Array(analyser.fftSize);
        const tick = () => {
          analyser.getFloatTimeDomainData(data);
          let sum = 0;
          for (const v of data) sum += v * v;
          const rms = Math.sqrt(sum / data.length);
          setLevel(Math.min(1, rms * 6));
          raf = requestAnimationFrame(tick);
        };
        tick();
      } catch {
        setError("Няма достъп до микрофона.");
        setRunning(false);
      }
    })();
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      void ctx?.close();
      setLevel(0);
    };
  }, [running, deviceId]);

  return (
    <div className="set-mictest">
      <button type="button" className="set-button" onClick={() => { setError(null); setRunning((r) => !r); }}>
        {running ? "Спри теста" : "Тествай микрофона"}
      </button>
      <div className="set-meter" aria-label="Ниво на микрофона">
        <div className="set-meter-fill" style={{ width: `${Math.round(level * 100)}%` }} />
      </div>
      {error && <span className="set-error-inline">{error}</span>}
    </div>
  );
}

/* ───────────── the window ───────────── */

/** Everything the window edits. Changes stay here until "Запази" applies them. */
interface Draft {
  username: string;
  avatarUrl: string | null;
  micId: string;
  speakerId: string;
  micMode: "voice-activation" | "push-to-talk";
  pttKey: string | null;
  aiSuppression: boolean;
  noiseGate: boolean;
  noiseGateSensitivity: number;
  highpassFilter: boolean;
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
  shareMode: "smooth" | "sharp";
  shareQuality: "low" | "standard" | "high";
  simulcast: boolean;
  frameId: string;
  chatFontSize: number;
  clock24h: boolean;
  showSeconds: boolean;
  desktopNotifications: boolean;
  unreadMarkers: boolean;
  joinSound: boolean;
  themeId: string;
  reduceMotion: boolean;
  soundboardEnabled: boolean;
  soundboardVolume: number;
  eventReminders: boolean;
  eventReminderMinutes: number;
}

/** The values as they are applied right now. */
function readCurrent(): Draft {
  const v = useVoiceStore.getState();
  const p = useAppPrefs.getState();
  const u = useAuthStore.getState().user;
  return {
    username: u?.username ?? "",
    avatarUrl: u?.avatarUrl ?? null,
    micId: getPreferredMicDeviceId() ?? "",
    speakerId: v.preferredSpeakerId,
    micMode: v.micMode,
    pttKey: v.pushToTalkKey,
    aiSuppression: getAiNoiseSuppressionEnabled(),
    noiseGate: getNoiseGateEnabled(),
    noiseGateSensitivity: getNoiseGateSensitivity(),
    highpassFilter: getHighpassFilterEnabled(),
    echoCancellation: getEchoCancellationEnabled(),
    noiseSuppression: getNoiseSuppressionEnabled(),
    autoGainControl: getAutoGainControlEnabled(),
    shareMode: v.screenShareMode,
    shareQuality: v.screenShareQuality,
    simulcast: v.screenShareSimulcast,
    frameId: useStreamFrameStore.getState().frameId,
    chatFontSize: p.chatFontSize,
    clock24h: p.clock24h,
    showSeconds: p.showSeconds,
    desktopNotifications: p.desktopNotifications,
    unreadMarkers: p.unreadMarkers,
    joinSound: p.joinSound,
    themeId: getStoredThemeId(),
    reduceMotion: p.reduceMotion,
    soundboardEnabled: p.soundboardEnabled,
    soundboardVolume: p.soundboardVolume,
    eventReminders: p.eventReminders,
    eventReminderMinutes: p.eventReminderMinutes,
  };
}

interface Props {
  onClose: () => void;
}

export default function UserSettingsModal({ onClose }: Props) {
  const { logout, setUser } = useAuthStore();
  const user = useAuthStore((s) => s.user);
  const [section, setSection] = useState<Section>("profile");
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [base, setBase] = useState<Draft>(readCurrent);
  const [draft, setDraft] = useState<Draft>(base);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | "unsupported">(
    typeof Notification === "undefined" ? "unsupported" : Notification.permission,
  );
  const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([]);
  const [speakerDevices, setSpeakerDevices] = useState<MediaDeviceInfo[]>([]);
  const setPreferredSpeakerId = useVoiceStore((s) => s.setPreferredSpeakerId);
  const setScreenShareSimulcast = useVoiceStore((s) => s.setScreenShareSimulcast);
  const setStreamFrameId = useStreamFrameStore((st) => st.setFrameId);
  const setPrefs = useAppPrefs((s) => s.set);
  const voice = useVoiceChannel();
  const [listeningForKey, setListeningForKey] = useState(false);

  const changed = (Object.keys(draft) as (keyof Draft)[]).filter((k) => draft[k] !== base[k]);
  const dirty = changed.length > 0;

  function edit(patch: Partial<Draft>) {
    setDraft((d) => ({ ...d, ...patch }));
    setJustSaved(false);
    setError(null);
  }

  // Theme is previewed live (you want to see it), but only kept if saved.
  useEffect(() => {
    applyTheme(draft.themeId);
  }, [draft.themeId]);

  function discard() {
    setDraft(base);
    applyTheme(base.themeId);
    setError(null);
  }

  function close() {
    if (dirty && !window.confirm("Имаш незапазени промени. Затвори без да ги запазиш?")) return;
    applyTheme(base.themeId);
    onClose();
  }

  // Escape is a valid key to bind for push-to-talk, so it must not also close the window then.
  useEscapeKey(() => {
    if (!listeningForKey) close();
  });

  useEffect(() => {
    // Device labels are empty until mic permission has been granted at least once;
    // requesting it here (and immediately releasing it) ensures the dropdowns show
    // real names instead of "Microphone 1" / "Speaker 1".
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        stream.getTracks().forEach((t) => t.stop());
        return Promise.all([listMicDevices(), listSpeakerDevices()]);
      })
      .then(([mics, speakers]) => {
        setMicDevices(mics);
        setSpeakerDevices(speakers);
      })
      .catch(() =>
        Promise.all([listMicDevices(), listSpeakerDevices()])
          .then(([mics, speakers]) => {
            setMicDevices(mics);
            setSpeakerDevices(speakers);
          })
          .catch(() => {}),
      );
  }, []);

  function startBindingPushToTalkKey() {
    setListeningForKey(true);
    function onKeyDown(e: KeyboardEvent) {
      e.preventDefault();
      edit({ pttKey: e.code });
      setListeningForKey(false);
      window.removeEventListener("keydown", onKeyDown);
    }
    window.addEventListener("keydown", onKeyDown);
  }

  async function handleAvatarPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      edit({ avatarUrl: await uploadImageToCloudinary(file) });
    } catch {
      setError("Качването на снимката не успя. Опитай пак.");
    } finally {
      setUploading(false);
    }
  }

  async function toggleNotifications(on: boolean) {
    if (on && notifPermission !== "granted" && notifPermission !== "unsupported") {
      const result = await Notification.requestPermission();
      setNotifPermission(result);
      if (result !== "granted") return;
    }
    edit({ desktopNotifications: on });
  }

  /** Applies every changed value through the same setters the app always used. */
  async function save() {
    if (!dirty) return;
    const d = draft;
    const has = (k: keyof Draft) => changed.includes(k);
    setSaving(true);
    setError(null);
    try {
      if (has("username") || has("avatarUrl")) {
        if (!d.username.trim()) throw new Error("Името не може да е празно.");
        try {
          setUser(await updateProfile({ username: d.username.trim(), avatarUrl: d.avatarUrl }));
        } catch {
          throw new Error("Профилът не се запази — може би името вече е заето.");
        }
      }
      if (has("micId")) setPreferredMicDeviceId(d.micId || null);
      if (has("speakerId")) setPreferredSpeakerId(d.speakerId);
      if (has("micMode")) voice.setMicMode(d.micMode);
      if (has("pttKey") && d.pttKey) voice.setPushToTalkKey(d.pttKey);
      if (has("aiSuppression")) voice.setAiNoiseSuppressionEnabled(d.aiSuppression);
      if (has("noiseGate")) voice.setNoiseGateEnabled(d.noiseGate);
      if (has("noiseGateSensitivity")) voice.setNoiseGateSensitivity(d.noiseGateSensitivity);
      if (has("highpassFilter")) voice.setHighpassFilterEnabled(d.highpassFilter);
      if (has("echoCancellation")) voice.setEchoCancellationEnabled(d.echoCancellation);
      if (has("noiseSuppression")) voice.setNoiseSuppressionEnabled(d.noiseSuppression);
      if (has("autoGainControl")) voice.setAutoGainControlEnabled(d.autoGainControl);
      if (has("shareMode")) voice.setScreenShareMode(d.shareMode);
      if (has("shareQuality")) voice.setScreenShareQuality(d.shareQuality);
      if (has("simulcast")) setScreenShareSimulcast(d.simulcast);
      if (has("frameId")) setStreamFrameId(d.frameId);
      if (has("themeId")) applyTheme(d.themeId, true);
      setPrefs({
        chatFontSize: d.chatFontSize,
        clock24h: d.clock24h,
        showSeconds: d.showSeconds,
        desktopNotifications: d.desktopNotifications,
        unreadMarkers: d.unreadMarkers,
        joinSound: d.joinSound,
        reduceMotion: d.reduceMotion,
        soundboardEnabled: d.soundboardEnabled,
        soundboardVolume: d.soundboardVolume,
        eventReminders: d.eventReminders,
        eventReminderMinutes: d.eventReminderMinutes,
      });
      const now = { ...d, username: d.username.trim() };
      setBase(now);
      setDraft(now);
      setJustSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Нещо се обърка при запазването.");
    } finally {
      setSaving(false);
    }
  }

  // Drag the window by its sidebar header, so it can be moved off the stream while trying frames.
  function startDrag(e: React.PointerEvent<HTMLElement>) {
    if (e.button !== 0) return;
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    const startX = e.clientX - offset.x;
    const startY = e.clientY - offset.y;
    const card = handle.closest(".set-window")!.getBoundingClientRect();
    // Keep at least a corner of the window on screen.
    const minX = offset.x - card.left - card.width + 160;
    const maxX = offset.x + (window.innerWidth - card.left) - 160;
    const minY = offset.y - card.top;
    const maxY = offset.y + (window.innerHeight - card.top) - 80;
    function move(ev: PointerEvent) {
      setOffset({
        x: Math.min(maxX, Math.max(minX, ev.clientX - startX)),
        y: Math.min(maxY, Math.max(minY, ev.clientY - startY)),
      });
    }
    function up() {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", up);
    }
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
    handle.addEventListener("pointercancel", up);
  }

  const sampleTime = new Date();
  sampleTime.setHours(14, 5, 33);
  const sampleClock = sampleTime.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    ...(draft.showSeconds ? { second: "2-digit" } : {}),
    hour12: !draft.clock24h,
  });

  return (
    <div className="modal-overlay settings-overlay" onClick={close}>
      <div
        className="set-window"
        style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Настройки"
      >
        {/* ── sidebar ── */}
        <nav className="set-nav">
          <div className="set-nav-head" onPointerDown={startDrag} title="Хвани и премести прозореца">
            <span className="set-nav-avatar">
              {user?.avatarUrl ? <img src={user.avatarUrl} alt="" /> : (user?.username ?? "?").slice(0, 2).toUpperCase()}
            </span>
            <span className="set-nav-name">{user?.username}</span>
          </div>
          {NAV.map((g) => (
            <div key={g.group} className="set-nav-group">
              <div className="set-nav-group-title">{g.group}</div>
              {g.items.map((it) => (
                <button
                  key={it.id}
                  className={`set-nav-item ${section === it.id ? "active" : ""}`}
                  onClick={() => setSection(it.id)}
                >
                  <span className="set-nav-icon">{it.icon}</span>
                  {it.label}
                </button>
              ))}
            </div>
          ))}
          <div className="set-nav-spacer" />
          <button
            className="set-nav-item danger"
            onClick={() => {
              applyTheme(base.themeId);
              logout();
              onClose();
            }}
          >
            <span className="set-nav-icon">🚪</span>
            Изход от акаунта
          </button>
        </nav>

        {/* ── content ── */}
        <div className="set-main">
          <header className="set-main-head" onPointerDown={startDrag}>
            <h2>{TITLES[section]}</h2>
            <button className="set-close" onPointerDown={(e) => e.stopPropagation()} onClick={close} title="Затвори (Esc)">
              ✕
            </button>
          </header>

          <div className="set-scroll">
            {section === "profile" && (
              <Card title="Аватар и име" hint="Така те виждат другите в чата и в гласовите канали.">
                <div className="set-profile">
                  <div className="set-profile-avatar">
                    {draft.avatarUrl ? <img src={draft.avatarUrl} alt="" /> : <span>{draft.username.slice(0, 2).toUpperCase()}</span>}
                  </div>
                  <div className="set-profile-fields">
                    <label className="set-field-label" htmlFor="username-input">
                      Потребителско име
                    </label>
                    <input
                      id="username-input"
                      className="set-input"
                      value={draft.username}
                      onChange={(e) => edit({ username: e.target.value })}
                    />
                    <div className="set-row">
                      <button
                        type="button"
                        className="set-button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading || !isCloudinaryConfigured()}
                      >
                        {uploading ? "Качване…" : "Смени аватара"}
                      </button>
                      <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleAvatarPick} />
                    </div>
                  </div>
                </div>
              </Card>
            )}

            {section === "voice" && (
              <>
                <Card title="Устройства">
                  <label className="set-field-label" htmlFor="mic-select">
                    Микрофон
                  </label>
                  <select id="mic-select" className="set-input" value={draft.micId} onChange={(e) => edit({ micId: e.target.value })}>
                    <option value="">По подразбиране (системен)</option>
                    {micDevices.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || `Микрофон ${d.deviceId.slice(0, 6)}`}
                      </option>
                    ))}
                  </select>
                  <p className="set-hint">Сменя се при следващото влизане в гласов канал.</p>
                  <MicTest deviceId={draft.micId} />

                  <label className="set-field-label" htmlFor="speaker-select">
                    Слушалки / високоговорители
                  </label>
                  {supportsOutputDeviceSelection() ? (
                    <select
                      id="speaker-select"
                      className="set-input"
                      value={draft.speakerId}
                      onChange={(e) => edit({ speakerId: e.target.value })}
                    >
                      <option value="">По подразбиране (системен)</option>
                      {speakerDevices.map((d) => (
                        <option key={d.deviceId} value={d.deviceId}>
                          {d.label || `Изход ${d.deviceId.slice(0, 6)}`}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="set-hint">Този браузър не позволява избор на изход — звукът е през системния.</p>
                  )}
                </Card>

                <Card title="Режим на микрофона">
                  <div className="set-choices">
                    <Choice
                      name="mic-mode"
                      checked={draft.micMode === "voice-activation"}
                      title="Гласова активност"
                      hint="Микрофонът е включен, щом не си на mute."
                      onSelect={() => edit({ micMode: "voice-activation" })}
                    />
                    <Choice
                      name="mic-mode"
                      checked={draft.micMode === "push-to-talk"}
                      title="Push-to-talk"
                      hint="Говориш само докато държиш клавиш."
                      onSelect={() => edit({ micMode: "push-to-talk" })}
                    />
                  </div>
                  {draft.micMode === "push-to-talk" && (
                    <div className="set-row spaced">
                      <span>
                        Клавиш:{" "}
                        <strong>
                          {listeningForKey ? "Натисни клавиш…" : draft.pttKey ? describeKeyCode(draft.pttKey) : "не е избран"}
                        </strong>
                      </span>
                      <button type="button" className="set-button" onClick={startBindingPushToTalkKey} disabled={listeningForKey}>
                        {draft.pttKey ? "Смени" : "Избери клавиш"}
                      </button>
                    </div>
                  )}
                  <p className="set-hint">В браузъра работи само когато прозорецът е на фокус; в десктоп приложението — винаги.</p>
                </Card>

                <Card title="Soundboard" hint="Кратките звуци, които хората пускат в гласовия канал (бутон 🔊).">
                  <Toggle
                    label="Чувай soundboard звуците"
                    checked={draft.soundboardEnabled}
                    onChange={(on) => edit({ soundboardEnabled: on })}
                  />
                  <div className="set-slider">
                    <span>Сила на звука</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={draft.soundboardVolume}
                      disabled={!draft.soundboardEnabled}
                      onChange={(e) => edit({ soundboardVolume: Number(e.target.value) })}
                    />
                    <span className="set-slider-value">{draft.soundboardVolume}%</span>
                  </div>
                </Card>

                <Card title="Обработка на звука" hint="Всичко е включено по подразбиране — изключи нещо, ако пречи на твоя микрофон.">
                  <Toggle
                    label="AI шумопотискане"
                    hint="Маха клавиатура, вентилатор, дишане и шум в стаята; оставя гласа."
                    checked={draft.aiSuppression}
                    onChange={(on) => edit({ aiSuppression: on })}
                  />
                  <Toggle
                    label="Шумова врата"
                    hint="Заглушава микрофона между думите, когато е тихо."
                    checked={draft.noiseGate}
                    onChange={(on) => edit({ noiseGate: on })}
                  />
                  {draft.noiseGate && (
                    <div className="set-slider">
                      <span>Чувствителност</span>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={draft.noiseGateSensitivity}
                        onChange={(e) => edit({ noiseGateSensitivity: Number(e.target.value) })}
                      />
                      <span className="set-slider-value">{draft.noiseGateSensitivity}</span>
                    </div>
                  )}
                  <Toggle
                    label="Филтър за ниски честоти"
                    hint="Реже бръмчене — вентилатор, климатик, удари по бюрото."
                    checked={draft.highpassFilter}
                    onChange={(on) => edit({ highpassFilter: on })}
                  />
                  <Toggle label="Премахване на ехо" checked={draft.echoCancellation} onChange={(on) => edit({ echoCancellation: on })} />
                  <Toggle
                    label="Потискане на шума (браузърно)"
                    checked={draft.noiseSuppression}
                    onChange={(on) => edit({ noiseSuppression: on })}
                  />
                  <Toggle
                    label="Автоматично ниво на звука"
                    hint="Изравнява тих и силен глас."
                    checked={draft.autoGainControl}
                    onChange={(on) => edit({ autoGainControl: on })}
                  />
                  <p className="set-hint">
                    След „Запази“: AI, шумовата врата и филтърът действат веднага; ехото, браузърното потискане и нивото — при
                    следващото влизане в канал.
                  </p>
                </Card>
              </>
            )}

            {section === "stream" && (
              <>
                <Card title="Режим" hint="И двата са 60 кадъра на видеокартата. Разликата е какво се жертва, ако мрежата или компютърът не смогват.">
                  <div className="set-choices">
                    <Choice
                      name="share-mode"
                      checked={draft.shareMode === "smooth"}
                      title="Плавно · 60 fps"
                      hint="Пази плавността, сваля резолюцията при нужда — за игри и видео."
                      onSelect={() => edit({ shareMode: "smooth" })}
                    />
                    <Choice
                      name="share-mode"
                      checked={draft.shareMode === "sharp"}
                      title="Остро · 60 fps"
                      hint="Пази пълната резолюция и повече битрейт, пуска кадри при нужда — за текст, код, детайл."
                      onSelect={() => edit({ shareMode: "sharp" })}
                    />
                  </div>
                </Card>

                <Card title="Качество" hint="Важи от следващото пускане на стрийм.">
                  <div className="set-choices three">
                    <Choice
                      name="share-quality"
                      checked={draft.shareQuality === "low"}
                      title="Леко · 720p"
                      hint="Слаб компютър или бавен upload."
                      onSelect={() => edit({ shareQuality: "low" })}
                    />
                    <Choice
                      name="share-quality"
                      checked={draft.shareQuality === "standard"}
                      title="Стандарт · 1080p"
                      hint="Безопасно за повечето."
                      onSelect={() => edit({ shareQuality: "standard" })}
                    />
                    <Choice
                      name="share-quality"
                      checked={draft.shareQuality === "high"}
                      title="Високо · 4K"
                      hint="Силна видеокарта и бърз upload."
                      onSelect={() => edit({ shareQuality: "high" })}
                    />
                  </div>
                  <Toggle
                    label="Олекотено копие за слаби връзки (експериментално)"
                    hint="Праща и втори, по-малък поток. Натоварва повече компютъра ти."
                    checked={draft.simulcast}
                    onChange={(on) => edit({ simulcast: on })}
                  />
                </Card>

                <Card title="Рамка на стрийма" hint="Как изглежда стриймът, който гледаш. Сменя се и с 🎬 върху самия стрийм.">
                  <div className="stream-frame-picker set-frames">
                    {STREAM_FRAMES.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        className={`stream-frame-option ${draft.frameId === f.id ? "selected" : ""}`}
                        onClick={() => edit({ frameId: f.id })}
                      >
                        <div className="tv" style={f.height ? { aspectRatio: `1100 / ${f.height}` } : undefined}>
                          <div
                            className="tv-screen"
                            style={{ left: `${f.screen.l}%`, top: `${f.screen.t}%`, width: `${f.screen.w}%`, height: `${f.screen.h}%` }}
                          />
                          <f.Art />
                        </div>
                        <span>{f.name}</span>
                      </button>
                    ))}
                  </div>
                </Card>
              </>
            )}

            {section === "chat" && (
              <>
                <Card title="Текст">
                  <div className="set-slider">
                    <span>Размер на текста</span>
                    <input
                      type="range"
                      min={12}
                      max={22}
                      value={draft.chatFontSize}
                      onChange={(e) => edit({ chatFontSize: Number(e.target.value) })}
                    />
                    <span className="set-slider-value">{draft.chatFontSize}px</span>
                  </div>
                  <div className="set-preview" style={{ fontSize: draft.chatFontSize }}>
                    Здрасти! Така ще изглеждат съобщенията в чата. 👋
                  </div>
                </Card>
                <Card title="Час на съобщенията" hint={`Пример: ${sampleClock}`}>
                  <Toggle label="24-часов формат" checked={draft.clock24h} onChange={(on) => edit({ clock24h: on })} />
                  <Toggle label="Показвай секундите" checked={draft.showSeconds} onChange={(on) => edit({ showSeconds: on })} />
                </Card>
              </>
            )}

            {section === "notifications" && (
              <Card title="Известия">
                <Toggle
                  label="Известия на работния плот"
                  hint="За нови съобщения и лични съобщения, когато прозорецът не е на фокус."
                  checked={draft.desktopNotifications && notifPermission === "granted"}
                  disabled={notifPermission === "unsupported"}
                  onChange={(on) => void toggleNotifications(on)}
                />
                {notifPermission === "denied" && (
                  <p className="set-hint warn">Браузърът блокира известията — разреши ги от иконата до адреса на сайта.</p>
                )}
                <Toggle
                  label="Маркирай непрочетените канали"
                  hint="Текстов канал с нови съобщения, които не си видял, светва с удебелено име и черта отляво."
                  checked={draft.unreadMarkers}
                  onChange={(on) => edit({ unreadMarkers: on })}
                />
                <Toggle
                  label="Напомняния за събития"
                  hint="Известие и звук преди събитие, за което си записан (✅ или 🤔), и когато започне."
                  checked={draft.eventReminders}
                  onChange={(on) => edit({ eventReminders: on })}
                />
                <div className="set-slider">
                  <span>Напомни ми</span>
                  <select
                    className="set-input"
                    value={draft.eventReminderMinutes}
                    disabled={!draft.eventReminders}
                    onChange={(e) => edit({ eventReminderMinutes: Number(e.target.value) })}
                  >
                    <option value={5}>5 минути преди</option>
                    <option value={15}>15 минути преди</option>
                    <option value={60}>1 час преди</option>
                  </select>
                </div>
                <Toggle
                  label="Звук при влизане в гласов канал"
                  hint="Кратък звук, когато някой влезе при теб."
                  checked={draft.joinSound}
                  onChange={(on) => edit({ joinSound: on })}
                />
              </Card>
            )}

            {section === "appearance" && (
              <Card title="Тема" hint="Виждаш я веднага като преглед — остава, ако натиснеш „Запази“.">
                <div className="theme-grid set-themes">
                  {THEMES.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className={`theme-swatch ${draft.themeId === t.id ? "selected" : ""}`}
                      title={t.name}
                      onClick={() => edit({ themeId: t.id })}
                    >
                      <span
                        className="theme-swatch-preview"
                        style={{
                          background: t.bodyImage ? `${t.bodyImage}, hsl(${t.h} ${t.s}% ${t.l}%)` : `hsl(${t.h} ${t.s}% ${t.l}%)`,
                          borderColor: `hsl(${t.h} ${t.s}% ${t.light ? t.l - 14 : t.l + 14}%)`,
                        }}
                      >
                        <span className="theme-swatch-accent" style={{ background: t.accent }} />
                      </span>
                      <span className="theme-swatch-name">{t.name}</span>
                    </button>
                  ))}
                </div>
              </Card>
            )}

            {section === "accessibility" && (
              <Card title="Движение и мащаб">
                <Toggle
                  label="Намали анимациите"
                  hint="Спира анимациите; огънят на Inferno темата спира след презареждане."
                  checked={draft.reduceMotion}
                  onChange={(on) => edit({ reduceMotion: on })}
                />
                <p className="set-hint">Мащаб на целия прозорец: Ctrl + / Ctrl − / Ctrl 0.</p>
              </Card>
            )}
          </div>

          {/* Save bar — on every section. */}
          <footer className={`set-savebar ${dirty ? "dirty" : ""}`}>
            <span className="set-savebar-text">
              {error ? (
                <span className="set-error-inline">{error}</span>
              ) : dirty ? (
                "Имаш незапазени промени"
              ) : justSaved ? (
                <span className="set-ok">Запазено ✓</span>
              ) : (
                "Всичко е запазено"
              )}
            </span>
            <button className="set-button" onClick={discard} disabled={!dirty || saving}>
              Откажи
            </button>
            <button className="set-button primary" onClick={() => void save()} disabled={!dirty || saving || uploading}>
              {saving ? "Запазване…" : "Запази промените"}
            </button>
          </footer>
        </div>
      </div>
    </div>
  );
}
