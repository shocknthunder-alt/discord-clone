import { useRef, useState } from "react";
import { createCustomEmoji } from "../api/servers.api";
import { isCloudinaryConfigured, uploadImageToCloudinary } from "../api/cloudinary";
import { useServerStore } from "../store/serverStore";
import { useEscapeKey } from "../hooks/useEscapeKey";

export default function AddEmojiModal({ serverId, onClose }: { serverId: string; onClose: () => void }) {
  useEscapeKey(onClose);
  const customEmojis = useServerStore((s) => s.customEmojis);
  const setCustomEmojis = useServerStore((s) => s.setCustomEmojis);
  const [name, setName] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      setImageUrl(await uploadImageToCloudinary(file));
      if (!name) {
        setName(file.name.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 32));
      }
    } catch {
      setError("Image upload failed. Try again.");
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    if (!imageUrl) return;
    setSaving(true);
    setError(null);
    try {
      const emoji = await createCustomEmoji(serverId, name, imageUrl);
      setCustomEmojis([...customEmojis, emoji]);
      onClose();
    } catch (err) {
      const message = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      setError(message ?? "Could not add emoji.");
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
        <h1 className="modal-title">Add Emoji</h1>
        <p className="modal-subtitle">Everyone in this server will be able to use it.</p>

        <div className="avatar-picker">
          {imageUrl ? <img className="avatar-picker-preview" src={imageUrl} alt="" /> : null}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || !isCloudinaryConfigured()}
          >
            {uploading ? "Uploading…" : imageUrl ? "Change image" : "Upload image"}
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handlePick} />
        </div>

        <label className="modal-label" htmlFor="emoji-name-input">
          Name
        </label>
        <input
          id="emoji-name-input"
          className="modal-input"
          value={name}
          onChange={(e) => setName(e.target.value.toLowerCase())}
          placeholder="e.g. party_parrot"
        />
        <p className="modal-hint">Used as :{name || "name"}: — lowercase letters, numbers and underscores.</p>

        {error && <div className="modal-error">{error}</div>}

        <button
          className="modal-create-button"
          onClick={handleSave}
          disabled={saving || uploading || !imageUrl || !/^[a-z0-9_]{2,32}$/.test(name)}
        >
          {saving ? "Adding…" : "Add Emoji"}
        </button>
      </div>
    </div>
  );
}
