import { useState } from "react";
import { tr } from "../i18n";
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
  const [kind, setKind] = useState<"text" | "trivia" | "forum" | "draw">("text");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    if (!name.trim()) return;
    setCreating(true);
    setError(null);
    try {
      if (type === "text") {
        addTextChannel(await createTextChannel(serverId, name.trim(), kind));
      } else {
        addVoiceChannel(await createVoiceChannel(serverId, name.trim()));
      }
      onClose();
    } catch {
      setError(tr("Каналът не се създаде.", "Could not create the channel."));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <button className="modal-back" onClick={onClose} aria-label={tr("Назад", "Back")}>
          ←
        </button>

        <h1 className="modal-title">{type === "text" ? tr("Нов текстов канал", "Create Text Channel") : tr("Нов гласов канал", "Create Voice Channel")}</h1>

        <label className="modal-label" htmlFor="channel-name-input">
          {tr("Име на канала", "Channel Name")}
        </label>
        <input
          id="channel-name-input"
          className="modal-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          placeholder={type === "text" ? tr("напр. новини", "e.g. announcements") : tr("напр. Игри", "e.g. Gaming")}
          autoFocus
        />

        {type === "text" && (
          <div className="channel-kind-options">
            <label className="modal-checkbox-label">
              <input type="radio" name="channel-kind" checked={kind === "text"} onChange={() => setKind("text")} />
              # {tr("Обикновен чат", "Normal chat")}
            </label>
            <label className="modal-checkbox-label">
              <input type="radio" name="channel-kind" checked={kind === "forum"} onChange={() => setKind("forum")} />
              🗂️ {tr("Форум — теми, всяка със свои отговори (LFG, билдове, идеи…)", "Forum — topics, each with its own replies (LFG, builds, ideas…)")}
            </label>
            <label className="modal-checkbox-label">
              <input type="radio" name="channel-kind" checked={kind === "trivia"} onChange={() => setKind("trivia")} />
              🎲 {tr("Тривия канал (ботът за тривия отговаря тук)", "Trivia channel (Trivia Bot answers here)")}
            </label>
            <label className="modal-checkbox-label">
              <input type="radio" name="channel-kind" checked={kind === "draw"} onChange={() => setKind("draw")} />
              🎨 {tr("Рисувай и познай (игра)", "Draw & guess (game)")}
            </label>
          </div>
        )}

        {error && <div className="modal-error">{error}</div>}

        <button className="modal-create-button" onClick={handleCreate} disabled={creating || !name.trim()}>
          {creating ? tr("Създаване…", "Creating…") : tr("Създай канала", "Create Channel")}
        </button>
      </div>
    </div>
  );
}
