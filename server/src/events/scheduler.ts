import { EVENT_DEFAULT_LENGTH_MS, SocketEvents, type ChannelActivityPayload } from "@discord-clone/shared";
import type { Server as IOServer } from "socket.io";
import { emitToMembers } from "../controllers/events.controller.js";
import { prisma } from "../db.js";

/**
 * Background job for the 📅 board, every 30 s:
 *  - 15 minutes before an event starts, the "Събития" bot posts a reminder in #general;
 *  - a repeating event that has ended moves on to its next date.
 * (If the server was asleep at the reminder time it still posts, as long as the event hasn't
 * been going for more than a couple of minutes.)
 */
const REMINDER_BEFORE_MS = 15 * 60_000;
const LATE_GRACE_MS = 2 * 60_000;
const TICK_MS = 30_000;
const TIME_ZONE = "Europe/Sofia";

const BOT_EMAIL = "events-bot@shmirka.local";
const BOT_NAME = "Събития";
let botUserId: string | null = null;

async function getBotUserId(): Promise<string> {
  if (botUserId) return botUserId;
  const bot = await prisma.user.upsert({
    where: { email: BOT_EMAIL },
    update: {},
    // Not a valid bcrypt hash, so nobody can log in as the bot.
    create: { email: BOT_EMAIL, username: BOT_NAME, passwordHash: "!bot-account-no-login" },
  });
  botUserId = bot.id;
  return bot.id;
}

/** #general (or a channel called like it); otherwise the first normal text channel. */
async function generalChannel(serverId: string) {
  const channels = await prisma.textChannel.findMany({ where: { serverId, type: "text" }, orderBy: { position: "asc" } });
  return (
    channels.find((c) => /^(general|генерал|общ|основен|chat|чат)$/i.test(c.name.trim())) ??
    channels.find((c) => /general|генерал/i.test(c.name)) ??
    channels[0] ??
    null
  );
}

async function post(io: IOServer, serverId: string, textChannelId: string, content: string) {
  const authorId = await getBotUserId();
  const message = await prisma.message.create({
    data: { content, textChannelId, authorId },
    include: { author: { select: { username: true, avatarUrl: true } } },
  });
  io.to(`channel:${textChannelId}`).emit(SocketEvents.MessageNew, {
    id: message.id,
    textChannelId,
    authorId,
    authorUsername: message.author.username,
    authorAvatarUrl: message.author.avatarUrl,
    content: message.content,
    imageUrl: null,
    createdAt: message.createdAt.toISOString(),
    editedAt: null,
    reactions: [],
    replyTo: null,
  });
  io.to(`server:${serverId}`).emit(SocketEvents.ChannelActivity, {
    serverId,
    textChannelId,
    authorId,
    createdAt: message.createdAt.toISOString(),
  } satisfies ChannelActivityPayload);
}

function minutesWord(n: number) {
  return n === 1 ? "1 минута" : `${n} минути`;
}

async function sendReminders(io: IOServer) {
  const now = Date.now();
  const due = await prisma.serverEvent.findMany({
    where: {
      reminderSentAt: null,
      startsAt: { lte: new Date(now + REMINDER_BEFORE_MS), gt: new Date(now - LATE_GRACE_MS) },
    },
    include: { rsvps: { where: { status: "going" }, orderBy: { updatedAt: "asc" }, include: { user: { select: { username: true } } } } },
  });

  for (const event of due) {
    // Claim it first, so a reminder is never posted twice (even with two server instances).
    const claimed = await prisma.serverEvent.updateMany({
      where: { id: event.id, reminderSentAt: null },
      data: { reminderSentAt: new Date() },
    });
    if (claimed.count === 0) continue;

    const channel = await generalChannel(event.serverId);
    if (!channel) continue;

    const left = Math.round((event.startsAt.getTime() - Date.now()) / 60_000);
    const when = left >= 1 ? `започва след ${minutesWord(Math.min(left, 15))}!` : "започва СЕГА!";
    const time = event.startsAt.toLocaleTimeString("bg-BG", { hour: "2-digit", minute: "2-digit", timeZone: TIME_ZONE });

    let place = "";
    if (event.voiceChannelId) {
      const vc = await prisma.voiceChannel.findUnique({ where: { id: event.voiceChannelId } });
      if (vc) place = `🔊 ${vc.name}`;
    } else if (event.location) {
      place = `📍 ${event.location}`;
    }
    const going = event.rsvps.map((r) => r.user.username);
    const shown = event.maxAttendees != null ? going.slice(0, event.maxAttendees) : going;

    const lines = [
      `⏰ Събитието „${event.title}“ ${when}`,
      [`🕘 ${time}`, place].filter(Boolean).join(" · "),
      shown.length ? `✅ Записани (${shown.length}${event.maxAttendees != null ? `/${event.maxAttendees}` : ""}): ${shown.join(", ")}` : "",
    ].filter(Boolean);
    await post(io, event.serverId, channel.id, lines.join("\n"));
  }
}

const STEP_MS: Record<string, number> = { daily: 24 * 3600_000, weekly: 7 * 24 * 3600_000 };

async function rollRecurring(io: IOServer) {
  const now = Date.now();
  const repeating = await prisma.serverEvent.findMany({ where: { recurrence: { in: ["daily", "weekly"] } } });
  for (const e of repeating) {
    const step = STEP_MS[e.recurrence];
    const length = e.endsAt ? e.endsAt.getTime() - e.startsAt.getTime() : EVENT_DEFAULT_LENGTH_MS;
    let start = e.startsAt.getTime();
    if (start + length > now) continue;
    while (start + length <= now) start += step;
    await prisma.serverEvent.update({
      where: { id: e.id },
      data: {
        startsAt: new Date(start),
        endsAt: e.endsAt ? new Date(start + length) : null,
        reminderSentAt: null,
      },
    });
    await emitToMembers(io, e.serverId, SocketEvents.EventsChanged, { serverId: e.serverId });
  }
}

export function startEventScheduler(io: IOServer) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await sendReminders(io);
      await rollRecurring(io);
    } catch (err) {
      console.error("event scheduler error", err);
    } finally {
      running = false;
    }
  };
  setTimeout(() => void tick(), 5_000);
  setInterval(() => void tick(), TICK_MS);
}
