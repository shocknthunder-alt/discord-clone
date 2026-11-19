import type { Request, Response } from "express";
import { Perm, SocketEvents } from "@discord-clone/shared";
import type { Server as IOServer } from "socket.io";
import { prisma } from "../db.js";
import { can } from "../permissions.js";

export async function listServers(req: Request, res: Response) {
  const memberships = await prisma.membership.findMany({
    where: { userId: req.userId! },
    include: { server: true },
  });
  res.json({ servers: memberships.map((m) => m.server) });
}

export async function createServer(req: Request, res: Response) {
  const { name } = req.body ?? {};
  if (!name) {
    return res.status(400).json({ error: "name is required" });
  }

  const server = await prisma.server.create({
    data: {
      name,
      ownerId: req.userId!,
      memberships: { create: { userId: req.userId!, role: "OWNER" } },
      textChannels: { create: { name: "general", position: 0 } },
      voiceChannels: { create: { name: "General", position: 0 } },
    },
    include: { textChannels: true, voiceChannels: true },
  });

  res.status(201).json({ server });
}

// Shown on the "Join a server" modal to a brand-new user who isn't a member of anything
// yet — so this can't be gated by membership. Points at the oldest server in the DB, which
// for this app is always the one real friend-group server; a hardcoded hint text in the
// client used to serve the same purpose but went stale the moment that server's invite
// code was ever regenerated.
export async function getFeaturedInvite(req: Request, res: Response) {
  const server = await prisma.server.findFirst({
    orderBy: { createdAt: "asc" },
    select: { name: true, inviteCode: true },
  });
  if (!server) {
    return res.status(404).json({ error: "No server to invite to yet" });
  }
  res.json(server);
}

export async function getServer(req: Request, res: Response) {
  const { serverId } = req.params;

  const membership = await prisma.membership.findUnique({
    where: { userId_serverId: { userId: req.userId!, serverId } },
  });
  if (!membership) {
    return res.status(403).json({ error: "Not a member of this server" });
  }

  const server = await prisma.server.findUnique({
    where: { id: serverId },
    include: { textChannels: true, voiceChannels: true },
  });
  if (!server) {
    return res.status(404).json({ error: "Server not found" });
  }

  res.json({ server });
}

export async function updateServer(req: Request, res: Response) {
  const { serverId } = req.params;
  const { name, iconUrl, bannerUrl, afkChannelId, afkTimeoutMin } = req.body ?? {};

  if (!(await can(req.userId!, serverId, Perm.MANAGE_SERVER))) {
    return res.status(403).json({ error: "Нямаш право да променяш сървъра." });
  }

  if (name !== undefined && (typeof name !== "string" || !name.trim())) {
    return res.status(400).json({ error: "name must be a non-empty string" });
  }
  if (iconUrl !== undefined && iconUrl !== null && typeof iconUrl !== "string") {
    return res.status(400).json({ error: "iconUrl must be a string or null" });
  }
  if (bannerUrl !== undefined && bannerUrl !== null && (typeof bannerUrl !== "string" || bannerUrl.length > 1000 || !/^https:\/\//.test(bannerUrl))) {
    return res.status(400).json({ error: "bannerUrl must be an https URL or null" });
  }
  if (afkChannelId !== undefined && afkChannelId !== null) {
    const vc = typeof afkChannelId === "string" ? await prisma.voiceChannel.findUnique({ where: { id: afkChannelId } }) : null;
    if (!vc || vc.serverId !== serverId) return res.status(400).json({ error: "afkChannelId must be a voice channel of this server" });
  }
  if (afkTimeoutMin !== undefined && (!Number.isInteger(afkTimeoutMin) || afkTimeoutMin < 1 || afkTimeoutMin > 240)) {
    return res.status(400).json({ error: "afkTimeoutMin must be 1-240 minutes" });
  }

  const server = await prisma.server.update({
    where: { id: serverId },
    data: {
      ...(name !== undefined ? { name: name.trim() } : {}),
      ...(iconUrl !== undefined ? { iconUrl } : {}),
      ...(bannerUrl !== undefined ? { bannerUrl } : {}),
      ...(afkChannelId !== undefined ? { afkChannelId } : {}),
      ...(afkTimeoutMin !== undefined ? { afkTimeoutMin } : {}),
    },
  });

  (req.app.get("io") as IOServer | undefined)?.to(`server:${serverId}`).emit(SocketEvents.ServerUpdated, { server });
  res.json({ server });
}

export async function joinServer(req: Request, res: Response) {
  const { inviteCode } = req.body ?? {};
  if (!inviteCode) {
    return res.status(400).json({ error: "inviteCode is required" });
  }

  const server = await prisma.server.findUnique({ where: { inviteCode } });
  if (!server) {
    return res.status(404).json({ error: "Invalid invite code" });
  }

  const membership = await prisma.membership.upsert({
    where: { userId_serverId: { userId: req.userId!, serverId: server.id } },
    update: {},
    create: { userId: req.userId!, serverId: server.id, role: "MEMBER" },
  });

  (req.app.get("io") as IOServer | undefined)?.to(`server:${server.id}`).emit(SocketEvents.MembersChanged, { serverId: server.id });
  res.status(201).json({ server, membership });
}

async function requireMember(userId: string, serverId: string) {
  return prisma.membership.findUnique({ where: { userId_serverId: { userId, serverId } } });
}

export async function listCustomEmojis(req: Request, res: Response) {
  const { serverId } = req.params;
  if (!(await requireMember(req.userId!, serverId))) {
    return res.status(403).json({ error: "Not a member of this server" });
  }
  const emojis = await prisma.customEmoji.findMany({
    where: { serverId },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, imageUrl: true },
  });
  res.json({ emojis });
}

