import { Perm, SocketEvents, hasPerm, type MemberDTO } from "@discord-clone/shared";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { startConversationWith } from "../api/dm.api";
import { apiError, kickMember, setMemberRole } from "../api/members.api";
import { memberResetLink, updateProfile } from "../api/auth.api";
import { getSocket } from "../socket/socket";
import { useAuthStore } from "../store/authStore";
import { useDmStore } from "../store/dmStore";
import { rankOf, roleOf, useMembersStore } from "../store/membersStore";
import { useServerStore } from "../store/serverStore";
import { useVoiceStore } from "../store/voiceStore";
import { tr } from "../i18n";
import GameIcon from "./GameIcon";
import "./members.css";

/** userId → the voice channel they are in (this server only). */
function useVoiceWhereabouts() {
  const occupants = useVoiceStore((s) => s.channelOccupants);
  const voiceChannels = useServerStore((s) => s.voiceChannels);
  return useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    for (const vc of voiceChannels) for (const p of occupants.get(vc.id) ?? []) map.set(p.userId, { id: vc.id, name: vc.name });
    return map;
  }, [occupants, voiceChannels]);
}

/** Right-hand member list: online people grouped by rank, then offline. */
export default function MemberListPanel({ onJoinVoice }: { onJoinVoice?: (voiceChannelId: string) => void }) {
  const members = useMembersStore((s) => s.members);
  const roles = useMembersStore((s) => s.roles);
  const open = useMembersStore((s) => s.panelOpen);
  const togglePanel = useMembersStore((s) => s.togglePanel);
  const where = useVoiceWhereabouts();
  const [menu, setMenu] = useState<{ member: MemberDTO; x: number; y: number } | null>(null);

  const online = members.filter((m) => m.online);
  const offline = members.filter((m) => !m.online).sort((a, b) => a.username.localeCompare(b.username));
  const byName = (a: MemberDTO, b: MemberDTO) => a.username.localeCompare(b.username);

  // Groups: owner, then every non-default rank (highest first), then the default rank as "Онлайн".
  const groups: { key: string; label: string; color: string | null; people: MemberDTO[] }[] = [];
  const owners = online.filter((m) => m.isOwner).sort(byName);
  if (owners.length) groups.push({ key: "owner", label: tr("👑 Собственик", "👑 Owner"), color: null, people: owners });
  for (const r of roles.filter((x) => !x.isDefault)) {
    const people = online.filter((m) => !m.isOwner && m.roleId === r.id).sort(byName);
    if (people.length) groups.push({ key: r.id, label: r.name, color: r.color, people });
  }
  const rest = online.filter((m) => !m.isOwner && !roles.some((r) => !r.isDefault && r.id === m.roleId)).sort(byName);
  if (rest.length) groups.push({ key: "online", label: tr("Онлайн", "Online"), color: null, people: rest });

  if (!open) {
    return (
      <aside className="members-panel collapsed">
        <button className="members-rail" onClick={togglePanel} title={tr("Покажи членовете", "Show members")}>
          <span className="members-rail-arrow">‹</span>
          <span className="members-rail-icon">👥</span>
          <span className="members-rail-count">
            <span className="members-dot on" />
            {online.length}
          </span>
        </button>
      </aside>
    );
  }

  return (
    <aside className="members-panel">
      <div className="members-head">
        <span className="members-title">
          {tr("Членове", "Members")} — {members.length}
          <button className="members-collapse" onClick={togglePanel} title={tr("Скрий членовете", "Hide members")} aria-label={tr("Скрий членовете", "Hide members")}>
            ›
          </button>
        </span>
        <span className="members-counts">
          <span className="members-dot on" /> {online.length} {tr("онлайн", "online")} · <span className="members-dot" /> {offline.length} {tr("офлайн", "offline")}
        </span>
      </div>
      <div className="members-scroll">
        {groups.map((g) => (
          <div key={g.key}>
            <div className="members-group" style={g.color ? { color: g.color } : undefined}>
              {g.label} — {g.people.length}
            </div>
            {g.people.map((m) => (
              <MemberRow key={m.userId} m={m} voice={where.get(m.userId)?.name} onClick={(e) => setMenu({ member: m, x: e.clientX, y: e.clientY })} />
            ))}
          </div>
        ))}
        {offline.length > 0 && (
          <>
            <div className="members-group">{tr("Офлайн", "Offline")} — {offline.length}</div>
            {offline.map((m) => (
              <MemberRow key={m.userId} m={m} offline onClick={(e) => setMenu({ member: m, x: e.clientX, y: e.clientY })} />
            ))}
          </>
        )}
      </div>
      {menu && (
        <MemberMenu
          key={menu.member.userId}
          member={members.find((m) => m.userId === menu.member.userId) ?? menu.member}
          x={menu.x}
          y={menu.y}
          voiceChannelId={where.get(menu.member.userId)?.id ?? null}
          onClose={() => setMenu(null)}
          onJoinVoice={onJoinVoice}
        />
      )}
    </aside>
  );
}

