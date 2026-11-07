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

export async function updateTextChannel(req: Request, res: Response) {
  const { channelId } = req.params;
  const { backgroundUrl } = req.body ?? {};

  if (backgroundUrl !== undefined && backgroundUrl !== null && typeof backgroundUrl !== "string") {
    return res.status(400).json({ error: "backgroundUrl must be a string or null" });
  }

  const textChannel = await prisma.textChannel.findUnique({ where: { id: channelId } });
  if (!textChannel) {
    return res.status(404).json({ error: "Channel not found" });
  }

  const membership = await requireMembership(req.userId!, textChannel.serverId);
  if (!membership || membership.role !== "OWNER") {
    return res.status(403).json({ error: "Only the server owner can update this channel" });
  }

  const updated = await prisma.textChannel.update({
    where: { id: channelId },
    data: { ...(backgroundUrl !== undefined ? { backgroundUrl } : {}) },
  });

  res.json({ textChannel: updated });
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
