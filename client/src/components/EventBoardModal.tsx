import { Perm, hasPerm, splitAttendees, type EventInput, type EventRecurrence, type EventRsvpDTO, type EventRsvpStatus, type ServerEventDTO } from "@discord-clone/shared";
import { useEffect, useRef, useState } from "react";
import { isCloudinaryConfigured, uploadImageToCloudinary } from "../api/cloudinary";
import { createEvent, deleteEvent, fetchEventArchive, setRsvp, updateEvent } from "../api/events.api";
import { useAuthStore } from "../store/authStore";
import { countdown, isEnded, isRunning, upcomingOf, useEventsStore } from "../store/eventsStore";
import { useServerStore } from "../store/serverStore";
import { useMembersStore } from "../store/membersStore";
import { linkifyText } from "../utils/linkify";
import {
  RECURRENCE_LABEL,
  downloadIcs,
  fmtDay,
  fmtRange,
  googleCalendarUrl,
  toDateInput,
  toTimeInput,
  useNow,
} from "./eventUtils";
import "./events.css";

interface Props {
  onJoinVoice: (serverId: string, voiceChannelId: string) => void;
}

type View = { kind: "list" } | { kind: "detail"; id: string } | { kind: "form"; editing: ServerEventDTO | null };

function Avatar({ r }: { r: EventRsvpDTO }) {
  return r.avatarUrl ? (
    <img className="ev-avatar" src={r.avatarUrl} alt="" title={r.username} />
  ) : (
    <span className="ev-avatar placeholder" title={r.username}>
      {r.username.slice(0, 2).toUpperCase()}
    </span>
  );
}

function usePlace() {
  const voiceChannels = useServerStore((s) => s.voiceChannels);
  return (e: ServerEventDTO) => {
    if (e.voiceChannelId) {
      const vc = voiceChannels.find((v) => v.id === e.voiceChannelId);
      return vc ? `🔊 ${vc.name}` : "🔊 гласов канал";
    }
    return e.location ? `📍 ${e.location}` : "";
  };
}