function MemberRow({ m, voice, offline, onClick }: { m: MemberDTO; voice?: string; offline?: boolean; onClick: (e: React.MouseEvent) => void }) {
  const roles = useMembersStore((s) => s.roles);
  const color = roleOf(m, roles)?.color ?? undefined;
  return (
    <button className={`member-row ${offline ? "offline" : ""}`} onClick={onClick} onContextMenu={(e) => { e.preventDefault(); onClick(e); }}>
      <span className="member-avatar-wrap">
        {m.avatarUrl ? <img className="member-avatar" src={m.avatarUrl} alt="" /> : <span className="member-avatar placeholder">{m.username.slice(0, 2).toUpperCase()}</span>}
        <span className={`member-status ${m.online ? "on" : ""}`} />
      </span>
      <span className="member-text">
        <span className="member-name" style={color ? { color } : undefined}>
          {m.username} {m.isOwner && <span title={tr("Собственик", "Owner")}>👑</span>}
        </span>
        {m.customStatus && <span className="member-sub member-status-text">{m.customStatus}</span>}
        {m.activity && m.online && (
          <span className="member-sub member-activity" title={`${tr("Играе", "Playing")} ${m.activity.name} — ${tr("от", "since")} ${new Date(m.activity.since).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}>
            <GameIcon userId={m.userId} className="member-game-icon" /> {tr("Играе", "Playing")} <b>{m.activity.name}</b>
          </span>
        )}
        {voice && <span className="member-sub">🔊 {voice}</span>}
      </span>
    </button>
  );
}

function MemberMenu({
  member,
  x,
  y,
  voiceChannelId,
  onClose,
  onJoinVoice,
}: {
  member: MemberDTO;
  x: number;
  y: number;
  voiceChannelId: string | null;
  onClose: () => void;
  onJoinVoice?: (voiceChannelId: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const me = useAuthStore((s) => s.user?.id);
  const { roles, myPermissions, myRank, serverId } = useMembersStore();
  const voiceChannels = useServerStore((s) => s.voiceChannels);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isMe = member.userId === me;
  const above = !member.isOwner && myRank > rankOf(member, roles);
  const canRole = hasPerm(myPermissions, Perm.MANAGE_ROLES) && above;
  const canMove = hasPerm(myPermissions, Perm.MOVE_MEMBERS) && (above || isMe) && !!voiceChannelId;
  const canKick = hasPerm(myPermissions, Perm.KICK_MEMBERS) && above && !isMe;
  const role = roleOf(member, roles);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    setTimeout(() => window.addEventListener("mousedown", close), 0);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [onClose]);

  async function message() {
    const c = await startConversationWith(member.userId);
    const dm = useDmStore.getState();
    dm.upsertConversation(c);
    dm.setActiveConversation(c.id);
    dm.setView("dms");
    onClose();
  }

  async function changeRole(roleId: string) {
    if (!serverId) return;
    setBusy(true);
    setError(null);
    try {
      await setMemberRole(serverId, member.userId, roleId || null);
    } catch (err) {
      setError(apiError(err, tr("Не успях.", "That didn't work.")));
    } finally {
      setBusy(false);
    }
  }

  function move(to: string | null) {
    getSocket()?.emit(SocketEvents.VoiceMoveMember, { userId: member.userId, voiceChannelId: to });
    onClose();
  }

  // Owner only: a one-time link (24 h) for someone who forgot their password — copied to the
  // clipboard, to send them in a DM / Messenger.
  const canResetLink = myRank >= 1e9 && !isMe && !member.isOwner;
  const [resetInfo, setResetInfo] = useState<string | null>(null);
  async function makeResetLink() {
    if (!serverId) return;
    setError(null);
    try {
      const { link } = await memberResetLink(serverId, member.userId);
      try {
        await navigator.clipboard.writeText(link);
        setResetInfo(tr(`✓ Линкът е копиран — прати го на ${member.username}. Важи 24 ч. и само веднъж.`, `✓ Link copied — send it to ${member.username}. Valid for 24 h, once.`));
      } catch {
        window.prompt(tr(`Линк за нова парола за ${member.username} (важи 24 ч.):`, `New-password link for ${member.username} (valid for 24 h):`), link);
      }
    } catch (err) {
      setError(apiError(err, tr("Не успях.", "That didn't work.")));
    }
  }

  async function kick() {
    if (!serverId || !window.confirm(tr(`Да изгоня ли ${member.username} от сървъра?`, `Kick ${member.username} from the server?`))) return;
    try {
      await kickMember(serverId, member.userId);
      onClose();
    } catch (err) {
      setError(apiError(err, tr("Не успях.", "That didn't work.")));
    }
  }

  // Quick message straight from the card (Enter sends, the DM opens only if you ask for it).
  const [draft, setDraft] = useState("");
  const [sent, setSent] = useState(false);
  async function quickSend() {
    const text = draft.trim();
    if (!text) return;
    setError(null);
    try {
      const c = await startConversationWith(member.userId);
      useDmStore.getState().upsertConversation(c);
      getSocket()?.emit(SocketEvents.DmSend, { conversationId: c.id, content: text });
      setDraft("");
      setSent(true);
    } catch (err) {
      setError(apiError(err, tr("Не успях.", "That didn't work.")));
    }
  }

  const [editingStatus, setEditingStatus] = useState(false);
  const [copied, setCopied] = useState(false);
  const myVoice = useVoiceStore((s) => s.activeVoiceChannelId);
  const voiceName = voiceChannels.find((v) => v.id === voiceChannelId)?.name;
  const [moveTo, setMoveTo] = useState("");
  const showModeration = canRole || canMove || canKick || canResetLink;

  // Keep the whole card on screen: measure it after it renders and nudge it in.
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: x, top: y });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    // Opened from the right-hand list → show it to the left of the click (Discord-style).
    const wanted = x > window.innerWidth / 2 ? x - width - 12 : x + 12;
    const left = Math.max(8, Math.min(wanted, window.innerWidth - width - 8));
    const top = Math.max(8, Math.min(y - 40, window.innerHeight - height - 8));
    setPos((p) => (p.left === left && p.top === top ? p : { left, top }));
  }, [x, y, editingStatus, showModeration, error, resetInfo, sent]);

  const accent = role?.color ?? (member.isOwner ? "#f0b232" : null);
  return createPortal(
    <div ref={ref} className="member-menu profile-card" style={{ left: pos.left, top: pos.top, ["--card-accent" as string]: accent ?? "var(--accent)" }}>
      <div className="profile-banner" />
      <div className="profile-top">
        <span className="profile-avatar-wrap">
          {member.avatarUrl ? <img className="profile-avatar" src={member.avatarUrl} alt="" /> : <span className="profile-avatar placeholder">{member.username.slice(0, 2).toUpperCase()}</span>}
          <span className={`profile-status ${member.online ? "on" : ""}`} title={member.online ? tr("Онлайн", "Online") : tr("Офлайн", "Offline")} />
        </span>
        <button className="profile-close" onClick={onClose} aria-label={tr("Затвори", "Close")}>
          ✕
        </button>
      </div>

      <div className="profile-body">
        <div className="profile-name-row">
          <strong className="profile-name" style={accent ? { color: accent } : undefined}>
            {member.username}
          </strong>
          <button
            className="profile-copy"
            title={tr("Копирай името", "Copy the name")}
            onClick={() => {
              void navigator.clipboard?.writeText(member.username).then(() => setCopied(true));
            }}
          >
            {copied ? "✓" : "⧉"}
          </button>
        </div>
        <span className="profile-rank" style={accent ? { borderColor: accent } : undefined}>
          <span className="profile-rank-dot" style={accent ? { background: accent } : undefined} />
          {member.isOwner ? tr("👑 Собственик", "👑 Owner") : role?.name ?? tr("Член", "Member")}
          {isMe && <span className="profile-you"> · {tr("ти", "you")}</span>}
        </span>

        {member.customStatus && !editingStatus && <div className="profile-custom-status">💬 {member.customStatus}</div>}

        {(member.online && member.activity) || voiceName ? (
          <div className="profile-section">
            <div className="profile-section-title">{tr("В момента", "Right now")}</div>
            {member.online && member.activity && (
              <div className="profile-now">
                <GameIcon userId={member.userId} className="profile-game-icon" />
                <span className="profile-now-text">
                  <b>{member.activity.name}</b>
                  <small>
                    {tr("играе от", "playing for")} {elapsed(member.activity.since)}
                  </small>
                </span>
              </div>
            )}
            {voiceName && (
              <div className="profile-now">
                <span className="profile-now-icon">🔊</span>
                <span className="profile-now-text">
                  <b>{voiceName}</b>
                  <small>{tr("в гласов канал", "in a voice channel")}</small>
                </span>
                {voiceChannelId && voiceChannelId !== myVoice && onJoinVoice && (
                  <button
                    className="profile-join"
                    onClick={() => {
                      onJoinVoice(voiceChannelId);
                      onClose();
                    }}
                  >
                    {tr("Влез", "Join")}
                  </button>
                )}
              </div>
            )}
          </div>
        ) : null}

        <div className="profile-meta">
          {tr("В сървъра от", "Member since")} {new Date(member.joinedAt).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}
        </div>

        {!isMe && (
          <div className="profile-message">
            <input
              value={draft}
              maxLength={2000}
              placeholder={sent ? tr("✓ Изпратено — още нещо?", "✓ Sent — anything else?") : `${tr("Съобщение до", "Message")} @${member.username}`}
              onChange={(e) => {
                setDraft(e.target.value);
                setSent(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") void quickSend();
              }}
            />
            <button title={tr("Отвори разговора", "Open the conversation")} onClick={() => void message()}>
              💬
            </button>
          </div>
        )}

        {isMe &&
          (editingStatus ? (
            <StatusEditor current={member.customStatus ?? ""} onDone={onClose} />
          ) : (
            <button className="profile-action" onClick={() => setEditingStatus(true)}>
              😀 {member.customStatus ? tr("Смени статуса", "Change status") : tr("Задай статус", "Set a status")}
            </button>
          ))}

        {showModeration && (
          <div className="profile-section profile-mod">
            <div className="profile-section-title">🛡️ {tr("Управление", "Manage")}</div>
            {canRole && (
              <label className="member-menu-row">
                {tr("Ранг", "Rank")}
                <select value={member.roleId ?? ""} disabled={busy} onChange={(e) => void changeRole(e.target.value)}>
                  {roles
                    .filter((r) => r.position < myRank || r.id === member.roleId)
                    .map((r) => (
                      <option key={r.id} value={r.isDefault ? "" : r.id}>
                        {r.name}
                      </option>
                    ))}
                </select>
              </label>
            )}
            {canMove && (
              <div className="member-menu-row">
                {tr("Премести", "Move")}
                <select
                  value={moveTo}
                  onChange={(e) => {
                    setMoveTo(e.target.value);
                    if (e.target.value) move(e.target.value);
                  }}
                >
                  <option value="">{tr("— избери канал —", "— pick a channel —")}</option>
                  {voiceChannels
                    .filter((v) => v.id !== voiceChannelId)
                    .map((v) => (
                      <option key={v.id} value={v.id}>
                        🔊 {v.name}
                      </option>
                    ))}
                </select>
              </div>
            )}
            {canMove && (
              <button className="profile-action danger" onClick={() => move(null)}>
                ⛔ {tr("Изключи от гласа", "Disconnect from voice")}
              </button>
            )}
            {canResetLink && (
              <button className="profile-action" onClick={() => void makeResetLink()} title={tr("Забравил си е паролата? Пусни му линка в лично съобщение.", "Forgot their password? Send them the link in a direct message.")}>
                🔑 {tr("Линк за нова парола", "New-password link")}
              </button>
            )}
            {resetInfo && <div className="member-menu-info">{resetInfo}</div>}
            {canKick && (
              <button className="profile-action danger" onClick={() => void kick()}>
                🚪 {tr("Изгони от сървъра", "Kick from the server")}
              </button>
            )}
          </div>
        )}
        {error && <div className="member-menu-error">{error}</div>}
      </div>
    </div>,
    document.body,
  );
}

/** "1 ч 20 мин" since a timestamp. */
function elapsed(since: number) {
  const min = Math.max(1, Math.round((Date.now() - since) / 60000));
  if (min < 60) return tr(`${min} мин`, `${min} min`);
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? tr(`${h} ч ${m} мин`, `${h} h ${m} min`) : tr(`${h} ч`, `${h} h`);
}

const STATUS_PRESETS = ["🎮 Играя", "🍕 Ям", "📚 Уча", "💼 На работа", "😴 Спя", "🚗 На път", "🔇 Не ме закачайте"];

/** "Задай статус" in your own member menu: text under your name, optionally disappearing. */
function StatusEditor({ current, onDone }: { current: string; onDone: () => void }) {
  const [text, setText] = useState(current);
  const [hours, setHours] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(value: string) {
    setBusy(true);
    setError(null);
    try {
      const user = await updateProfile({ customStatus: value.trim() || null, customStatusHours: hours });
      const auth = useAuthStore.getState();
      if (auth.user) auth.setUser({ ...auth.user, ...user });
      onDone();
    } catch (err) {
      setError(apiError(err, tr("Не успях.", "That didn't work.")));
      setBusy(false);
    }
  }

  return (
    <div className="status-editor">
      <div className="member-menu-label">{tr("Статус под името", "Status under your name")}</div>
      <input
        className="status-input"
        value={text}
        maxLength={80}
        autoFocus
        placeholder={tr("напр. 🍕 връщам се след 10 мин", "e.g. 🍕 back in 10 min")}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void save(text);
        }}
      />
      <div className="status-presets">
        {STATUS_PRESETS.map((p) => (
          <button key={p} type="button" onClick={() => setText(p)}>
            {p}
          </button>
        ))}
      </div>
      <label className="member-menu-row">
        {tr("Изчезва", "Clears")}
        <select value={hours} onChange={(e) => setHours(Number(e.target.value))}>
          <option value={0}>{tr("никога", "never")}</option>
          <option value={0.5}>{tr("след 30 мин", "in 30 min")}</option>
          <option value={1}>{tr("след 1 ч", "in 1 h")}</option>
          <option value={4}>{tr("след 4 ч", "in 4 h")}</option>
          <option value={24}>{tr("след 24 ч", "in 24 h")}</option>
        </select>
      </label>
      <div className="status-actions">
        <button className="primary" disabled={busy} onClick={() => void save(text)}>
          {tr("Запази", "Save")}
        </button>
        {current && (
          <button disabled={busy} onClick={() => void save("")}>
            {tr("Махни статуса", "Clear status")}
          </button>
        )}
      </div>
      {error && <div className="member-menu-error">{error}</div>}
    </div>
  );
}
