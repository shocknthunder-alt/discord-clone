import { SocketEvents, type MessageDTO } from "@discord-clone/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import { fetchMessages } from "../api/channels.api";
import { useSearchStore } from "../store/searchStore";
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
import EmojiGlyph from "./EmojiGlyph";
import MessageInput from "./MessageInput";
import MessageToolbar from "./MessageToolbar";
import ThreadPanel from "./ThreadPanel";
import UserContextMenu from "./UserContextMenu";

interface Props {
  channelId: string;
}

function ThreadAvatar({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  return avatarUrl ? (
    <img className="thread-avatar" src={avatarUrl} alt="" />
  ) : (
    <div className="thread-avatar placeholder">{(name || "?").slice(0, 2).toUpperCase()}</div>
  );
}

function MessageRow({
  message,
  isOwn,
  currentUserId,
  replyCount,
  replyAuthors,
  onOpenThread,
  onAuthorClick,
  highlighted = false,
}: {
  highlighted?: boolean;
  message: MessageDTO;
  isOwn: boolean;
  currentUserId: string | undefined;
  replyCount: number;
  replyAuthors: { authorId: string; username: string; avatarUrl: string | null }[];
  onOpenThread: (messageId: string) => void;
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

  return (
    <div className={`message-row ${highlighted ? "jump-highlight" : ""}`} id={`msg-${message.id}`}>
      <div className="message-main">
      {!editing && (
        <MessageToolbar
          message={message}
          isOwn={isOwn}
          onReply={() => onOpenThread(message.id)}
          onEdit={() => setEditing(true)}
        />
      )}
      <span className="author" onClick={(e) => onAuthorClick(e, message)}>
        {message.authorUsername}
      </span>
      <span className="timestamp">{new Date(message.createdAt).toLocaleTimeString()}</span>
      {message.editedAt && <span className="edited-tag">(edited)</span>}

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
        message.content && <div className="message-text">{linkifyText(message.content)}</div>
      )}

      {message.imageUrl && (
        <a href={message.imageUrl} target="_blank" rel="noreferrer">
          <img className="message-image" src={message.imageUrl} alt="attachment" />
        </a>
      )}
      </div>

      {message.reactions.length > 0 && (
        <div className="reaction-row">
          {message.reactions.map((r) => {
            const mine = !!currentUserId && r.userIds.includes(currentUserId);
            return (
              <button
                key={r.emoji}
                className={`reaction-chip ${mine ? "mine" : ""}`}
                onClick={() => getSocket()?.emit(SocketEvents.MessageReact, { messageId: message.id, emoji: r.emoji })}
              >
                <EmojiGlyph emoji={r.emoji} /> {r.userIds.length}
              </button>
            );
          })}
        </div>
      )}

      {replyCount > 0 && (
        <div className="thread-summary" onClick={() => onOpenThread(message.id)}>
          <div className="thread-summary-avatars">
            {replyAuthors.slice(0, 3).map((author) => (
              <ThreadAvatar key={author.authorId} name={author.username} avatarUrl={author.avatarUrl} />
            ))}
          </div>
          <span>
            {replyCount} {replyCount === 1 ? "reply" : "replies"}
          </span>
        </div>
      )}
    </div>
  );
}

