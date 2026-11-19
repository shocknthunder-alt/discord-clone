import type { NextFunction, Request, Response } from "express";
import { signToken, verifyToken } from "../utils/jwt.js";

declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

// Sliding session: a token older than this gets a fresh one in the X-Refreshed-Token header, so
// people who use the app keep their login instead of hitting the expiry (7 days) silently.
const RENEW_AFTER_S = 12 * 60 * 60;

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;

  if (!token) {
    return res.status(401).json({ error: "Missing token" });
  }

  try {
    const payload = verifyToken(token) as ReturnType<typeof verifyToken> & { iat?: number };
    req.userId = payload.userId;
    if (typeof payload.iat === "number" && Date.now() / 1000 - payload.iat > RENEW_AFTER_S) {
      res.setHeader("X-Refreshed-Token", signToken({ userId: payload.userId }));
    }
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}
