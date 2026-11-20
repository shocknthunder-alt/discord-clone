import bcrypt from "bcryptjs";
import type { Server as IOServer } from "socket.io";
import { activeStatus } from "../utils/customStatus.js";
import { notifyMembersChanged } from "./members.controller.js";
import type { Request, Response } from "express";
import { prisma } from "../db.js";
import { signToken } from "../utils/jwt.js";
import { mailConfigured, sendMail } from "../utils/mailer.js";
import { maskEmail, peekResetUserId, resetLink, signResetToken, verifyResetToken } from "../utils/passwordReset.js";

function toUserDTO(user: { id: string; username: string; email: string; avatarUrl: string | null; customStatus?: string | null; customStatusUntil?: Date | null }) {
  const status = activeStatus(user);
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    avatarUrl: user.avatarUrl,
    customStatus: status,
    customStatusUntil: status && user.customStatusUntil ? user.customStatusUntil.toISOString() : null,
  };
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

/** A user by e-mail or (case-insensitive) username — the login box accepts either. */
async function findByLogin(raw: unknown) {
  const login = typeof raw === "string" ? raw.trim() : "";
  if (!login) return null;
  if (login.includes("@")) return prisma.user.findUnique({ where: { email: login.toLowerCase() } });
  return prisma.user.findFirst({ where: { username: { equals: login, mode: "insensitive" } } });
}

export async function login(req: Request, res: Response) {
  const { password } = req.body ?? {};
  if (!req.body?.email || !password) {
    return res.status(400).json({ error: "email and password are required" });
  }

  const user = await findByLogin(req.body.email);
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

// Lives on the login screen, not the settings menu — proving identity via the current
// password stands in for being logged in, so this intentionally doesn't require a session.
export async function changePassword(req: Request, res: Response) {
  const { currentPassword, newPassword } = req.body ?? {};

  if (!req.body?.email || !currentPassword || !newPassword) {
    return res.status(400).json({ error: "email, currentPassword and newPassword are required" });
  }
  if (typeof newPassword !== "string" || newPassword.length < 6) {
    return res.status(400).json({ error: "newPassword must be at least 6 characters" });
  }

  // The form says "e-mail or username" (like the login form) — look it up the same way.
  const user = await findByLogin(req.body.email);
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: "Current password is incorrect" });
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

  res.json({ ok: true });
}

const PASSWORD_MIN = 6;

/** Settings → Акаунт: new password (logged in; the current password is still required). */
export async function changeMyPassword(req: Request, res: Response) {
  const { currentPassword, newPassword } = req.body ?? {};
  if (typeof newPassword !== "string" || newPassword.length < PASSWORD_MIN) {
    return res.status(400).json({ error: `Новата парола трябва да е поне ${PASSWORD_MIN} знака.` });
  }
  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) return res.status(404).json({ error: "User not found" });
  if (typeof currentPassword !== "string" || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
    return res.status(401).json({ error: "Сегашната парола е грешна." });
  }
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(newPassword, 10) } });
  res.json({ ok: true });
}

/** Settings → Акаунт: new e-mail (password required). */
export async function changeMyEmail(req: Request, res: Response) {
  const { password } = req.body ?? {};
  const email: string = typeof req.body?.newEmail === "string" ? req.body.newEmail.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "Невалиден имейл." });
  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) return res.status(404).json({ error: "User not found" });
  if (typeof password !== "string" || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: "Грешна парола." });
  }
  const taken = await prisma.user.findUnique({ where: { email } });
  if (taken && taken.id !== user.id) return res.status(409).json({ error: "Този имейл вече се ползва." });
  const updated = await prisma.user.update({ where: { id: user.id }, data: { email } });
  res.json({ user: toUserDTO(updated) });
}

/**
 * Login screen → "Забравена парола": e-mails a reset link (valid 1 hour) when e-mail is set up.
 * Answers the same whether or not the account exists; `mail: false` = e-mail isn't configured,
 * so the page tells them to ask the server owner for a link.
 */
