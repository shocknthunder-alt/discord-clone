import type { Request, Response } from "express";
import { prisma } from "../db.js";

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

  res.json({ textChannels, voiceChannels });
}

export async function createTextChannel(req: Request, res: Response) {
  const { serverId } = req.params;
  const { name } = req.body ?? {};
  if (!name) {
    return res.status(400).json({ error: "name is required" });
  }

  const membership = await requireMembership(req.userId!, serverId);
  if (!membership || membership.role !== "OWNER") {
    return res.status(403).json({ error: "Only the server owner can create channels" });
  }

  const textChannel = await prisma.textChannel.create({ data: { name, serverId } });
  res.status(201).json({ textChannel });
}

export async function createVoiceChannel(req: Request, res: Response) {
  const { serverId } = req.params;
  const { name } = req.body ?? {};
  if (!name) {
    return res.status(400).json({ error: "name is required" });
  }

  const membership = await requireMembership(req.userId!, serverId);
  if (!membership || membership.role !== "OWNER") {
    return res.status(403).json({ error: "Only the server owner can create channels" });
  }

  const voiceChannel = await prisma.voiceChannel.create({ data: { name, serverId } });
  res.status(201).json({ voiceChannel });
}
