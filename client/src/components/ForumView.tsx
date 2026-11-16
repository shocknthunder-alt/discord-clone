import { SocketEvents, type ForumPostDTO, type MessageDTO } from "@discord-clone/shared";
import { useEffect, useMemo, useState } from "react";
import { fetchForumPosts, fetchThread } from "../api/media.api";
import { getSocket } from "../socket/socket";
import { useChatStore } from "../store/chatStore";
import { useIgnoredUsersStore } from "../store/ignoredUsersStore";
import { attachmentLabel, parseAttachment } from "../utils/attachments";
import { tr } from "../i18n";
import { splitTopic } from "../utils/forum";
import ChatTextarea from "./ChatTextarea";
import ThreadPanel from "./ThreadPanel";

/**
 * 🗂️ Forum channel: a list of topics (each one is a thread opener), most recently active first.
 * Click a topic → its replies open on the right. "＋ Нова тема" = title + text.
 */

function ago(iso: string): string {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return tr("току-що", "just now");
  if (s < 3600) return tr(`преди ${Math.floor(s / 60)} мин`, `${Math.floor(s / 60)} min ago`);
  if (s < 86400) return tr(`преди ${Math.floor(s / 3600)} ч`, `${Math.floor(s / 3600)} h ago`);
  return tr(`преди ${Math.floor(s / 86400)} дни`, `${Math.floor(s / 86400)} days ago`);
}

