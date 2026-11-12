import { formatTime } from "../utils/appPrefs";
import { SocketEvents, type DirectMessageDTO } from "@discord-clone/shared";
import ChatImage from "./ChatImage";
import { useEffect, useRef, useState } from "react";
import { fetchDmMessages } from "../api/dm.api";
import { getSocket } from "../socket/socket";
import { useAuthStore } from "../store/authStore";
import { useDmStore } from "../store/dmStore";
import { useVoiceStore } from "../store/voiceStore";
import { linkifyText } from "../utils/linkify";
import { useVoiceChannel } from "../webrtc/useVoiceChannel";
import DmMessageInput from "./DmMessageInput";

interface Props {
  conversationId: string;
}

function DmMessageRow({ message, isOwn }: { message: DirectMessageDTO; isOwn: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);

  function saveEdit() {
    const content = draft.trim();
    if (!content) return;
    getSocket()?.emit(SocketEvents.DmEdit, { messageId: message.id, content });
    setEditing(false);
  }

  function cancelEdit() {
    setDraft(message.content);
    setEditing(false);
  }

  function handleDelete() {
    if (!window.confirm("Delete this message?")) return;
    getSocket()?.emit(SocketEvents.DmDelete, { messageId: message.id });
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
        message.content && <div>{linkifyText(message.content)}</div>
      )}

      {message.imageUrl && (
        <ChatImage url={message.imageUrl} />
      )}
    </div>
  );
}

export default function DmChatView({ conversationId }: Props) {
  const {
    conversations,
    messagesByConversation,
    typingByConversation,
    setMessages,
    addMessage,
    updateMessage,
    removeMessage,
    setTyping,
  } = useDmStore();
  const currentUserId = useAuthStore((s) => s.user?.id);
  const activeVoiceChannelId = useVoiceStore((s) => s.activeVoiceChannelId);
  const { joinVoiceChannel, leaveVoiceChannel } = useVoiceChannel();
  const bottomRef = useRef<HTMLDivElement>(null);

  const conversation = conversations.find((c) => c.id === conversationId);
  const messages = messagesByConversation[conversationId] ?? [];
  const typingUsers = Array.from(typingByConversation[conversationId] ?? []).filter((id) => id !== currentUserId);
  const voiceRoomId = `dm:${conversationId}`;
  const inThisCall = activeVoiceChannelId === voiceRoomId;

  useEffect(() => {
    fetchDmMessages(conversationId).then((msgs) => setMessages(conversationId, msgs)).catch(console.error);

    const socket = getSocket();

    function onMessage(message: DirectMessageDTO) {
      if (message.conversationId === conversationId) addMessage(message);
    }
    function onTyping({
      conversationId: cId,
      userId,
      isTyping,
    }: {
      conversationId: string;
      userId: string;
      isTyping: boolean;
    }) {
      if (cId === conversationId) setTyping(cId, userId, isTyping);
    }
    function onUpdated({
      id,
      conversationId: cId,
      content,
      editedAt,
    }: {
      id: string;
      conversationId: string;
      content: string;
      editedAt: string | null;
    }) {
      if (cId === conversationId) updateMessage(cId, id, content, editedAt);
    }
    function onDeleted({ id, conversationId: cId }: { id: string; conversationId: string }) {
      if (cId === conversationId) removeMessage(cId, id);
    }

    socket?.emit(SocketEvents.DmJoin, { conversationId });
    socket?.on(SocketEvents.DmNew, onMessage);
    socket?.on(SocketEvents.DmTypingUpdate, onTyping);
    socket?.on(SocketEvents.DmUpdated, onUpdated);
    socket?.on(SocketEvents.DmDeleted, onDeleted);

    return () => {
      socket?.off(SocketEvents.DmNew, onMessage);
      socket?.off(SocketEvents.DmTypingUpdate, onTyping);
      socket?.off(SocketEvents.DmUpdated, onUpdated);
      socket?.off(SocketEvents.DmDeleted, onDeleted);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function handleCallToggle() {
    if (inThisCall) {
      leaveVoiceChannel();
      return;
    }
    if (activeVoiceChannelId) leaveVoiceChannel();
    await joinVoiceChannel(voiceRoomId);
    getSocket()?.emit(SocketEvents.DmRing, { conversationId });
  }

  return (
    <div className="main-content">
      <div className="chat-header">
        <span className="chat-header-title">@ {conversation?.otherUser.username ?? ""}</span>
        <button className="server-settings-button" onClick={handleCallToggle} title="Call">
          {inThisCall ? "📞 Hang up" : "📞 Call"}
        </button>
      </div>

      <div className="message-list">
        {messages.map((message) => (
          <DmMessageRow key={message.id} message={message} isOwn={message.authorId === currentUserId} />
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="typing-indicator">
        {typingUsers.length > 0 ? `${conversation?.otherUser.username ?? "Someone"} is typing…` : ""}
      </div>
      <DmMessageInput conversationId={conversationId} />
    </div>
  );
}
