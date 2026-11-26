import type { SurvGearSlot, SurvGearStat, SurvItem } from "./survItems.js";
/**
 * 🧟 Шмиркленд — our own "survive the hordes" game (channels with type "survivors"): Bulgarian folklore
 * monsters, folk weapons (цървул, прасе, Тесла…), endless — it gets harder until you fall, a boss every
 * few minutes. Solo or co-op (2–4 people, shared XP, each picks their own upgrades).
 *
 * What the server needs to know lives here: heroes + how they unlock, the gold shop, curses (gold bonus),
 * and the co-op socket payloads. The game itself (weapons, enemies, waves) runs in the browser.
 */

export const SURV_MAX_PLAYERS = 4;

/* ───────────── heroes ───────────── */

export type SurvHeroId = "peyo" | "tseko" | "nikola" | "gitsa" | "strahil" | "vela" | "gosho" | "mitko" | "stana";

/** stat = reached in any single game (or a running total, see SurvStats) */
export type SurvUnlock =
  | { kind: "free" }
  | { kind: "stat"; stat: keyof SurvStats; value: number }
  | { kind: "gold"; cost: number };

export interface SurvHeroInfo {
  id: SurvHeroId;
  unlock: SurvUnlock;
}

export const SURV_HEROES: SurvHeroInfo[] = [
  { id: "peyo", unlock: { kind: "free" } },
  { id: "tseko", unlock: { kind: "free" } },
  { id: "nikola", unlock: { kind: "free" } },
  { id: "gitsa", unlock: { kind: "stat", stat: "bestSeconds", value: 300 } },
  { id: "strahil", unlock: { kind: "stat", stat: "bosses", value: 1 } },
  { id: "vela", unlock: { kind: "stat", stat: "bestLevel", value: 30 } },
  { id: "gosho", unlock: { kind: "stat", stat: "bestSeconds", value: 900 } },
  { id: "mitko", unlock: { kind: "stat", stat: "kills", value: 5000 } },
  { id: "stana", unlock: { kind: "gold", cost: 1500 } },
];

/** Running totals / bests kept per person (SurvivorProfile.stats). */
export interface SurvStats {
  bestSeconds: number;
  /** (2026-11-26+) the furthest wave */
  bestWave: number;
  bestLevel: number;
  kills: number;
  bosses: number;
  games: number;
  coopGames: number;
  /** wave tasks done, in total */
  tasks: number;
}

export const emptySurvStats = (): SurvStats => ({ bestSeconds: 0, bestWave: 0, bestLevel: 0, kills: 0, bosses: 0, games: 0, coopGames: 0, tasks: 0 });

/** Heroes whose stat condition is met (gold ones are bought separately). */
export function survHeroesUnlockedBy(stats: SurvStats): SurvHeroId[] {
  return SURV_HEROES.filter((h) => h.unlock.kind === "free" || (h.unlock.kind === "stat" && (stats[h.unlock.stat] ?? 0) >= h.unlock.value)).map((h) => h.id);
}

/* ───────────── 🗺️ maps + 🎯 missions (2026-11-27) ───────────── */

/** Each map has its own ground, scenery, monsters and final giant. The next one opens when you win
 *  the mission on the one before (break the 5 sanctuaries, call the giant, beat it). */
export type SurvMapId = "polyana" | "gora" | "blato" | "planina";
export const SURV_MAPS: { id: SurvMapId; /** extra gold for winning its mission */ winGold: number }[] = [
  { id: "polyana", winGold: 500 },
  { id: "gora", winGold: 900 },
  { id: "blato", winGold: 1400 },
  { id: "planina", winGold: 2000 },
];
export const isSurvMap = (v: unknown): v is SurvMapId => typeof v === "string" && SURV_MAPS.some((m) => m.id === v);
/** Maps open for someone: the first one, and each one after a map whose mission they won. */
export function survMapsOpen(missions: Partial<Record<SurvMapId, number>> | undefined): SurvMapId[] {
  const out: SurvMapId[] = [];
  for (let i = 0; i < SURV_MAPS.length; i++) {
    if (i === 0 || (missions?.[SURV_MAPS[i - 1]!.id] ?? 0) > 0) out.push(SURV_MAPS[i]!.id);
  }
  return out;
}

/* ───────────── ᚱ runes (permanent, a few slots) (2026-11-27) ───────────── */

