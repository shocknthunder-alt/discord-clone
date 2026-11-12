import { useEffect, useRef, useState } from "react";
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
import { formatTime, useAppPrefs } from "../utils/appPrefs";

// A short, readable label for a KeyboardEvent.code — covers the keys people actually bind
// PTT to (modifiers, function keys, mouse-adjacent keys like CapsLock); falls back to the
// raw code for anything else rather than guessing at every possible layout.
function describeKeyCode(code: string): string {
  const known: Record<string, string> = {
    ControlLeft: "Left Ctrl",
    ControlRight: "Right Ctrl",
    AltLeft: "Left Alt",
    AltRight: "Right Alt",
    ShiftLeft: "Left Shift",
    ShiftRight: "Right Shift",
    CapsLock: "Caps Lock",
    Space: "Space",
    Tab: "Tab",
    Backquote: "`",
  };
  return known[code] ?? code.replace(/^Key/, "").replace(/^Digit/, "");
}

type SettingsTab = "profile" | "general" | "audio" | "stream" | "appearance";

const SETTINGS_TABS: { id: SettingsTab; label: string }[] = [
  { id: "profile", label: "👤 Профил" },
  { id: "general", label: "⚙️ Общи" },
  { id: "audio", label: "🎙️ Звук" },
  { id: "stream", label: "📺 Стрийм" },
  { id: "appearance", label: "🎨 Външен вид" },
];

interface Props {
  onClose: () => void;
}

/** Settings → Общи: chat text, clock, notifications, sounds, motion. Applied the moment they change. */
function GeneralSettings() {
  const prefs = useAppPrefs();
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    typeof Notification === "undefined" ? "unsupported" : Notification.permission,
  );

  async function toggleNotifications(on: boolean) {
    if (on && permission !== "granted" && permission !== "unsupported") {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== "granted") return;
    }
    prefs.set({ desktopNotifications: on });
  }

  const sample = new Date();
  sample.setHours(14, 5, 33);

  return (
    <>
      <div className="modal-label">Чат</div>
      <div className="ptt-keybind-row">
        <span>Размер на текста: {prefs.chatFontSize}px</span>
        <input
          type="range"
          min={12}
          max={22}
          value={prefs.chatFontSize}
          onChange={(e) => prefs.set({ chatFontSize: Number(e.target.value) })}
        />
      </div>
      <p className="modal-hint message-text">Примерно съобщение в чата.</p>

      <label className="modal-checkbox-label">
        <input type="checkbox" checked={prefs.clock24h} onChange={(e) => prefs.set({ clock24h: e.target.checked })} />
        24-часов формат на часа
      </label>
      <label className="modal-checkbox-label">
        <input type="checkbox" checked={prefs.showSeconds} onChange={(e) => prefs.set({ showSeconds: e.target.checked })} />
        Показвай секундите
      </label>
      <p className="modal-hint">Пример: {formatTime(sample.toISOString())}</p>

      <div className="modal-label">Известия</div>
      <label className="modal-checkbox-label">
        <input
          type="checkbox"
          checked={prefs.desktopNotifications && permission === "granted"}
          disabled={permission === "unsupported"}
          onChange={(e) => void toggleNotifications(e.target.checked)}
        />
        Известия на работния плот за нови съобщения (когато прозорецът не е на фокус)
      </label>
      {permission === "denied" && (
        <p className="modal-hint">Браузърът блокира известията — разреши ги от иконата до адреса на сайта.</p>
      )}
      <label className="modal-checkbox-label">
        <input type="checkbox" checked={prefs.joinSound} onChange={(e) => prefs.set({ joinSound: e.target.checked })} />
        Звук, когато някой влезе в гласовия канал
      </label>

      <div className="modal-label">Достъпност</div>
      <label className="modal-checkbox-label">
        <input type="checkbox" checked={prefs.reduceMotion} onChange={(e) => prefs.set({ reduceMotion: e.target.checked })} />
        Намали анимациите (спира и огъня на Inferno темата след презареждане)
      </label>
      <p className="modal-hint">Мащаб на целия прозорец: Ctrl + / Ctrl − / Ctrl 0.</p>
    </>
  );
}

