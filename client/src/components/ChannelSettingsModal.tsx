import type { TextChannelDTO, VoiceChannelDTO } from "@discord-clone/shared";
import { useRef, useState } from "react";
import { isCloudinaryConfigured, uploadImageToCloudinary } from "../api/cloudinary";
import { updateTextChannel, updateVoiceChannel } from "../api/channels.api";
import { useServerStore } from "../store/serverStore";

type Props =
  | { kind: "text"; channel: TextChannelDTO; onClose: () => void }
  | { kind: "voice"; channel: VoiceChannelDTO; onClose: () => void };

export default function ChannelSettingsModal({ kind, channel, onClose }: Props) {
  const updateTextChannelInList = useServerStore((s) => s.updateTextChannelInList);
  const updateVoiceChannelInList = useServerStore((s) => s.updateVoiceChannelInList);
  const [name, setName] = useState(channel.name);
  const [backgroundUrl, setBackgroundUrl] = useState(channel.backgroundUrl);
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
      const url = await uploadImageToCloudinary(file);
      setBackgroundUrl(url);
    } catch {
      setError("Image upload failed. Try again.");
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Channel name can't be empty.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      if (kind === "text") {
        const updated = await updateTextChannel(channel.id, { name: trimmedName, backgroundUrl });
        updateTextChannelInList(updated);
      } else {
        const updated = await updateVoiceChannel(channel.id, { name: trimmedName, backgroundUrl });
        updateVoiceChannelInList(updated);
      }
      onClose();
    } catch {
      setError("Could not save channel settings.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    setBackgroundUrl(null);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <button className="modal-back" onClick={onClose} aria-label="Back">
          ←
        </button>

        <h1 className="modal-title">Channel Settings</h1>
        <p className="modal-subtitle">{kind === "text" ? "#" : "🔊"} {channel.name}</p>

        <label className="modal-label" htmlFor="channel-settings-name-input">
          Channel Name
        </label>
        <input
          id="channel-settings-name-input"
          className="modal-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Channel name"
        />

        <label className="modal-label" style={{ marginTop: 16 }}>
          Background Image
        </label>
        {backgroundUrl ? (
          <div className="channel-background-preview-wrap">
            <img className="channel-background-preview" src={backgroundUrl} alt="" />
            <button type="button" onClick={handleRemove}>
              Remove
            </button>
          </div>
        ) : (
          <div className="channel-background-preview-wrap empty">No background set</div>
        )}

        <div className="avatar-picker">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || !isCloudinaryConfigured()}
          >
            {uploading ? "Uploading…" : "Upload Background"}
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handlePick} />
        </div>

        {error && <div className="modal-error">{error}</div>}

        <button className="modal-create-button" onClick={handleSave} disabled={saving || uploading}>
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