export default function TextChatView({ channelId }: Props) {
  const { messagesByChannel, typingByChannel, setMessages, addMessage, updateMessage, removeMessage, setReactions, setTyping } =
    useChatStore();
  const currentUserId = useAuthStore((s) => s.user?.id);
  const { textChannels, servers, activeServerId } = useServerStore();
  const ignoredUserIds = useIgnoredUsersStore((s) => s.ignoredUserIds);
  const { setView, setActiveConversation, upsertConversation } = useDmStore();
  const { joinVoiceChannel, leaveVoiceChannel } = useVoiceChannel();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [showChannelSettings, setShowChannelSettings] = useState(false);
  const [openThreadRootId, setOpenThreadRootId] = useState<string | null>(null);
  const [userMenu, setUserMenu] = useState<{ userId: string; username: string; x: number; y: number } | null>(null);

  const channel = textChannels.find((c) => c.id === channelId);
  const activeServer = servers.find((s) => s.id === activeServerId);
  const isOwner = activeServer?.ownerId === currentUserId;
  const allMessages = (messagesByChannel[channelId] ?? []).filter((m) => !ignoredUserIds.has(m.authorId));
  // Threads are flat (never nested), so any message's replyTo.id already IS the thread
  // root — replies never show inline in the channel, only as the "N replies" summary
  // under their root and inside the thread panel itself.
  const rootMessages = useMemo(() => allMessages.filter((m) => !m.replyTo), [allMessages]);
  const repliesByRoot = useMemo(() => {
    const map = new Map<string, MessageDTO[]>();
    for (const m of allMessages) {
      if (!m.replyTo) continue;
      const list = map.get(m.replyTo.id) ?? [];
      list.push(m);
      map.set(m.replyTo.id, list);
    }
    return map;
  }, [allMessages]);
  const typingUsers = Array.from(typingByChannel[channelId] ?? []).filter((id) => id !== currentUserId);

  const openThreadRoot = openThreadRootId ? allMessages.find((m) => m.id === openThreadRootId) : undefined;
  const openThreadReplies = openThreadRootId ? (repliesByRoot.get(openThreadRootId) ?? []) : [];

  useEffect(() => {
    const jt = useChatStore.getState().jumpTarget;
    fetchMessages(channelId, undefined, jt && jt.channelId === channelId ? jt.messageId : undefined)
      .then((msgs) => setMessages(channelId, msgs))
      .catch(console.error);

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

    function onReactions({ id, textChannelId, reactions }: { id: string; textChannelId: string; reactions: MessageDTO["reactions"] }) {
      if (textChannelId === channelId) setReactions(channelId, id, reactions);
    }

    socket?.on(SocketEvents.MessageReactionsUpdated, onReactions);
    socket?.on(SocketEvents.MessageNew, onMessage);
    socket?.on(SocketEvents.TypingUpdate, onTyping);
    socket?.on(SocketEvents.MessageUpdated, onUpdated);
    socket?.on(SocketEvents.MessageDeleted, onDeleted);

    return () => {
      socket?.off(SocketEvents.MessageReactionsUpdated, onReactions);
      socket?.off(SocketEvents.MessageNew, onMessage);
      socket?.off(SocketEvents.TypingUpdate, onTyping);
      socket?.off(SocketEvents.MessageUpdated, onUpdated);
      socket?.off(SocketEvents.MessageDeleted, onDeleted);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  useEffect(() => {
    setOpenThreadRootId(null);
  }, [channelId]);

  // "Jump to message" from search: once the target is in the loaded list, scroll to it,
  // flash it, and (for thread replies) open the thread. If the message is older than what's
  // loaded, fetch a window around it first.
  const jumpTarget = useChatStore((s) => s.jumpTarget);
  const setJumpTarget = useChatStore((s) => s.setJumpTarget);
  const [flashId, setFlashId] = useState<string | null>(null);
  useEffect(() => {
    if (!jumpTarget || jumpTarget.channelId !== channelId) return;
    const loaded = (messagesByChannel[channelId] ?? []).some((m) => m.id === jumpTarget.messageId);
    if (!loaded) {
      fetchMessages(channelId, undefined, jumpTarget.messageId)
        .then((msgs) => setMessages(channelId, msgs))
        .catch(console.error);
      return;
    }
    const target = jumpTarget;
    const t = setTimeout(() => {
      document.getElementById(`msg-${target.messageId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      setFlashId(target.messageId);
      if (target.rootId) setOpenThreadRootId(target.rootId);
      setJumpTarget(null);
      setTimeout(() => setFlashId(null), 2600);
    }, 150);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpTarget, channelId, messagesByChannel]);

  useEffect(() => {
    if (useChatStore.getState().jumpTarget) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [rootMessages.length]);

  function handleOpenThread(messageId: string) {
    // Clicking the thread icon on a message that's already inside a thread (shouldn't
    // normally be reachable from the flat root list, but defensive) opens its root's
    // thread rather than trying to nest.
    const message = allMessages.find((m) => m.id === messageId);
    setOpenThreadRootId(message?.replyTo?.id ?? messageId);
  }

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
        <span className="chat-header-title">{channel?.type === "trivia" ? "🎲" : "#"} {channel?.name ?? ""}</span>
        <button className="server-settings-button" onClick={() => useSearchStore.getState().setOpen(true)} title="Search messages (Ctrl+K)">
          🔍
        </button>
        {isOwner && (
          <button className="server-settings-button" onClick={() => setShowChannelSettings(true)} title="Channel settings">
            ⚙️
          </button>
        )}
      </div>

      <div className="chat-body">
        <div className="chat-main-column">
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
            {rootMessages.map((message) => {
              const replies = repliesByRoot.get(message.id) ?? [];
              // Avatar row shows distinct participants, not one per reply — someone who
              // replied five times should still only take up one avatar slot.
              const replyAuthors = Array.from(
                new Map(
                  replies.map((r) => [r.authorId, { authorId: r.authorId, username: r.authorUsername, avatarUrl: r.authorAvatarUrl }]),
                ).values(),
              );
              return (
                <MessageRow
                  key={message.id}
                  message={message}
                  isOwn={message.authorId === currentUserId}
                  currentUserId={currentUserId}
                  replyCount={replies.length}
                  replyAuthors={replyAuthors}
                  onOpenThread={handleOpenThread}
                  onAuthorClick={handleAuthorClick}
                  highlighted={flashId === message.id}
                />
              );
            })}
            <div ref={bottomRef} />
          </div>
          <div className="typing-indicator">
            {typingUsers.length > 0 ? `${typingUsers.length} user(s) typing…` : ""}
          </div>
          {channel?.type === "trivia" && (
            <div className="trivia-hint">
              🎲 <b>!trivia</b> — игра с 5 въпроса · <b>!trivia 10</b> · <b>!trivia en</b> (английски) · <b>!top</b> класация · <b>!стоп</b> · отговаряш с <b>A / B / C / D</b>
            </div>
          )}
          <MessageInput channelId={channelId} />
        </div>

        {openThreadRoot && (
          <ThreadPanel
            channelId={channelId}
            root={openThreadRoot}
            replies={openThreadReplies}
            onClose={() => setOpenThreadRootId(null)}
          />
        )}
      </div>

      {showChannelSettings && channel && (
        <ChannelSettingsModal kind="text" channel={channel} onClose={() => setShowChannelSettings(false)} />
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
