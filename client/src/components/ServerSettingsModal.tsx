import { ALL_PERMS, PERM_INFO, Perm, hasPerm, type RoleDTO, type ServerDTO } from "@discord-clone/shared";
import { useEffect, useRef, useState } from "react";
import { updateServer } from "../api/servers.api";
import { createVoiceChannel } from "../api/channels.api";
import { isCloudinaryConfigured, uploadImageToCloudinary } from "../api/cloudinary";
import { apiError, createRole, deleteRole, kickMember, reorderRoles, setMemberRole, updateRole } from "../api/members.api";
import { useAuthStore } from "../store/authStore";
import { rankOf, roleOf, useMembersStore } from "../store/membersStore";
import { useServerStore } from "../store/serverStore";
import { useEscapeKey } from "../hooks/useEscapeKey";
import { tr } from "../i18n";
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
        <button className="modal-back" onClick={onClose} aria-label={tr("Назад", "Back")}>
          ←
        </button>
        <h1 className="modal-title">{tr("Настройки на сървъра", "Server settings")}</h1>
        <div className="ss-tabs">
          {canServer && (
            <button className={tab === "general" ? "on" : ""} onClick={() => setTab("general")}>
              {tr("Общи", "General")}
            </button>
          )}
          {canRoles && (
            <button className={tab === "roles" ? "on" : ""} onClick={() => setTab("roles")}>
              {tr("Рангове", "Ranks")}
            </button>
          )}
          {(canRoles || canKick) && (
            <button className={tab === "members" ? "on" : ""} onClick={() => setTab("members")}>
              {tr("Членове", "Members")}
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
  const allVoiceChannels = useServerStore((s) => s.voiceChannels);
  const voiceChannels = allVoiceChannels.filter((v) => v.serverId === server.id);
  const addVoiceChannel = useServerStore((s) => s.addVoiceChannel);
  const [afkChannelId, setAfkChannelId] = useState<string>(server.afkChannelId ?? "");
  const [afkTimeoutMin, setAfkTimeoutMin] = useState<number>(server.afkTimeoutMin ?? 20);
  const [name, setName] = useState(server.name);
  const [iconUrl, setIconUrl] = useState(server.iconUrl);
  const [bannerUrl, setBannerUrl] = useState(server.bannerUrl ?? null);
  const [bannerUploading, setBannerUploading] = useState(false);
  const bannerInputRef = useRef<HTMLInputElement>(null);
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
      setError(tr("Качването не успя.", "Upload failed."));
    } finally {
      setUploading(false);
    }
  }

  async function handleBannerPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBannerUploading(true);
    setError(null);
    try {
      setBannerUrl(await uploadImageToCloudinary(file));
    } catch {
      setError(tr("Качването на банера не успя.", "Banner upload failed."));
    } finally {
      setBannerUploading(false);
    }
  }

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      let afkId = afkChannelId || null;
      if (afkId === "new") {
        const vc = await createVoiceChannel(server.id, "💤 AFK");
        addVoiceChannel(vc);
        afkId = vc.id;
      }
      const updated = await updateServer(server.id, { name: name.trim(), iconUrl, bannerUrl, afkChannelId: afkId, afkTimeoutMin });
      updateServerInList(updated);
      onClose();
    } catch (err) {
      setError(apiError(err, tr("Не успях да запазя.", "Couldn't save.")));
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
          {uploading ? tr("Качване…", "Uploading…") : tr("Смени иконата", "Change icon")}
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleIconPick} />
      </div>
      <label className="modal-label" htmlFor="server-name-input">
        {tr("Име на сървъра", "Server name")}
      </label>
      <input id="server-name-input" className="modal-input" value={name} onChange={(e) => setName(e.target.value)} />
      <label className="modal-label" style={{ marginTop: 14 }}>
        {tr("🖼️ Банер (горе в списъка с канали)", "🖼️ Banner (top of the channel list)")}
      </label>
      {bannerUrl ? (
        <img className="server-banner-preview" src={bannerUrl} alt="" />
      ) : (
        <p className="modal-subtitle" style={{ margin: "4px 0 8px" }}>
          {tr("Няма банер — горе се вижда името. Най-добре е широка снимка (около 16:9), поне 600 px.", "No banner — the name is shown. A wide picture works best (about 16:9), at least 600 px.")}
        </p>
      )}
      <div className="server-banner-actions">
        <button type="button" onClick={() => bannerInputRef.current?.click()} disabled={bannerUploading || !isCloudinaryConfigured()}>
          {bannerUploading ? tr("Качване…", "Uploading…") : bannerUrl ? tr("Смени банера", "Change banner") : tr("Качи банер", "Upload banner")}
        </button>
        {bannerUrl && (
          <button type="button" onClick={() => setBannerUrl(null)}>
            {tr("Махни банера", "Remove banner")}
          </button>
        )}
        <input ref={bannerInputRef} type="file" accept="image/*" hidden onChange={handleBannerPick} />
      </div>
      <label className="modal-label" htmlFor="afk-channel-select" style={{ marginTop: 14 }}>
        {tr("💤 AFK канал", "💤 AFK channel")}
      </label>
      <select id="afk-channel-select" className="modal-input" value={afkChannelId} onChange={(e) => setAfkChannelId(e.target.value)}>
        <option value="">{tr("Няма (никой не се мести)", "None (nobody is moved)")}</option>
        {voiceChannels.map((v) => (
          <option key={v.id} value={v.id}>
            🔊 {v.name}
          </option>
        ))}
        <option value="new">{tr("＋ Създай нов канал „💤 AFK“", "＋ Create a new \"💤 AFK\" channel")}</option>
      </select>
      {afkChannelId && (
        <>
          <label className="modal-label" htmlFor="afk-timeout-select" style={{ marginTop: 10 }}>
            {tr("Мести там след", "Move people there after")}
          </label>
          <select id="afk-timeout-select" className="modal-input" value={afkTimeoutMin} onChange={(e) => setAfkTimeoutMin(Number(e.target.value))}>
            {[5, 10, 15, 20, 30, 60].map((m) => (
              <option key={m} value={m}>
                {m} {tr("мин без говорене", "min without talking")}
              </option>
            ))}
          </select>
          <p className="modal-hint">
            {tr(
              "Който толкова време не говори и не пипа клавиатура/мишка, отива в AFK канала със заглушен звук и микрофон. В десктоп приложението се брои активност навсякъде (и в игри). Не се мести, ако стриймва, гледа стрийм или е с камера.",
              "Anyone who hasn't talked or touched the keyboard/mouse for that long goes to the AFK channel, deafened. In the desktop app activity anywhere counts (games too). Not moved while streaming, watching a stream or on camera.",
            )}
          </p>
        </>
      )}
      {error && <div className="modal-error">{error}</div>}
      <button className="modal-create-button" onClick={handleSave} disabled={saving || uploading || bannerUploading || !name.trim()}>
        {saving ? tr("Запазване…", "Saving…") : tr("Запази", "Save")}
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
      const r = await createRole(serverId, { name: tr("Нов ранг", "New rank") });
      setSelectedId(r.id);
      await useMembersStore.getState().load(serverId);
    } catch (err) {
      setError(apiError(err, tr("Не успях да създам ранг.", "Couldn't create a rank.")));
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
      setError(apiError(err, tr("Не успях да ги пренаредя.", "Couldn't reorder them.")));
    }
  }

  const editable = (r: RoleDTO) => myRank >= 1e9 || r.position < myRank;

  return (
    <div className="ss-roles">
      <div className="ss-role-list">
        <button className="ss-btn primary" onClick={() => void add()} style={{ marginBottom: 8 }}>
          ＋ {tr("Нов ранг", "New rank")}
        </button>
        {[...ordered, ...(defaultRole ? [defaultRole] : [])].map((r, i) => (
          <div key={r.id} className={`ss-role ${selected?.id === r.id ? "on" : ""}`} onClick={() => setSelectedId(r.id)}>
            <span className="ss-role-dot" style={r.color ? { background: r.color } : undefined} />
            <span className="ss-role-name">{r.isDefault ? `${r.name} (${tr("всички", "everyone")})` : r.name}</span>
            {!r.isDefault && editable(r) && (
              <span className="ss-role-move">
                {i > 0 && editable(ordered[i - 1]!) && (
                  <span title={tr("По-високо", "Higher")} onClick={(e) => { e.stopPropagation(); void move(r, -1); }}>▲</span>
                )}
                {i < ordered.length - 1 && (
                  <span title={tr("По-ниско", "Lower")} onClick={(e) => { e.stopPropagation(); void move(r, 1); }}>▼</span>
                )}
              </span>
            )}
          </div>
        ))}
        <p className="ss-note">{tr("Горе = по-висок ранг. Всеки управлява само хора и рангове под своя.", "Top = higher rank. Everyone only manages people and ranks below their own.")}</p>
        {error && <div className="ss-error">{error}</div>}
      </div>
      {selected ? (
        <RoleEditor key={selected.id} serverId={serverId} role={selected} canEdit={editable(selected)} grantable={isAdmin ? ALL_PERMS : myPerms} />
      ) : (
        <div className="ss-note">{tr("Няма рангове.", "No ranks.")}</div>
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
      setError(apiError(err, tr("Не успях да запазя.", "Couldn't save.")));
    } finally {
      setSaving(false);
    }
  }

  const defaultName = useMembersStore((s) => s.roles.find((r) => r.isDefault)?.name ?? tr("основния ранг", "the default rank"));

  async function remove() {
    if (!window.confirm(tr(`Да изтрия ли ранга „${role.name}“? Хората с него стават „${defaultName}“.`, `Delete the rank "${role.name}"? People with it become "${defaultName}".`))) return;
    try {
      await deleteRole(serverId, role.id);
      await useMembersStore.getState().load(serverId);
    } catch (err) {
      setError(apiError(err, tr("Не успях да го изтрия.", "Couldn't delete it.")));
    }
  }

  return (
    <div className="ss-editor">
      {!canEdit && <div className="ss-note">{tr("Този ранг е равен или над твоя — можеш само да го разгледаш.", "This rank is equal to or above yours — you can only look at it.")}</div>}
      <label className="ss-field">
        <span>{tr("Име", "Name")}</span>
        <input className="ss-input" value={name} maxLength={32} disabled={!canEdit} onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="ss-field">
        <span>{tr("Цвят на името", "Name colour")}</span>
        <div className="ss-colors">
          <button type="button" className={`ss-color none ${color === null ? "on" : ""}`} title={tr("Без цвят", "No colour")} disabled={!canEdit} onClick={() => setColor(null)} />
          {COLORS.map((c) => (
            <button type="button" key={c} className={`ss-color ${color === c ? "on" : ""}`} style={{ background: c }} disabled={!canEdit} onClick={() => setColor(c)} />
          ))}
          <input type="color" value={color ?? "#99aab5"} disabled={!canEdit} onChange={(e) => setColor(e.target.value)} title={tr("Друг цвят", "Other colour")} />
        </div>
      </div>
      <div className="ss-field">
        <span>{tr("Права", "Permissions")}</span>
        <div className="ss-perms">
          {PERM_INFO.map((p) => {
            const bit = Perm[p.key];
            const allowed = canEdit && (grantable & bit) === bit;
            return (
              <label key={p.key} className={`ss-perm ${allowed ? "" : "disabled"}`}>
                <span className="ss-perm-text">
                  <b>{tr(p.label, p.labelEn)}</b>
                  {p.hint && <small>{tr(p.hint, p.hintEn)}</small>}
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
              {tr("Изтрий ранга", "Delete rank")}
            </button>
          )}
          <span className="ss-spacer" />
          {saved && !dirty && <span className="ss-note">{tr("✓ Запазено", "✓ Saved")}</span>}
          <button
            className="ss-btn"
            disabled={!dirty}
            onClick={() => {
              setName(role.name);
              setColor(role.color);
              setPerms(role.permissions);
            }}
          >
            {tr("Откажи", "Discard")}
          </button>
          <button className="ss-btn primary" disabled={!dirty || saving || !name.trim()} onClick={() => void save()}>
            {saving ? tr("Запазване…", "Saving…") : tr("Запази", "Save")}
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
      setError(apiError(err, tr("Не успях.", "That didn't work.")));
    }
  }

  async function kick(userId: string, username: string) {
    if (!window.confirm(tr(`Да изгоня ли ${username} от сървъра?`, `Kick ${username} from the server?`))) return;
    setError(null);
    try {
      await kickMember(serverId, userId);
    } catch (err) {
      setError(apiError(err, tr("Не успях.", "That didn't work.")));
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
              <span className="ss-note">{tr("Собственик", "Owner")}</span>
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
                {tr("Изгони", "Kick")}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
