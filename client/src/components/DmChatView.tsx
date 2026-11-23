import { formatTime } from "../utils/appPrefs";
import MobileNavButton from "./MobileNavButton";
import { SocketEvents, type DirectMessageDTO } from "@discord-clone/shared";
import ChatImage from "./ChatImage";
import MessageText from "./MessageText";
import { textStyleCss, useAuthorTextStyle } from "../utils/textStyle";
import { useEffect, useRef, useState } from "react";
import { fetchDmMessages } from "../api/dm.api";
import { getSocket } from "../socket/socket";
import { useAuthStore } from "../store/authStore";
import { useDmStore } from "../store/dmStore";
import { useVoiceStore } from "../store/voiceStore";
import { useVoiceChannel } from "../webrtc/useVoiceChannel";
import DmMessageInput from "./DmMessageInput";
import { tr } from "../i18n";

interface Props {
  conversationId: string;
}

function DmMessageRow({ message, isOwn }: { message: DirectMessageDTO; isOwn: boolean }) {
  const [editing, setEditing] = useState(false);
  const textStyle = useAuthorTextStyle(message.authorId);
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
    if (!window.confirm(tr("Да изтрия ли това съобщение?", "Delete this message?"))) return;
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
          <span className="styled-text" style={textStyleCss(textStyle)}>
            <MessageText text={message.content} dm />
          </span>
        )
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

    // After a reconnect (Wi-Fi blip, server restart, PC asleep) the new connection isn't in the
    // conversation's room: join again and fetch what came in meanwhile.
    function onReconnect() {
      socket?.emit(SocketEvents.DmJoin, { conversationId });
      fetchDmMessages(conversationId).then((msgs) => setMessages(conversationId, msgs)).catch(console.error);
    }

    socket?.emit(SocketEvents.DmJoin, { conversationId });
    socket?.on("connect", onReconnect);
    socket?.on(SocketEvents.DmNew, onMessage);
    socket?.on(SocketEvents.DmTypingUpdate, onTyping);
    socket?.on(SocketEvents.DmUpdated, onUpdated);
    socket?.on(SocketEvents.DmDeleted, onDeleted);

    return () => {
      socket?.off("connect", onReconnect);
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
    <div className="main-content" data-drop-zone>
      <div className="chat-header">
        <MobileNavButton />
        <span className="chat-header-title">@ {conversation?.otherUser.username ?? ""}</span>
        <button className="server-settings-button" onClick={handleCallToggle} title={tr("Обади се", "Call")}>
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
