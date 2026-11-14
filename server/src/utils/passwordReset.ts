import { createHash } from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "../env.js";

/**
 * Password-reset links. Signed with a key DERIVED from JWT_SECRET (not the session key itself),
 * so a reset token can never be used as a login token. It carries a fingerprint of the current
 * password hash: once the password changes the link stops working (single use), and an old link
 * can't be replayed.
 */
const RESET_SECRET = `${env.JWT_SECRET}:password-reset`;

function fingerprint(passwordHash: string) {
  return createHash("sha256").update(passwordHash).digest("hex").slice(0, 20);
}

export function signResetToken(userId: string, passwordHash: string, expiresIn: string): string {
  return jwt.sign({ uid: userId, ph: fingerprint(passwordHash), p: "pwreset" }, RESET_SECRET, {
    expiresIn,
  } as jwt.SignOptions);
}

/** userId if the token is valid and still matches the current password; otherwise null. */
export function verifyResetToken(token: string, currentHashOf: (userId: string) => string | null): string | null {
  try {
    const payload = jwt.verify(token, RESET_SECRET) as { uid?: string; ph?: string; p?: string };
    if (payload.p !== "pwreset" || typeof payload.uid !== "string") return null;
    const hash = currentHashOf(payload.uid);
    return hash && fingerprint(hash) === payload.ph ? payload.uid : null;
  } catch {
    return null;
  }
}

/** Reads the user id without checking anything (to look the user up before verifying). */
export function peekResetUserId(token: string): string | null {
  const decoded = jwt.decode(token) as { uid?: string } | null;
  return typeof decoded?.uid === "string" ? decoded.uid : null;
}

export function resetLink(token: string) {
  return `${env.CLIENT_ORIGIN.replace(/\/$/, "")}/reset-password?token=${encodeURIComponent(token)}`;
}

/** "shocknthunder@gmail.com" → "sh•••••••••er@gmail.com" */
export function maskEmail(email: string) {
  const [name, domain] = email.split("@");
  if (!domain) return "•••";
  const keep = name.length <= 3 ? 1 : 2;
  const tail = name.length > 5 ? name.slice(-2) : "";
  return `${name.slice(0, keep)}${"•".repeat(Math.max(3, name.length - keep - tail.length))}${tail}@${domain}`;
}
