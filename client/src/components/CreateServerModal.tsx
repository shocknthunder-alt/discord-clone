import { useRef, useState } from "react";
import { createServer, updateServer } from "../api/servers.api";
import { isCloudinaryConfigured, uploadImageToCloudinary } from "../api/cloudinary";
import { useServerStore } from "../store/serverStore";

interface Props {
  onClose: () => void;
}

export default function CreateServerModal({ onClose }: Props) {
  const { addServer, setActiveServer } = useServerStore();
  const [name, setName] = useState("");
  const [iconUrl, setIconUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [creating, setCreating] = useState(false);
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

  async function handleCreate() {
    if (!name.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const created = await createServer(name.trim());
      const server = iconUrl ? await updateServer(created.id, { iconUrl }) : created;
      addServer(server);
      setActiveServer(server.id);
      onClose();
    } catch {
      setError("Could not create the server. Try again.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <button className="modal-back" onClick={onClose} aria-label="Back">
          ←
        </button>

        <h1 className="modal-title">Create your server</h1>
        <p className="modal-subtitle">Give it a personality with a name and an icon. You can change these anytime.</p>

        <div className="avatar-picker">
          {iconUrl ? (
            <img className="avatar-picker-preview" src={iconUrl} alt="" />
          ) : (
            <div className="avatar-picker-preview placeholder">{name.slice(0, 2).toUpperCase() || "?"}</div>
          )}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || !isCloudinaryConfigured()}
          >
            {uploading ? "Uploading…" : "Upload Icon"}
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleIconPick} />
        </div>

        <label className="modal-label" htmlFor="server-name-input">
          Server Name
        </label>
        <input
          id="server-name-input"
          className="modal-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          placeholder="e.g. My Awesome Server"
          autoFocus
        />

        {error && <div className="modal-error">{error}</div>}

        <button
          className="modal-create-button"
          onClick={handleCreate}
          disabled={creating || uploading || !name.trim()}
        >
          {creating ? "Creating…" : "Create Server"}
        </button>
      </div>
    </div>
  );
}
