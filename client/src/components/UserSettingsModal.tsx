import { useEffect, useRef, useState } from "react";
import { updateProfile } from "../api/auth.api";
import { isCloudinaryConfigured, uploadImageToCloudinary } from "../api/cloudinary";
import { useAuthStore } from "../store/authStore";
import { useVoiceStore } from "../store/voiceStore";
import {
  getPreferredMicDeviceId,
  listMicDevices,
  listSpeakerDevices,
  setPreferredMicDeviceId,
  supportsOutputDeviceSelection,
} from "../webrtc/devicePrefs";
import { useVoiceChannel } from "../webrtc/useVoiceChannel";

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

interface Props {
  onClose: () => void;
}

export default function UserSettingsModal({ onClose }: Props) {
  const { user, setUser, logout } = useAuthStore();
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
  const { setMicMode, setPushToTalkKey, setScreenShareQuality } = useVoiceChannel();
  const [listeningForKey, setListeningForKey] = useState(false);

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
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <button className="modal-back" onClick={onClose} aria-label="Back">
          ←
        </button>

        <h1 className="modal-title">User Settings</h1>

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

        <h2 className="modal-section-title">Screen Share Quality</h2>

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
          High — 4K, needs a stronger CPU while sharing
        </label>
        <p className="modal-hint">
          Applies the next time you start a screen share. High encodes 3 quality levels at once
          (so every viewer gets one that fits their connection) — on weaker hardware this can
          cause the shared video itself to stutter.
        </p>

        {error && <div className="modal-error">{error}</div>}

        <button className="modal-join-button" onClick={handleSave} disabled={saving || uploading || !username.trim()}>
          {saving ? "Saving…" : "Save Changes"}
        </button>

        <button className="modal-logout-button" onClick={handleLogout}>
          Log Out
        </button>
      </div>
    </div>
  );
}
