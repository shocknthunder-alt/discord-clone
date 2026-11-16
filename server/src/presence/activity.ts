import { SocketEvents, type UserActivity } from "@discord-clone/shared";
import type { Server as IOServer } from "socket.io";
import { prisma } from "../db.js";

/**
 * "Какво играе": the desktop app detects the game, the client reports it, we keep it in memory
 * (gone on restart / when the person goes offline — like Discord, it's live-only).
 */
const activities = new Map<string, UserActivity>();

export function getActivity(userId: string): UserActivity | null {
  return activities.get(userId) ?? null;
}

async function broadcast(io: IOServer, userId: string, activity: UserActivity | null) {
  const memberships = await prisma.membership.findMany({ where: { userId }, select: { serverId: true } });
  if (!memberships.length) return;
  io.to(memberships.map((m) => `server:${m.serverId}`)).emit(SocketEvents.PresenceActivityUpdated, { userId, activity });
}

/** Sets (or clears with null) someone's activity; tells their servers only when it changed. */
export async function setActivity(io: IOServer, userId: string, name: string | null) {
  const clean = typeof name === "string" ? name.replace(/[\u0000-\u001f]/g, "").trim().slice(0, 64) : "";
  const prev = activities.get(userId);
  if (!clean) {
    if (!prev) return;
    activities.delete(userId);
    await broadcast(io, userId, null);
    return;
  }
  if (prev?.name === clean) return;
  const next = { name: clean, since: Date.now() };
  activities.set(userId, next);
  await broadcast(io, userId, next);
}