export default function ForumView({ channelId }: { channelId: string }) {
  const [posts, setPosts] = useState<ForumPostDTO[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [thread, setThread] = useState<{ root: MessageDTO; replies: MessageDTO[] } | null>(null);
  const [composing, setComposing] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [filter, setFilter] = useState("");
  const ignored = useIgnoredUsersStore((s) => s.ignoredUserIds);

  useEffect(() => {
    setPosts(null);
    setOpenId(null);
    fetchForumPosts(channelId)
      .then(setPosts)
      .catch(() => setPosts([]));
  }, [channelId]);

  // Open the thread (and keep it fresh).
  useEffect(() => {
    setThread(null);
    if (!openId) return;
    let alive = true;
    fetchThread(openId)
      .then((t) => alive && setThread(t))
      .catch(() => alive && setOpenId(null));
    return () => {
      alive = false;
    };
  }, [openId]);

  // "Jump to message" (search, mention notification) into a forum topic.
  const jumpTarget = useChatStore((s) => s.jumpTarget);
  useEffect(() => {
    if (!jumpTarget || jumpTarget.channelId !== channelId) return;
    setOpenId(jumpTarget.rootId ?? jumpTarget.messageId);
    useChatStore.getState().setJumpTarget(null);
  }, [jumpTarget, channelId]);

  // Live updates.
  useEffect(() => {
    const socket = getSocket();
    const patch = (id: string, fn: (m: MessageDTO) => MessageDTO) => {
      setPosts((list) => list?.map((p) => (p.message.id === id ? { ...p, message: fn(p.message) } : p)) ?? list);
      setThread((t) =>
        t ? { root: t.root.id === id ? fn(t.root) : t.root, replies: t.replies.map((r) => (r.id === id ? fn(r) : r)) } : t,
      );
    };
    function onNew(m: MessageDTO) {
      if (m.textChannelId !== channelId) return;
      if (m.replyTo) {
        const rootId = m.replyTo.id;
        setPosts((list) =>
          list
            ?.map((p) => (p.message.id === rootId ? { ...p, replyCount: p.replyCount + 1, lastActivityAt: m.createdAt } : p))
            .sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt)) ?? list,
        );
        setThread((t) => (t && t.root.id === rootId && !t.replies.some((r) => r.id === m.id) ? { ...t, replies: [...t.replies, m] } : t));
      } else {
        setPosts((list) => (list && !list.some((p) => p.message.id === m.id) ? [{ message: m, replyCount: 0, lastActivityAt: m.createdAt }, ...list] : list));
      }
    }
    function onUpdated(p: { id: string; textChannelId: string; content: string; editedAt: string | null }) {
      if (p.textChannelId === channelId) patch(p.id, (m) => ({ ...m, content: p.content, editedAt: p.editedAt }));
    }
    function onDeleted(p: { id: string; textChannelId: string }) {
      if (p.textChannelId !== channelId) return;
      setPosts((list) => list?.filter((x) => x.message.id !== p.id) ?? list);
      setThread((t) => (t ? (t.root.id === p.id ? null : { ...t, replies: t.replies.filter((r) => r.id !== p.id) }) : t));
      setOpenId((id) => (id === p.id ? null : id));
    }
    function onReactions(p: { id: string; textChannelId: string; reactions: MessageDTO["reactions"] }) {
      if (p.textChannelId === channelId) patch(p.id, (m) => ({ ...m, reactions: p.reactions }));
    }
    function onPinned(p: { id: string; textChannelId: string; pinnedAt: string | null }) {
      if (p.textChannelId === channelId) patch(p.id, (m) => ({ ...m, pinnedAt: p.pinnedAt }));
    }
    socket?.on(SocketEvents.MessageNew, onNew);
    socket?.on(SocketEvents.MessageUpdated, onUpdated);
    socket?.on(SocketEvents.MessageDeleted, onDeleted);
    socket?.on(SocketEvents.MessageReactionsUpdated, onReactions);
    socket?.on(SocketEvents.MessagePinned, onPinned);
    return () => {
      socket?.off(SocketEvents.MessageNew, onNew);
      socket?.off(SocketEvents.MessageUpdated, onUpdated);
      socket?.off(SocketEvents.MessageDeleted, onDeleted);
      socket?.off(SocketEvents.MessageReactionsUpdated, onReactions);
      socket?.off(SocketEvents.MessagePinned, onPinned);
    };
  }, [channelId]);

  function publish() {
    const t = title.trim();
    if (!t) return;
    getSocket()?.emit(SocketEvents.MessageSend, { textChannelId: channelId, content: `# ${t}${body.trim() ? `\n${body.trim()}` : ""}` });
    setTitle("");
    setBody("");
    setComposing(false);
  }

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return (posts ?? [])
      .filter((p) => !ignored.has(p.message.authorId))
      .filter((p) => !q || p.message.content.toLowerCase().includes(q) || p.message.authorUsername.toLowerCase().includes(q));
  }, [posts, filter, ignored]);

  return (
    <div className="chat-body">
      <div className="chat-main-column forum">
        <div className="forum-toolbar">
          <input className="forum-search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={tr("🔎 Търси тема…", "🔎 Search topics…")} />
          <button className="forum-new" onClick={() => setComposing((v) => !v)}>
            {composing ? tr("Откажи", "Cancel") : tr("＋ Нова тема", "＋ New topic")}
          </button>
        </div>

        {composing && (
          <div className="forum-composer">
            <input
              className="forum-title-input"
              autoFocus
              maxLength={120}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={tr("Заглавие на темата", "Topic title")}
              onKeyDown={(e) => e.key === "Escape" && setComposing(false)}
            />
            <div className="message-input-form">
              <ChatTextarea value={body} onChange={setBody} onSubmit={publish} mentions placeholder={tr("Текст (по избор)… Enter = публикувай", "Text (optional)… Enter = post")} />
              <button type="submit" disabled={!title.trim()} onClick={publish}>
                {tr("Публикувай", "Post")}
              </button>
            </div>
          </div>
        )}

        <div className="forum-list">
          {posts === null && <div className="forum-empty">{tr("Зареждам…", "Loading…")}</div>}
          {posts !== null && shown.length === 0 && (
            <div className="forum-empty">
              {filter ? tr("Нищо не намерих.", "Nothing found.") : tr("Още няма теми. Започни първата с „＋ Нова тема“.", "No topics yet. Start one with “＋ New topic”.")}
            </div>
          )}
          {shown.map((p) => {
            const { title: t, rest } = splitTopic(p.message.content);
            const img = p.message.imageUrl && parseAttachment(p.message.imageUrl).kind === "image" ? p.message.imageUrl : null;
            return (
              <button key={p.message.id} className={`forum-card ${openId === p.message.id ? "open" : ""}`} onClick={() => setOpenId(p.message.id)}>
                <div className="forum-card-body">
                  <div className="forum-card-title">
                    {p.message.pinnedAt && "📌 "}
                    {t}
                  </div>
                  {(rest || p.message.imageUrl) && <div className="forum-card-preview">{rest || attachmentLabel(p.message.imageUrl)}</div>}
                  <div className="forum-card-meta">
                    <span className="forum-card-author">{p.message.authorUsername}</span>
                    <span>
                      💬 {p.replyCount}
                    </span>
                    {p.message.reactions.slice(0, 3).map((r) => (
                      <span key={r.emoji}>
                        {r.emoji.startsWith(":") ? "🙂" : r.emoji} {r.userIds.length}
                      </span>
                    ))}
                    <span className="forum-card-time">{ago(p.lastActivityAt)}</span>
                  </div>
                </div>
                {img && <img className="forum-card-thumb" src={img} alt="" loading="lazy" referrerPolicy="no-referrer" />}
              </button>
            );
          })}
        </div>
      </div>

      {openId && thread && (
        <ThreadPanel channelId={channelId} root={thread.root} replies={thread.replies} onClose={() => setOpenId(null)} forum />
      )}
    </div>
  );
}
