import { SocketEvents, type MessageDTO } from "@discord-clone/shared";
import { useEffect, useRef, useState } from "react";
import { fetchMessages } from "../api/channels.api";
import { startConversationWith } from "../api/dm.api";
import { getSocket } from "../socket/socket";
import { useAuthStore } from "../store/authStore";
import { useChatStore } from "../store/chatStore";
import { useDmStore } from "../store/dmStore";
import { useIgnoredUsersStore } from "../store/ignoredUsersStore";
import { useServerStore } from "../store/serverStore";
import { useVoiceChannel } from "../webrtc/useVoiceChannel";
import { linkifyText } from "../utils/linkify";
import ChannelSettingsModal from "./ChannelSettingsModal";
import MessageInput from "./MessageInput";
import UserContextMenu from "./UserContextMenu";

interface Props {
  channelId: string;
}

function scrollToMessage(id: string) {
  document.getElementById(`message-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
}

function MessageRow({
  message,
  isOwn,
  onReply,
  onAuthorClick,
}: {
  message: MessageDTO;
  isOwn: boolean;
  onReply: (message: MessageDTO) => void;
  onAuthorClick: (e: React.MouseEvent, message: MessageDTO) => void;
}) {
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
    <div className="message-row" id={`message-${message.id}`}>
      {message.replyTo && (
        <div className="reply-reference" onClick={() => scrollToMessage(message.replyTo!.id)}>
          ↩ <strong>{message.replyTo.authorUsername}</strong>
          {message.replyTo.content ? `: ${message.replyTo.content.slice(0, 80)}` : message.replyTo.imageUrl ? " sent an image" : ""}
        </div>
      )}

      <span className="author" onClick={(e) => onAuthorClick(e, message)}>
        {message.authorUsername}
      </span>
      <span className="timestamp">{new Date(message.createdAt).toLocaleTimeString()}</span>
      {message.editedAt && <span className="edited-tag">(edited)</span>}

      {!editing && (
        <span className="message-actions">
          <button onClick={() => onReply(message)} title="Reply">
            ↩️
          </button>
          {isOwn && (
            <>
              {message.content && (
                <button onClick={() => setEditing(true)} title="Edit">
                  ✏️
                </button>
              )}
              <button onClick={handleDelete} title="Delete">
                🗑️
              </button>
            </>
          )}
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
  const ignoredUserIds = useIgnoredUsersStore((s) => s.ignoredUserIds);
  const { setView, setActiveConversation, upsertConversation } = useDmStore();
  const { joinVoiceChannel, leaveVoiceChannel } = useVoiceChannel();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [showChannelSettings, setShowChannelSettings] = useState(false);
  const [replyingTo, setReplyingTo] = useState<MessageDTO | null>(null);
  const [userMenu, setUserMenu] = useState<{ userId: string; username: string; x: number; y: number } | null>(null);

  const channel = textChannels.find((c) => c.id === channelId);
  const activeServer = servers.find((s) => s.id === activeServerId);
  const isOwner = activeServer?.ownerId === currentUserId;
  const messages = (messagesByChannel[channelId] ?? []).filter((m) => !ignoredUserIds.has(m.authorId));
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
    setReplyingTo(null);
  }, [channelId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  function handleAuthorClick(e: React.MouseEvent, message: MessageDTO) {
    if (message.authorId === currentUserId) return;
    setUserMenu({ userId: message.authorId, username: message.authorUsername, x: e.clientX, y: e.clientY });
  }

  async function goToDm(userId: string) {
    const conversation = await startConversationWith(userId);
    upsertConversation(conversation);
    setActiveConversation(conversation.id);
    setView("dms");
    return conversation;
  }

  async function handleMessageUser(userId: string) {
    await goToDm(userId);
  }

  async function handleCallUser(userId: string) {
    const conversation = await goToDm(userId);
    const voiceRoomId = `dm:${conversation.id}`;
    leaveVoiceChannel();
    await joinVoiceChannel(voiceRoomId);
    getSocket()?.emit(SocketEvents.DmRing, { conversationId: conversation.id });
  }

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
          <MessageRow
            key={message.id}
            message={message}
            isOwn={message.authorId === currentUserId}
            onReply={setReplyingTo}
            onAuthorClick={handleAuthorClick}
          />
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="typing-indicator">
        {typingUsers.length > 0 ? `${typingUsers.length} user(s) typing…` : ""}
      </div>
      <MessageInput
        channelId={channelId}
        replyingTo={
          replyingTo
            ? { id: replyingTo.id, authorUsername: replyingTo.authorUsername, content: replyingTo.content, imageUrl: replyingTo.imageUrl }
            : null
        }
        onCancelReply={() => setReplyingTo(null)}
      />

      {showChannelSettings && channel && (
        <ChannelSettingsModal channel={channel} onClose={() => setShowChannelSettings(false)} />
      )}

      {userMenu && (
        <UserContextMenu
          userId={userMenu.userId}
          username={userMenu.username}
          x={userMenu.x}
          y={userMenu.y}
          onClose={() => setUserMenu(null)}
          onMessage={handleMessageUser}
          onCall={handleCallUser}
        />
      )}
    </div>
  );
}
