import type { Request, Response } from "express";
import {
  EVENT_ARCHIVE_AFTER_MS,
  EVENT_DEFAULT_LENGTH_MS,
  Perm,
  SocketEvents,
  hasPerm,
  type EventCreatedPayload,
  type EventRecurrence,
  type EventRsvpStatus,
  type ServerEventDTO,
} from "@discord-clone/shared";
import type { Server as IOServer } from "socket.io";
import { prisma } from "../db.js";
import { can, memberContext } from "../permissions.js";

const MAX_UPCOMING_PER_SERVER = 50;
const RECURRENCES: EventRecurrence[] = ["none", "daily", "weekly"];
const STATUSES: EventRsvpStatus[] = ["going", "maybe", "no"];

const eventInclude = {
  rsvps: { include: { user: { select: { username: true, avatarUrl: true } } } },
} as const;

type EventRow = NonNullable<Awaited<ReturnType<typeof loadEvent>>>;

function loadEvent(id: string) {
  return prisma.serverEvent.findUnique({ where: { id }, include: eventInclude });
}

async function toDtos(rows: EventRow[]): Promise<ServerEventDTO[]> {
  const creatorIds = [...new Set(rows.map((r) => r.creatorId))];
  const creators = await prisma.user.findMany({ where: { id: { in: creatorIds } }, select: { id: true, username: true } });
  const names = new Map(creators.map((c) => [c.id, c.username]));
  return rows.map((e) => ({
    id: e.id,
    serverId: e.serverId,
    title: e.title,
    description: e.description,
    startsAt: e.startsAt.toISOString(),
    endsAt: e.endsAt?.toISOString() ?? null,
    imageUrl: e.imageUrl,
    voiceChannelId: e.voiceChannelId,
    location: e.location,
    maxAttendees: e.maxAttendees,
    recurrence: (RECURRENCES.includes(e.recurrence as EventRecurrence) ? e.recurrence : "none") as EventRecurrence,
    creatorId: e.creatorId,
    creatorUsername: names.get(e.creatorId) ?? "?",
    createdAt: e.createdAt.toISOString(),
    rsvps: e.rsvps.map((r) => ({
      userId: r.userId,
      username: r.user.username,
      avatarUrl: r.user.avatarUrl,
      status: r.status as EventRsvpStatus,
      at: r.updatedAt.toISOString(),
    })),
  }));
}

/** Events reach people through their personal rooms, so it works whichever server they have open. */
export async function emitToMembers(io: IOServer | undefined, serverId: string, event: string, payload: unknown) {
  if (!io) return;
  const members = await prisma.membership.findMany({ where: { serverId }, select: { userId: true } });
  if (members.length) io.to(members.map((m) => `user:${m.userId}`)).emit(event, payload);
}

function notifyChanged(req: Request, serverId: string) {
  void emitToMembers(req.app.get("io"), serverId, SocketEvents.EventsChanged, { serverId }).catch(console.error);
}

function membership(userId: string, serverId: string) {
  return prisma.membership.findUnique({ where: { userId_serverId: { userId, serverId } } });
}

/** Rows whose (end or start+2h) is after `cutoff`. */
function endsAfter(cutoff: Date) {
  return {
    OR: [
      { endsAt: { gt: cutoff } },
      { endsAt: null, startsAt: { gt: new Date(cutoff.getTime() - EVENT_DEFAULT_LENGTH_MS) } },
    ],
  };
}

type Parsed = {
  title: string;
  description: string;
  startsAt: Date;
  endsAt: Date | null;
  imageUrl: string | null;
  voiceChannelId: string | null;
  location: string | null;
  maxAttendees: number | null;
  recurrence: EventRecurrence;
};

