import { Router, type Request, type Response } from "express";
import {
  SURV_ACHIEVEMENTS,
  SURV_HEROES,
  SURV_META,
  SURV_SKINS,
  SURV_MAPS,
  SURV_RUNES,
  cleanSurvRunes,
  isSurvMap,
  survRuneCost,
  survRuneSlots,
  type SurvMapId,
  type SurvRuneId,
  skinKey,
  type SurvAchId,
  type SurvSkinId,
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
  SURV_DIFF_MAX,
  SURV_GEAR_SLOTS,
  SURV_INV_MAX,
  cleanSurvItems,
  survDiffGold,
  survDiffOpen,
  survGearStats,
  survItemFits,
  survLootCap,
  survRollDrop,
  survLookKey,
  SURV_PETS,
  SURV_CRAFT,
  SURV_ITEM_KINDS,
  survRollCraft,
  survSalvageDust,
  type SurvItemKind,
  isSurvPet,
  type SurvPetId,
  survSalvageGold,
  type SurvGearSlot,
  type SurvGearStat,
  type SurvItem,
} from "@discord-clone/shared";
import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
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

const achIds = new Set<string>(SURV_ACHIEVEMENTS.map((a) => a.id));
const strList = (v: unknown, ok: (s: string) => boolean) => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && ok(x)))] : []);

function readProfile(row: { gold: number; upgrades: unknown; heroes: unknown; stats: unknown; extra?: unknown } | null): SurvProfileDTO {
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
  const ex = (row?.extra && typeof row.extra === "object" ? row.extra : {}) as Record<string, unknown>;
  const skins = strList(ex.skins, (k) => {
    const [h, sk] = k.split(":");
    return heroIds.has(h!) && SURV_SKINS.some((x) => x.id === sk && x.cost);
  });
  const achievements = strList(ex.achievements, (a) => achIds.has(a)) as SurvAchId[];
  const bossTypes = strList(ex.bossTypes, (b) => /^[a-z]{2,16}$/.test(b));
  const runes = cleanSurvRunes(ex.runes);
  const missions: Partial<Record<SurvMapId, number>> = {};
  if (ex.missions && typeof ex.missions === "object") {
    for (const m of SURV_MAPS) {
      const v = (ex.missions as Record<string, unknown>)[m.id];
      if (typeof v === "number" && v > 0) missions[m.id] = Math.floor(v);
    }
  }
  const slots = survRuneSlots(stats, missions);
  const equipped = (strList(ex.equipped, (r) => (runes[r as SurvRuneId] ?? 0) > 0) as SurvRuneId[]).slice(0, slots);
  // 🎒 items + what each hero wears (only items that exist and fit), ☠️ difficulties open
  const items = cleanSurvItems(ex.items);
  const gear: NonNullable<SurvProfileDTO["gear"]> = {};
  if (ex.gear && typeof ex.gear === "object") {
    for (const h of heroIds) {
      const w = (ex.gear as Record<string, unknown>)[h];
      if (!w || typeof w !== "object") continue;
      const slotsOf: Partial<Record<SurvGearSlot, string>> = {};
      for (const slot of SURV_GEAR_SLOTS) {
        const id = (w as Record<string, unknown>)[slot];
        const it = typeof id === "string" ? items.find((i) => i.id === id) : undefined;
        if (it && survItemFits(it, h as SurvHeroId, slot) && !Object.values(slotsOf).includes(it.id)) slotsOf[slot] = it.id;
      }
      if (Object.keys(slotsOf).length) gear[h as SurvHeroId] = slotsOf;
    }
  }
  const diffs: Partial<Record<SurvMapId, number>> = {};
  if (ex.diffs && typeof ex.diffs === "object") {
    for (const m of SURV_MAPS) {
      const v = (ex.diffs as Record<string, unknown>)[m.id];
      if (typeof v === "number" && v > 0) diffs[m.id] = Math.min(SURV_DIFF_MAX, Math.floor(v));
    }
  }
  const pets = strList(ex.pets, isSurvPet) as SurvPetId[];
  const pet = isSurvPet(ex.pet) && pets.includes(ex.pet) ? ex.pet : null;
  const dust = typeof ex.dust === "number" && ex.dust > 0 ? Math.floor(ex.dust) : 0;
  return { gold: row?.gold ?? 0, upgrades, heroes, stats, skins, achievements, bossTypes, runes, equipped, missions, items, gear, diffs, pets, pet, dust };
}

