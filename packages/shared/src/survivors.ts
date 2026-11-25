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
  bestLevel: number;
  kills: number;
  bosses: number;
  games: number;
  coopGames: number;
}

export const emptySurvStats = (): SurvStats => ({ bestSeconds: 0, bestLevel: 0, kills: 0, bosses: 0, games: 0, coopGames: 0 });

/** Heroes whose stat condition is met (gold ones are bought separately). */
export function survHeroesUnlockedBy(stats: SurvStats): SurvHeroId[] {
  return SURV_HEROES.filter((h) => h.unlock.kind === "free" || (h.unlock.kind === "stat" && (stats[h.unlock.stat] ?? 0) >= h.unlock.value)).map((h) => h.id);
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

export interface SurvProfileDTO {
  gold: number;
  upgrades: Partial<Record<SurvMetaKey, number>>;
  heroes: SurvHeroId[];
  stats: SurvStats;
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
}

export interface SurvRunResultDTO extends SurvListsDTO {
  record: boolean;
  goldEarned: number;
  /** heroes unlocked by this game */
  newHeroes: SurvHeroId[];
}

/* ───────────── co-op over the socket ───────────── */

export interface SurvMemberDTO {
  userId: string;
  username: string;
  avatarUrl: string | null;
  hero: SurvHeroId;
  /** their gold-shop upgrades (the host's browser runs the game, so it needs them) */
  meta?: Partial<Record<SurvMetaKey, number>>;
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
