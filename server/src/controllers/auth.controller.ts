import bcrypt from "bcryptjs";
import type { Request, Response } from "express";
import { prisma } from "../db.js";
import { signToken } from "../utils/jwt.js";

function toUserDTO(user: { id: string; username: string; email: string; avatarUrl: string | null }) {
  return { id: user.id, username: user.username, email: user.email, avatarUrl: user.avatarUrl };
}

export async function register(req: Request, res: Response) {
  const { username, password } = req.body ?? {};
  const email: string | undefined = req.body?.email?.trim().toLowerCase();
  if (!username || !email || !password) {
    return res.status(400).json({ error: "username, email and password are required" });
  }

  const existing = await prisma.user.findFirst({ where: { OR: [{ email }, { username }] } });
  if (existing) {
    return res.status(409).json({ error: "User with this email or username already exists" });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({ data: { username, email, passwordHash } });
  const token = signToken({ userId: user.id });

  res.status(201).json({ user: toUserDTO(user), token });
}

export async function login(req: Request, res: Response) {
  const { password } = req.body ?? {};
  const email: string | undefined = req.body?.email?.trim().toLowerCase();
  if (!email || !password) {
    return res.status(400).json({ error: "email and password are required" });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const token = signToken({ userId: user.id });
  res.json({ user: toUserDTO(user), token });
}

export async function me(req: Request, res: Response) {
  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }
  res.json({ user: toUserDTO(user) });
}
