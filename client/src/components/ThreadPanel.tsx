import { LinkedImages } from "./ChatImage";
import { formatTime } from "../utils/appPrefs";
import { SocketEvents, type MessageDTO } from "@discord-clone/shared";
import { useState } from "react";
import { getSocket } from "../socket/socket";
import { useAuthStore } from "../store/authStore";
import { linkifyText } from "../utils/linkify";
import MessageInput from "./MessageInput";

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
    if (!window.confirm("Delete this message?")) return;
    getSocket()?.emit(SocketEvents.MessageDelete, { messageId: message.id });
  }

  return (
    <div className="message-row">
      <span className="author">{message.authorUsername}</span>
      <span className="timestamp">{formatTime(message.createdAt)}</span>
      {message.editedAt && <span className="edited-tag">(edited)</span>}

      {isOwn && !editing && (
        <span className="message-actions">
          {message.content && (
            <button onClick={() => setEditing(true)} title="Edit">
              ✏️
            </button>
          )}
          <button onClick={handleDelete} title="Delete">
            🗑️
          </button>
        </span>
      )}

      {editing ? (
        <div className="message-edit-form">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveEdit();
              if (e.key === "Escape") cancelEdit();
            }}
            autoFocus
          />
          <button className="save" onClick={saveEdit}>Save</button>
          <button onClick={cancelEdit}>Cancel</button>
        </div>
      ) : (
        message.content && (
          <>
            <div>{linkifyText(message.content)}</div>
            <LinkedImages text={message.content} />
          </>
        )
      )}

      {message.imageUrl && (
        <a href={message.imageUrl} target="_blank" rel="noreferrer">
          <img className="message-image" src={message.imageUrl} alt="attachment" />
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
        <span>Thread</span>
        <button className="thread-panel-close" onClick={onClose} aria-label="Close thread">
          ✕
        </button>
      </div>

      <div className="thread-panel-messages">
        <ThreadMessageRow message={root} isOwn={root.authorId === currentUserId} />

        <div className="thread-panel-divider">
          {replies.length} {replies.length === 1 ? "reply" : "replies"}
        </div>

        {replies.map((message) => (
          <ThreadMessageRow key={message.id} message={message} isOwn={message.authorId === currentUserId} />
        ))}
      </div>

      <MessageInput channelId={channelId} replyToId={root.id} showSendToChannelOption placeholder="Reply…" autoFocus />
    </div>
  );
}
