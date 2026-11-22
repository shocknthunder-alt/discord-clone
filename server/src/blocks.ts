import { Router, type Request, type Response } from "express";
import { prisma } from "./db.js";
import { requireAuth } from "./middleware/auth.js";

/**
 * 🧱 Шметрис — a solo falling-blocks game in channels of type "blocks". The game runs in the
 * browser; the server only keeps each person's best per server and serves the top list.
 * Friends-only app, so the checks are just sanity bounds, not real anti-cheat.
 */
export const blocksRouter = Router();
blocksRouter.use(requireAuth);

async function blocksChannel(req: Request, res: Response) {
  const ch = await prisma.textChannel.findUnique({ where: { id: req.params.channelId } });
  if (!ch || ch.type !== "blocks") {
    res.status(404).json({ error: "Not a blocks channel" });
    return null;
  }
  const member = await prisma.membership.findUnique({ where: { userId_serverId: { userId: req.userId!, serverId: ch.serverId } } });
  if (!member) {
    res.status(403).json({ error: "Not a member of this server" });
    return null;
  }
  return ch;
}

async function top(serverId: string) {
  const rows = await prisma.blockScore.findMany({
    where: { serverId, best: { gt: 0 } },
    orderBy: [{ best: "desc" }, { updatedAt: "asc" }],
    take: 10,
    include: { user: { select: { username: true, avatarUrl: true } } },
  });
  return rows.map((r) => ({
    userId: r.userId,
    username: r.user.username,
    avatarUrl: r.user.avatarUrl,
    best: r.best,
    lines: r.bestLines,
    level: r.bestLevel,
    games: r.games,
  }));
}

blocksRouter.get("/text-channels/:channelId/blocks", async (req, res) => {
  const ch = await blocksChannel(req, res);
  if (!ch) return;
  const mine = await prisma.blockScore.findUnique({ where: { serverId_userId: { serverId: ch.serverId, userId: req.userId! } } });
  res.json({ top: await top(ch.serverId), mine: mine ? { best: mine.best, games: mine.games, totalLines: mine.totalLines } : null });
});

const int = (v: unknown, max: number) => (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= max ? v : null);

blocksRouter.post("/text-channels/:channelId/blocks/score", async (req, res) => {
  const ch = await blocksChannel(req, res);
  if (!ch) return;
  const score = int(req.body?.score, 50_000_000);
  const lines = int(req.body?.lines, 100_000);
  const level = int(req.body?.level, 1_000);
  const ms = int(req.body?.durationMs, 24 * 3600_000);
  if (score === null || lines === null || level === null || ms === null || level < 1) return res.status(400).json({ error: "Bad score" });
  // Rough plausibility: a 4-line clear is worth at most ~800×level×1.5 + combo, drops a few points a cell.
  const ceiling = (lines + 4) * 2_500 * (level + 1) + 200 * Math.ceil(ms / 1000) + 5_000;
  if (score > ceiling) return res.status(400).json({ error: "Implausible score" });

  const where = { serverId_userId: { serverId: ch.serverId, userId: req.userId! } };
  const prev = await prisma.blockScore.findUnique({ where });
  const record = !prev || score > prev.best;
  const saved = await prisma.blockScore.upsert({
    where,
    create: { serverId: ch.serverId, userId: req.userId!, best: score, bestLines: lines, bestLevel: level, games: 1, totalLines: lines },
    update: {
      games: { increment: 1 },
      totalLines: { increment: lines },
      ...(record ? { best: score, bestLines: lines, bestLevel: level } : {}),
    },
  });
  res.json({ record, mine: { best: saved.best, games: saved.games, totalLines: saved.totalLines }, top: await top(ch.serverId) });
});