export async function createCustomEmoji(req: Request, res: Response) {
  const { serverId } = req.params;
  const { name, imageUrl } = req.body ?? {};
  if (!(await can(req.userId!, serverId, Perm.ADD_EMOJIS))) {
    return res.status(403).json({ error: "Нямаш право да добавяш емоджита." });
  }
  if (typeof name !== "string" || !/^[a-z0-9_]{2,32}$/.test(name)) {
    return res.status(400).json({ error: "Name must be 2-32 characters: lowercase letters, numbers, underscores" });
  }
  if (typeof imageUrl !== "string" || !/^https:\/\//.test(imageUrl) || imageUrl.length > 2000) {
    return res.status(400).json({ error: "A valid image is required" });
  }
  const taken = await prisma.customEmoji.findUnique({ where: { serverId_name: { serverId, name } } });
  if (taken) return res.status(409).json({ error: "An emoji with that name already exists" });

  const emoji = await prisma.customEmoji.create({
    data: { serverId, name, imageUrl },
    select: { id: true, name: true, imageUrl: true },
  });
  res.status(201).json({ emoji });
}

// ── Stickers ──
const stickerSelect = { id: true, name: true, imageUrl: true, uploaderId: true } as const;

export async function listStickers(req: Request, res: Response) {
  const { serverId } = req.params;
  if (!(await requireMember(req.userId!, serverId))) return res.status(403).json({ error: "Not a member of this server" });
  const stickers = await prisma.sticker.findMany({ where: { serverId }, orderBy: { createdAt: "asc" }, select: stickerSelect });
  res.json({ stickers });
}

export async function createSticker(req: Request, res: Response) {
  const { serverId } = req.params;
  const { name, imageUrl } = req.body ?? {};
  if (!(await can(req.userId!, serverId, Perm.ADD_EMOJIS))) return res.status(403).json({ error: "Нямаш право да добавяш стикери." });
  const clean = typeof name === "string" ? name.replace(/\s+/g, " ").trim().slice(0, 32) : "";
  if (!clean) return res.status(400).json({ error: "Дай име на стикера." });
  if (typeof imageUrl !== "string" || !/^https:\/\//.test(imageUrl) || imageUrl.length > 2000) return res.status(400).json({ error: "A valid image is required" });
  if ((await prisma.sticker.count({ where: { serverId } })) >= 200) return res.status(400).json({ error: "Максимум 200 стикера на сървър." });
  const sticker = await prisma.sticker.create({ data: { serverId, name: clean, imageUrl, uploaderId: req.userId! }, select: stickerSelect });
  (req.app.get("io") as IOServer | undefined)?.to(`server:${serverId}`).emit(SocketEvents.StickersChanged, { serverId });
  res.status(201).json({ sticker });
}

export async function deleteSticker(req: Request, res: Response) {
  const { serverId, stickerId } = req.params;
  const sticker = await prisma.sticker.findUnique({ where: { id: stickerId } });
  if (!sticker || sticker.serverId !== serverId) return res.status(404).json({ error: "Not found" });
  if (sticker.uploaderId !== req.userId && !(await can(req.userId!, serverId, Perm.MANAGE_MESSAGES))) return res.status(403).json({ error: "Нямаш право." });
  await prisma.sticker.delete({ where: { id: stickerId } });
  (req.app.get("io") as IOServer | undefined)?.to(`server:${serverId}`).emit(SocketEvents.StickersChanged, { serverId });
  res.json({ ok: true });
}
