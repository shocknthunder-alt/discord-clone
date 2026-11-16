import MessageText from "./MessageText";
import { formatTime } from "../utils/appPrefs";
import { SocketEvents, type MessageDTO } from "@discord-clone/shared";
import { useState } from "react";
import { getSocket } from "../socket/socket";
import { useAuthStore } from "../store/authStore";
import MessageInput from "./MessageInput";
import { tr } from "../i18n";

interface Props {
  channelId: string;
  root: MessageDTO;
  replies: MessageDTO[];
  onClose: () => void;
}

function ThreadMessageRow({ message, isOwn }: { message: MessageDTO; isOwn: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);

  function saveEdit() {
    const content = draft.trim();
    if (!content) return;
    getSocket()?.emit(SocketEvents.MessageEdit, { messageId: message.id, content });
    setEditing(false);
  }

  function cancelEdit() {
    setDraft(message.content);
    setEditing(false);
  }

  function handleDelete() {
    if (!window.confirm(tr("Да изтрия ли това съобщение?", "Delete this message?"))) return;
    getSocket()?.emit(SocketEvents.MessageDelete, { messageId: message.id });
  }

  return (
    <div className="message-row">
      <span className="author">{message.authorUsername}</span>
      <span className="timestamp">{formatTime(message.createdAt)}</span>
      {message.editedAt && <span className="edited-tag">({tr("редактирано", "edited")})</span>}

      {isOwn && !editing && (
        <span className="message-actions">
          {message.content && (
            <button onClick={() => setEditing(true)} title={tr("Редактирай", "Edit")}>
              ✏️
            </button>
          )}
          <button onClick={handleDelete} title={tr("Изтрий", "Delete")}>
            🗑️
          </button>
        </span>
      )}

      {editing ? (
        <div className="message-edit-form">
          <textarea
            className="message-edit-textarea"
            rows={Math.min(8, draft.split("\n").length)}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                saveEdit();
              }
              if (e.key === "Escape") cancelEdit();
            }}
            autoFocus
          />
          <button className="save" onClick={saveEdit}>{tr("Запази", "Save")}</button>
          <button onClick={cancelEdit}>{tr("Отказ", "Cancel")}</button>
        </div>
      ) : (
        message.content && (
          <>
            <MessageText text={message.content} />
          </>
        )
      )}

      {message.imageUrl && (
        <a href={message.imageUrl} target="_blank" rel="noreferrer">
          <img className="message-image" src={message.imageUrl} alt="" />
        </a>
      )}
    </div>
  );
}

export default function ThreadPanel({ channelId, root, replies, onClose }: Props) {
  const currentUserId = useAuthStore((s) => s.user?.id);

  return (
    <div className="thread-panel" data-drop-zone>
      <div className="thread-panel-header">
        <span>{tr("Нишка", "Thread")}</span>
        <button className="thread-panel-close" onClick={onClose} aria-label={tr("Затвори нишката", "Close thread")}>
          ✕
        </button>
      </div>

      <div className="thread-panel-messages">
        <ThreadMessageRow message={root} isOwn={root.authorId === currentUserId} />

        <div className="thread-panel-divider">
          {replies.length} {replies.length === 1 ? tr("отговор", "reply") : tr("отговора", "replies")}
        </div>

        {replies.map((message) => (
          <ThreadMessageRow key={message.id} message={message} isOwn={message.authorId === currentUserId} />
        ))}
      </div>

      <MessageInput channelId={channelId} replyToId={root.id} showSendToChannelOption placeholder={tr("Отговор…", "Reply…")} autoFocus />
    </div>
  );
}
