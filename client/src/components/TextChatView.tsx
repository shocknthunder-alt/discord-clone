import { formatTime, notifyDesktop } from "../utils/appPrefs";
import { playNotifySound } from "../utils/voiceSounds";
import MobileNavButton from "./MobileNavButton";
import { attachmentLabel } from "../utils/attachments";
import { Perm, SocketEvents, hasPerm, mentionsUser, type MessageDTO, type MessagePinnedPayload, type PollUpdatedPayload } from "@discord-clone/shared";
import ChatImage from "./ChatImage";
import MessageText from "./MessageText";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchMessages } from "../api/channels.api";
import { useSearchStore } from "../store/searchStore";
import { useMembersStore } from "../store/membersStore";
import AuthorName from "./AuthorName";
import { textStyleCss, useAuthorTextStyle } from "../utils/textStyle";
import { startConversationWith } from "../api/dm.api";
import { getSocket } from "../socket/socket";
import { useAuthStore } from "../store/authStore";
import { useChatStore } from "../store/chatStore";
import { useDmStore } from "../store/dmStore";
import { useIgnoredUsersStore } from "../store/ignoredUsersStore";
import { useServerStore } from "../store/serverStore";
import { useVoiceChannel } from "../webrtc/useVoiceChannel";
import ChannelSettingsModal from "./ChannelSettingsModal";
import EmojiGlyph from "./EmojiGlyph";
import MessageInput from "./MessageInput";
import MessageToolbar from "./MessageToolbar";
import ThreadPanel from "./ThreadPanel";
import PinsPanel from "./PinsPanel";
import ForumView from "./ForumView";
import DrawGameView from "./draw/DrawGameView";
import BlocksGameView from "./blocks/BlocksGameView";
import { isMutedHere, useMuteStore } from "../store/muteStore";
import EditedTag from "./EditHistory";
import { PollCard } from "./Polls";
import UserContextMenu from "./UserContextMenu";
import { tr } from "../i18n";
import { useChannelBackground } from "../utils/personalLooks";

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
  onMentionClick,
  highlighted = false,
}: {
  highlighted?: boolean;
  onMentionClick?: (name: string, e: React.MouseEvent) => void;
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

  const textStyle = useAuthorTextStyle(message.authorId);
  const myName = useAuthStore((s) => s.user?.username);
  const mentioned = !isOwn && mentionsUser(message.content, myName);

  function cancelEdit() {
    setDraft(message.content);
    setEditing(false);
  }

  return (
    <div className={`message-row ${highlighted ? "jump-highlight" : ""} ${mentioned ? "mentioned" : ""}`} id={`msg-${message.id}`}>
      <div className="message-main">
      {!editing && (
        <MessageToolbar
          message={message}
          isOwn={isOwn}
          onReply={() => onOpenThread(message.id)}
          onEdit={() => setEditing(true)}
        />
      )}
      <AuthorName userId={message.authorId} name={message.authorUsername} onClick={(e) => onAuthorClick(e, message)} />
      <span className="timestamp">{formatTime(message.createdAt)}</span>
      {message.editedAt && <EditedTag messageId={message.id} current={message.content} editedAt={message.editedAt} />}
      {message.pinnedAt && (
        <span className="pinned-tag" title={tr("Закачено в канала", "Pinned")}>
          📌
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
        message.poll ? (
          <PollCard poll={message.poll} authorId={message.authorId} />
        ) : message.content && (
          <span className="styled-text" style={textStyleCss(textStyle)}>
            <MessageText text={message.content} onMentionClick={onMentionClick} />
          </span>
        )
      )}

      {message.imageUrl && (
        <ChatImage url={message.imageUrl} />
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
            {replyCount} {replyCount === 1 ? tr("отговор", "reply") : tr("отговора", "replies")}
          </span>
        </div>
      )}
    </div>
  );
}

