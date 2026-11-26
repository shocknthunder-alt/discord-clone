import { Router, type Request, type Response } from "express";
import {
  SURV_HEROES,
  SURV_META,
  cleanSurvCurses,
  emptySurvStats,
  survGoldMul,
  survHeroesUnlockedBy,
  survMetaCost,
  type SurvHeroId,
  type SurvListsDTO,
  type SurvMetaKey,
  type SurvProfileDTO,
  type SurvStats,
  type SurvTopRow,
} from "@discord-clone/shared";
import { prisma } from "./db.js";
import { requireAuth } from "./middleware/auth.js";

/**
 * 🧟 Шмиркленд — survive the hordes, in channels of type "survivors". The game runs in the browser
 * (co-op: in the host's browser, see survivorsCoop.ts). Here: top lists (MatchScore modes "surv" /
 * "surv-coop", best = seconds survived, bestCombo = kills), and each person's SurvivorProfile — gold,
 * shop upgrades, heroes, stats. Friends-only app: sanity ceilings, not real anti-cheat.
 */
export const survivorsRouter = Router();
survivorsRouter.use(requireAuth);

async function survChannel(req: Request, res: Response) {
  const ch = await prisma.textChannel.findUnique({ where: { id: req.params.channelId } });
  if (!ch || ch.type !== "survivors") {
    res.status(404).json({ error: "Not a survivors channel" });
    return null;
  }
  const member = await prisma.membership.findUnique({ where: { userId_serverId: { userId: req.userId!, serverId: ch.serverId } } });
  if (!member) {
    res.status(403).json({ error: "Not a member of this server" });
    return null;
  }
  return ch;
}

const heroIds = new Set<string>(SURV_HEROES.map((h) => h.id));

function readProfile(row: { gold: number; upgrades: unknown; heroes: unknown; stats: unknown } | null): SurvProfileDTO {
  const stats: SurvStats = { ...emptySurvStats() };
  if (row?.stats && typeof row.stats === "object") {
    for (const k of Object.keys(stats) as (keyof SurvStats)[]) {
      const v = (row.stats as Record<string, unknown>)[k];
      if (typeof v === "number" && Number.isFinite(v)) stats[k] = v;
    }
  }
  const upgrades: SurvProfileDTO["upgrades"] = {};
  if (row?.upgrades && typeof row.upgrades === "object") {
    for (const m of SURV_META) {
      const v = (row.upgrades as Record<string, unknown>)[m.key];
      if (typeof v === "number" && v > 0) upgrades[m.key] = Math.min(m.max, Math.floor(v));
    }
  }
  const bought = Array.isArray(row?.heroes) ? (row!.heroes as unknown[]).filter((h): h is SurvHeroId => typeof h === "string" && heroIds.has(h)) : [];
  const heroes = [...new Set([...survHeroesUnlockedBy(stats), ...bought])];
  return { gold: row?.gold ?? 0, upgrades, heroes, stats };
}

async function profileOf(userId: string) {
  return readProfile(await prisma.survivorProfile.findUnique({ where: { userId } }));
}

async function top(serverId: string, mode: string): Promise<SurvTopRow[]> {
  const rows = await prisma.matchScore.findMany({
    where: { serverId, mode, best: { gt: 0 } },
    orderBy: [{ best: "desc" }, { bestCombo: "desc" }, { updatedAt: "asc" }],
    take: 10,
    include: { user: { select: { username: true, avatarUrl: true } } },
  });
  return rows.map((r) => ({ userId: r.userId, username: r.user.username, avatarUrl: r.user.avatarUrl, best: r.best, kills: r.bestCombo, games: r.games }));
}

async function lists(serverId: string, userId: string): Promise<SurvListsDTO> {
  const mine = await prisma.matchScore.findMany({ where: { serverId, userId, mode: { in: ["surv", "surv-coop"] } } });
  const m = (mode: string) => {
    const r = mine.find((x) => x.mode === mode);
    return r ? { best: r.best, kills: r.bestCombo, games: r.games } : null;
  };
  return {
    solo: { top: await top(serverId, "surv"), mine: m("surv") },
    coop: { top: await top(serverId, "surv-coop"), mine: m("surv-coop") },
    profile: await profileOf(userId),
  };
}

survivorsRouter.get("/text-channels/:channelId/survivors", async (req, res) => {
  const ch = await survChannel(req, res);
  if (!ch) return;
  res.json(await lists(ch.serverId, req.userId!));
});

const int = (v: unknown, max: number) => (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= max ? v : null);

