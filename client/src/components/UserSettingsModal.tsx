import { useEffect, useRef, useState, type ReactNode } from "react";
import { updateProfile } from "../api/auth.api";
import { isCloudinaryConfigured, uploadImageToCloudinary } from "../api/cloudinary";
import { useAuthStore } from "../store/authStore";
import { STREAM_FRAMES, frameName } from "./streamFrames";
import { useStreamFrameStore } from "../store/streamFrameStore";
import { THEMES, applyTheme, getStoredThemeId, themeName } from "../theme/themes";
import { useVoiceStore } from "../store/voiceStore";
import {
  getAutoGainControlEnabled,
  getEchoCancellationEnabled,
  getHighpassFilterEnabled,
  getNoiseGateEnabled,
  getAiNoiseSuppressionEnabled,
  getNoiseGateSensitivity,
  getNoiseSuppressionEnabled,
  getVoiceOnlyEnabled,
  getPreferredMicDeviceId,
  getScreenShareAutoRefreshMin,
  getScreenShareEncoder,
  listMicDevices,
  listSpeakerDevices,
  setPreferredMicDeviceId,
  setScreenShareAutoRefreshMin,
  setScreenShareEncoder,
  supportsOutputDeviceSelection,
} from "../webrtc/devicePrefs";
import { useVoiceChannel } from "../webrtc/useVoiceChannel";
import { useEscapeKey } from "../hooks/useEscapeKey";
import { useAppPrefs } from "../utils/appPrefs";
import AccountSettings from "./AccountSettings";
import "./settings.css";
import { setLang, tr, useLang, useT } from "../i18n";

// A short, readable label for a KeyboardEvent.code — covers the keys people actually bind
// PTT to (modifiers, function keys, mouse-adjacent keys like CapsLock); falls back to the
// raw code for anything else rather than guessing at every possible layout.
function describeKeyCode(code: string): string {
  const known: Record<string, string> = {
    ControlLeft: tr("Ляв Ctrl", "Left Ctrl"),
    ControlRight: tr("Десен Ctrl", "Right Ctrl"),
    AltLeft: tr("Ляв Alt", "Left Alt"),
    AltRight: tr("Десен Alt", "Right Alt"),
    ShiftLeft: tr("Ляв Shift", "Left Shift"),
    ShiftRight: tr("Десен Shift", "Right Shift"),
    CapsLock: "Caps Lock",
    Space: tr("Интервал", "Space"),
    Tab: "Tab",
    Backquote: "`",
  };
  return known[code] ?? code.replace(/^Key/, "").replace(/^Digit/, "");
}

type Section = "profile" | "account" | "voice" | "stream" | "chat" | "notifications" | "appearance" | "accessibility";

// Built at render time so the labels follow the interface language.
function titles(): Record<Section, string> {
  return {
    profile: tr("Моят профил", "My profile"),
    account: tr("Акаунт и парола", "Account & password"),
    voice: tr("Глас и видео", "Voice & video"),
    stream: tr("Стрийм", "Streaming"),
    chat: tr("Чат", "Chat"),
    notifications: tr("Известия", "Notifications"),
    appearance: tr("Външен вид и език", "Appearance & language"),
    accessibility: tr("Достъпност", "Accessibility"),
  };
}

