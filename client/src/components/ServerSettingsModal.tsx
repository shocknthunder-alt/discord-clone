import type { ServerDTO } from "@discord-clone/shared";
import { useRef, useState } from "react";
import { updateServer } from "../api/servers.api";
import { isCloudinaryConfigured, uploadImageToCloudinary } from "../api/cloudinary";
import { useServerStore } from "../store/serverStore";

interface Props {
  server: ServerDTO;
  onClose: () => void;
}

export default function ServerSettingsModal({ server, onClose }: Props) {
  const updateServerInList = useServerStore((s) => s.updateServerInList);
  const [name, setName] = useState(server.name);
  const [iconUrl, setIconUrl] = useState(server.iconUrl);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleIconPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    try {
      const url = await uploadImageToCloudinary(file);
      setIconUrl(url);
    } catch {
      setError("Image upload failed. Try again.");
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateServer(server.id, { name: name.trim(), iconUrl });
      updateServerInList(updated);
      onClose();
    } catch {
      setError("Could not save server settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <button className="modal-back" onClick={onClose} aria-label="Back">
          ←
        </button>

        <h1 className="modal-title">Server Settings</h1>

        <div className="avatar-picker">
          {iconUrl ? (
            <img className="avatar-picker-preview" src={iconUrl} alt="" />
          ) : (
            <div className="avatar-picker-preview placeholder">{name.slice(0, 2).toUpperCase()}</div>
          )}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || !isCloudinaryConfigured()}
          >
            {uploading ? "Uploading…" : "Change Icon"}
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleIconPick} />
        </div>

        <label className="modal-label" htmlFor="server-name-input">
          Server Name
        </label>
        <input id="server-name-input" className="modal-input" value={name} onChange={(e) => setName(e.target.value)} />

        {error && <div className="modal-error">{error}</div>}

        <button className="modal-join-button" onClick={handleSave} disabled={saving || uploading || !name.trim()}>
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