survivorsRouter.post("/text-channels/:channelId/survivors/run", async (req, res) => {
  const ch = await survChannel(req, res);
  if (!ch) return;
  const b = req.body ?? {};
  const seconds = int(b.seconds, 6 * 3600);
  const kills = int(b.kills, 2_000_000);
  const level = int(b.level, 2000);
  const gold = int(b.gold, 1_000_000);
  const bosses = int(b.bosses, 500);
  const coop = b.coop === true;
  const hero = typeof b.hero === "string" && heroIds.has(b.hero) ? (b.hero as SurvHeroId) : null;
  const curses = cleanSurvCurses(b.curses);
  if (seconds === null || kills === null || level === null || gold === null || bosses === null || !hero) return res.status(400).json({ error: "Bad run" });
  // rough ceilings: hordes get big, but not this big
  const wave = int(b.wave, 5000) ?? 0;
  if (kills > seconds * 90 + 300 || gold > seconds * 8 + bosses * 150 + 100 || bosses > seconds / 60 + 2 || wave > seconds / 10 + 2) {
    return res.status(400).json({ error: "Implausible run" });
  }

  const userId = req.userId!;
  const before = await profileOf(userId);
  const goldEarned = Math.round((gold + Math.floor(seconds / 10)) * survGoldMul(curses, before.upgrades.greed ?? 0));
  const stats: SurvStats = {
    bestSeconds: Math.max(before.stats.bestSeconds, seconds),
    bestWave: Math.max(before.stats.bestWave, wave),
    bestLevel: Math.max(before.stats.bestLevel, level),
    kills: before.stats.kills + kills,
    bosses: before.stats.bosses + bosses,
    games: before.stats.games + 1,
    coopGames: before.stats.coopGames + (coop ? 1 : 0),
  };
  const boughtHeroes = before.heroes.filter((h) => SURV_HEROES.find((x) => x.id === h)?.unlock.kind === "gold");
  await prisma.survivorProfile.upsert({
    where: { userId },
    create: { userId, gold: goldEarned, upgrades: {}, heroes: [], stats: { ...stats } },
    update: { gold: { increment: goldEarned }, stats: { ...stats }, heroes: boughtHeroes },
  });
  const newHeroes = survHeroesUnlockedBy(stats).filter((h) => !before.heroes.includes(h));

  const mode = coop ? "surv-coop" : "surv";
  const where = { serverId_userId_mode: { serverId: ch.serverId, userId, mode } };
  const prev = await prisma.matchScore.findUnique({ where });
  const record = !prev || seconds > prev.best || (seconds === prev.best && kills > prev.bestCombo);
  await prisma.matchScore.upsert({
    where,
    create: { serverId: ch.serverId, userId, mode, best: seconds, bestCombo: kills, games: 1 },
    update: { games: { increment: 1 }, ...(record ? { best: seconds, bestCombo: kills } : {}) },
  });
  res.json({ record, goldEarned, newHeroes, ...(await lists(ch.serverId, userId)) });
});

/** Buy the next level of a shop upgrade. */
survivorsRouter.post("/text-channels/:channelId/survivors/buy", async (req, res) => {
  const ch = await survChannel(req, res);
  if (!ch) return;
  const info = SURV_META.find((m) => m.key === req.body?.key);
  if (!info) return res.status(400).json({ error: "Unknown upgrade" });
  const userId = req.userId!;
  const p = await profileOf(userId);
  const lvl = p.upgrades[info.key as SurvMetaKey] ?? 0;
  if (lvl >= info.max) return res.status(400).json({ error: "Maxed" });
  const cost = survMetaCost(info, lvl);
  if (p.gold < cost) return res.status(400).json({ error: "Not enough gold" });
  // only take the gold if it is still there (two tabs buying at once)
  const done = await prisma.survivorProfile.updateMany({ where: { userId, gold: { gte: cost } }, data: { gold: { decrement: cost }, upgrades: { ...p.upgrades, [info.key]: lvl + 1 } } });
  if (!done.count) return res.status(400).json({ error: "Not enough gold" });
  res.json(await lists(ch.serverId, userId));
});

/** Undo all shop upgrades and get the gold back. */
survivorsRouter.post("/text-channels/:channelId/survivors/refund", async (req, res) => {
  const ch = await survChannel(req, res);
  if (!ch) return;
  const userId = req.userId!;
  const p = await profileOf(userId);
  let back = 0;
  for (const m of SURV_META) for (let l = 0; l < (p.upgrades[m.key] ?? 0); l++) back += survMetaCost(m, l);
  if (back > 0) await prisma.survivorProfile.update({ where: { userId }, data: { gold: { increment: back }, upgrades: {} } });
  res.json(await lists(ch.serverId, userId));
});

/** Buy a hero that is sold for gold. */
survivorsRouter.post("/text-channels/:channelId/survivors/hero", async (req, res) => {
  const ch = await survChannel(req, res);
  if (!ch) return;
  const info = SURV_HEROES.find((h) => h.id === req.body?.hero);
  if (!info || info.unlock.kind !== "gold") return res.status(400).json({ error: "Not for sale" });
  const userId = req.userId!;
  const p = await profileOf(userId);
  if (p.heroes.includes(info.id)) return res.json(await lists(ch.serverId, userId));
  const cost = info.unlock.cost;
  const bought = p.heroes.filter((h) => SURV_HEROES.find((x) => x.id === h)?.unlock.kind === "gold");
  const done = await prisma.survivorProfile.updateMany({ where: { userId, gold: { gte: cost } }, data: { gold: { decrement: cost }, heroes: [...bought, info.id] } });
  if (!done.count) return res.status(400).json({ error: "Not enough gold" });
  res.json(await lists(ch.serverId, userId));
});