export type SurvRuneId = "sila" | "zhivot" | "barzina" | "vreme" | "kasmet" | "magnit" | "opit" | "zlato" | "perun" | "veles" | "mokosh" | "dazhbog";
export const SURV_RUNES: { id: SurvRuneId; base: number; max: number }[] = [
  { id: "sila", base: 300, max: 3 },
  { id: "zhivot", base: 250, max: 3 },
  { id: "barzina", base: 250, max: 3 },
  { id: "vreme", base: 400, max: 3 },
  { id: "kasmet", base: 300, max: 3 },
  { id: "magnit", base: 200, max: 3 },
  { id: "opit", base: 300, max: 3 },
  { id: "zlato", base: 350, max: 3 },
  { id: "perun", base: 600, max: 3 },
  { id: "veles", base: 600, max: 3 },
  { id: "mokosh", base: 600, max: 3 },
  { id: "dazhbog", base: 600, max: 3 },
];
/** level n+1 costs base × (n+1) */
export const survRuneCost = (id: SurvRuneId, currentLevel: number) => (SURV_RUNES.find((r) => r.id === id)?.base ?? 0) * (currentLevel + 1);
/** 2 slots, +1 after 3 bosses beaten (in total), +1 after the first mission won */
export function survRuneSlots(stats: SurvStats, missions: Partial<Record<SurvMapId, number>> | undefined): number {
  return 2 + (stats.bosses >= 3 ? 1 : 0) + (Object.values(missions ?? {}).some((n) => (n ?? 0) > 0) ? 1 : 0);
}
export function cleanSurvRunes(v: unknown): Partial<Record<SurvRuneId, number>> {
  const out: Partial<Record<SurvRuneId, number>> = {};
  if (!v || typeof v !== "object") return out;
  for (const r of SURV_RUNES) {
    const x = (v as Record<string, unknown>)[r.id];
    if (typeof x === "number" && x > 0) out[r.id] = Math.min(r.max, Math.floor(x));
  }
  return out;
}

/* ───────────── the gold shop (permanent upgrades) ───────────── */

export type SurvMetaKey =
  | "might"
  | "health"
  | "armor"
  | "regen"
  | "speed"
  | "magnet"
  | "wisdom"
  | "luck"
  | "haste"
  | "revival"
  | "reroll"
  | "greed";

export interface SurvMetaInfo {
  key: SurvMetaKey;
  max: number;
  /** price of the first level; level n costs base × n */
  base: number;
}

export const SURV_META: SurvMetaInfo[] = [
  { key: "might", max: 5, base: 200 },
  { key: "health", max: 5, base: 150 },
  { key: "armor", max: 3, base: 300 },
  { key: "regen", max: 3, base: 250 },
  { key: "speed", max: 3, base: 200 },
  { key: "magnet", max: 3, base: 150 },
  { key: "wisdom", max: 5, base: 200 },
  { key: "luck", max: 3, base: 250 },
  { key: "haste", max: 3, base: 400 },
  { key: "revival", max: 1, base: 1500 },
  { key: "reroll", max: 5, base: 200 },
  { key: "greed", max: 5, base: 250 },
];

export const survMetaCost = (info: SurvMetaInfo, currentLevel: number) => info.base * (currentLevel + 1);

/* ───────────── curses (harder game, more gold) ───────────── */

export type SurvCurseId = "wolves" | "winter" | "horde" | "evileye" | "nomagnet" | "night" | "glass";

/** gold = extra gold in percent */
export const SURV_CURSES: { id: SurvCurseId; gold: number }[] = [
  { id: "wolves", gold: 25 },
  { id: "winter", gold: 15 },
  { id: "horde", gold: 30 },
  { id: "evileye", gold: 30 },
  { id: "nomagnet", gold: 15 },
  { id: "night", gold: 20 },
  { id: "glass", gold: 40 },
];

export const cleanSurvCurses = (v: unknown): SurvCurseId[] =>
  Array.isArray(v) ? [...new Set(v.filter((c): c is SurvCurseId => SURV_CURSES.some((x) => x.id === c)))] : [];

/** Gold multiplier of curses + the "greed" shop level. */
export const survGoldMul = (curses: SurvCurseId[], greed: number) =>
  1 + curses.reduce((s, c) => s + (SURV_CURSES.find((x) => x.id === c)?.gold ?? 0), 0) / 100 + greed * 0.1;

/* ───────────── REST ───────────── */

/* ───────────── skins (2026-11-26) ───────────── */

export type SurvSkinId = "classic" | "night" | "fest" | "royal" | "gold" | "fire" | "ghost";

/** cost = gold, per hero · ach = unlocked for every hero by that achievement */
export const SURV_SKINS: { id: SurvSkinId; cost?: number; ach?: SurvAchId }[] = [
  { id: "classic" },
  { id: "night", cost: 400 },
  { id: "fest", cost: 700 },
  { id: "royal", cost: 1200 },
  { id: "gold", ach: "wave20" },
  { id: "fire", ach: "streak1000" },
  { id: "ghost", ach: "allBosses" },
];