export default function TextChatView({ channelId }: Props) {
  const { messagesByChannel, typingByChannel, setMessages, addMessage, updateMessage, removeMessage, setReactions, setTyping, setPinned, setPoll } =
    useChatStore();
  const currentUserId = useAuthStore((s) => s.user?.id);
  const { textChannels, servers, activeServerId } = useServerStore();
  const ignoredUserIds = useIgnoredUsersStore((s) => s.ignoredUserIds);
  const { setView, setActiveConversation, upsertConversation } = useDmStore();
  const { joinVoiceChannel, leaveVoiceChannel } = useVoiceChannel();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [showChannelSettings, setShowChannelSettings] = useState(false);
  const [showPins, setShowPins] = useState(false);
  const [openThreadRootId, setOpenThreadRootId] = useState<string | null>(null);
  const [userMenu, setUserMenu] = useState<{ userId: string; username: string; x: number; y: number } | null>(null);

  const channel = textChannels.find((c) => c.id === channelId);
  const background = useChannelBackground(channel?.id, channel?.backgroundUrl);
  const activeServer = servers.find((s) => s.id === activeServerId);
  const isOwner = useMembersStore((s) => hasPerm(s.myPermissions, Perm.MANAGE_CHANNELS)) || activeServer?.ownerId === currentUserId;
  const membersPanelOpen = useMembersStore((s) => s.panelOpen);
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
        if (message.authorId !== useAuthStore.getState().user?.id && !isMutedHere(useMuteStore.getState(), useServerStore.getState().activeServerId, channelId)) {
          if (!document.hasFocus()) playNotifySound();
          notifyDesktop(message.authorUsername, message.content || attachmentLabel(message.imageUrl), message.authorAvatarUrl);
        }
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

    function onPinned(p: MessagePinnedPayload & { error?: string }) {
      if (p.error) {
        window.alert(p.error);
        return;
      }
      if (p.textChannelId === channelId) setPinned(channelId, p.id, p.pinnedAt);
    }

    function onPoll(p: PollUpdatedPayload) {
      if (p.textChannelId === channelId) setPoll(channelId, p.messageId, p.poll);
    }

    // After a reconnect (Wi-Fi blip, server restart, PC asleep) the new connection isn't in the
    // channel's room — no new messages would arrive. Join again and fetch what came in meanwhile.
    function onReconnect() {
      socket?.emit(SocketEvents.ChannelJoin, { textChannelId: channelId });
      fetchMessages(channelId)
        .then((msgs) => setMessages(channelId, msgs))
        .catch(console.error);
    }

    socket?.on("connect", onReconnect);
    socket?.on(SocketEvents.PollUpdated, onPoll);
    socket?.on(SocketEvents.MessagePinned, onPinned);
    socket?.on(SocketEvents.MessageReactionsUpdated, onReactions);
    socket?.on(SocketEvents.MessageNew, onMessage);
    socket?.on(SocketEvents.TypingUpdate, onTyping);
    socket?.on(SocketEvents.MessageUpdated, onUpdated);
    socket?.on(SocketEvents.MessageDeleted, onDeleted);

    return () => {
      socket?.off("connect", onReconnect);
      socket?.off(SocketEvents.PollUpdated, onPoll);
      socket?.off(SocketEvents.MessagePinned, onPinned);
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
    setShowPins(false);
  }, [channelId]);

  // "Jump to message" from search: once the target is in the loaded list, scroll to it,
  // flash it, and (for thread replies) open the thread. If the message is older than what's
  // loaded, fetch a window around it first.
  const jumpTarget = useChatStore((s) => s.jumpTarget);
  const setJumpTarget = useChatStore((s) => s.setJumpTarget);
  const [flashId, setFlashId] = useState<string | null>(null);
  useEffect(() => {
    if (!jumpTarget || jumpTarget.channelId !== channelId) return;
    if (useServerStore.getState().textChannels.find((c) => c.id === channelId)?.type === "forum") return; // ForumView handles it
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

  const handleMentionClick = useCallback(
    (name: string, e: React.MouseEvent) => {
      const m = useMembersStore.getState().members.find((x) => x.username.toLowerCase() === name.toLowerCase());
      if (!m || m.userId === currentUserId) return;
      setUserMenu({ userId: m.userId, username: m.username, x: e.clientX, y: e.clientY });
    },
    [currentUserId],
  );

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
    <div className="main-content" data-drop-zone>
      <div className="chat-header">
        <MobileNavButton />
        <span className="chat-header-title">{channel?.type === "trivia" ? "🎲" : channel?.type === "forum" ? "🗂️" : channel?.type === "draw" ? "🎨" : channel?.type === "blocks" ? "🧱" : "#"} {channel?.name ?? ""}</span>
        {channel?.type !== "draw" && channel?.type !== "blocks" && (
          <button
            className={`server-settings-button pins-toggle ${showPins ? "on" : ""}`}
            onClick={() => setShowPins((v) => !v)}
            title={tr("Закачени съобщения", "Pinned messages")}
          >
            📌
          </button>
        )}
        <button className="server-settings-button" onClick={() => useSearchStore.getState().setOpen(true)} title={tr("Търси в съобщенията (Ctrl+K)", "Search messages (Ctrl+K)")}>
          🔍
        </button>
        <button
          className={`server-settings-button members-toggle ${membersPanelOpen ? "on" : ""}`}
          onClick={() => useMembersStore.getState().togglePanel()}
          title={membersPanelOpen ? tr("Скрий членовете", "Hide members") : tr("Покажи членовете", "Show members")}
        >
          👥
        </button>
        {isOwner && (
          <button className="server-settings-button" onClick={() => setShowChannelSettings(true)} title={tr("Настройки на канала", "Channel settings")}>
            ⚙️
          </button>
        )}
      </div>

      {showPins && <PinsPanel channelId={channelId} onClose={() => setShowPins(false)} />}

      {channel?.type === "draw" ? (
        <DrawGameView channelId={channelId} />
      ) : channel?.type === "blocks" ? (
        <BlocksGameView channelId={channelId} />
      ) :channel?.type === "forum" ? (
        <ForumView channelId={channelId} />
      ) : (
      <div className="chat-body">
        <div className="chat-main-column">
          <div
            className="message-list"
            style={
              background
                ? {
                    backgroundImage: `linear-gradient(rgba(20,21,23,0.35), rgba(20,21,23,0.55)), url(${background})`,
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
                  onMentionClick={handleMentionClick}
                  highlighted={flashId === message.id}
                />
              );
            })}
            <div ref={bottomRef} />
          </div>
          <div className="typing-indicator">
            {typingUsers.length > 0 ? `${typingUsers.length} ${tr("пише…", "typing…")}` : ""}
          </div>
          {channel?.type === "trivia" && (
            <div className="trivia-hint">
              🎲 <b>!trivia</b> — {tr("безкрайна игра", "endless game")} · <b>!trivia 15</b> · <b>!trivia en</b> · <b>!hint</b> {tr("подсказка", "hint")} · <b>!skip</b> · <b>!score</b> · <b>!top</b> · <b>!стоп</b> — {tr("пиши отговорите свободно, като в чата", "type the answers freely, like in chat")}
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

      )}

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
