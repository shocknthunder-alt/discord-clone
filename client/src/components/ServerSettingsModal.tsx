import { ALL_PERMS, PERM_INFO, Perm, hasPerm, type RoleDTO, type ServerDTO } from "@discord-clone/shared";
import { useEffect, useRef, useState } from "react";
import { updateServer } from "../api/servers.api";
import { isCloudinaryConfigured, uploadImageToCloudinary } from "../api/cloudinary";
import { apiError, createRole, deleteRole, kickMember, reorderRoles, setMemberRole, updateRole } from "../api/members.api";
import { useAuthStore } from "../store/authStore";
import { rankOf, roleOf, useMembersStore } from "../store/membersStore";
import { useServerStore } from "../store/serverStore";
import { useEscapeKey } from "../hooks/useEscapeKey";
import "./members.css";

interface Props {
  server: ServerDTO;
  onClose: () => void;
}

type Tab = "general" | "roles" | "members";

export default function ServerSettingsModal({ server, onClose }: Props) {
  useEscapeKey(onClose);
  const myPerms = useMembersStore((s) => s.myPermissions);
  const canServer = hasPerm(myPerms, Perm.MANAGE_SERVER);
  const canRoles = hasPerm(myPerms, Perm.MANAGE_ROLES);
  const canKick = hasPerm(myPerms, Perm.KICK_MEMBERS);
  const [tab, setTab] = useState<Tab>(canServer ? "general" : canRoles ? "roles" : "members");

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card ss-card" onClick={(e) => e.stopPropagation()}>
        <button className="modal-back" onClick={onClose} aria-label="Back">
          ←
        </button>
        <h1 className="modal-title">Настройки на сървъра</h1>
        <div className="ss-tabs">
          {canServer && (
            <button className={tab === "general" ? "on" : ""} onClick={() => setTab("general")}>
              Общи
            </button>
          )}
          {canRoles && (
            <button className={tab === "roles" ? "on" : ""} onClick={() => setTab("roles")}>
              Рангове
            </button>
          )}
          {(canRoles || canKick) && (
            <button className={tab === "members" ? "on" : ""} onClick={() => setTab("members")}>
              Членове
            </button>
          )}
        </div>
        {tab === "general" && canServer && <GeneralTab server={server} onClose={onClose} />}
        {tab === "roles" && canRoles && <RolesTab serverId={server.id} />}
        {tab === "members" && <MembersTab serverId={server.id} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- general

function GeneralTab({ server, onClose }: Props) {
  const updateServerInList = useServerStore((s) => s.updateServerInList);
  const [name, setName] = useState(server.name);
  const [iconUrl, setIconUrl] = useState(server.iconUrl);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleIconPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      setIconUrl(await uploadImageToCloudinary(file));
    } catch {
      setError("Качването не успя.");
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateServer(server.id, { name: name.trim(), iconUrl });
      updateServerInList(updated);
      onClose();
    } catch (err) {
      setError(apiError(err, "Не успях да запазя."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="avatar-picker">
        {iconUrl ? (
          <img className="avatar-picker-preview" src={iconUrl} alt="" />
        ) : (
          <div className="avatar-picker-preview placeholder">{name.slice(0, 2).toUpperCase()}</div>
        )}
        <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading || !isCloudinaryConfigured()}>
          {uploading ? "Качване…" : "Смени иконата"}
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleIconPick} />
      </div>
      <label className="modal-label" htmlFor="server-name-input">
        Име на сървъра
      </label>
      <input id="server-name-input" className="modal-input" value={name} onChange={(e) => setName(e.target.value)} />
      {error && <div className="modal-error">{error}</div>}
      <button className="modal-create-button" onClick={handleSave} disabled={saving || uploading || !name.trim()}>
        {saving ? "Запазване…" : "Запази"}
      </button>
    </>
  );
}

// ---------------------------------------------------------------- ranks

const COLORS = ["#e74c3c", "#e67e22", "#f1c40f", "#2ecc71", "#1abc9c", "#3498db", "#9b59b6", "#e91e63", "#95a5a6", "#ffffff"];

function RolesTab({ serverId }: { serverId: string }) {
  const roles = useMembersStore((s) => s.roles);
  const myPerms = useMembersStore((s) => s.myPermissions);
  const myRank = useMembersStore((s) => s.myRank);
  const isAdmin = (myPerms & Perm.ADMINISTRATOR) !== 0;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selected = roles.find((r) => r.id === selectedId) ?? roles[0] ?? null;
  const ordered = roles.filter((r) => !r.isDefault); // highest first (server sorts desc)
  const defaultRole = roles.find((r) => r.isDefault);

  async function add() {
    setError(null);
    try {
      const r = await createRole(serverId, { name: "Нов ранг" });
      setSelectedId(r.id);
      await useMembersStore.getState().load(serverId);
    } catch (err) {
      setError(apiError(err, "Не успях да създам ранг."));
    }
  }

  async function move(role: RoleDTO, dir: -1 | 1) {
    const ids = ordered.map((r) => r.id);
    const i = ids.indexOf(role.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    setError(null);
    try {
      await reorderRoles(serverId, ids);
      await useMembersStore.getState().load(serverId);
    } catch (err) {
      setError(apiError(err, "Не успях да ги пренаредя."));
    }
  }

  const editable = (r: RoleDTO) => myRank >= 1e9 || r.position < myRank;

  return (
    <div className="ss-roles">
      <div className="ss-role-list">
        <button className="ss-btn primary" onClick={() => void add()} style={{ marginBottom: 8 }}>
          ＋ Нов ранг
        </button>
        {[...ordered, ...(defaultRole ? [defaultRole] : [])].map((r, i) => (
          <div key={r.id} className={`ss-role ${selected?.id === r.id ? "on" : ""}`} onClick={() => setSelectedId(r.id)}>
            <span className="ss-role-dot" style={r.color ? { background: r.color } : undefined} />
            <span className="ss-role-name">{r.isDefault ? `${r.name} (всички)` : r.name}</span>
            {!r.isDefault && editable(r) && (
              <span className="ss-role-move">
                {i > 0 && editable(ordered[i - 1]!) && (
                  <span title="По-високо" onClick={(e) => { e.stopPropagation(); void move(r, -1); }}>▲</span>
                )}
                {i < ordered.length - 1 && (
                  <span title="По-ниско" onClick={(e) => { e.stopPropagation(); void move(r, 1); }}>▼</span>
                )}
              </span>
            )}
          </div>
        ))}
        <p className="ss-note">Горе = по-висок ранг. Всеки управлява само хора и рангове под своя.</p>
        {error && <div className="ss-error">{error}</div>}
      </div>
      {selected ? (
        <RoleEditor key={selected.id} serverId={serverId} role={selected} canEdit={editable(selected)} grantable={isAdmin ? ALL_PERMS : myPerms} />
      ) : (
        <div className="ss-note">Няма рангове.</div>
      )}
    </div>
  );
}

function RoleEditor({ serverId, role, canEdit, grantable }: { serverId: string; role: RoleDTO; canEdit: boolean; grantable: number }) {
  const [name, setName] = useState(role.name);
  const [color, setColor] = useState<string | null>(role.color);
  const [perms, setPerms] = useState(role.permissions);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const dirty = name !== role.name || color !== role.color || perms !== role.permissions;

  useEffect(() => setSaved(false), [name, color, perms]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await updateRole(serverId, role.id, { name: name.trim(), color, permissions: perms });
      await useMembersStore.getState().load(serverId);
      setSaved(true);
    } catch (err) {
      setError(apiError(err, "Не успях да запазя."));
    } finally {
      setSaving(false);
    }
  }

  const defaultName = useMembersStore((s) => s.roles.find((r) => r.isDefault)?.name ?? "основния ранг");

  async function remove() {
    if (!window.confirm(`Да изтрия ли ранга „${role.name}“? Хората с него стават „${defaultName}“.`)) return;
    try {
      await deleteRole(serverId, role.id);
      await useMembersStore.getState().load(serverId);
    } catch (err) {
      setError(apiError(err, "Не успях да го изтрия."));
    }
  }

  return (
    <div className="ss-editor">
      {!canEdit && <div className="ss-note">Този ранг е равен или над твоя — можеш само да го разгледаш.</div>}
      <label className="ss-field">
        <span>Име</span>
        <input className="ss-input" value={name} maxLength={32} disabled={!canEdit} onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="ss-field">
        <span>Цвят на името</span>
        <div className="ss-colors">
          <button type="button" className={`ss-color none ${color === null ? "on" : ""}`} title="Без цвят" disabled={!canEdit} onClick={() => setColor(null)} />
          {COLORS.map((c) => (
            <button type="button" key={c} className={`ss-color ${color === c ? "on" : ""}`} style={{ background: c }} disabled={!canEdit} onClick={() => setColor(c)} />
          ))}
          <input type="color" value={color ?? "#99aab5"} disabled={!canEdit} onChange={(e) => setColor(e.target.value)} title="Друг цвят" />
        </div>
      </div>
      <div className="ss-field">
        <span>Права</span>
        <div className="ss-perms">
          {PERM_INFO.map((p) => {
            const bit = Perm[p.key];
            const allowed = canEdit && (grantable & bit) === bit;
            return (
              <label key={p.key} className={`ss-perm ${allowed ? "" : "disabled"}`}>
                <span className="ss-perm-text">
                  <b>{p.label}</b>
                  {p.hint && <small>{p.hint}</small>}
                </span>
                <input
                  type="checkbox"
                  checked={(perms & bit) === bit}
                  disabled={!allowed}
                  onChange={(e) => setPerms((v) => (e.target.checked ? v | bit : v & ~bit))}
                />
              </label>
            );
          })}
        </div>
      </div>
      {error && <div className="ss-error">{error}</div>}
      {canEdit && (
        <div className="ss-actions">
          {!role.isDefault && (
            <button className="ss-btn danger" onClick={() => void remove()}>
              Изтрий ранга
            </button>
          )}
          <span className="ss-spacer" />
          {saved && !dirty && <span className="ss-note">✓ Запазено</span>}
          <button
            className="ss-btn"
            disabled={!dirty}
            onClick={() => {
              setName(role.name);
              setColor(role.color);
              setPerms(role.permissions);
            }}
          >
            Откажи
          </button>
          <button className="ss-btn primary" disabled={!dirty || saving || !name.trim()} onClick={() => void save()}>
            {saving ? "Запазване…" : "Запази"}
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- members

function MembersTab({ serverId }: { serverId: string }) {
  const { members, roles, myPermissions, myRank } = useMembersStore();
  const me = useAuthStore((s) => s.user?.id);
  const [error, setError] = useState<string | null>(null);
  const canRoles = hasPerm(myPermissions, Perm.MANAGE_ROLES);
  const canKick = hasPerm(myPermissions, Perm.KICK_MEMBERS);
  const sorted = [...members].sort((a, b) => rankOf(b, roles) - rankOf(a, roles) || a.username.localeCompare(b.username));

  async function change(userId: string, roleId: string) {
    setError(null);
    try {
      await setMemberRole(serverId, userId, roleId || null);
    } catch (err) {
      setError(apiError(err, "Не успях."));
    }
  }

  async function kick(userId: string, username: string) {
    if (!window.confirm(`Да изгоня ли ${username} от сървъра?`)) return;
    setError(null);
    try {
      await kickMember(serverId, userId);
    } catch (err) {
      setError(apiError(err, "Не успях."));
    }
  }

  return (
    <div className="ss-members">
      {error && <div className="ss-error">{error}</div>}
      {sorted.map((m) => {
        const above = !m.isOwner && myRank > rankOf(m, roles);
        const role = roleOf(m, roles);
        return (
          <div key={m.userId} className="ss-member">
            {m.avatarUrl ? <img className="member-avatar" src={m.avatarUrl} alt="" /> : <span className="member-avatar placeholder">{m.username.slice(0, 2).toUpperCase()}</span>}
            <span className="ss-member-name" style={role?.color ? { color: role.color } : undefined}>
              {m.username} {m.isOwner && "👑"}
            </span>
            {m.isOwner ? (
              <span className="ss-note">Собственик</span>
            ) : canRoles && above ? (
              <select value={m.roleId ?? ""} onChange={(e) => void change(m.userId, e.target.value)}>
                {roles
                  .filter((r) => r.position < myRank || r.id === m.roleId)
                  .map((r) => (
                    <option key={r.id} value={r.isDefault ? "" : r.id}>
                      {r.name}
                    </option>
                  ))}
              </select>
            ) : (
              <span className="ss-note">{role?.name}</span>
            )}
            {canKick && above && m.userId !== me && (
              <button className="ss-btn danger" onClick={() => void kick(m.userId, m.username)}>
                Изгони
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
