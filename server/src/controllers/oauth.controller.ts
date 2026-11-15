import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import type { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../db.js";
import { env } from "../env.js";
import { signToken } from "../utils/jwt.js";
import { oauthConfig, verifyIdToken, type OAuthProfile, type OAuthProvider } from "../utils/oauth.js";
import { maskEmail } from "../utils/passwordReset.js";

function toUserDTO(user: { id: string; username: string; email: string; avatarUrl: string | null }) {
  return { id: user.id, username: user.username, email: user.email, avatarUrl: user.avatarUrl };
}

// "Link this Microsoft account to your existing one": proves which sign-in it was for 10 minutes,
// signed with a key that can never pass as a session token.
const LINK_KEY = `${env.JWT_SECRET}:oauth-link`;
interface LinkPayload {
  provider: OAuthProvider;
  subject: string;
  email: string | null;
  userId: string;
}

/** GET /api/auth/oauth/config — which buttons to show (client IDs are public). */
export function oauthConfigHandler(_req: Request, res: Response) {
  res.json(oauthConfig());
}

async function uniqueUsername(profile: OAuthProfile): Promise<string> {
  const base =
    (profile.name ?? profile.email?.split("@")[0] ?? "user")
      .replace(/[^\p{L}\p{N}_. -]/gu, "")
      .trim()
      .slice(0, 24) || "user";
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? base : `${base.slice(0, 21)}${i + 1}`;
    const taken = await prisma.user.findFirst({ where: { username: { equals: candidate, mode: "insensitive" } } });
    if (!taken) return candidate;
  }
  return `${base.slice(0, 16)}${randomBytes(3).toString("hex")}`;
}

async function linkAndLogin(res: Response, userId: string, profile: { provider: OAuthProvider; subject: string; email: string | null }) {
  await prisma.oAuthIdentity.upsert({
    where: { provider_subject: { provider: profile.provider, subject: profile.subject } },
    update: { userId, email: profile.email },
    create: { provider: profile.provider, subject: profile.subject, email: profile.email, userId },
  });
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  res.json({ user: toUserDTO(user), token: signToken({ userId: user.id }) });
}

/** POST /api/auth/oauth { provider, idToken } — sign in (or up) with Google / Microsoft. */
export async function oauthLogin(req: Request, res: Response) {
  const provider = req.body?.provider;
  const idToken = req.body?.idToken;
  if ((provider !== "google" && provider !== "microsoft") || typeof idToken !== "string" || idToken.length > 8000) {
    return res.status(400).json({ error: "Невалидна заявка." });
  }
  let profile: OAuthProfile;
  try {
    profile = await verifyIdToken(provider, idToken);
  } catch (err) {
    console.warn("oauth token rejected", provider, err instanceof Error ? err.message : err);
    return res.status(401).json({ error: "Входът не беше потвърден. Опитай пак." });
  }

  // 1) Signed in this way before.
  const known = await prisma.oAuthIdentity.findUnique({
    where: { provider_subject: { provider: profile.provider, subject: profile.subject } },
  });
  if (known) return linkAndLogin(res, known.userId, profile);

  // 2) Same e-mail as an existing account.
  const existing = profile.email ? await prisma.user.findUnique({ where: { email: profile.email } }) : null;
  if (existing) {
    if (profile.emailVerified) return linkAndLogin(res, existing.id, profile);
    // Not vouched for (Microsoft): their password once, then never again.
    const linkToken = jwt.sign(
      { provider: profile.provider, subject: profile.subject, email: profile.email, userId: existing.id } satisfies LinkPayload,
      LINK_KEY,
      { expiresIn: "10m" },
    );
    return res.status(409).json({
      needsPassword: true,
      linkToken,
      username: existing.username,
      email: maskEmail(existing.email),
    });
  }

  // 3) New person: an account is made for them (no password — they sign in with the button; a
  // password can be set later through "Забравена парола").
  const username = await uniqueUsername(profile);
  const email = profile.email ?? `${profile.provider}-${profile.subject.replace(/[^a-z0-9]/gi, "").slice(0, 40)}@oauth.shmirka.local`;
  const passwordHash = await bcrypt.hash(randomBytes(24).toString("hex"), 10);
  const user = await prisma.user.create({
    data: {
      username,
      email,
      passwordHash,
      avatarUrl: profile.picture,
      oauthIdentities: { create: { provider: profile.provider, subject: profile.subject, email: profile.email } },
    },
  });
  res.status(201).json({ user: toUserDTO(user), token: signToken({ userId: user.id }), created: true });
}

/** POST /api/auth/oauth/link { linkToken, password } — connect a Microsoft sign-in to an existing account. */
export async function oauthLink(req: Request, res: Response) {
  const { linkToken, password } = req.body ?? {};
  if (typeof linkToken !== "string" || typeof password !== "string") return res.status(400).json({ error: "Невалидна заявка." });
  let payload: LinkPayload;
  try {
    payload = jwt.verify(linkToken, LINK_KEY) as LinkPayload;
  } catch {
    return res.status(401).json({ error: "Изтече времето — натисни бутона за вход пак." });
  }
  const user = await prisma.user.findUnique({ where: { id: payload.userId } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) return res.status(401).json({ error: "Грешна парола." });
  return linkAndLogin(res, user.id, payload);
}

// ── Desktop app: Google refuses sign-in inside an embedded browser, so the app opens the real
// browser at /desktop-login?code=…; once signed in there, that page hands the session over here and
// the app (polling with the same unguessable code) picks it up. Codes live 5 minutes, used once.
const handoffs = new Map<string, { userId: string; at: number }>();
const HANDOFF_TTL = 5 * 60_000;
const validCode = (c: unknown): c is string => typeof c === "string" && /^[A-Za-z0-9_-]{32,128}$/.test(c);

/** POST /api/auth/handoff { code } (signed in, in the browser). */
export function handoffPut(req: Request, res: Response) {
  const code = req.body?.code;
  if (!validCode(code)) return res.status(400).json({ error: "Невалиден код." });
  const now = Date.now();
  for (const [k, v] of handoffs) if (now - v.at > HANDOFF_TTL) handoffs.delete(k);
  handoffs.set(code, { userId: req.userId!, at: now });
  res.json({ ok: true });
}

/** GET /api/auth/handoff/:code (the desktop app, polling) → { user, token } once, else 404. */
export async function handoffTake(req: Request, res: Response) {
  const code = req.params.code;
  const entry = validCode(code) ? handoffs.get(code) : undefined;
  if (!entry || Date.now() - entry.at > HANDOFF_TTL) return res.status(404).json({ pending: true });
  handoffs.delete(code);
  const user = await prisma.user.findUnique({ where: { id: entry.userId } });
  if (!user) return res.status(404).json({ pending: true });
  res.json({ user: toUserDTO(user), token: signToken({ userId: user.id }) });
}
