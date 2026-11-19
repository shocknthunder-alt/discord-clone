import type { MemberDTO } from "@discord-clone/shared";
import { useState } from "react";
import { roleOf, useMembersStore } from "../store/membersStore";
import { tr } from "../i18n";
import GameIcon from "./GameIcon";
import ProfileCard, { useVoiceWhereabouts } from "./ProfileCard";
import "./members.css";

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
        <ProfileCard
          key={menu.member.userId}
          member={members.find((m) => m.userId === menu.member.userId) ?? menu.member}
          x={menu.x}
          y={menu.y}
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