export default function UserSettingsModal({ onClose }: Props) {
  const { user, setUser, logout } = useAuthStore();
  const [tab, setTab] = useState<SettingsTab>("profile");
  const streamFrameId = useStreamFrameStore((st) => st.frameId);
  const setStreamFrameId = useStreamFrameStore((st) => st.setFrameId);
  const [themeId, setThemeId] = useState(getStoredThemeId());
  const [username, setUsername] = useState(user?.username ?? "");
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl ?? null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicId, setSelectedMicId] = useState(getPreferredMicDeviceId() ?? "");
  const [speakerDevices, setSpeakerDevices] = useState<MediaDeviceInfo[]>([]);
  const preferredSpeakerId = useVoiceStore((s) => s.preferredSpeakerId);
  const setPreferredSpeakerId = useVoiceStore((s) => s.setPreferredSpeakerId);
  const micMode = useVoiceStore((s) => s.micMode);
  const pushToTalkKey = useVoiceStore((s) => s.pushToTalkKey);
  const screenShareQuality = useVoiceStore((s) => s.screenShareQuality);
  const screenShareMode = useVoiceStore((s) => s.screenShareMode);
  const screenShareSimulcast = useVoiceStore((s) => s.screenShareSimulcast);
  const setScreenShareSimulcast = useVoiceStore((s) => s.setScreenShareSimulcast);
  const {
    setMicMode,
    setPushToTalkKey,
    setScreenShareQuality,
    setScreenShareMode,
    setEchoCancellationEnabled,
    setNoiseSuppressionEnabled,
    setAutoGainControlEnabled,
    setHighpassFilterEnabled,
    setAiNoiseSuppressionEnabled,
    setNoiseGateEnabled,
    setNoiseGateSensitivity,
  } = useVoiceChannel();
  const [listeningForKey, setListeningForKey] = useState(false);
  // Escape is a valid key to bind for push-to-talk, so it must not also close the modal then.
  useEscapeKey(() => {
    if (!listeningForKey) onClose();
  });

  const [echoCancellation, setEchoCancellationState] = useState(getEchoCancellationEnabled());
  const [noiseSuppression, setNoiseSuppressionState] = useState(getNoiseSuppressionEnabled());
  const [autoGainControl, setAutoGainControlState] = useState(getAutoGainControlEnabled());
  const [highpassFilter, setHighpassFilterState] = useState(getHighpassFilterEnabled());
  const [aiSuppression, setAiSuppressionState] = useState(getAiNoiseSuppressionEnabled());
  const [noiseGate, setNoiseGateState] = useState(getNoiseGateEnabled());
  const [noiseGateSensitivity, setNoiseGateSensitivityState] = useState(getNoiseGateSensitivity());

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

  function handleMicChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const deviceId = e.target.value;
    setSelectedMicId(deviceId);
    setPreferredMicDeviceId(deviceId || null);
  }

  function handleSpeakerChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setPreferredSpeakerId(e.target.value);
  }

  function startBindingPushToTalkKey() {
    setListeningForKey(true);

    function onKeyDown(e: KeyboardEvent) {
      e.preventDefault();
      setPushToTalkKey(e.code);
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
      const url = await uploadImageToCloudinary(file);
      setAvatarUrl(url);
    } catch {
      setError("Image upload failed. Try again.");
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    if (!username.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateProfile({ username: username.trim(), avatarUrl });
      setUser(updated);
      onClose();
    } catch {
      setError("Could not save — username may already be taken.");
    } finally {
      setSaving(false);
    }
  }

  function handleLogout() {
    logout();
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card settings-card" onClick={(e) => e.stopPropagation()}>
        <button className="modal-back" onClick={onClose} aria-label="Back">
          ←
        </button>

        <h1 className="modal-title">User Settings</h1>

        <div className="settings-tabs" role="tablist">
          {SETTINGS_TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              className={`settings-tab ${tab === t.id ? "active" : ""}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="settings-body">
        {tab === "profile" && (
          <>
        <div className="avatar-picker">
          {avatarUrl ? (
            <img className="avatar-picker-preview" src={avatarUrl} alt="" />
          ) : (
            <div className="avatar-picker-preview placeholder">{username.slice(0, 2).toUpperCase()}</div>
          )}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || !isCloudinaryConfigured()}
          >
            {uploading ? "Uploading…" : "Change Avatar"}
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleAvatarPick} />
        </div>

        <label className="modal-label" htmlFor="username-input">
          Username
        </label>
        <input id="username-input" className="modal-input" value={username} onChange={(e) => setUsername(e.target.value)} />

          </>
        )}

        {tab === "general" && <GeneralSettings />}

        {tab === "audio" && (
          <>
        <label className="modal-label" htmlFor="mic-select">
          Microphone
        </label>
        <select id="mic-select" className="modal-input" value={selectedMicId} onChange={handleMicChange}>
          <option value="">System Default</option>
          {micDevices.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || `Microphone ${d.deviceId.slice(0, 6)}`}
            </option>
          ))}
        </select>
        <p className="modal-hint">Takes effect next time you join a voice channel.</p>

        <label className="modal-label" htmlFor="speaker-select">
          Output Device (Speaker)
        </label>
        {supportsOutputDeviceSelection() ? (
          <>
            <select
              id="speaker-select"
              className="modal-input"
              value={preferredSpeakerId}
              onChange={handleSpeakerChange}
            >
              <option value="">System Default</option>
              {speakerDevices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Speaker ${d.deviceId.slice(0, 6)}`}
                </option>
              ))}
            </select>
            <p className="modal-hint">Applies immediately to anyone already talking.</p>
          </>
        ) : (
          <p className="modal-hint">
            Your browser doesn't support choosing an output device — audio plays through your system default.
          </p>
        )}

          </>
        )}

        {tab === "appearance" && (
          <>
        <h2 className="modal-section-title">Theme</h2>
        <div className="theme-grid">
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`theme-swatch ${themeId === t.id ? "selected" : ""}`}
              title={t.name}
              onClick={() => {
                setThemeId(t.id);
                applyTheme(t.id, true);
              }}
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

          </>
        )}

        {tab === "stream" && (
          <>
        <h2 className="modal-section-title">Stream Frame</h2>
        <div className="stream-frame-picker">
          {STREAM_FRAMES.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`stream-frame-option ${streamFrameId === f.id ? "selected" : ""}`}
              onClick={() => setStreamFrameId(f.id)}
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

          </>
        )}

        {tab === "audio" && (
          <>
        <h2 className="modal-section-title">Input Mode</h2>

        <label className="modal-radio-label">
          <input
            type="radio"
            name="mic-mode"
            checked={micMode === "voice-activation"}
            onChange={() => setMicMode("voice-activation")}
          />
          Voice Activation — mic is live whenever you're not muted
        </label>
        <label className="modal-radio-label">
          <input
            type="radio"
            name="mic-mode"
            checked={micMode === "push-to-talk"}
            onChange={() => setMicMode("push-to-talk")}
          />
          Push to Talk — mic is only live while a key is held
        </label>

        {micMode === "push-to-talk" && (
          <div className="ptt-keybind-row">
            <span>
              Key: <strong>{listeningForKey ? "Press any key…" : pushToTalkKey ? describeKeyCode(pushToTalkKey) : "Not set"}</strong>
            </span>
            <button type="button" onClick={startBindingPushToTalkKey} disabled={listeningForKey}>
              {pushToTalkKey ? "Change" : "Bind a key"}
            </button>
          </div>
        )}

          </>
        )}

        {tab === "stream" && (
          <>
        <h2 className="modal-section-title">Screen Share Mode</h2>

        <label className="modal-radio-label">
          <input
            type="radio"
            name="screen-share-mode"
            checked={screenShareMode === "smooth"}
            onChange={() => setScreenShareMode("smooth")}
          />
          Smooth — up to 60 FPS, for games and videos
        </label>
        <label className="modal-radio-label">
          <input
            type="radio"
            name="screen-share-mode"
            checked={screenShareMode === "sharp"}
            onChange={() => setScreenShareMode("sharp")}
          />
          Sharp — 30 FPS, maximum detail, for text, slides and code
        </label>

        <h2 className="modal-section-title">Screen Share Quality</h2>

        <label className="modal-radio-label">
          <input
            type="radio"
            name="screen-share-quality"
            checked={screenShareQuality === "low"}
            onChange={() => setScreenShareQuality("low")}
          />
          Light — 720p, for weaker computers or a slow upload (often smoother than 1080p)
        </label>
        <label className="modal-radio-label">
          <input
            type="radio"
            name="screen-share-quality"
            checked={screenShareQuality === "standard"}
            onChange={() => setScreenShareQuality("standard")}
          />
          Standard — 1080p, safe for most computers
        </label>
        <label className="modal-radio-label">
          <input
            type="radio"
            name="screen-share-quality"
            checked={screenShareQuality === "high"}
            onChange={() => setScreenShareQuality("high")}
          />
          High — 4K, needs a strong computer and a fast upload
        </label>
        <p className="modal-hint">
          Both apply the next time you start a screen share. Tip: a game on the screen you share
          costs the same power as a game — use Smooth + Standard, and share a whole screen (not
          a window) if you also want the sound.
        </p>

        <label className="modal-radio-label">
          <input
            type="checkbox"
            checked={screenShareSimulcast}
            onChange={(e) => setScreenShareSimulcast(e.target.checked)}
          />
          Experimental: also send a lighter copy for viewers with a weak connection (uses more of your PC)
        </label>

          </>
        )}

        {tab === "audio" && (
          <>
        <h2 className="modal-section-title">Audio Processing</h2>
        <p className="modal-hint">All on by default — turn one off if it's fighting your specific mic.</p>

        <label className="modal-checkbox-label">
          <input
            type="checkbox"
            checked={echoCancellation}
            onChange={(e) => {
              setEchoCancellationState(e.target.checked);
              setEchoCancellationEnabled(e.target.checked);
            }}
          />
          Echo Cancellation
        </label>
        <label className="modal-checkbox-label">
          <input
            type="checkbox"
            checked={noiseSuppression}
            onChange={(e) => {
              setNoiseSuppressionState(e.target.checked);
              setNoiseSuppressionEnabled(e.target.checked);
            }}
          />
          Noise Suppression
        </label>
        <label className="modal-checkbox-label">
          <input
            type="checkbox"
            checked={autoGainControl}
            onChange={(e) => {
              setAutoGainControlState(e.target.checked);
              setAutoGainControlEnabled(e.target.checked);
            }}
          />
          Auto Gain Control (levels out quiet/loud mic volume)
        </label>
        <p className="modal-hint">These three take effect next time you join a voice channel.</p>

        <label className="modal-checkbox-label">
          <input
            type="checkbox"
            checked={highpassFilter}
            onChange={(e) => {
              setHighpassFilterState(e.target.checked);
              setHighpassFilterEnabled(e.target.checked);
            }}
          />
          Highpass Filter (cuts low rumble — fan/AC hum, desk thumps)
        </label>
        <label className="modal-checkbox-label">
          <input
            type="checkbox"
            checked={aiSuppression}
            onChange={(e) => {
              setAiSuppressionState(e.target.checked);
              setAiNoiseSuppressionEnabled(e.target.checked);
            }}
          />
          AI noise suppression (removes keyboard, fan, breathing and room noise; keeps your voice)
        </label>
        <label className="modal-checkbox-label">
          <input
            type="checkbox"
            checked={noiseGate}
            onChange={(e) => {
              setNoiseGateState(e.target.checked);
              setNoiseGateEnabled(e.target.checked);
            }}
          />
          Noise Gate (mutes your mic between words when it's quiet)
        </label>
        {noiseGate && (
          <div className="ptt-keybind-row">
            <span>Sensitivity</span>
            <input
              type="range"
              min={0}
              max={100}
              value={noiseGateSensitivity}
              onChange={(e) => {
                const value = Number(e.target.value);
                setNoiseGateSensitivityState(value);
                setNoiseGateSensitivity(value);
              }}
            />
          </div>
        )}
        <p className="modal-hint">
          Higher sensitivity picks up quieter speech too, but may also let more background
          noise through. These two apply immediately to a call already in progress.
        </p>

          </>
        )}

        {tab === "profile" && (
          <button className="modal-logout-button" onClick={handleLogout}>
            Log Out
          </button>
        )}
        </div>

        {/* Same footer on every tab. Audio/stream/theme options are applied (and remembered) the
            moment they change; Save stores the profile and closes. */}
        <div className="settings-footer">
          {error && <div className="modal-error">{error}</div>}
          <button className="modal-create-button" onClick={handleSave} disabled={saving || uploading || !username.trim()}>
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>

      </div>
    </div>
  );
}