/** owned skins are stored as "hero:skin" (gold ones) */
export const skinKey = (hero: SurvHeroId, skin: SurvSkinId) => `${hero}:${skin}`;

export function survOwnsSkin(p: { skins: string[]; achievements: SurvAchId[] }, hero: SurvHeroId, skin: SurvSkinId): boolean {
  const info = SURV_SKINS.find((x) => x.id === skin);
  if (!info) return false;
  if (!info.cost && !info.ach) return true;
  if (info.ach) return p.achievements.includes(info.ach);
  return p.skins.includes(skinKey(hero, skin));
}

/* ───────────── achievements (2026-11-26) ───────────── */

export type SurvAchId =
  | "first"
  | "wave5"
  | "wave10"
  | "wave15"
  | "wave20"
  | "wave30"
  | "boss1"
  | "boss5kinds"
  | "allBosses"
  | "kills1000"
  | "kills3000"
  | "streak250"
  | "streak1000"
  | "evolve1"
  | "evolve3"
  | "coop"
  | "tasks10"
  | "tasks50"
  | "cursed"
  | "level50"
  | "veteran"
  | "allHeroes"
  | "mission1"
  | "missionAll";

/** How many different bosses there are (the "allBosses" achievement). */
export const SURV_BOSS_COUNT = 14;

/** What one finished game tells the achievements (+ the person's totals after it). */
export interface SurvAchInput {
  wave: number;
  kills: number;
  level: number;
  streak: number;
  evolutions: number;
  coop: boolean;
  curses: number;
  stats: SurvStats;
  bossKinds: number;
  heroes: number;
  /** (2026-11-27+) maps whose mission was won, after this game */
  missionsWon?: number;
}

export const SURV_ACHIEVEMENTS: { id: SurvAchId; gold: number; check: (r: SurvAchInput) => boolean }[] = [
  { id: "first", gold: 50, check: (r) => r.stats.games >= 1 },
  { id: "wave5", gold: 100, check: (r) => r.wave >= 5 },
  { id: "wave10", gold: 250, check: (r) => r.wave >= 10 },
  { id: "wave15", gold: 500, check: (r) => r.wave >= 15 },
  { id: "wave20", gold: 1000, check: (r) => r.wave >= 20 },
  { id: "wave30", gold: 2500, check: (r) => r.wave >= 30 },
  { id: "boss1", gold: 150, check: (r) => r.stats.bosses >= 1 },
  { id: "boss5kinds", gold: 600, check: (r) => r.bossKinds >= 5 },
  { id: "allBosses", gold: 2500, check: (r) => r.bossKinds >= SURV_BOSS_COUNT },
  { id: "kills1000", gold: 300, check: (r) => r.kills >= 1000 },
  { id: "kills3000", gold: 800, check: (r) => r.kills >= 3000 },
  { id: "streak250", gold: 300, check: (r) => r.streak >= 250 },
  { id: "streak1000", gold: 1000, check: (r) => r.streak >= 1000 },
  { id: "evolve1", gold: 200, check: (r) => r.evolutions >= 1 },
  { id: "evolve3", gold: 700, check: (r) => r.evolutions >= 3 },
  { id: "coop", gold: 150, check: (r) => r.coop },
  { id: "tasks10", gold: 300, check: (r) => (r.stats.tasks ?? 0) >= 10 },
  { id: "tasks50", gold: 900, check: (r) => (r.stats.tasks ?? 0) >= 50 },
  { id: "cursed", gold: 800, check: (r) => r.wave >= 10 && r.curses >= 3 },
  { id: "level50", gold: 500, check: (r) => r.level >= 50 },
  { id: "veteran", gold: 400, check: (r) => r.stats.games >= 25 },
  { id: "allHeroes", gold: 1500, check: (r) => r.heroes >= 9 },
  { id: "mission1", gold: 400, check: (r) => (r.missionsWon ?? 0) >= 1 },
  { id: "missionAll", gold: 3000, check: (r) => (r.missionsWon ?? 0) >= SURV_MAPS.length },
];

export interface SurvProfileDTO {
  gold: number;
  upgrades: Partial<Record<SurvMetaKey, number>>;
  heroes: SurvHeroId[];
  stats: SurvStats;
  /** (2026-11-26+) bought skins "hero:skin", earned achievements, bosses ever beaten */
  skins: string[];
  achievements: SurvAchId[];
  bossTypes: string[];
  /** (2026-11-27+) rune levels owned, the ones worn, missions won per map */
  runes?: Partial<Record<SurvRuneId, number>>;
  equipped?: SurvRuneId[];
  missions?: Partial<Record<SurvMapId, number>>;
  /** (2026-11-27+) 🎒 items owned, what each hero wears (slot → item id), ☠️ highest difficulty open per map */
  items?: SurvItem[];
  gear?: Partial<Record<SurvHeroId, Partial<Record<SurvGearSlot, string>>>>;
  diffs?: Partial<Record<SurvMapId, number>>;
}