const extraOf = (p: SurvProfileDTO, over: Partial<Record<string, unknown>> = {}) =>
  ({
  skins: p.skins,
  achievements: p.achievements,
  bossTypes: p.bossTypes,
  runes: p.runes ?? {},
  equipped: p.equipped ?? [],
  missions: p.missions ?? {},
  items: p.items ?? [],
  gear: p.gear ?? {},
  diffs: p.diffs ?? {},
  pets: p.pets ?? [],
  pet: p.pet ?? null,
  dust: p.dust ?? 0,
    ...over,
  }) as unknown as Prisma.InputJsonObject;

const newItemId = () => randomBytes(6).toString("base64url");

/** 🎒 the summed stats of what someone's hero wears (co-op: the host's browser runs the game). */
export async function survGearOf(userId: string, hero: SurvHeroId): Promise<Partial<Record<SurvGearStat, number>>> {
  const p = await profileOf(userId);
  return survGearStats(p.items, p.gear?.[hero], hero);
}

/** 👕 how someone's hero looks in their gear */
export async function survLookOf(userId: string, hero: SurvHeroId): Promise<string> {
  const p = await profileOf(userId);
  return survLookKey(p.items, p.gear?.[hero], hero);
}

/** 🐾 the pet someone takes along */
export async function survPetOf(userId: string): Promise<SurvPetId | null> {
  return (await profileOf(userId)).pet ?? null;
}

/** ☠️ the highest difficulty someone has open on a map */
export async function survDiffOf(userId: string, map: SurvMapId): Promise<number> {
  return survDiffOpen((await profileOf(userId)).diffs, map);
}

/** The runes someone wears, with their levels (for co-op: the host's browser runs the game). */
export async function survRunesOf(userId: string): Promise<Partial<Record<SurvRuneId, number>>> {
  const p = await profileOf(userId);
  const out: Partial<Record<SurvRuneId, number>> = {};
  for (const r of p.equipped ?? []) out[r] = p.runes?.[r] ?? 0;
  return out;
}

