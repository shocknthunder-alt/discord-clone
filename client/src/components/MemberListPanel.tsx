import { Perm, SocketEvents, hasPerm, type MemberDTO } from "@discord-clone/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { startConversationWith } from "../api/dm.api";
import { apiError, kickMember, setMemberRole } from "../api/members.api";
import { getSocket } from "../socket/socket";
import { useAuthStore } from "../store/authStore";
import { useDmStore } from "../store/dmStore";
import { rankOf, roleOf, useMembersStore } from "../store/membersStore";
import { useServerStore } from "../store/serverStore";
import { useVoiceStore } from "../store/voiceStore";
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
export default function MemberListPanel() {
  const members = useMembersStore((s) => s.members);
  const roles = useMembersStore((s) => s.roles);
  const where = useVoiceWhereabouts();
  const [menu, setMenu] = useState<{ member: MemberDTO; x: number; y: number } | null>(null);

  const online = members.filter((m) => m.online);
  const offline = members.filter((m) => !m.online).sort((a, b) => a.username.localeCompare(b.username));
  const byName = (a: MemberDTO, b: MemberDTO) => a.username.localeCompare(b.username);

  // Groups: owner, then every non-default rank (highest first), then the default rank as "Онлайн".
  const groups: { key: string; label: string; color: string | null; people: MemberDTO[] }[] = [];
  const owners = online.filter((m) => m.isOwner).sort(byName);
  if (owners.length) groups.push({ key: "owner", label: "👑 Собственик", color: null, people: owners });
  for (const r of roles.filter((x) => !x.isDefault)) {
    const people = online.filter((m) => !m.isOwner && m.roleId === r.id).sort(byName);
    if (people.length) groups.push({ key: r.id, label: r.name, color: r.color, people });
  }
  const rest = online.filter((m) => !m.isOwner && !roles.some((r) => !r.isDefault && r.id === m.roleId)).sort(byName);
  if (rest.length) groups.push({ key: "online", label: "Онлайн", color: null, people: rest });

  return (
    <aside className="members-panel">
      <div className="members-head">
        <span>Членове — {members.length}</span>
        <span className="members-counts">
          <span className="members-dot on" /> {online.length} онлайн · <span className="members-dot" /> {offline.length} офлайн
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
            <div className="members-group">Офлайн — {offline.length}</div>
            {offline.map((m) => (
              <MemberRow key={m.userId} m={m} offline onClick={(e) => setMenu({ member: m, x: e.clientX, y: e.clientY })} />
            ))}
          </>
        )}
      </div>
      {menu && <MemberMenu member={menu.member} x={menu.x} y={menu.y} voiceChannelId={where.get(menu.member.userId)?.id ?? null} onClose={() => setMenu(null)} />}
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
          {m.username} {m.isOwner && <span title="Собственик">👑</span>}
        </span>
        {voice && <span className="member-sub">🔊 {voice}</span>}
      </span>
    </button>
  );
}

function MemberMenu({ member, x, y, voiceChannelId, onClose }: { member: MemberDTO; x: number; y: number; voiceChannelId: string | null; onClose: () => void }) {
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
      setError(apiError(err, "Не успях."));
    } finally {
      setBusy(false);
    }
  }

  function move(to: string | null) {
    getSocket()?.emit(SocketEvents.VoiceMoveMember, { userId: member.userId, voiceChannelId: to });
    onClose();
  }

  async function kick() {
    if (!serverId || !window.confirm(`Да изгоня ли ${member.username} от сървъра?`)) return;
    try {
      await kickMember(serverId, member.userId);
      onClose();
    } catch (err) {
      setError(apiError(err, "Не успях."));
    }
  }

  const left = Math.min(x, window.innerWidth - 250);
  const top = Math.min(y, window.innerHeight - 320);
  return createPortal(
    <div ref={ref} className="member-menu" style={{ left, top }}>
      <div className="member-menu-head">
        <strong style={role?.color ? { color: role.color } : undefined}>{member.username}</strong>
        <span>{member.isOwner ? "👑 Собственик" : role?.name ?? ""}</span>
      </div>
      {!isMe && <button onClick={() => void message()}>💬 Съобщение</button>}
      {canRole && (
        <label className="member-menu-row">
          Ранг
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
        <>
          <div className="member-menu-label">Премести в</div>
          {voiceChannels
            .filter((v) => v.id !== voiceChannelId)
            .map((v) => (
              <button key={v.id} onClick={() => move(v.id)}>
                🔊 {v.name}
              </button>
            ))}
          <button className="danger" onClick={() => move(null)}>
            ⛔ Изключи от гласа
          </button>
        </>
      )}
      {canKick && (
        <button className="danger" onClick={() => void kick()}>
          🚪 Изгони от сървъра
        </button>
      )}
      {error && <div className="member-menu-error">{error}</div>}
    </div>,
    document.body,
  );
}