export async function forgotPassword(req: Request, res: Response) {
  if (!mailConfigured()) return res.json({ ok: true, mail: false });
  const user = await findByLogin(req.body?.login);
  if (user) {
    const link = resetLink(signResetToken(user.id, user.passwordHash, "1h"));
    await sendMail(
      user.email,
      "Нова парола за ШмиркаТа",
      `<p>Здрасти, ${escapeHtml(user.username)}!</p>
<p>Някой (надяваме се ти) поиска нова парола за ШмиркаТа. Отвори линка, за да си избереш нова (важи 1 час):</p>
<p><a href="${link}">${link}</a></p>
<p>Ако не си бил ти — просто игнорирай това писмо, паролата ти не е сменена.</p>`,
    );
  }
  res.json({ ok: true, mail: true });
}

/** "Забравен имейл": which e-mail is this username registered with (partly hidden). */
export async function forgotEmail(req: Request, res: Response) {
  const username = typeof req.body?.username === "string" ? req.body.username.trim() : "";
  if (!username) return res.status(400).json({ error: "Въведи потребителско име." });
  const user = await prisma.user.findFirst({ where: { username: { equals: username, mode: "insensitive" } } });
  if (!user) return res.status(404).json({ error: "Няма такъв потребител." });
  res.json({ maskedEmail: maskEmail(user.email) });
}

/** The page behind a reset link: set a new password, and you're logged in. */
export async function resetPassword(req: Request, res: Response) {
  const { token, newPassword } = req.body ?? {};
  if (typeof token !== "string") return res.status(400).json({ error: "Липсва линкът." });
  if (typeof newPassword !== "string" || newPassword.length < PASSWORD_MIN) {
    return res.status(400).json({ error: `Новата парола трябва да е поне ${PASSWORD_MIN} знака.` });
  }
  const uid = peekResetUserId(token);
  const user = uid ? await prisma.user.findUnique({ where: { id: uid } }) : null;
  const ok = user && verifyResetToken(token, (id) => (id === user.id ? user.passwordHash : null)) === user.id;
  if (!user || !ok) {
    return res.status(400).json({ error: "Линкът е изтекъл или вече е използван. Поискай нов." });
  }
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(newPassword, 10) },
  });
  res.json({ user: toUserDTO(updated), token: signToken({ userId: updated.id }) });
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export async function updateMe(req: Request, res: Response) {
  const { username, avatarUrl, customStatus, customStatusHours } = req.body ?? {};

  // Custom status: text (≤ 80) or null/"" to clear; hours = when it disappears (0/absent = never).
  let statusData: { customStatus: string | null; customStatusUntil: Date | null } | null = null;
  if (customStatus !== undefined) {
    if (customStatus !== null && typeof customStatus !== "string") return res.status(400).json({ error: "customStatus must be a string or null" });
    const text = typeof customStatus === "string" ? customStatus.replace(/\s+/g, " ").trim().slice(0, 80) : "";
    const hours = Math.max(0, Math.min(Number(customStatusHours) || 0, 24 * 30));
    statusData = { customStatus: text || null, customStatusUntil: text && hours ? new Date(Date.now() + hours * 3600_000) : null };
  }

  if (username !== undefined) {
    if (typeof username !== "string" || !username.trim()) {
      return res.status(400).json({ error: "username must be a non-empty string" });
    }
    const existing = await prisma.user.findUnique({ where: { username: username.trim() } });
    if (existing && existing.id !== req.userId) {
      return res.status(409).json({ error: "Username already taken" });
    }
  }

  if (avatarUrl !== undefined && avatarUrl !== null && typeof avatarUrl !== "string") {
    return res.status(400).json({ error: "avatarUrl must be a string or null" });
  }

  const user = await prisma.user.update({
    where: { id: req.userId! },
    data: {
      ...(username !== undefined ? { username: username.trim() } : {}),
      ...(avatarUrl !== undefined ? { avatarUrl } : {}),
      ...(statusData ?? {}),
    },
  });

  // Others see name/avatar/status changes in the member lists right away.
  if (statusData || username !== undefined || avatarUrl !== undefined) {
    const io = req.app.get("io") as IOServer | undefined;
    const memberships = await prisma.membership.findMany({ where: { userId: user.id }, select: { serverId: true } });
    for (const m of memberships) notifyMembersChanged(io, m.serverId);
  }

  res.json({ user: toUserDTO(user) });
}