async function parseInput(body: Record<string, unknown>, serverId: string): Promise<Parsed | string> {
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (title.length < 1 || title.length > 80) return "Името трябва да е 1–80 символа.";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  if (description.length > 2000) return "Описанието е твърде дълго (до 2000 символа).";

  const startsAt = new Date(String(body.startsAt ?? ""));
  if (Number.isNaN(startsAt.getTime())) return "Невалидна дата/час.";
  if (startsAt.getTime() > Date.now() + 366 * 24 * 3600_000) return "Събитието е твърде далеч напред (до година).";

  let endsAt: Date | null = null;
  if (body.endsAt) {
    endsAt = new Date(String(body.endsAt));
    if (Number.isNaN(endsAt.getTime())) return "Невалиден краен час.";
    if (endsAt <= startsAt) return "Краят трябва да е след началото.";
    if (endsAt.getTime() - startsAt.getTime() > 7 * 24 * 3600_000) return "Събитието може да е най-много 7 дни.";
  }

  let imageUrl: string | null = null;
  if (typeof body.imageUrl === "string" && body.imageUrl) {
    if (!/^https:\/\//.test(body.imageUrl) || body.imageUrl.length > 2000) return "Невалидна картинка.";
    imageUrl = body.imageUrl;
  }

  let voiceChannelId: string | null = null;
  if (typeof body.voiceChannelId === "string" && body.voiceChannelId) {
    const vc = await prisma.voiceChannel.findFirst({ where: { id: body.voiceChannelId, serverId } });
    if (!vc) return "Няма такъв гласов канал.";
    voiceChannelId = vc.id;
  }
  const location = typeof body.location === "string" && body.location.trim() ? body.location.trim().slice(0, 100) : null;

  let maxAttendees: number | null = null;
  if (body.maxAttendees != null && body.maxAttendees !== "") {
    const n = Math.round(Number(body.maxAttendees));
    if (!Number.isFinite(n) || n < 1 || n > 500) return "Лимитът трябва да е между 1 и 500.";
    maxAttendees = n;
  }
  const recurrence = RECURRENCES.includes(body.recurrence as EventRecurrence) ? (body.recurrence as EventRecurrence) : "none";

  return { title, description, startsAt, endsAt, imageUrl, voiceChannelId, location, maxAttendees, recurrence };
}

/** Upcoming + running + ended in the last 24 h, from every server you are in. */
export async function listEvents(req: Request, res: Response) {
  const memberships = await prisma.membership.findMany({ where: { userId: req.userId! }, select: { serverId: true } });
  const rows = await prisma.serverEvent.findMany({
    where: {
      serverId: { in: memberships.map((m) => m.serverId) },
      ...endsAfter(new Date(Date.now() - EVENT_ARCHIVE_AFTER_MS)),
    },
    include: eventInclude,
    orderBy: { startsAt: "asc" },
    take: 300,
  });
  res.json({ events: await toDtos(rows) });
}

/** Older events of one server, newest first. */
export async function listArchive(req: Request, res: Response) {
  const serverId = String(req.query.serverId ?? "");
  if (!(await membership(req.userId!, serverId))) return res.status(403).json({ error: "Not a member of this server" });
  const cutoff = new Date(Date.now() - EVENT_ARCHIVE_AFTER_MS);
  const rows = await prisma.serverEvent.findMany({
    where: {
      serverId,
      OR: [{ endsAt: { lte: cutoff } }, { endsAt: null, startsAt: { lte: new Date(cutoff.getTime() - EVENT_DEFAULT_LENGTH_MS) } }],
    },
    include: eventInclude,
    orderBy: { startsAt: "desc" },
    take: 30,
  });
  res.json({ events: await toDtos(rows) });
}

/** Anyone in the server can create an event; the creator is signed up as "going". */
export async function createEvent(req: Request, res: Response) {
  const serverId = String(req.body?.serverId ?? "");
  if (!(await can(req.userId!, serverId, Perm.CREATE_EVENTS))) return res.status(403).json({ error: "Нямаш право да създаваш събития." });
  const parsed = await parseInput(req.body ?? {}, serverId);
  if (typeof parsed === "string") return res.status(400).json({ error: parsed });
  if (parsed.startsAt.getTime() < Date.now() - 10 * 60_000) return res.status(400).json({ error: "Началото е в миналото." });

  const upcoming = await prisma.serverEvent.count({ where: { serverId, ...endsAfter(new Date()) } });
  if (upcoming >= MAX_UPCOMING_PER_SERVER) return res.status(409).json({ error: "Има твърде много предстоящи събития." });

  const created = await prisma.serverEvent.create({
    data: { ...parsed, serverId, creatorId: req.userId!, rsvps: { create: { userId: req.userId!, status: "going" } } },
  });
  const [dto] = await toDtos([(await loadEvent(created.id))!]);

  const io = req.app.get("io") as IOServer | undefined;
  notifyChanged(req, serverId);
  void emitToMembers(io, serverId, SocketEvents.EventCreated, {
    serverId,
    eventId: dto.id,
    title: dto.title,
    startsAt: dto.startsAt,
    creatorId: dto.creatorId,
    creatorUsername: dto.creatorUsername,
  } satisfies EventCreatedPayload).catch(console.error);
  res.status(201).json({ event: dto });
}

async function editable(req: Request) {
  const event = await prisma.serverEvent.findUnique({ where: { id: req.params.eventId } });
  if (!event) return null;
  const member = await memberContext(req.userId!, event.serverId);
  if (!member) return null;
  return { event, canEdit: event.creatorId === req.userId || hasPerm(member.permissions, Perm.MANAGE_EVENTS) };
}

/** The creator or the server owner. */
export async function updateEvent(req: Request, res: Response) {
  const found = await editable(req);
  if (!found) return res.status(404).json({ error: "Not found" });
  if (!found.canEdit) return res.status(403).json({ error: "Само създателят може да го променя." });
  const parsed = await parseInput(req.body ?? {}, found.event.serverId);
  if (typeof parsed === "string") return res.status(400).json({ error: parsed });

  const moved = parsed.startsAt.getTime() !== found.event.startsAt.getTime();
  await prisma.serverEvent.update({
    where: { id: found.event.id },
    // A new start time gets a new reminder.
    data: { ...parsed, ...(moved ? { reminderSentAt: null } : {}) },
  });
  const [dto] = await toDtos([(await loadEvent(found.event.id))!]);
  notifyChanged(req, found.event.serverId);
  res.json({ event: dto });
}

export async function deleteEvent(req: Request, res: Response) {
  const found = await editable(req);
  if (!found) return res.status(404).json({ error: "Not found" });
  if (!found.canEdit) return res.status(403).json({ error: "Само създателят може да го изтрие." });
  await prisma.serverEvent.delete({ where: { id: found.event.id } });
  notifyChanged(req, found.event.serverId);
  res.status(204).end();
}

/** body.status: "going" | "maybe" | "no", or null to take the answer back. */
export async function setRsvp(req: Request, res: Response) {
  const event = await prisma.serverEvent.findUnique({ where: { id: req.params.eventId } });
  if (!event || !(await membership(req.userId!, event.serverId))) return res.status(404).json({ error: "Not found" });
  const status = req.body?.status as EventRsvpStatus | null;
  const key = { eventId_userId: { eventId: event.id, userId: req.userId! } };

  if (status === null) {
    await prisma.eventRsvp.deleteMany({ where: { eventId: event.id, userId: req.userId! } });
  } else if (STATUSES.includes(status)) {
    const existing = await prisma.eventRsvp.findUnique({ where: key });
    if (!existing) {
      await prisma.eventRsvp.create({ data: { eventId: event.id, userId: req.userId!, status } });
    } else if (existing.status !== status) {
      // Switching to "going" puts you at the back of the line (reserves are first come, first served).
      await prisma.eventRsvp.update({ where: key, data: { status, updatedAt: new Date() } });
    }
  } else {
    return res.status(400).json({ error: "Невалиден отговор." });
  }
  const [dto] = await toDtos([(await loadEvent(event.id))!]);
  notifyChanged(req, event.serverId);
  res.json({ event: dto });
}
