import { useState } from "react";
import { createTextChannel, createVoiceChannel } from "../api/channels.api";
import { useServerStore } from "../store/serverStore";
import { useEscapeKey } from "../hooks/useEscapeKey";

interface Props {
  serverId: string;
  type: "text" | "voice";
  onClose: () => void;
}

export default function CreateChannelModal({ serverId, type, onClose }: Props) {
  useEscapeKey(onClose);
  const { addTextChannel, addVoiceChannel } = useServerStore();
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    if (!name.trim()) return;
    setCreating(true);
    setError(null);
    try {
      if (type === "text") {
        addTextChannel(await createTextChannel(serverId, name.trim()));
      } else {
        addVoiceChannel(await createVoiceChannel(serverId, name.trim()));
      }
      onClose();
    } catch {
      setError("Could not create the channel.");
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

        <h1 className="modal-title">{type === "text" ? "Create Text Channel" : "Create Voice Channel"}</h1>

        <label className="modal-label" htmlFor="channel-name-input">
          Channel Name
        </label>
        <input
          id="channel-name-input"
          className="modal-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          placeholder={type === "text" ? "e.g. announcements" : "e.g. Gaming"}
          autoFocus
        />

        {error && <div className="modal-error">{error}</div>}

        <button className="modal-create-button" onClick={handleCreate} disabled={creating || !name.trim()}>
          {creating ? "Creating…" : "Create Channel"}
        </button>
      </div>
    </div>
  );
}