/** Does this person own that look (for co-op lobbies)? */
export async function survOwnsSkinOf(userId: string, hero: SurvHeroId, skin: SurvSkinId): Promise<boolean> {
  const info = SURV_SKINS.find((x) => x.id === skin);
  if (!info) return false;
  if (!info.cost && !info.ach) return true;
  const p = await profileOf(userId);
  return info.ach ? p.achievements.includes(info.ach) : p.skins.includes(skinKey(hero, skin));
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
  const kills0 = int(b.kills, 5_000_000);
  const level = int(b.level, 5000);
  const gold0 = int(b.gold, 10_000_000);
  const bosses0 = int(b.bosses, 2000);
  const coop = b.coop === true;
  const hero = typeof b.hero === "string" && heroIds.has(b.hero) ? (b.hero as SurvHeroId) : null;
  const curses = cleanSurvCurses(b.curses);
  if (seconds === null || kills0 === null || level === null || gold0 === null || bosses0 === null || !hero) return res.status(400).json({ error: "Bad run" });
  // rough ceilings: a value past them is cut down to them (never lose a whole game, its items included, over one number)
  const kills = Math.min(kills0, seconds * 150 + 500);
  const bosses = Math.min(bosses0, Math.floor(seconds / 30) + 4);
  const gold = Math.min(gold0, seconds * 40 + bosses * 600 + 1000);
  // rough ceilings: hordes get big, but not this big
  const wave = Math.min(int(b.wave, 5000) ?? 0, Math.floor(seconds / 10) + 2);
  const streak = Math.min(kills, int(b.streak, 2_000_000) ?? 0);
  const evolutions = Math.min(6, int(b.evolutions, 50) ?? 0);
  const tasks = Math.min(wave, int(b.tasks, 5000) ?? 0);
  const bossTypes = strList(b.bossTypes, (x) => /^[a-z]{2,16}$/.test(x)).slice(0, 40);
  const map: SurvMapId | null = isSurvMap(b.map) ? b.map : null;
  // a mission can't be won in under 3 minutes (5 sanctuaries + a giant)
  const won = b.won === true && b.mission === true && !!map && seconds >= 180;

  const userId = req.userId!;
  const before = await profileOf(userId);
  // ☠️ difficulty: no higher than what this person has open on that map
  const diff = map ? Math.min(int(b.diff, SURV_DIFF_MAX) ?? 0, survDiffOpen(before.diffs, map)) : 0;
  const runeGold = 1 + (before.equipped?.includes("zlato") ? (before.runes?.zlato ?? 0) * 0.1 : 0);
  let goldEarned = Math.round((gold + Math.floor(seconds / 10)) * survGoldMul(curses, before.upgrades.greed ?? 0) * runeGold * survDiffGold(diff));
  const missions = { ...(before.missions ?? {}) };
  const diffs = { ...(before.diffs ?? {}) };
  let newDiff: number | undefined;
  if (won && map) {
    const first = !missions[map];
    missions[map] = (missions[map] ?? 0) + 1;
    const info = SURV_MAPS.find((m) => m.id === map)!;
    goldEarned += Math.round((first ? info.winGold * 2 : info.winGold) * survDiffGold(diff));
    if (diff >= survDiffOpen(diffs, map) && diff < SURV_DIFF_MAX) {
      diffs[map] = diff + 1;
      newDiff = diff + 1;
    }
  }
  // 🎒 items: the client says how many and how rare, the server rolls them (and caps both)
  const loot = (Array.isArray(b.loot) ? (b.loot as unknown[]) : [])
    .filter((x): x is number => typeof x === "number" && Number.isInteger(x) && x >= 0 && x <= 3)
    .slice(0, survLootCap(bosses, seconds, won));
  const newItems: SurvItem[] = [];
  for (const r of loot) {
    const it = survRollDrop(Math.random, hero, r, diff, newItemId());
    if (it) newItems.push(it);
  }
  const items = [...(before.items ?? []), ...newItems];
  let salvaged = 0;
  while (items.length > SURV_INV_MAX) {
    // a full bag: the weakest unworn item is broken down for gold
    const worn = new Set(Object.values(before.gear ?? {}).flatMap((g) => Object.values(g ?? {})));
    let k = -1;
    items.forEach((it, i) => {
      if (worn.has(it.id)) return;
      if (k < 0 || it.r < items[k]!.r || (it.r === items[k]!.r && it.d < items[k]!.d)) k = i;
    });
    if (k < 0) break;
    salvaged += survSalvageDust(items[k]!);
    items.splice(k, 1);
  }
  const missionsWon = Object.values(missions).filter((n) => (n ?? 0) > 0).length;
  const stats: SurvStats = {
    bestSeconds: Math.max(before.stats.bestSeconds, seconds),
    bestWave: Math.max(before.stats.bestWave, wave),
    bestLevel: Math.max(before.stats.bestLevel, level),
    kills: before.stats.kills + kills,
    bosses: before.stats.bosses + bosses,
    games: before.stats.games + 1,
    coopGames: before.stats.coopGames + (coop ? 1 : 0),
    tasks: (before.stats.tasks ?? 0) + tasks,
  };
  const allBossTypes = [...new Set([...before.bossTypes, ...bossTypes])];
  const heroCount = new Set([...before.heroes, ...survHeroesUnlockedBy(stats)]).size;
  const newAchievements = SURV_ACHIEVEMENTS.filter(
    (a) =>
      !before.achievements.includes(a.id) &&
      a.check({ wave, kills, level, streak, evolutions, coop, curses: curses.length, stats, bossKinds: allBossTypes.length, heroes: heroCount, missionsWon }),
  );
  const achGold = newAchievements.reduce((s, a) => s + a.gold, 0);
  goldEarned += achGold;
  const boughtHeroes = before.heroes.filter((h) => SURV_HEROES.find((x) => x.id === h)?.unlock.kind === "gold");
  const extra = extraOf(before, { achievements: [...before.achievements, ...newAchievements.map((a) => a.id)], bossTypes: allBossTypes, missions, diffs, items, dust: (before.dust ?? 0) + salvaged });
  await prisma.survivorProfile.upsert({
    where: { userId },
    create: { userId, gold: goldEarned, upgrades: {}, heroes: [], stats: { ...stats }, extra },
    update: { gold: { increment: goldEarned }, stats: { ...stats }, heroes: boughtHeroes, extra },
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
  res.json({
    record,
    goldEarned,
    newHeroes,
    newAchievements: newAchievements.map((a) => a.id),
    newItems: newItems.filter((it) => items.some((x) => x.id === it.id)),
    salvaged,
    ...(newDiff ? { newDiff } : {}),
    ...(await lists(ch.serverId, userId)),
  });
});

/** 🐾 Buy a pet, or pick which one comes along (pet: null = none). */
survivorsRouter.post("/text-channels/:channelId/survivors/pet", async (req, res) => {
  const ch = await survChannel(req, res);
  if (!ch) return;
  const userId = req.userId!;
  const p = await profileOf(userId);
  const want = req.body?.pet;
  if (want === null) {
    await prisma.survivorProfile.update({ where: { userId }, data: { extra: extraOf(p, { pet: null }) } });
    return res.json(await lists(ch.serverId, userId));
  }
  const info = SURV_PETS.find((x) => x.id === want);
  if (!info) return res.status(400).json({ error: "Unknown pet" });
  if ((p.pets ?? []).includes(info.id)) {
    await prisma.survivorProfile.update({ where: { userId }, data: { extra: extraOf(p, { pet: info.id }) } });
    return res.json(await lists(ch.serverId, userId));
  }
  // buy it (and take it along)
  const done = await prisma.survivorProfile.updateMany({
    where: { userId, gold: { gte: info.cost } },
    data: { gold: { decrement: info.cost }, extra: extraOf(p, { pets: [...(p.pets ?? []), info.id], pet: info.id }) },
  });
  if (!done.count) return res.status(400).json({ error: "Not enough gold" });
  res.json(await lists(ch.serverId, userId));
});

/** 🎒 Put an item on a hero (item: null = take it off). */
survivorsRouter.post("/text-channels/:channelId/survivors/equip", async (req, res) => {
  const ch = await survChannel(req, res);
  if (!ch) return;
  const hero = typeof req.body?.hero === "string" && heroIds.has(req.body.hero) ? (req.body.hero as SurvHeroId) : null;
  const slot = SURV_GEAR_SLOTS.find((x) => x === req.body?.slot);
  if (!hero || !slot) return res.status(400).json({ error: "Bad slot" });
  const userId = req.userId!;
  const p = await profileOf(userId);
  const gear = { ...(p.gear ?? {}) };
  const mine = { ...(gear[hero] ?? {}) };
  if (req.body?.item === null) delete mine[slot];
  else {
    const it = (p.items ?? []).find((i) => i.id === req.body?.item);
    if (!it || !survItemFits(it, hero, slot)) return res.status(400).json({ error: "Doesn't fit" });
    // the same ring can't sit on both fingers
    for (const k of SURV_GEAR_SLOTS) if (mine[k] === it.id) delete mine[k];
    mine[slot] = it.id;
  }
  gear[hero] = mine;
  await prisma.survivorProfile.update({ where: { userId }, data: { extra: extraOf(p, { gear }) } });
  res.json(await lists(ch.serverId, userId));
});

/** ⚒️ Craft a thing of the chosen kind for dust (rarity by the tier's chances; item level = the highest difficulty open). */
survivorsRouter.post("/text-channels/:channelId/survivors/craft", async (req, res) => {
  const ch = await survChannel(req, res);
  if (!ch) return;
  const hero = typeof req.body?.hero === "string" && heroIds.has(req.body.hero) ? (req.body.hero as SurvHeroId) : null;
  const kind = SURV_ITEM_KINDS.find((k) => k === req.body?.kind) as SurvItemKind | undefined;
  const tier = typeof req.body?.tier === "number" ? Math.floor(req.body.tier) : -1;
  const info = SURV_CRAFT[tier];
  if (!hero || !kind || !info) return res.status(400).json({ error: "Bad craft" });
  const userId = req.userId!;
  const p = await profileOf(userId);
  if ((p.dust ?? 0) < info.cost) return res.status(400).json({ error: "Not enough dust" });
  if ((p.items ?? []).length >= SURV_INV_MAX) return res.status(400).json({ error: "Bag full" });
  const diff = Math.max(0, ...Object.values(p.diffs ?? {}).map((d) => d ?? 0));
  const item = survRollCraft(Math.random, hero, kind, tier, diff, newItemId());
  if (!item) return res.status(400).json({ error: "Bad craft" });
  await prisma.survivorProfile.update({ where: { userId }, data: { extra: extraOf(p, { items: [...(p.items ?? []), item], dust: (p.dust ?? 0) - info.cost }) } });
  res.json({ item, ...(await lists(ch.serverId, userId)) });
});

/** ♻️ Recycle items into dust (worn ones are taken off first). */
survivorsRouter.post("/text-channels/:channelId/survivors/salvage", async (req, res) => {
  const ch = await survChannel(req, res);
  if (!ch) return;
  const ids = new Set(strList(req.body?.items, (x) => x.length <= 20));
  const userId = req.userId!;
  const p = await profileOf(userId);
  const gone = (p.items ?? []).filter((i) => ids.has(i.id));
  if (!gone.length) return res.json(await lists(ch.serverId, userId));
  const dust = gone.reduce((a, i) => a + survSalvageDust(i), 0);
  const items = (p.items ?? []).filter((i) => !ids.has(i.id));
  const gear: NonNullable<SurvProfileDTO["gear"]> = {};
  for (const [h, g] of Object.entries(p.gear ?? {})) {
    gear[h as SurvHeroId] = Object.fromEntries(Object.entries(g ?? {}).filter(([, id]) => !ids.has(id as string)));
  }
  await prisma.survivorProfile.update({ where: { userId }, data: { extra: extraOf(p, { items, gear, dust: (p.dust ?? 0) + dust }) } });
  res.json(await lists(ch.serverId, userId));
});

/** Buy a look for a hero (achievement looks can't be bought). */
survivorsRouter.post("/text-channels/:channelId/survivors/skin", async (req, res) => {
  const ch = await survChannel(req, res);
  if (!ch) return;
  const hero = typeof req.body?.hero === "string" && heroIds.has(req.body.hero) ? (req.body.hero as SurvHeroId) : null;
  const info = SURV_SKINS.find((x) => x.id === req.body?.skin);
  if (!hero || !info?.cost) return res.status(400).json({ error: "Not for sale" });
  const userId = req.userId!;
  const p = await profileOf(userId);
  const key = skinKey(hero, info.id);
  if (p.skins.includes(key)) return res.json(await lists(ch.serverId, userId));
  const done = await prisma.survivorProfile.updateMany({
    where: { userId, gold: { gte: info.cost } },
    data: { gold: { decrement: info.cost }, extra: extraOf(p, { skins: [...p.skins, key] }) },
  });
  if (!done.count) return res.status(400).json({ error: "Not enough gold" });
  res.json(await lists(ch.serverId, userId));
});

/** ᚱ Buy the next level of a rune. */
survivorsRouter.post("/text-channels/:channelId/survivors/rune", async (req, res) => {
  const ch = await survChannel(req, res);
  if (!ch) return;
  const info = SURV_RUNES.find((r) => r.id === req.body?.rune);
  if (!info) return res.status(400).json({ error: "Unknown rune" });
  const userId = req.userId!;
  const p = await profileOf(userId);
  const lvl = p.runes?.[info.id] ?? 0;
  if (lvl >= info.max) return res.status(400).json({ error: "Maxed" });
  const cost = survRuneCost(info.id, lvl);
  if (p.gold < cost) return res.status(400).json({ error: "Not enough gold" });
  // a new rune goes into a free slot by itself
  const equipped = [...(p.equipped ?? [])];
  if (!lvl && !equipped.includes(info.id) && equipped.length < survRuneSlots(p.stats, p.missions)) equipped.push(info.id);
  const done = await prisma.survivorProfile.updateMany({
    where: { userId, gold: { gte: cost } },
    data: { gold: { decrement: cost }, extra: extraOf(p, { runes: { ...(p.runes ?? {}), [info.id]: lvl + 1 }, equipped }) },
  });
  if (!done.count) return res.status(400).json({ error: "Not enough gold" });
  res.json(await lists(ch.serverId, userId));
});

/** ᚱ Which runes to wear (owned ones, as many as there are slots). */
survivorsRouter.post("/text-channels/:channelId/survivors/runes", async (req, res) => {
  const ch = await survChannel(req, res);
  if (!ch) return;
  const userId = req.userId!;
  const p = await profileOf(userId);
  const want = strList(req.body?.equipped, (r) => (p.runes?.[r as SurvRuneId] ?? 0) > 0) as SurvRuneId[];
  if (want.length > survRuneSlots(p.stats, p.missions)) return res.status(400).json({ error: "Not enough slots" });
  await prisma.survivorProfile.update({ where: { userId }, data: { extra: extraOf(p, { equipped: want }) } });
  res.json(await lists(ch.serverId, userId));
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