export interface SurvTopRow {
  userId: string;
  username: string;
  avatarUrl: string | null;
  /** seconds survived */
  best: number;
  /** kills in that game */
  kills: number;
  games: number;
}

export interface SurvListsDTO {
  solo: { top: SurvTopRow[]; mine: { best: number; kills: number; games: number } | null };
  coop: { top: SurvTopRow[]; mine: { best: number; kills: number; games: number } | null };
  profile: SurvProfileDTO;
}

/** POST /text-channels/:id/survivors/run */
export interface SurvRunDTO {
  seconds: number;
  kills: number;
  level: number;
  /** gold picked up in the game (before the curse/greed multiplier; the server applies it) */
  gold: number;
  bosses: number;
  coop: boolean;
  hero: SurvHeroId;
  curses: SurvCurseId[];
  /** (2026-11-26+) the wave the game ended in */
  wave?: number;
  /** (2026-11-26+) best kill streak, evolved weapons, wave tasks done, kinds of bosses beaten */
  streak?: number;
  evolutions?: number;
  tasks?: number;
  bossTypes?: string[];
  /** (2026-11-27+) the map, and whether its mission was won */
  map?: SurvMapId;
  mission?: boolean;
  won?: boolean;
  /** (2026-11-27+) ☠️ difficulty played, 🎒 rarities of the items picked up (the server rolls the items) */
  diff?: number;
  loot?: number[];
}

export interface SurvRunResultDTO extends SurvListsDTO {
  record: boolean;
  goldEarned: number;
  /** heroes unlocked by this game */
  newHeroes: SurvHeroId[];
  /** (2026-11-26+) achievements earned by this game (their gold is in goldEarned) */
  newAchievements?: SurvAchId[];
  /** (2026-11-27+) items this game brought home, gold from items that didn't fit, difficulty newly opened */
  newItems?: SurvItem[];
  salvaged?: number;
  newDiff?: number;
}

/* ───────────── co-op over the socket ───────────── */

export interface SurvMemberDTO {
  userId: string;
  username: string;
  avatarUrl: string | null;
  hero: SurvHeroId;
  /** (2026-11-26+) the look they picked (checked against what they own) */
  skin?: SurvSkinId;
  /** their gold-shop upgrades (the host's browser runs the game, so it needs them) */
  meta?: Partial<Record<SurvMetaKey, number>>;
  /** (2026-11-27+) the runes they wear (levels) */
  runes?: Partial<Record<SurvRuneId, number>>;
  /** (2026-11-27+) 🎒 the summed stats of the gear their hero wears */
  gear?: Partial<Record<SurvGearStat, number>>;
}

export function cleanSurvMeta(v: unknown): Partial<Record<SurvMetaKey, number>> {
  const out: Partial<Record<SurvMetaKey, number>> = {};
  if (!v || typeof v !== "object") return out;
  for (const m of SURV_META) {
    const x = (v as Record<string, unknown>)[m.key];
    if (typeof x === "number" && x > 0) out[m.key] = Math.min(m.max, Math.floor(x));
  }
  return out;
}

export interface SurvPartyDTO {
  id: string;
  channelId: string;
  hostId: string;
  players: SurvMemberDTO[];
  curses: SurvCurseId[];
  /** (2026-11-27+) the map + mission mode the host picked */
  map?: SurvMapId;
  mission?: boolean;
  /** (2026-11-27+) ☠️ difficulty */
  diff?: number;
  state: "lobby" | "playing";
  /** while playing (sent by the host now and then) */
  seconds?: number;
  kills?: number;
  spectators: number;
}

export interface SurvLobbyDTO {
  channelId: string;
  parties: SurvPartyDTO[];
}

export interface SurvStartDTO {
  partyId: string;
  channelId: string;
  hostId: string;
  players: SurvMemberDTO[];
  curses: SurvCurseId[];
  map?: SurvMapId;
  mission?: boolean;
  diff?: number;
  /** back after a reload: the game goes on */
  resume?: boolean;
  /** 👁 joined as a spectator */
  spectator?: boolean;
}

/** Relayed as is: host → guests (state, offers, events), guest → host (input, picks). */
export interface SurvRelayDTO {
  partyId: string;
  /** set by the server: who sent it */
  from?: string;
  /** host → one person (missing = everyone in the party + spectators) */
  to?: string;
  d: unknown;
}

export interface SurvMemberEventDTO {
  partyId: string;
  userId: string;
  kind: "left" | "back";
}

export interface SurvOverDTO {
  partyId: string;
  reason: "dead" | "host-left" | "stopped";
  seconds: number;
  kills: number;
}
