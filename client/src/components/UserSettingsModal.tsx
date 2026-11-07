import { useEffect, useRef, useState } from "react";
import { changePassword, updateProfile } from "../api/auth.api";
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

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicId, setSelectedMicId] = useState(getPreferredMicDeviceId() ?? "");
  const [speakerDevices, setSpeakerDevices] = useState<MediaDeviceInfo[]>([]);
  const preferredSpeakerId = useVoiceStore((s) => s.preferredSpeakerId);
  const setPreferredSpeakerId = useVoiceStore((s) => s.setPreferredSpeakerId);

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

  async function handleChangePassword() {
    setPasswordError(null);
    setPasswordSuccess(false);
    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError("Fill in all password fields.");
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError("New password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords don't match.");
      return;
    }
    setPasswordSaving(true);
    try {
      await changePassword(currentPassword, newPassword);
      setPasswordSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      setPasswordError(err?.response?.data?.error ?? "Could not change password.");
    } finally {
      setPasswordSaving(false);
    }
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

        {error && <div className="modal-error">{error}</div>}

        <button className="modal-join-button" onClick={handleSave} disabled={saving || uploading || !username.trim()}>
          {saving ? "Saving…" : "Save Changes"}
        </button>

        <h2 className="modal-section-title">Change Password</h2>

        <label className="modal-label" htmlFor="current-password-input">
          Current Password
        </label>
        <input
          id="current-password-input"
          type="password"
          autoComplete="current-password"
          className="modal-input"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
        />

        <label className="modal-label" htmlFor="new-password-input">
          New Password
        </label>
        <input
          id="new-password-input"
          type="password"
          autoComplete="new-password"
          className="modal-input"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />

        <label className="modal-label" htmlFor="confirm-password-input">
          Confirm New Password
        </label>
        <input
          id="confirm-password-input"
          type="password"
          autoComplete="new-password"
          className="modal-input"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />

        {passwordError && <div className="modal-error">{passwordError}</div>}
        {passwordSuccess && <div className="modal-success">Password changed successfully.</div>}

        <button
          className="modal-join-button"
          onClick={handleChangePassword}
          disabled={passwordSaving || !currentPassword || !newPassword || !confirmPassword}
        >
          {passwordSaving ? "Saving…" : "Change Password"}
        </button>

        <button className="modal-logout-button" onClick={handleLogout}>
          Log Out
        </button>
      </div>
    </div>
  );
}