function nav(): { group: string; items: { id: Section; icon: string; label: string }[] }[] {
  const t = titles();
  return [
    {
      group: tr("Потребител", "User"),
      items: [
        { id: "profile", icon: "👤", label: t.profile },
        { id: "account", icon: "🔐", label: t.account },
      ],
    },
    {
      group: tr("Приложение", "App"),
      items: [
        { id: "voice", icon: "🎙️", label: t.voice },
        { id: "stream", icon: "📺", label: t.stream },
        { id: "chat", icon: "💬", label: t.chat },
        { id: "notifications", icon: "🔔", label: t.notifications },
        { id: "appearance", icon: "🎨", label: t.appearance },
        { id: "accessibility", icon: "♿", label: t.accessibility },
      ],
    },
  ];
}

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
  const t = useT();
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
        setError(tr("Няма достъп до микрофона.", "No access to the microphone."));
        setRunning(false);
      }
    })();
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((tr) => tr.stop());
      void ctx?.close();
      setLevel(0);
    };
  }, [running, deviceId]);

  return (
    <div className="set-mictest">
      <button type="button" className="set-button" onClick={() => { setError(null); setRunning((r) => !r); }}>
        {running ? t("Спри теста", "Stop the test") : t("Тествай микрофона", "Test the microphone")}
      </button>
      <div className="set-meter" aria-label={t("Ниво на микрофона", "Microphone level")}>
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
  voiceOnly: boolean;
  noiseGate: boolean;
  noiseGateSensitivity: number;
  highpassFilter: boolean;
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
  shareMode: "smooth" | "sharp";
  shareQuality: "low" | "standard" | "high";
  simulcast: boolean;
  shareEncoder: "gpu" | "cpu";
  shareAutoRefresh: number;
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
    voiceOnly: getVoiceOnlyEnabled(),
    noiseGate: getNoiseGateEnabled(),
    noiseGateSensitivity: getNoiseGateSensitivity(),
    highpassFilter: getHighpassFilterEnabled(),
    echoCancellation: getEchoCancellationEnabled(),
    noiseSuppression: getNoiseSuppressionEnabled(),
    autoGainControl: getAutoGainControlEnabled(),
    shareMode: v.screenShareMode,
    shareQuality: v.screenShareQuality,
    simulcast: v.screenShareSimulcast,
    shareEncoder: getScreenShareEncoder(),
    shareAutoRefresh: getScreenShareAutoRefreshMin(),
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
  const t = useT();
  const lang = useLang();
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
    if (dirty && !window.confirm(t("Имаш незапазени промени. Затвори без да ги запазиш?", "You have unsaved changes. Close without saving them?"))) return;
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
        stream.getTracks().forEach((track) => track.stop());
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
      setError(t("Качването на снимката не успя. Опитай пак.", "The picture didn't upload. Try again."));
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
        if (!d.username.trim()) throw new Error(t("Името не може да е празно.", "The name can't be empty."));
        try {
          setUser(await updateProfile({ username: d.username.trim(), avatarUrl: d.avatarUrl }));
        } catch {
          throw new Error(t("Профилът не се запази — може би името вече е заето.", "The profile wasn't saved — the name may already be taken."));
        }
      }
      if (has("micId")) setPreferredMicDeviceId(d.micId || null);
      if (has("speakerId")) setPreferredSpeakerId(d.speakerId);
      if (has("micMode")) voice.setMicMode(d.micMode);
      if (has("pttKey") && d.pttKey) voice.setPushToTalkKey(d.pttKey);
      if (has("aiSuppression")) voice.setAiNoiseSuppressionEnabled(d.aiSuppression);
      if (has("voiceOnly")) voice.setVoiceOnlyEnabled(d.voiceOnly);
      if (has("noiseGate")) voice.setNoiseGateEnabled(d.noiseGate);
      if (has("noiseGateSensitivity")) voice.setNoiseGateSensitivity(d.noiseGateSensitivity);
      if (has("highpassFilter")) voice.setHighpassFilterEnabled(d.highpassFilter);
      if (has("echoCancellation")) voice.setEchoCancellationEnabled(d.echoCancellation);
      if (has("noiseSuppression")) voice.setNoiseSuppressionEnabled(d.noiseSuppression);
      if (has("autoGainControl")) voice.setAutoGainControlEnabled(d.autoGainControl);
      if (has("shareMode")) voice.setScreenShareMode(d.shareMode);
      if (has("shareQuality")) voice.setScreenShareQuality(d.shareQuality);
      if (has("simulcast")) setScreenShareSimulcast(d.simulcast);
      if (has("shareEncoder")) setScreenShareEncoder(d.shareEncoder);
      if (has("shareAutoRefresh")) setScreenShareAutoRefreshMin(d.shareAutoRefresh);
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
      setError(err instanceof Error ? err.message : t("Нещо се обърка при запазването.", "Something went wrong while saving."));
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
        aria-label={t("Настройки", "Settings")}
      >
        {/* ── sidebar ── */}
        <nav className="set-nav">
          <div className="set-nav-head" onPointerDown={startDrag} title={t("Хвани и премести прозореца", "Drag to move the window")}>
            <span className="set-nav-avatar">
              {user?.avatarUrl ? <img src={user.avatarUrl} alt="" /> : (user?.username ?? "?").slice(0, 2).toUpperCase()}
            </span>
            <span className="set-nav-name">{user?.username}</span>
          </div>
          {nav().map((g) => (
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
            {t("Изход от акаунта", "Log out")}
          </button>
        </nav>

        {/* ── content ── */}
        <div className="set-main">
          <header className="set-main-head" onPointerDown={startDrag}>
            <h2>{titles()[section]}</h2>
            <button className="set-close" onPointerDown={(e) => e.stopPropagation()} onClick={close} title={t("Затвори (Esc)", "Close (Esc)")}>
              ✕
            </button>
          </header>

          <div className="set-scroll">
            {section === "profile" && (
              <Card title={t("Аватар и име", "Avatar & name")} hint={t("Така те виждат другите в чата и в гласовите канали.", "This is how others see you in chat and voice channels.")}>
                <div className="set-profile">
                  <div className="set-profile-avatar">
                    {draft.avatarUrl ? <img src={draft.avatarUrl} alt="" /> : <span>{draft.username.slice(0, 2).toUpperCase()}</span>}
                  </div>
                  <div className="set-profile-fields">
                    <label className="set-field-label" htmlFor="username-input">
                      {t("Потребителско име", "Username")}
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
                        {uploading ? t("Качване…", "Uploading…") : t("Смени аватара", "Change avatar")}
                      </button>
                      <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleAvatarPick} />
                    </div>
                  </div>
                </div>
              </Card>
            )}

            {section === "account" && <AccountSettings />}

            {section === "voice" && (
              <>
                <Card title={t("Устройства", "Devices")}>
                  <label className="set-field-label" htmlFor="mic-select">
                    {t("Микрофон", "Microphone")}
                  </label>
                  <select id="mic-select" className="set-input" value={draft.micId} onChange={(e) => edit({ micId: e.target.value })}>
                    <option value="">{t("По подразбиране (системен)", "Default (system)")}</option>
                    {micDevices.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || `${t("Микрофон", "Microphone")} ${d.deviceId.slice(0, 6)}`}
                      </option>
                    ))}
                  </select>
                  <p className="set-hint">{t("Сменя се при следващото влизане в гласов канал.", "Takes effect the next time you join a voice channel.")}</p>
                  <MicTest deviceId={draft.micId} />

                  <label className="set-field-label" htmlFor="speaker-select">
                    {t("Слушалки / високоговорители", "Headphones / speakers")}
                  </label>
                  {supportsOutputDeviceSelection() ? (
                    <select
                      id="speaker-select"
                      className="set-input"
                      value={draft.speakerId}
                      onChange={(e) => edit({ speakerId: e.target.value })}
                    >
                      <option value="">{t("По подразбиране (системен)", "Default (system)")}</option>
                      {speakerDevices.map((d) => (
                        <option key={d.deviceId} value={d.deviceId}>
                          {d.label || `${t("Изход", "Output")} ${d.deviceId.slice(0, 6)}`}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="set-hint">{t("Този браузър не позволява избор на изход — звукът е през системния.", "This browser can't pick an output — sound goes through the system default.")}</p>
                  )}
                </Card>

                <Card title={t("Режим на микрофона", "Microphone mode")}>
                  <div className="set-choices">
                    <Choice
                      name="mic-mode"
                      checked={draft.micMode === "voice-activation"}
                      title={t("Гласова активност", "Voice activity")}
                      hint={t("Микрофонът е включен, щом не си на mute.", "The mic is on whenever you're not muted.")}
                      onSelect={() => edit({ micMode: "voice-activation" })}
                    />
                    <Choice
                      name="mic-mode"
                      checked={draft.micMode === "push-to-talk"}
                      title="Push-to-talk"
                      hint={t("Говориш само докато държиш клавиш.", "You only talk while holding a key.")}
                      onSelect={() => edit({ micMode: "push-to-talk" })}
                    />
                  </div>
                  {draft.micMode === "push-to-talk" && (
                    <div className="set-row spaced">
                      <span>
                        {t("Клавиш:", "Key:")}{" "}
                        <strong>
                          {listeningForKey ? t("Натисни клавиш…", "Press a key…") : draft.pttKey ? describeKeyCode(draft.pttKey) : t("не е избран", "not set")}
                        </strong>
                      </span>
                      <button type="button" className="set-button" onClick={startBindingPushToTalkKey} disabled={listeningForKey}>
                        {draft.pttKey ? t("Смени", "Change") : t("Избери клавиш", "Pick a key")}
                      </button>
                    </div>
                  )}
                  <p className="set-hint">{t("В браузъра работи само когато прозорецът е на фокус; в десктоп приложението — винаги.", "In the browser it only works while the window is focused; in the desktop app — always.")}</p>
                </Card>

                <Card title="Soundboard" hint={t("Кратките звуци, които хората пускат в гласовия канал (бутон 🔊).", "The short sounds people play in the voice channel (🔊 button).")}>
                  <Toggle
                    label={t("Чувай soundboard звуците", "Hear soundboard sounds")}
                    checked={draft.soundboardEnabled}
                    onChange={(on) => edit({ soundboardEnabled: on })}
                  />
                  <div className="set-slider">
                    <span>{t("Сила на звука", "Volume")}</span>
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

                <Card title={t("Обработка на звука", "Sound processing")} hint={t("Всичко е включено по подразбиране — изключи нещо, ако пречи на твоя микрофон.", "Everything is on by default — turn something off if it fights your microphone.")}>
                  <Toggle
                    label={t("AI шумопотискане", "AI noise suppression")}
                    hint={t("Маха клавиатура, вентилатор, дишане и шум в стаята; оставя гласа.", "Removes keyboard, fan, breathing and room noise; keeps the voice.")}
                    checked={draft.aiSuppression}
                    onChange={(on) => edit({ aiSuppression: on })}
                  />
                  {draft.aiSuppression && (
                    <Toggle
                      label={t("Само глас (без клавиатура)", "Voice only (no keyboard)")}
                      hint={t("Микрофонът праща звук само докато говориш — тракането на клавиатурата и мишката между думите не се чува. Изключи го, ако ти реже началото на думите.", "The mic only sends while you talk — keyboard and mouse clicks between words aren't heard. Turn it off if it cuts the start of your words.")}
                      checked={draft.voiceOnly}
                      onChange={(on) => edit({ voiceOnly: on })}
                    />
                  )}
                  <Toggle
                    label={t("Шумова врата", "Noise gate")}
                    hint={t("Заглушава микрофона между думите, когато е тихо.", "Mutes the mic between words when it's quiet.")}
                    checked={draft.noiseGate}
                    onChange={(on) => edit({ noiseGate: on })}
                  />
                  {draft.noiseGate && (
                    <div className="set-slider">
                      <span>{t("Чувствителност", "Sensitivity")}</span>
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
                    label={t("Филтър за ниски честоти", "Low-cut filter")}
                    hint={t("Реже бръмчене — вентилатор, климатик, удари по бюрото.", "Cuts hum — fans, air conditioning, desk bumps.")}
                    checked={draft.highpassFilter}
                    onChange={(on) => edit({ highpassFilter: on })}
                  />
                  <Toggle label={t("Премахване на ехо", "Echo cancellation")} checked={draft.echoCancellation} onChange={(on) => edit({ echoCancellation: on })} />
                  <Toggle
                    label={t("Потискане на шума (браузърно)", "Noise suppression (browser)")}
                    checked={draft.noiseSuppression}
                    onChange={(on) => edit({ noiseSuppression: on })}
                  />
                  <Toggle
                    label={t("Автоматично ниво на звука", "Automatic gain")}
                    hint={t("Изравнява тих и силен глас.", "Evens out quiet and loud voices.")}
                    checked={draft.autoGainControl}
                    onChange={(on) => edit({ autoGainControl: on })}
                  />
                  <p className="set-hint">
                    {t(
                      "След „Запази“: AI, шумовата врата и филтърът действат веднага; ехото, браузърното потискане и нивото — при следващото влизане в канал.",
                      "After Save: AI, the noise gate and the filter apply at once; echo, browser suppression and gain — the next time you join a channel.",
                    )}
                  </p>
                </Card>
              </>
            )}

            {section === "stream" && (
              <>
                <Card title={t("Режим", "Mode")} hint={t("И двата са 60 кадъра на видеокартата. Разликата е какво се жертва, ако мрежата или компютърът не смогват.", "Both are 60 fps on the graphics card. The difference is what gives way when the network or the PC can't keep up.")}>
                  <div className="set-choices">
                    <Choice
                      name="share-mode"
                      checked={draft.shareMode === "smooth"}
                      title={t("Плавно · 60 fps", "Smooth · 60 fps")}
                      hint={t("Пази плавността, сваля резолюцията при нужда — за игри и видео.", "Keeps it smooth, lowers the resolution when needed — for games and video.")}
                      onSelect={() => edit({ shareMode: "smooth" })}
                    />
                    <Choice
                      name="share-mode"
                      checked={draft.shareMode === "sharp"}
                      title={t("Остро · 60 fps", "Sharp · 60 fps")}
                      hint={t("Пази пълната резолюция и повече битрейт, пуска кадри при нужда — за текст, код, детайл.", "Keeps full resolution and more bitrate, drops frames when needed — for text, code, detail.")}
                      onSelect={() => edit({ shareMode: "sharp" })}
                    />
                  </div>
                </Card>

                <Card
                  title={t("Кодиране", "Encoding")}
                  hint={t("Важи от следващото пускане на стрийм. „Процесор“ е за видеокарти, чийто енкодер засича играта (напр. някои AMD) — натоварва процесора повече.", "Applies from the next stream. \"Processor\" is for graphics cards whose encoder makes the game stutter (e.g. some AMD) — it loads the CPU more.")}
                >
                  <div className="set-choices">
                    <Choice
                      name="share-encoder"
                      checked={draft.shareEncoder === "gpu"}
                      title={t("Видеокарта", "Graphics card")}
                      hint={t("По подразбиране. Най-леко за компютъра.", "Default. Lightest for the PC.")}
                      onSelect={() => edit({ shareEncoder: "gpu" })}
                    />
                    <Choice
                      name="share-encoder"
                      checked={draft.shareEncoder === "cpu"}
                      title={t("Процесор", "Processor")}
                      hint={t("Софтуерно кодиране — пробвай, ако играта губи fps, докато стриймваш.", "Software encoding — try it if the game loses fps while you stream.")}
                      onSelect={() => edit({ shareEncoder: "cpu" })}
                    />
                  </div>
                  <div className="set-slider">
                    <span>{t("Освежавай енкодера", "Refresh the encoder")}</span>
                    <select className="set-input" value={draft.shareAutoRefresh} onChange={(e) => edit({ shareAutoRefresh: Number(e.target.value) })}>
                      <option value={0}>{t("Никога", "Never")}</option>
                      <option value={3}>{t("на всеки 3 мин", "every 3 min")}</option>
                      <option value={5}>{t("на всеки 5 мин", "every 5 min")}</option>
                      <option value={8}>{t("на всеки 8 мин", "every 8 min")}</option>
                    </select>
                  </div>
                  <p className="set-hint">
                    {t(
                      "Ако играта ти започва да засича след няколко минути стрийм и спирането/пускането го оправя — това го прави само (зрителите виждат само миг пауза). Ръчно: бутонът 🔄 в панела 📊 на стрийма.",
                      "If your game starts stuttering after a few minutes of streaming and stopping/starting fixes it — this does that by itself (viewers only see a brief pause). Manually: the 🔄 button in the stream's 📊 panel.",
                    )}
                  </p>
                </Card>

                <Card title={t("Качество", "Quality")} hint={t("Важи от следващото пускане на стрийм.", "Applies from the next stream.")}>
                  <div className="set-choices three">
                    <Choice
                      name="share-quality"
                      checked={draft.shareQuality === "low"}
                      title={t("Леко · 720p", "Light · 720p")}
                      hint={t("Слаб компютър или бавен upload.", "Weak PC or slow upload.")}
                      onSelect={() => edit({ shareQuality: "low" })}
                    />
                    <Choice
                      name="share-quality"
                      checked={draft.shareQuality === "standard"}
                      title={t("Стандарт · 1080p", "Standard · 1080p")}
                      hint={t("Безопасно за повечето.", "Safe for most.")}
                      onSelect={() => edit({ shareQuality: "standard" })}
                    />
                    <Choice
                      name="share-quality"
                      checked={draft.shareQuality === "high"}
                      title={t("Високо · 4K", "High · 4K")}
                      hint={t("Силна видеокарта и бърз upload.", "Strong graphics card and fast upload.")}
                      onSelect={() => edit({ shareQuality: "high" })}
                    />
                  </div>
                  <Toggle
                    label={t("Олекотено копие за слаби връзки (експериментално)", "Light copy for weak connections (experimental)")}
                    hint={t("Праща и втори, по-малък поток. Натоварва повече компютъра ти.", "Also sends a second, smaller stream. Loads your PC more.")}
                    checked={draft.simulcast}
                    onChange={(on) => edit({ simulcast: on })}
                  />
                </Card>

                <Card title={t("Рамка на стрийма", "Stream frame")} hint={t("Как изглежда стриймът, който гледаш. Сменя се и с 🎬 върху самия стрийм.", "How the stream you watch looks. Also changed with 🎬 on the stream itself.")}>
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
                        <span>{frameName(f)}</span>
                      </button>
                    ))}
                  </div>
                </Card>
              </>
            )}

            {section === "chat" && (
              <>
                <Card title={t("Текст", "Text")}>
                  <div className="set-slider">
                    <span>{t("Размер на текста", "Text size")}</span>
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
                    {t("Здрасти! Така ще изглеждат съобщенията в чата. 👋", "Hi! This is how chat messages will look. 👋")}
                  </div>
                </Card>
                <Card title={t("Час на съобщенията", "Message time")} hint={`${t("Пример", "Example")}: ${sampleClock}`}>
                  <Toggle label={t("24-часов формат", "24-hour clock")} checked={draft.clock24h} onChange={(on) => edit({ clock24h: on })} />
                  <Toggle label={t("Показвай секундите", "Show seconds")} checked={draft.showSeconds} onChange={(on) => edit({ showSeconds: on })} />
                </Card>
              </>
            )}

            {section === "notifications" && (
              <Card title={t("Известия", "Notifications")}>
                <Toggle
                  label={t("Известия на работния плот", "Desktop notifications")}
                  hint={t("За нови съобщения и лични съобщения, когато прозорецът не е на фокус.", "For new messages and direct messages while the window isn't focused.")}
                  checked={draft.desktopNotifications && notifPermission === "granted"}
                  disabled={notifPermission === "unsupported"}
                  onChange={(on) => void toggleNotifications(on)}
                />
                {notifPermission === "denied" && (
                  <p className="set-hint warn">{t("Браузърът блокира известията — разреши ги от иконата до адреса на сайта.", "The browser blocks notifications — allow them from the icon next to the site address.")}</p>
                )}
                <Toggle
                  label={t("Маркирай непрочетените канали", "Mark unread channels")}
                  hint={t("Текстов канал с нови съобщения, които не си видял, светва с удебелено име и черта отляво.", "A text channel with messages you haven't seen lights up with a bold name and a bar on the left.")}
                  checked={draft.unreadMarkers}
                  onChange={(on) => edit({ unreadMarkers: on })}
                />
                <Toggle
                  label={t("Напомняния за събития", "Event reminders")}
                  hint={t("Известие и звук преди събитие, за което си записан (✅ или 🤔), и когато започне.", "A notification and sound before an event you signed up for (✅ or 🤔), and when it starts.")}
                  checked={draft.eventReminders}
                  onChange={(on) => edit({ eventReminders: on })}
                />
                <div className="set-slider">
                  <span>{t("Напомни ми", "Remind me")}</span>
                  <select
                    className="set-input"
                    value={draft.eventReminderMinutes}
                    disabled={!draft.eventReminders}
                    onChange={(e) => edit({ eventReminderMinutes: Number(e.target.value) })}
                  >
                    <option value={5}>{t("5 минути преди", "5 minutes before")}</option>
                    <option value={15}>{t("15 минути преди", "15 minutes before")}</option>
                    <option value={60}>{t("1 час преди", "1 hour before")}</option>
                  </select>
                </div>
                <Toggle
                  label={t("Звук при влизане в гласов канал", "Voice channel join sound")}
                  hint={t("Кратък звук, когато някой влезе при теб.", "A short sound when someone joins you.")}
                  checked={draft.joinSound}
                  onChange={(on) => edit({ joinSound: on })}
                />
              </Card>
            )}

            {section === "appearance" && (
              <>
              <Card title={t("Език", "Language")} hint={t("Сменя се веднага.", "Changes right away.")}>
                <div className="set-choices">
                  <Choice name="ui-lang" checked={lang === "bg"} title="Български" hint="Интерфейсът на български." onSelect={() => setLang("bg")} />
                  <Choice name="ui-lang" checked={lang === "en"} title="English" hint="The interface in English." onSelect={() => setLang("en")} />
                </div>
              </Card>
              <Card title={t("Тема", "Theme")} hint={t("Виждаш я веднага като преглед — остава, ако натиснеш „Запази“.", "You see it right away as a preview — it stays if you press Save.")}>
                <div className="theme-grid set-themes">
                  {THEMES.map((th) => (
                    <button
                      key={th.id}
                      type="button"
                      className={`theme-swatch ${draft.themeId === th.id ? "selected" : ""}`}
                      title={themeName(th)}
                      onClick={() => edit({ themeId: th.id })}
                    >
                      <span
                        className="theme-swatch-preview"
                        style={{
                          background: th.bodyImage ? `${th.bodyImage}, hsl(${th.h} ${th.s}% ${th.l}%)` : `hsl(${th.h} ${th.s}% ${th.l}%)`,
                          borderColor: `hsl(${th.h} ${th.s}% ${th.light ? th.l - 14 : th.l + 14}%)`,
                        }}
                      >
                        <span className="theme-swatch-accent" style={{ background: th.accent }} />
                      </span>
                      <span className="theme-swatch-name">{themeName(th)}</span>
                    </button>
                  ))}
                </div>
              </Card>
              </>
            )}

            {section === "accessibility" && (
              <Card title={t("Движение и мащаб", "Motion & zoom")}>
                <Toggle
                  label={t("Намали анимациите", "Reduce motion")}
                  hint={t("Спира анимациите; огънят на Inferno темата спира след презареждане.", "Stops animations; the Inferno theme's fire stops after a reload.")}
                  checked={draft.reduceMotion}
                  onChange={(on) => edit({ reduceMotion: on })}
                />
                <p className="set-hint">{t("Мащаб на целия прозорец: Ctrl + / Ctrl − / Ctrl 0.", "Zoom the whole window: Ctrl + / Ctrl − / Ctrl 0.")}</p>
              </Card>
            )}
          </div>

          {/* Save bar — on every section. */}
          <footer className={`set-savebar ${dirty ? "dirty" : ""}`}>
            <span className="set-savebar-text">
              {error ? (
                <span className="set-error-inline">{error}</span>
              ) : dirty ? (
                t("Имаш незапазени промени", "You have unsaved changes")
              ) : justSaved ? (
                <span className="set-ok">{t("Запазено ✓", "Saved ✓")}</span>
              ) : (
                t("Всичко е запазено", "Everything is saved")
              )}
            </span>
            <button className="set-button" onClick={discard} disabled={!dirty || saving}>
              {t("Откажи", "Discard")}
            </button>
            <button className="set-button primary" onClick={() => void save()} disabled={!dirty || saving || uploading}>
              {saving ? t("Запазване…", "Saving…") : t("Запази промените", "Save changes")}
            </button>
          </footer>
        </div>
      </div>
    </div>
  );
}