export default function EventBoardModal({ onJoinVoice }: Props) {
  const board = useEventsStore((s) => s.board);
  const events = useEventsStore((s) => s.events);
  const closeBoard = useEventsStore((s) => s.closeBoard);
  const markSeen = useEventsStore((s) => s.markSeen);
  const activeServerId = useServerStore((s) => s.activeServerId);
  const [view, setView] = useState<View>({ kind: "list" });

  useEffect(() => {
    if (!board.open) return;
    if (board.creating) setView({ kind: "form", editing: null });
    else if (board.eventId) setView({ kind: "detail", id: board.eventId });
    else setView({ kind: "list" });
  }, [board]);

  useEffect(() => {
    if (board.open && activeServerId) markSeen(activeServerId);
  }, [board.open, activeServerId, events, markSeen]);

  useEffect(() => {
    if (!board.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeBoard();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [board.open, closeBoard]);

  if (!board.open || !activeServerId) return null;

  return (
    <div className="modal-overlay" onMouseDown={closeBoard}>
      <div className="ev-modal" onMouseDown={(e) => e.stopPropagation()}>
        <button className="ev-close" onClick={closeBoard} aria-label="Затвори">
          ✕
        </button>
        {view.kind === "list" && (
          <EventList
            serverId={activeServerId}
            onOpen={(id) => setView({ kind: "detail", id })}
            onCreate={() => setView({ kind: "form", editing: null })}
          />
        )}
        {view.kind === "detail" && (
          <EventDetail
            id={view.id}
            onBack={() => setView({ kind: "list" })}
            onEdit={(e) => setView({ kind: "form", editing: e })}
            onJoinVoice={onJoinVoice}
          />
        )}
        {view.kind === "form" && (
          <EventForm
            serverId={activeServerId}
            editing={view.editing}
            onDone={(id) => setView(id ? { kind: "detail", id } : { kind: "list" })}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- list

function EventList({ serverId, onOpen, onCreate }: { serverId: string; onOpen: (id: string) => void; onCreate: () => void }) {
  const events = useEventsStore((s) => s.events);
  const now = useNow();
  const [tab, setTab] = useState<"upcoming" | "archive">("upcoming");
  const [archive, setArchive] = useState<ServerEventDTO[] | null>(null);

  useEffect(() => {
    if (tab !== "archive") return;
    fetchEventArchive(serverId).then(setArchive).catch(() => setArchive([]));
  }, [tab, serverId]);

  const upcoming = upcomingOf(events, serverId, now);
  const recentlyEnded = events.filter((e) => e.serverId === serverId && isEnded(e, now)).reverse();
  const shown = tab === "upcoming" ? upcoming : [...recentlyEnded, ...(archive ?? [])];

  return (
    <>
      <div className="ev-head">
        <h2>📅 Събития</h2>
        <button className="ev-btn primary" onClick={onCreate}>
          ＋ Ново събитие
        </button>
      </div>
      <div className="ev-tabs">
        <button className={tab === "upcoming" ? "on" : ""} onClick={() => setTab("upcoming")}>
          Предстоящи ({upcoming.length})
        </button>
        <button className={tab === "archive" ? "on" : ""} onClick={() => setTab("archive")}>
          Архив
        </button>
      </div>
      <div className="ev-list">
        {shown.length === 0 && (
          <div className="ev-empty-big">
            {tab === "upcoming" ? "Няма предстоящи събития. Създай първото! 🎉" : archive === null ? "Зареждане…" : "Архивът е празен."}
          </div>
        )}
        {shown.map((e) => (
          <EventCard key={e.id} e={e} now={now} onClick={() => onOpen(e.id)} />
        ))}
      </div>
    </>
  );
}

function EventCard({ e, now, onClick }: { e: ServerEventDTO; now: number; onClick: () => void }) {
  const me = useAuthStore((s) => s.user?.id);
  const place = usePlace()(e);
  const { going } = splitAttendees(e);
  const mine = e.rsvps.find((r) => r.userId === me)?.status;
  const running = isRunning(e, now);
  const d = new Date(e.startsAt);
  return (
    <button className={`ev-card ${running ? "live" : ""} ${isEnded(e, now) ? "ended" : ""}`} onClick={onClick}>
      <div className="ev-card-cover" style={e.imageUrl ? { backgroundImage: `url("${e.imageUrl}")` } : undefined}>
        <div className="ev-date">
          <span className="ev-date-m">{d.toLocaleDateString("bg-BG", { month: "short" })}</span>
          <span className="ev-date-d">{d.getDate()}</span>
        </div>
        {running && <span className="ev-live-tag">● ТЕЧЕ</span>}
      </div>
      <div className="ev-card-body">
        <div className="ev-card-title">{e.title}</div>
        <div className="ev-card-meta">
          {fmtDay(e.startsAt)} · {fmtRange(e)} {RECURRENCE_LABEL[e.recurrence] && <span>· {RECURRENCE_LABEL[e.recurrence]}</span>}
        </div>
        {place && <div className="ev-card-meta">{place}</div>}
        <div className="ev-card-foot">
          <span className="ev-count">
            ✅ {going.length}
            {e.maxAttendees != null ? `/${e.maxAttendees}` : ""}
          </span>
          <span className="ev-countdown">{countdown(e, now)}</span>
          {mine && <span className={`ev-mine ${mine}`}>{mine === "going" ? "Ще дойдеш" : mine === "maybe" ? "Може би" : "Няма да дойдеш"}</span>}
        </div>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------- detail

function EventDetail({
  id,
  onBack,
  onEdit,
  onJoinVoice,
}: {
  id: string;
  onBack: () => void;
  onEdit: (e: ServerEventDTO) => void;
  onJoinVoice: (serverId: string, voiceChannelId: string) => void;
}) {
  const fromStore = useEventsStore((s) => s.events.find((e) => e.id === id));
  const [archived, setArchived] = useState<ServerEventDTO | null>(null);
  const upsert = useEventsStore((s) => s.upsert);
  const remove = useEventsStore((s) => s.remove);
  const closeBoard = useEventsStore((s) => s.closeBoard);
  const me = useAuthStore((s) => s.user?.id);
  const servers = useServerStore((s) => s.servers);
  const membersServer = useMembersStore((s) => s.serverId);
  const myPerms = useMembersStore((s) => s.myPermissions);
  const placeOf = usePlace();
  const now = useNow(15_000);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const e = fromStore ?? archived;

  // An archived event isn't in the store — look it up once.
  useEffect(() => {
    if (fromStore || archived) return;
    const serverId = useServerStore.getState().activeServerId;
    if (serverId) fetchEventArchive(serverId).then((list) => setArchived(list.find((x) => x.id === id) ?? null)).catch(() => {});
  }, [fromStore, archived, id]);

  if (!e) {
    return (
      <div className="ev-detail">
        <button className="ev-back" onClick={onBack}>
          ← Всички събития
        </button>
        <div className="ev-empty-big">Събитието не е намерено (може да е изтрито).</div>
      </div>
    );
  }

  const owner = servers.find((s) => s.id === e.serverId)?.ownerId;
  const canEdit = e.creatorId === me || owner === me || (membersServer === e.serverId && hasPerm(myPerms, Perm.MANAGE_EVENTS));
  const { going, reserves, maybe } = splitAttendees(e);
  const no = e.rsvps.filter((r) => r.status === "no");
  const mine = e.rsvps.find((r) => r.userId === me)?.status ?? null;
  const place = placeOf(e);
  const ended = isEnded(e, now);
  const running = isRunning(e, now);
  const myReserve = reserves.some((r) => r.userId === me);

  async function answer(status: EventRsvpStatus) {
    if (!e) return;
    setBusy(true);
    setError(null);
    try {
      upsert(await setRsvp(e.id, mine === status ? null : status));
    } catch {
      setError("Не успях да запиша отговора.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!e || !window.confirm(`Да изтрия ли „${e.title}“?`)) return;
    try {
      await deleteEvent(e.id);
      remove(e.id);
      onBack();
    } catch {
      setError("Не успях да го изтрия.");
    }
  }

  return (
    <div className="ev-detail">
      <button className="ev-back" onClick={onBack}>
        ← Всички събития
      </button>
      {e.imageUrl && <img className="ev-detail-cover" src={e.imageUrl} alt="" />}
      <div className="ev-detail-head">
        <div>
          <h2 className="ev-detail-title">{e.title}</h2>
          <div className="ev-detail-by">създадено от {e.creatorUsername}</div>
        </div>
        <span className={`ev-countdown big ${running ? "live" : ""}`}>{countdown(e, now)}</span>
      </div>

      <div className="ev-facts">
        <div>
          🗓️ {fmtDay(e.startsAt)}, {fmtRange(e)} {RECURRENCE_LABEL[e.recurrence] && <span className="ev-muted">{RECURRENCE_LABEL[e.recurrence]}</span>}
        </div>
        {place && (
          <div className="ev-place">
            {place}
            {e.voiceChannelId && !ended && (
              <button
                className="ev-btn small primary"
                onClick={() => {
                  onJoinVoice(e.serverId, e.voiceChannelId!);
                  closeBoard();
                }}
              >
                Влез
              </button>
            )}
          </div>
        )}
        {e.maxAttendees != null && <div>👥 Места: {e.maxAttendees}</div>}
      </div>

      {e.description && <div className="ev-desc">{linkifyText(e.description)}</div>}

      {!ended && (
        <div className="ev-rsvp">
          <button className={`going ${mine === "going" ? "on" : ""}`} disabled={busy} onClick={() => void answer("going")}>
            ✅ Ще дойда
          </button>
          <button className={`maybe ${mine === "maybe" ? "on" : ""}`} disabled={busy} onClick={() => void answer("maybe")}>
            🤔 Може би
          </button>
          <button className={`no ${mine === "no" ? "on" : ""}`} disabled={busy} onClick={() => void answer("no")}>
            ❌ Не
          </button>
        </div>
      )}
      {myReserve && <div className="ev-note">Местата са заети — ти си в резервите и влизаш, ако някой се откаже.</div>}
      {error && <div className="ev-error">{error}</div>}

      <div className="ev-people">
        <PeopleRow label={`Ще дойдат${e.maxAttendees != null ? ` (${going.length}/${e.maxAttendees})` : ` (${going.length})`}`} people={going} />
        {reserves.length > 0 && <PeopleRow label={`Резерви (${reserves.length})`} people={reserves} />}
        {maybe.length > 0 && <PeopleRow label={`Може би (${maybe.length})`} people={maybe} />}
        {no.length > 0 && <PeopleRow label={`Няма да дойдат (${no.length})`} people={no} />}
      </div>

      <div className="ev-actions">
        <button className="ev-btn" onClick={() => downloadIcs(e, place.replace(/^\S+\s/, ""))}>
          📥 Добави в календар (.ics)
        </button>
        <a className="ev-btn" href={googleCalendarUrl(e, place.replace(/^\S+\s/, ""))} target="_blank" rel="noreferrer">
          Google Calendar
        </a>
        <span className="ev-spacer" />
        {canEdit && (
          <>
            <button className="ev-btn" onClick={() => onEdit(e)}>
              ✎ Редактирай
            </button>
            <button className="ev-btn danger" onClick={() => void handleDelete()}>
              🗑 Изтрий
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function PeopleRow({ label, people }: { label: string; people: EventRsvpDTO[] }) {
  return (
    <div className="ev-people-row">
      <div className="ev-people-label">{label}</div>
      <div className="ev-people-list">
        {people.length === 0 && <span className="ev-muted">още никой</span>}
        {people.map((r) => (
          <span key={r.userId} className="ev-person">
            <Avatar r={r} />
            {r.username}
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- form

function EventForm({ serverId, editing, onDone }: { serverId: string; editing: ServerEventDTO | null; onDone: (id: string | null) => void }) {
  const voiceChannels = useServerStore((s) => s.voiceChannels);
  const upsert = useEventsStore((s) => s.upsert);
  const initialStart = editing ? new Date(editing.startsAt) : nextRoundHour();
  const [title, setTitle] = useState(editing?.title ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [date, setDate] = useState(toDateInput(initialStart));
  const [time, setTime] = useState(toTimeInput(initialStart));
  const [endTime, setEndTime] = useState(editing?.endsAt ? toTimeInput(new Date(editing.endsAt)) : "");
  const [imageUrl, setImageUrl] = useState<string | null>(editing?.imageUrl ?? null);
  const [voiceChannelId, setVoiceChannelId] = useState(editing?.voiceChannelId ?? "");
  const [location, setLocation] = useState(editing?.location ?? "");
  const [maxAttendees, setMaxAttendees] = useState(editing?.maxAttendees != null ? String(editing.maxAttendees) : "");
  const [recurrence, setRecurrence] = useState<EventRecurrence>(editing?.recurrence ?? "none");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function pickImage(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return setError("Може само снимка или GIF.");
    if (file.size > 10 * 1024 * 1024) return setError("Картинката е над 10 MB.");
    if (!isCloudinaryConfigured()) return setError("Качването на картинки не е настроено.");
    setUploading(true);
    setError(null);
    try {
      setImageUrl(await uploadImageToCloudinary(file));
    } catch {
      setError("Качването не успя — опитай пак.");
    } finally {
      setUploading(false);
    }
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    const start = new Date(`${date}T${time}`);
    if (Number.isNaN(start.getTime())) return setError("Избери дата и час.");
    let end: Date | null = null;
    if (endTime) {
      end = new Date(`${date}T${endTime}`);
      // An end earlier than the start means "after midnight".
      if (end <= start) end = new Date(end.getTime() + 24 * 3600_000);
    }
    const body: EventInput = {
      title: title.trim(),
      description: description.trim(),
      startsAt: start.toISOString(),
      endsAt: end ? end.toISOString() : null,
      imageUrl,
      voiceChannelId: voiceChannelId || null,
      location: voiceChannelId ? null : location.trim() || null,
      maxAttendees: maxAttendees ? Number(maxAttendees) : null,
      recurrence,
    };
    setSaving(true);
    setError(null);
    try {
      const saved = editing ? await updateEvent(editing.id, body) : await createEvent(serverId, body);
      upsert(saved);
      onDone(saved.id);
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      setError(msg ?? "Не успях да запазя събитието.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className={`ev-form ${dragOver ? "drag-over" : ""}`}
      onSubmit={(e) => void submit(e)}
      onDragOver={(e) => {
        if (!Array.from(e.dataTransfer.types).includes("Files")) return;
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        void pickImage(Array.from(e.dataTransfer.files).find((f) => f.type.startsWith("image/")));
      }}
      onPaste={(e) => {
        const file = Array.from(e.clipboardData.files).find((f) => f.type.startsWith("image/"));
        if (file) {
          e.preventDefault();
          void pickImage(file);
        }
      }}
    >
      <button type="button" className="ev-back" onClick={() => onDone(editing?.id ?? null)}>
        ← Назад
      </button>
      <h2>{editing ? "Редактирай събитието" : "Ново събитие"}</h2>

      <div
        className={`ev-cover-pick ${imageUrl ? "has" : ""}`}
        style={imageUrl ? { backgroundImage: `url("${imageUrl}")` } : undefined}
        onClick={() => fileRef.current?.click()}
      >
        {uploading ? "Качване…" : imageUrl ? "" : "🖼️ Картинка — цъкни, провлачи или постави (Ctrl+V)"}
        {imageUrl && !uploading && (
          <button
            type="button"
            className="ev-cover-remove"
            onClick={(e) => {
              e.stopPropagation();
              setImageUrl(null);
            }}
          >
            ✕ Махни
          </button>
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => void pickImage(e.target.files?.[0])} />

      <label className="ev-field">
        <span>Име *</span>
        <input className="ev-input" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="напр. PoE2 рейд" autoFocus />
      </label>

      <div className="ev-grid">
        <label className="ev-field">
          <span>Дата *</span>
          <input className="ev-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
        <label className="ev-field">
          <span>Начало *</span>
          <input className="ev-input" type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
        </label>
        <label className="ev-field">
          <span>Край (по желание)</span>
          <input className="ev-input" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
        </label>
      </div>

      <div className="ev-grid">
        <label className="ev-field">
          <span>Място</span>
          <select className="ev-input" value={voiceChannelId} onChange={(e) => setVoiceChannelId(e.target.value)}>
            <option value="">— друго (напиши) —</option>
            {voiceChannels.map((v) => (
              <option key={v.id} value={v.id}>
                🔊 {v.name}
              </option>
            ))}
          </select>
        </label>
        {!voiceChannelId && (
          <label className="ev-field">
            <span>Къде</span>
            <input className="ev-input" value={location} maxLength={100} onChange={(e) => setLocation(e.target.value)} placeholder="напр. в Steam / при Иван" />
          </label>
        )}
      </div>

      <div className="ev-grid">
        <label className="ev-field">
          <span>Лимит на хората</span>
          <input
            className="ev-input"
            type="number"
            min={1}
            max={500}
            value={maxAttendees}
            onChange={(e) => setMaxAttendees(e.target.value)}
            placeholder="без лимит"
          />
        </label>
        <label className="ev-field">
          <span>Повтаря се</span>
          <select className="ev-input" value={recurrence} onChange={(e) => setRecurrence(e.target.value as EventRecurrence)}>
            <option value="none">Не</option>
            <option value="daily">Всеки ден</option>
            <option value="weekly">Всяка седмица</option>
          </select>
        </label>
      </div>

      <label className="ev-field">
        <span>Описание</span>
        <textarea
          className="ev-input"
          rows={4}
          value={description}
          maxLength={2000}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Какво ще правим, какво да подготвят хората…"
        />
      </label>

      {error && <div className="ev-error">{error}</div>}
      <div className="ev-actions">
        <span className="ev-spacer" />
        <button type="button" className="ev-btn" onClick={() => onDone(editing?.id ?? null)}>
          Откажи
        </button>
        <button type="submit" className="ev-btn primary" disabled={saving || uploading || !title.trim()}>
          {saving ? "Запазване…" : editing ? "Запази" : "Създай"}
        </button>
      </div>
    </form>
  );
}

function nextRoundHour() {
  const d = new Date(Date.now() + 60 * 60_000);
  d.setMinutes(0, 0, 0);
  return d;
}
