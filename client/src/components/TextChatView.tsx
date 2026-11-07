import { SocketEvents, type MessageDTO } from "@discord-clone/shared";
import { useEffect, useRef, useState } from "react";
import { fetchMessages } from "../api/channels.api";
import { getSocket } from "../socket/socket";
import { useAuthStore } from "../store/authStore";
import { useChatStore } from "../store/chatStore";
import { useServerStore } from "../store/serverStore";
import { linkifyText } from "../utils/linkify";
import ChannelSettingsModal from "./ChannelSettingsModal";
import MessageInput from "./MessageInput";

interface Props {
  channelId: string;
}

function MessageRow({ message, isOwn }: { message: MessageDTO; isOwn: boolean }) {
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
      <span className="timestamp">{new Date(message.createdAt).toLocaleTimeString()}</span>
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
          <button onClick={saveEdit}>Save</button>
          <button onClick={cancelEdit}>Cancel</button>
        </div>
      ) : (
        message.content && <div>{linkifyText(message.content)}</div>
      )}

      {message.imageUrl && (
        <a href={message.imageUrl} target="_blank" rel="noreferrer">
          <img className="message-image" src={message.imageUrl} alt="attachment" />
        </a>
      )}
    </div>
  );
}

export default function TextChatView({ channelId }: Props) {
  const { messagesByChannel, typingByChannel, setMessages, addMessage, updateMessage, removeMessage, setTyping } =
    useChatStore();
  const currentUserId = useAuthStore((s) => s.user?.id);
  const { textChannels, servers, activeServerId } = useServerStore();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [showChannelSettings, setShowChannelSettings] = useState(false);

  const channel = textChannels.find((c) => c.id === channelId);
  const activeServer = servers.find((s) => s.id === activeServerId);
  const isOwner = activeServer?.ownerId === currentUserId;
  const messages = messagesByChannel[channelId] ?? [];
  const typingUsers = Array.from(typingByChannel[channelId] ?? []).filter((id) => id !== currentUserId);

  useEffect(() => {
    fetchMessages(channelId).then((msgs) => setMessages(channelId, msgs)).catch(console.error);

    const socket = getSocket();
    socket?.emit(SocketEvents.ChannelJoin, { textChannelId: channelId });

    function onMessage(message: MessageDTO) {
      if (message.textChannelId === channelId) {
        addMessage(message);
      }
    }
    function onTyping({ userId, textChannelId, isTyping }: { userId: string; textChannelId: string; isTyping: boolean }) {
      if (textChannelId === channelId) {
        setTyping(textChannelId, userId, isTyping);
      }
    }
    function onUpdated({
      id,
      textChannelId,
      content,
      editedAt,
    }: {
      id: string;
      textChannelId: string;
      content: string;
      editedAt: string | null;
    }) {
      if (textChannelId === channelId) {
        updateMessage(channelId, id, content, editedAt);
      }
    }
    function onDeleted({ id, textChannelId }: { id: string; textChannelId: string }) {
      if (textChannelId === channelId) {
        removeMessage(channelId, id);
      }
    }

    socket?.on(SocketEvents.MessageNew, onMessage);
    socket?.on(SocketEvents.TypingUpdate, onTyping);
    socket?.on(SocketEvents.MessageUpdated, onUpdated);
    socket?.on(SocketEvents.MessageDeleted, onDeleted);

    return () => {
      socket?.off(SocketEvents.MessageNew, onMessage);
      socket?.off(SocketEvents.TypingUpdate, onTyping);
      socket?.off(SocketEvents.MessageUpdated, onUpdated);
      socket?.off(SocketEvents.MessageDeleted, onDeleted);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  return (
    <div className="main-content">
      <div className="chat-header">
        <span className="chat-header-title"># {channel?.name ?? ""}</span>
        {isOwner && (
          <button className="server-settings-button" onClick={() => setShowChannelSettings(true)} title="Channel settings">
            ⚙️
          </button>
        )}
      </div>
      <div
        className="message-list"
        style={
          channel?.backgroundUrl
            ? {
                backgroundImage: `linear-gradient(rgba(20,21,23,0.35), rgba(20,21,23,0.55)), url(${channel.backgroundUrl})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }
            : undefined
        }
      >
        {messages.map((message) => (
          <MessageRow key={message.id} message={message} isOwn={message.authorId === currentUserId} />
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="typing-indicator">
        {typingUsers.length > 0 ? `${typingUsers.length} user(s) typing…` : ""}
      </div>
      <MessageInput channelId={channelId} />

      {showChannelSettings && channel && (
        <ChannelSettingsModal channel={channel} onClose={() => setShowChannelSettings(false)} />
      )}
    </div>
  );
}
