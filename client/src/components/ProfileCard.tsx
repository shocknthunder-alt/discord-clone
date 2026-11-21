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
export function useVoiceWhereabouts() {
  const occupants = useVoiceStore((s) => s.channelOccupants);
  const voiceChannels = useServerStore((s) => s.voiceChannels);
  return useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    for (const vc of voiceChannels) for (const p of occupants.get(vc.id) ?? []) map.set(p.userId, { id: vc.id, name: vc.name });
    return map;
  }, [occupants, voiceChannels]);
}

interface Props {
  member: MemberDTO;
  x: number;
  y: number;
  onClose: () => void;
  /** "Влез" next to the voice channel they're in. */
  onJoinVoice?: (voiceChannelId: string) => void;
  /** Opened on someone in my call: adds their volume / mute-for-me controls. */
  peerSocketId?: string;
  /** "Обади се" (private call). */
  onCall?: (userId: string) => void;
}

/**
 * The card you get when you click someone (member list, voice channel list, voice tiles):
 * who they are, what they're doing, a quick message, sound controls when they're in your call,
 * and the moderation tools your rank allows.
 */
export default function ProfileCard({ member, x, y, onClose, onJoinVoice, peerSocketId, onCall }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const me = useAuthStore((s) => s.user?.id);
  const { roles, myPermissions, myRank, serverId } = useMembersStore();
  const voiceChannels = useServerStore((s) => s.voiceChannels);
  const where = useVoiceWhereabouts();
  const voiceChannelId = where.get(member.userId)?.id ?? null;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isMe = member.userId === me;
  // Someone who isn't in this server (e.g. a private call): no rank, no moderation.
  const inServer = useMembersStore((s) => s.members.some((m) => m.userId === member.userId));
  const above = inServer && !member.isOwner && myRank > rankOf(member, roles);
  const canRole = hasPerm(myPermissions, Perm.MANAGE_ROLES) && above;
  const canMove = inServer && hasPerm(myPermissions, Perm.MOVE_MEMBERS) && (above || isMe) && !!voiceChannelId;
  const canKick = hasPerm(myPermissions, Perm.KICK_MEMBERS) && above && !isMe;
  const role = inServer ? roleOf(member, roles) : null;

  // Live peer (volume slider / mute label follow clicks while the card is open).
  const peer = useVoiceStore((s) => (peerSocketId ? s.peers.get(peerSocketId) : undefined));
  const { setPeerLocalVolume, setPeerLocalMuted } = useVoiceStore();

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const t = setTimeout(() => window.addEventListener("mousedown", close), 0);
    window.addEventListener("keydown", esc);
    return () => {
      clearTimeout(t);
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
  const canResetLink = inServer && myRank >= 1e9 && !isMe && !member.isOwner;
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
    // Clicked on the right half (member list) → card to the left of the click, else to the right.
    const wanted = x > window.innerWidth / 2 ? x - width - 12 : x + 12;
    const left = Math.max(8, Math.min(wanted, window.innerWidth - width - 8));
    const top = Math.max(8, Math.min(y - 40, window.innerHeight - height - 8));
    setPos((p) => (p.left === left && p.top === top ? p : { left, top }));
  }, [x, y, editingStatus, showModeration, error, resetInfo, sent, !!peer]);

  const accent = role?.color ?? (member.isOwner ? "#f0b232" : null);
  return createPortal(
    <div
      ref={ref}
      className="member-menu profile-card"
      style={{ left: pos.left, top: pos.top, ["--card-accent" as string]: accent ?? "var(--accent)" }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
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
          {member.isOwner ? (
            <strong className="profile-name owner-name">
              <span className="owner-name-text">{member.username}</span>
            </strong>
          ) : (
            <strong className="profile-name" style={accent ? { color: accent } : undefined}>
              {member.username}
            </strong>
          )}
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
        {inServer && (
          <span className="profile-rank" style={accent ? { borderColor: accent } : undefined}>
            <span className="profile-rank-dot" style={accent ? { background: accent } : undefined} />
            {member.isOwner ? tr("👑 Собственик", "👑 Owner") : role?.name ?? tr("Член", "Member")}
            {isMe && <span className="profile-you"> · {tr("ти", "you")}</span>}
          </span>
        )}

        {member.customStatus && !editingStatus && <div className="profile-custom-status">💬 {member.customStatus}</div>}

        {peer && (
          <div className="profile-section profile-voice">
            <div className="profile-section-title">
              🎧 {tr("Звук (само за теб)", "Sound (just for you)")}
              {peer.isMuted && <span className="profile-voice-flag">🔇 {tr("микрофонът му е спрян", "their mic is off")}</span>}
            </div>
            <div className="profile-volume">
              <button
                className={`profile-mute ${peer.localMuted ? "on" : ""}`}
                title={peer.localMuted ? tr("Включи го за мен", "Unmute for me") : tr("Заглуши го за мен", "Mute for me")}
                onClick={() => setPeerLocalMuted(peer.socketId, !peer.localMuted)}
              >
                {peer.localMuted ? "🔇" : "🔊"}
              </button>
              <input
                type="range"
                min={0}
                max={200}
                step={5}
                value={peer.localVolume}
                disabled={peer.localMuted}
                style={{ ["--fill" as string]: `${peer.localVolume / 2}%` }}
                onChange={(e) => setPeerLocalVolume(peer.socketId, Number(e.target.value))}
              />
              <button className="profile-volume-value" title={tr("Върни на 100%", "Back to 100%")} onClick={() => setPeerLocalVolume(peer.socketId, 100)}>
                {peer.localVolume}%
              </button>
            </div>
            <div className="profile-volume-presets">
              {[50, 100, 150, 200].map((v) => (
                <button key={v} className={peer.localVolume === v ? "on" : ""} onClick={() => setPeerLocalVolume(peer.socketId, v)}>
                  {v}%
                </button>
              ))}
              <button className={`profile-mute-text ${peer.localMuted ? "on" : ""}`} onClick={() => setPeerLocalMuted(peer.socketId, !peer.localMuted)}>
                {peer.localMuted ? tr("Включи го", "Unmute") : tr("Заглуши за мен", "Mute for me")}
              </button>
            </div>
          </div>
        )}

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
                  <small>{voiceChannelId === myVoice ? tr("с теб в канала", "in the channel with you") : tr("в гласов канал", "in a voice channel")}</small>
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

        {inServer && member.joinedAt && (
          <div className="profile-meta">
            {tr("В сървъра от", "Member since")} {new Date(member.joinedAt).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}
          </div>
        )}

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
            {onCall && (
              <button
                title={tr(`Обади се на ${member.username}`, `Call ${member.username}`)}
                onClick={() => {
                  onCall(member.userId);
                  onClose();
                }}
              >
                📞
              </button>
            )}
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

/** "Задай статус" on your own card: text under your name, optionally disappearing. */
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
