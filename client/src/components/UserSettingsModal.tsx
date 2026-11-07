import { useRef, useState } from "react";
import { updateProfile } from "../api/auth.api";
import { isCloudinaryConfigured, uploadImageToCloudinary } from "../api/cloudinary";
import { useAuthStore } from "../store/authStore";

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
