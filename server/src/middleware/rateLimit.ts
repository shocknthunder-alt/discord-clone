import type { NextFunction, Request, Response } from "express";

/** Tiny in-memory per-IP limiter for the public account endpoints (password guessing, spam). */
export function rateLimit(max: number, windowMs: number) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (req: Request, res: Response, next: NextFunction) => {
    const forwarded = String(req.headers["x-forwarded-for"] ?? "").split(",")[0].trim();
    const ip = forwarded || req.socket.remoteAddress || "?";
    const now = Date.now();
    const entry = hits.get(ip);
    if (!entry || entry.resetAt < now) {
      hits.set(ip, { count: 1, resetAt: now + windowMs });
      if (hits.size > 5000) for (const [k, v] of hits) if (v.resetAt < now) hits.delete(k);
      return next();
    }
    entry.count += 1;
    if (entry.count > max) return res.status(429).json({ error: "Твърде много опити — пробвай пак след малко." });
    next();
  };
}
