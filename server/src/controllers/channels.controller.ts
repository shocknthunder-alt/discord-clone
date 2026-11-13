import { Perm } from "@discord-clone/shared";
import type { Request, Response } from "express";
import { SocketEvents } from "@discord-clone/shared";
import { prisma } from "../db.js";
import { can } from "../permissions.js";
import { BOT_EMAIL as TRIVIA_BOT_EMAIL } from "../trivia/bot.js";

// Tells everyone viewing the server to refetch its channel list, so renames and new
// channels show up live instead of only after a refresh.
function notifyChannelsChanged(req: Request, serverId: string) {
  const io = req.app.get("io");
  io?.to(`server:${serverId}`).emit(SocketEvents.ChannelsChanged, { serverId });
}

async function requireMembership(userId: string, serverId: string) {
  return prisma.membership.findUnique({ where: { userId_serverId: { userId, serverId } } });
}

export async function listChannels(req: Request, res: Response) {
  const { serverId } = req.params;
  const membership = await requireMembership(req.userId!, serverId);
  if (!membership) {
    return res.status(403).json({ error: "Not a member of this server" });
  }

  const [textChannels, voiceChannels] = await Promise.all([
    prisma.textChannel.findMany({ where: { serverId }, orderBy: { position: "asc" } }),
    prisma.voiceChannel.findMany({ where: { serverId }, orderBy: { position: "asc" } }),
  ]);

  // Newest message per channel by a person (the trivia bot would keep its channel "unread" forever).
  const latest = await prisma.message.groupBy({
    by: ["textChannelId"],
    where: { textChannelId: { in: textChannels.map((c) => c.id) }, author: { email: { not: TRIVIA_BOT_EMAIL } } },
    _max: { createdAt: true },
  });
  const lastAt = new Map(latest.map((r) => [r.textChannelId, r._max.createdAt?.toISOString() ?? null]));

  res.json({
    textChannels: textChannels.map((c) => ({ ...c, lastMessageAt: lastAt.get(c.id) ?? null })),
    voiceChannels,
  });
}

export async function createTextChannel(req: Request, res: Response) {
  const { serverId } = req.params;
  const { name, type } = req.body ?? {};
  if (!name) {
    return res.status(400).json({ error: "name is required" });
  }

  const membership = await can(req.userId!, serverId, Perm.MANAGE_CHANNELS);
  if (!membership) {
    return res.status(403).json({ error: "Only the server owner can create channels" });
  }

  const last = await prisma.textChannel.aggregate({ where: { serverId }, _max: { position: true } });
  const textChannel = await prisma.textChannel.create({
    data: { name, serverId, position: (last._max.position ?? -1) + 1, type: type === "trivia" ? "trivia" : "text" },
  });
  notifyChannelsChanged(req, serverId);
  res.status(201).json({ textChannel });
}

export async function updateTextChannel(req: Request, res: Response) {
  const { channelId } = req.params;
  const { backgroundUrl, name } = req.body ?? {};

  if (backgroundUrl !== undefined && backgroundUrl !== null && typeof backgroundUrl !== "string") {
    return res.status(400).json({ error: "backgroundUrl must be a string or null" });
  }
  if (name !== undefined && (typeof name !== "string" || !name.trim())) {
    return res.status(400).json({ error: "name must be a non-empty string" });
  }

  const textChannel = await prisma.textChannel.findUnique({ where: { id: channelId } });
  if (!textChannel) {
    return res.status(404).json({ error: "Channel not found" });
  }

  const membership = await can(req.userId!, textChannel.serverId, Perm.MANAGE_CHANNELS);
  if (!membership) {
    return res.status(403).json({ error: "Only the server owner can update this channel" });
  }

  const updated = await prisma.textChannel.update({
    where: { id: channelId },
    data: {
      ...(backgroundUrl !== undefined ? { backgroundUrl } : {}),
      ...(name !== undefined ? { name: name.trim() } : {}),
    },
  });

  notifyChannelsChanged(req, textChannel.serverId);
  res.json({ textChannel: updated });
}

export async function createVoiceChannel(req: Request, res: Response) {
  const { serverId } = req.params;
  const { name } = req.body ?? {};
  if (!name) {
    return res.status(400).json({ error: "name is required" });
  }

  const membership = await can(req.userId!, serverId, Perm.MANAGE_CHANNELS);
  if (!membership) {
    return res.status(403).json({ error: "Only the server owner can create channels" });
  }

  const last = await prisma.voiceChannel.aggregate({ where: { serverId }, _max: { position: true } });
  const voiceChannel = await prisma.voiceChannel.create({
    data: { name, serverId, position: (last._max.position ?? -1) + 1 },
  });
  notifyChannelsChanged(req, serverId);
  res.status(201).json({ voiceChannel });
}

export async function updateVoiceChannel(req: Request, res: Response) {
  const { channelId } = req.params;
  const { name, backgroundUrl } = req.body ?? {};

  if (name !== undefined && (typeof name !== "string" || !name.trim())) {
    return res.status(400).json({ error: "name must be a non-empty string" });
  }
  if (backgroundUrl !== undefined && backgroundUrl !== null && typeof backgroundUrl !== "string") {
    return res.status(400).json({ error: "backgroundUrl must be a string or null" });
  }

  const voiceChannel = await prisma.voiceChannel.findUnique({ where: { id: channelId } });
  if (!voiceChannel) {
    return res.status(404).json({ error: "Channel not found" });
  }

  const membership = await can(req.userId!, voiceChannel.serverId, Perm.MANAGE_CHANNELS);
  if (!membership) {
    return res.status(403).json({ error: "Only the server owner can update this channel" });
  }

  const updated = await prisma.voiceChannel.update({
    where: { id: channelId },
    data: {
      ...(name !== undefined ? { name: name.trim() } : {}),
      ...(backgroundUrl !== undefined ? { backgroundUrl } : {}),
    },
  });

  notifyChannelsChanged(req, voiceChannel.serverId);
  res.json({ voiceChannel: updated });
}

export async function reorderChannels(req: Request, res: Response) {
  const { serverId } = req.params;
  const { kind, orderedIds } = req.body ?? {};

  if ((kind !== "text" && kind !== "voice") || !Array.isArray(orderedIds) || orderedIds.some((id) => typeof id !== "string")) {
    return res.status(400).json({ error: "kind ('text'|'voice') and orderedIds are required" });
  }

  const membership = await can(req.userId!, serverId, Perm.MANAGE_CHANNELS);
  if (!membership) {
    return res.status(403).json({ error: "Only the server owner can reorder channels" });
  }

  const existing =
    kind === "text"
      ? await prisma.textChannel.findMany({ where: { serverId }, select: { id: true } })
      : await prisma.voiceChannel.findMany({ where: { serverId }, select: { id: true } });
  const existingIds = new Set(existing.map((c) => c.id));
  if (orderedIds.length !== existingIds.size || orderedIds.some((id: string) => !existingIds.has(id))) {
    return res.status(400).json({ error: "orderedIds must list every channel of that kind exactly once" });
  }

  await prisma.$transaction(
    orderedIds.map((id: string, position: number) =>
      kind === "text"
        ? prisma.textChannel.update({ where: { id }, data: { position } })
        : prisma.voiceChannel.update({ where: { id }, data: { position } }),
    ),
  );

  notifyChannelsChanged(req, serverId);
  res.json({ ok: true });
}
