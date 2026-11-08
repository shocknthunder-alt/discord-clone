import type { Request, Response } from "express";
import { prisma } from "../db.js";

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
  const { name, iconUrl } = req.body ?? {};

  const membership = await prisma.membership.findUnique({
    where: { userId_serverId: { userId: req.userId!, serverId } },
  });
  if (!membership || membership.role !== "OWNER") {
    return res.status(403).json({ error: "Only the server owner can update the server" });
  }

  if (name !== undefined && (typeof name !== "string" || !name.trim())) {
    return res.status(400).json({ error: "name must be a non-empty string" });
  }
  if (iconUrl !== undefined && iconUrl !== null && typeof iconUrl !== "string") {
    return res.status(400).json({ error: "iconUrl must be a string or null" });
  }

  const server = await prisma.server.update({
    where: { id: serverId },
    data: {
      ...(name !== undefined ? { name: name.trim() } : {}),
      ...(iconUrl !== undefined ? { iconUrl } : {}),
    },
  });

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

  res.status(201).json({ server, membership });
}
