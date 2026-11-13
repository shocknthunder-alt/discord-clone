import type { Request, Response } from "express";
import { Perm, SocketEvents, hasPerm, type SoundboardSoundDTO } from "@discord-clone/shared";
import { prisma } from "../db.js";
import { can, memberContext } from "../permissions.js";

export const SOUNDBOARD_MAX_MS = 10_000;
const MAX_SOUNDS_PER_SERVER = 100;

async function membership(userId: string, serverId: string) {
  return prisma.membership.findUnique({ where: { userId_serverId: { userId, serverId } } });
}

function toDto(s: {
  id: string;
  name: string;
  emoji: string;
  url: string;
  durationMs: number;
  volume: number;
  uploaderId: string;
}): SoundboardSoundDTO {
  return { id: s.id, name: s.name, emoji: s.emoji, url: s.url, durationMs: s.durationMs, volume: s.volume, uploaderId: s.uploaderId };
}

function notifyChanged(req: Request, serverId: string) {
  req.app.get("io")?.to(`server:${serverId}`).emit(SocketEvents.SoundboardChanged, { serverId });
}

export async function listSounds(req: Request, res: Response) {
  const { serverId } = req.params;
  if (!(await membership(req.userId!, serverId))) return res.status(403).json({ error: "Not a member of this server" });
  const sounds = await prisma.soundboardSound.findMany({ where: { serverId }, orderBy: { createdAt: "asc" } });
  res.json({ sounds: sounds.map(toDto) });
}

/** Anyone in the server can add a sound (the clip itself is uploaded to Cloudinary by the client). */
export async function createSound(req: Request, res: Response) {
  const { serverId } = req.params;
  if (!(await can(req.userId!, serverId, Perm.ADD_SOUNDS))) return res.status(403).json({ error: "Нямаш право да качваш звуци." });

  const { name, emoji, url, durationMs, volume } = req.body ?? {};
  const cleanName = typeof name === "string" ? name.trim() : "";
  if (cleanName.length < 1 || cleanName.length > 32) return res.status(400).json({ error: "Името трябва да е 1–32 символа." });
  const cleanEmoji = typeof emoji === "string" && emoji.trim() ? emoji.trim().slice(0, 16) : "🔊";
  if (typeof url !== "string" || !/^https:\/\/res\.cloudinary\.com\//.test(url) || url.length > 2000) {
    return res.status(400).json({ error: "Невалиден файл." });
  }
  const ms = Number(durationMs);
  if (!Number.isFinite(ms) || ms <= 0 || ms > SOUNDBOARD_MAX_MS + 500) {
    return res.status(400).json({ error: "Звукът трябва да е до 10 секунди." });
  }
  const vol = Math.round(Math.min(100, Math.max(5, Number.isFinite(Number(volume)) ? Number(volume) : 100)));

  const count = await prisma.soundboardSound.count({ where: { serverId } });
  if (count >= MAX_SOUNDS_PER_SERVER) return res.status(409).json({ error: "Сървърът вече има 100 звука — изтрий някой." });

  const sound = await prisma.soundboardSound.create({
    data: { serverId, name: cleanName, emoji: cleanEmoji, url, durationMs: Math.round(ms), volume: vol, uploaderId: req.userId! },
  });
  notifyChanged(req, serverId);
  res.status(201).json({ sound: toDto(sound) });
}

/** The uploader or the server owner can change a sound's volume / name / emoji. */
export async function updateSound(req: Request, res: Response) {
  const { serverId, soundId } = req.params;
  const member = await memberContext(req.userId!, serverId);
  const sound = await prisma.soundboardSound.findFirst({ where: { id: soundId, serverId } });
  if (!member || !sound) return res.status(404).json({ error: "Not found" });
  if (sound.uploaderId !== req.userId && !hasPerm(member.permissions, Perm.MANAGE_SOUNDBOARD)) return res.status(403).json({ error: "Само който го е качил." });

  const { name, emoji, volume } = req.body ?? {};
  const data: { name?: string; emoji?: string; volume?: number } = {};
  if (typeof name === "string" && name.trim().length >= 1 && name.trim().length <= 32) data.name = name.trim();
  if (typeof emoji === "string" && emoji.trim()) data.emoji = emoji.trim().slice(0, 16);
  if (Number.isFinite(Number(volume))) data.volume = Math.round(Math.min(100, Math.max(5, Number(volume))));
  const updated = await prisma.soundboardSound.update({ where: { id: sound.id }, data });
  notifyChanged(req, serverId);
  res.json({ sound: toDto(updated) });
}

/** The uploader or the server owner can delete a sound. */
export async function deleteSound(req: Request, res: Response) {
  const { serverId, soundId } = req.params;
  const member = await memberContext(req.userId!, serverId);
  const sound = await prisma.soundboardSound.findFirst({ where: { id: soundId, serverId } });
  if (!member || !sound) return res.status(404).json({ error: "Not found" });
  if (sound.uploaderId !== req.userId && !hasPerm(member.permissions, Perm.MANAGE_SOUNDBOARD)) return res.status(403).json({ error: "Само който го е качил." });
  await prisma.soundboardSound.delete({ where: { id: sound.id } });
  notifyChanged(req, serverId);
  res.status(204).end();
}
