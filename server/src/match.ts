import { Router, type Request, type Response } from "express";
import { prisma } from "./db.js";
import { requireAuth } from "./middleware/auth.js";

/**
 * 🍬 Шмиксер — a solo match-3 game in channels of type "match". The game runs in the browser; the
 * server keeps each person's best per server and mode ("time" = 4 minutes, "moves" = 60 moves, since
 * 2026-11-26; before that 30) and serves the top lists. "duel" rows are written by matchDuel.ts
 * (best = wins, bestCombo = best duel score). Friends-only app: only a sanity ceiling, not real anti-cheat.
 */
export const matchRouter = Router();
matchRouter.use(requireAuth);

const MODES = ["time", "moves"] as const;
type Mode = (typeof MODES)[number] | "duel";
const LIST_MODES: Mode[] = [...MODES, "duel"];

async function matchChannel(req: Request, res: Response) {
  const ch = await prisma.textChannel.findUnique({ where: { id: req.params.channelId } });
  if (!ch || ch.type !== "match") {
    res.status(404).json({ error: "Not a match channel" });
    return null;
  }
  const member = await prisma.membership.findUnique({ where: { userId_serverId: { userId: req.userId!, serverId: ch.serverId } } });
  if (!member) {
    res.status(403).json({ error: "Not a member of this server" });
    return null;
  }
  return ch;
}

async function top(serverId: string, mode: Mode) {
  const rows = await prisma.matchScore.findMany({
    where: { serverId, mode, best: { gt: 0 } },
    orderBy: [{ best: "desc" }, { updatedAt: "asc" }],
    take: 10,
    include: { user: { select: { username: true, avatarUrl: true } } },
  });
  return rows.map((r) => ({
    userId: r.userId,
    username: r.user.username,
    avatarUrl: r.user.avatarUrl,
    best: r.best,
    combo: r.bestCombo,
    games: r.games,
  }));
}

async function lists(serverId: string, userId: string) {
  const mine = await prisma.matchScore.findMany({ where: { serverId, userId } });
  const out: Record<string, unknown> = {};
  for (const mode of LIST_MODES) {
    const m = mine.find((r) => r.mode === mode);
    out[mode] = { top: await top(serverId, mode), mine: m ? { best: m.best, games: m.games, combo: m.bestCombo } : null };
  }
  return out;
}

matchRouter.get("/text-channels/:channelId/match", async (req, res) => {
  const ch = await matchChannel(req, res);
  if (!ch) return;
  res.json(await lists(ch.serverId, req.userId!));
});

const int = (v: unknown, max: number) => (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= max ? v : null);

matchRouter.post("/text-channels/:channelId/match/score", async (req, res) => {
  const ch = await matchChannel(req, res);
  if (!ch) return;
  const mode = MODES.find((m) => m === req.body?.mode);
  const score = int(req.body?.score, 20_000_000);
  const combo = int(req.body?.combo, 500);
  const moves = int(req.body?.moves, 2_000);
  if (!mode || score === null || combo === null || moves === null) return res.status(400).json({ error: "Bad score" });
  // Very rough: a whole-board clear with a big combo × the fever (×3) + move bonuses, per move.
  if (score > (moves + 1) * 200_000) return res.status(400).json({ error: "Implausible score" });

  const where = { serverId_userId_mode: { serverId: ch.serverId, userId: req.userId!, mode } };
  const prev = await prisma.matchScore.findUnique({ where });
  const record = !prev || score > prev.best;
  await prisma.matchScore.upsert({
    where,
    create: { serverId: ch.serverId, userId: req.userId!, mode, best: score, bestCombo: combo, games: 1 },
    update: {
      games: { increment: 1 },
      ...(record ? { best: score } : {}),
      ...(!prev || combo > prev.bestCombo ? { bestCombo: combo } : {}),
    },
  });
  res.json({ record, ...(await lists(ch.serverId, req.userId!)) });
});
