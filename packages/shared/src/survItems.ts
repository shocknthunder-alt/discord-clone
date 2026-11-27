import type { SurvHeroId, SurvMapId } from "./survivors.js";

/*
 * 🧟 Шмиркленд — 🎒 gear (2026-11-27) and ☠️ difficulty levels.
 * Items drop in a game (the client only reports how many and how rare), the SERVER rolls them and keeps them in
 * SurvivorProfile.extra.items; each hero wears 3 (weapon = only that hero's, armour + amulet = anyone's).
 * Difficulty 0..10 per map: winning a map's mission at difficulty d opens d+1 there.
 */

/** where a hero wears things (armor = the chest); two ring fingers (2026-11-27: 10 slots, was 3) */
export type SurvGearSlot = "weapon" | "helmet" | "shoulders" | "armor" | "gloves" | "pants" | "boots" | "amulet" | "ring1" | "ring2";
export const SURV_GEAR_SLOTS: SurvGearSlot[] = ["weapon", "helmet", "shoulders", "armor", "gloves", "pants", "boots", "amulet", "ring1", "ring2"];
/** what kind of thing an item is ("ring" fits either ring slot) */
export type SurvItemKind = Exclude<SurvGearSlot, "ring1" | "ring2"> | "ring";
export const slotKind = (slot: SurvGearSlot): SurvItemKind => (slot === "ring1" || slot === "ring2" ? "ring" : slot);

export type SurvGearStat =
  | "might"
  | "maxHp"
  | "armor"
  | "regen"
  | "cooldown"
  | "area"
  | "speed"
  | "magnet"
  | "luck"
  | "crit"
  | "xp"
  | "greed"
  | "skillDmg"
  | "skillCd"
  | "heroWeapon"
  | "amount";

/** a roll at "common": min..max (percent, except armor / regen / amount); rarer items multiply it */
export const SURV_GEAR_STATS: Record<SurvGearStat, { min: number; max: number; dec?: number }> = {
  might: { min: 3, max: 6 },
  maxHp: { min: 4, max: 8 },
  armor: { min: 1, max: 2 },
  regen: { min: 0.15, max: 0.35, dec: 2 },
  cooldown: { min: 2, max: 4 },
  area: { min: 3, max: 6 },
  speed: { min: 2, max: 4 },
  magnet: { min: 8, max: 15 },
  luck: { min: 3, max: 6 },
  crit: { min: 2, max: 4 },
  xp: { min: 3, max: 6 },
  greed: { min: 5, max: 10 },
  skillDmg: { min: 8, max: 15 },
  skillCd: { min: 4, max: 8 },
  heroWeapon: { min: 8, max: 15 },
  amount: { min: 1, max: 1 },
};
/** stats an extra roll may pick (amount = legendary only, heroWeapon = weapons only) */
const EXTRA_STATS: SurvGearStat[] = ["might", "maxHp", "armor", "regen", "cooldown", "area", "speed", "magnet", "luck", "crit", "xp", "greed", "skillDmg", "skillCd"];

export const SURV_RARITY_MUL = [1, 1.4, 1.9, 2.6];
export const SURV_RARITY_COUNT = 4;

export interface SurvItemBase {
  id: string;
  slot: SurvItemKind;
  /** weapons belong to one hero */
  hero?: SurvHeroId;
  /** always rolled first */
  main: SurvGearStat;
}

export const SURV_ITEM_BASES: SurvItemBase[] = [
  // weapons, two per hero
  { id: "gega", slot: "weapon", hero: "peyo", main: "heroWeapon" },
  { id: "hlopka", slot: "weapon", hero: "peyo", main: "skillDmg" },
  { id: "maratonki", slot: "weapon", hero: "tseko", main: "heroWeapon" },
  { id: "kasket", slot: "weapon", hero: "tseko", main: "speed" },
  { id: "bobina", slot: "weapon", hero: "nikola", main: "heroWeapon" },
  { id: "kreda", slot: "weapon", hero: "nikola", main: "cooldown" },
  { id: "tava", slot: "weapon", hero: "gitsa", main: "heroWeapon" },
  { id: "tochilka", slot: "weapon", hero: "gitsa", main: "skillDmg" },
  { id: "dvuraka", slot: "weapon", hero: "strahil", main: "heroWeapon" },
  { id: "kolan", slot: "weapon", hero: "strahil", main: "might" },
  { id: "venets", slot: "weapon", hero: "vela", main: "heroWeapon" },
  { id: "pesen", slot: "weapon", hero: "vela", main: "skillCd" },
  { id: "kozagaida", slot: "weapon", hero: "gosho", main: "heroWeapon" },
  { id: "maska", slot: "weapon", hero: "gosho", main: "armor" },
  { id: "hidrokrik", slot: "weapon", hero: "mitko", main: "heroWeapon" },
  { id: "klyuch", slot: "weapon", hero: "mitko", main: "might" },
  { id: "hurka", slot: "weapon", hero: "stana", main: "heroWeapon" },
  { id: "bilki", slot: "weapon", hero: "stana", main: "regen" },
  // armour (anyone)
  { id: "kozhuh", slot: "armor", main: "maxHp" },
  { id: "elek", slot: "armor", main: "armor" },
  { id: "poyas", slot: "armor", main: "speed" },
  { id: "yamurluk", slot: "armor", main: "regen" },
  // amulets (anyone)
  { id: "muska", slot: "amulet", main: "luck" },
  { id: "sinchets", slot: "amulet", main: "crit" },
  { id: "monista", slot: "amulet", main: "greed" },
  { id: "oko", slot: "amulet", main: "xp" },
  { id: "pero", slot: "amulet", main: "might" },
  // (2026-11-27) helmets, shoulders, gloves, trousers, boots, rings — anyone
  { id: "kalpak", slot: "helmet", main: "maxHp" },
  { id: "shlem", slot: "helmet", main: "armor" },
  { id: "kachulka", slot: "helmet", main: "skillCd" },
  { id: "naplechnitsi", slot: "shoulders", main: "armor" },
  { id: "valcha", slot: "shoulders", main: "might" },
  { id: "pelerina", slot: "shoulders", main: "area" },
  { id: "kovashki", slot: "gloves", main: "might" },
  { id: "pleteni", slot: "gloves", main: "crit" },
  { id: "strelets", slot: "gloves", main: "cooldown" },
  { id: "poturi", slot: "pants", main: "maxHp" },
  { id: "benevretsi", slot: "pants", main: "speed" },
  { id: "shalvari", slot: "pants", main: "regen" },
  { id: "botushi", slot: "boots", main: "speed" },
  { id: "bivolski", slot: "boots", main: "armor" },
  { id: "krilati", slot: "boots", main: "magnet" },
  { id: "srebaren", slot: "ring", main: "might" },
  { id: "venchalen", slot: "ring", main: "luck" },
  { id: "rubin", slot: "ring", main: "crit" },
  { id: "pechat", slot: "ring", main: "cooldown" },
  { id: "zmiya", slot: "ring", main: "skillDmg" },
];
export const survItemBase = (id: string) => SURV_ITEM_BASES.find((b) => b.id === id);

export interface SurvItem {
  /** unique per person */
  id: string;
  /** base id */
  b: string;
  /** rarity 0 common, 1 rare, 2 epic, 3 legendary */
  r: number;
  /** the stats it gives */
  s: [SurvGearStat, number][];
  /** difficulty it dropped at */
  d: number;
}

export const SURV_INV_MAX = 80;
export const SURV_DIFF_MAX = 10;

/** rarity of a drop: harder = rarer things */
export function survRollRarity(rand: () => number, diff: number, luck = 0): number {
  const d = Math.max(0, Math.min(SURV_DIFF_MAX, diff));
  const w = [Math.max(15, 60 - 4 * d), 28 + 1.5 * d, 10 + 2 * d + luck * 20, 2 + 0.6 * d + luck * 5];
  let x = rand() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < w.length; i++) {
    x -= w[i]!;
    if (x <= 0) return i;
  }
  return 0;
}

function rollStat(rand: () => number, stat: SurvGearStat, rarity: number, diff: number): number {
  const s = SURV_GEAR_STATS[stat];
  if (stat === "amount") return 1;
  const v = (s.min + rand() * (s.max - s.min)) * SURV_RARITY_MUL[rarity]! * (1 + 0.06 * diff);
  const k = 10 ** (s.dec ?? 0);
  return Math.max(stat === "armor" ? 1 : 0, Math.round(v * k) / k);
}

/** a whole item: the base's stat + 0..3 more (by rarity); legendary sometimes +1 projectile */
export function survRollItem(rand: () => number, baseId: string, rarity: number, diff: number, id: string): SurvItem | null {
  const base = survItemBase(baseId);
  if (!base) return null;
  const r = Math.max(0, Math.min(3, Math.floor(rarity)));
  const s: [SurvGearStat, number][] = [[base.main, rollStat(rand, base.main, r, diff)]];
  const pool = EXTRA_STATS.filter((x) => x !== base.main);
  for (let i = 0; i < r; i++) {
    const k = Math.floor(rand() * pool.length);
    const stat = pool.splice(k, 1)[0]!;
    s.push([stat, rollStat(rand, stat, r, diff)]);
  }
  if (r === 3 && rand() < 0.3) s.push(["amount", 1]);
  return { id, b: base.id, r, s, d: Math.max(0, Math.min(SURV_DIFF_MAX, diff)) };
}

/** what drops: one of the 9 kinds of thing (the weapon = the hero's own) */
const DROP_KINDS: SurvItemKind[] = ["weapon", "helmet", "shoulders", "armor", "gloves", "pants", "boots", "amulet", "ring", "ring"];
export function survRollDrop(rand: () => number, hero: SurvHeroId, rarity: number, diff: number, id: string): SurvItem | null {
  const kind = DROP_KINDS[Math.floor(rand() * DROP_KINDS.length)]!;
  const pool = SURV_ITEM_BASES.filter((b) => b.slot === kind && (!b.hero || b.hero === hero));
  const base = pool[Math.floor(rand() * pool.length)] ?? SURV_ITEM_BASES.find((b) => b.slot === "armor")!;
  return survRollItem(rand, base.id, rarity, diff, id);
}

export const survItemFits = (item: SurvItem, hero: SurvHeroId, slot: SurvGearSlot) => {
  const b = survItemBase(item.b);
  return !!b && b.slot === slotKind(slot) && (!b.hero || b.hero === hero);
};

/** gold for breaking an item down */
export const survSalvageGold = (item: SurvItem) => Math.round([12, 35, 90, 220][item.r]! * (1 + 0.15 * item.d));

/** the sum of the stats of what a hero wears */
export function survGearStats(items: SurvItem[] | undefined, worn: Partial<Record<SurvGearSlot, string>> | undefined, hero: SurvHeroId): Partial<Record<SurvGearStat, number>> {
  const out: Partial<Record<SurvGearStat, number>> = {};
  const used = new Set<string>();
  for (const slot of SURV_GEAR_SLOTS) {
    const it = items?.find((i) => i.id === worn?.[slot]);
    if (!it || used.has(it.id) || !survItemFits(it, hero, slot)) continue;
    used.add(it.id);
    for (const [k, v] of it.s) out[k] = (out[k] ?? 0) + v;
  }
  return out;
}

export function cleanSurvGearStats(v: unknown): Partial<Record<SurvGearStat, number>> {
  const out: Partial<Record<SurvGearStat, number>> = {};
  if (!v || typeof v !== "object") return out;
  for (const k of Object.keys(SURV_GEAR_STATS) as SurvGearStat[]) {
    const x = (v as Record<string, unknown>)[k];
    // ten items, legendary at difficulty 10 ≈ 15 × 2.6 × 1.6 each
    if (typeof x === "number" && Number.isFinite(x) && x > 0) out[k] = Math.min(k === "amount" ? 3 : 600, x);
  }
  return out;
}

export function cleanSurvItems(v: unknown): SurvItem[] {
  if (!Array.isArray(v)) return [];
  const out: SurvItem[] = [];
  const seen = new Set<string>();
  for (const x of v) {
    if (!x || typeof x !== "object") continue;
    const it = x as Record<string, unknown>;
    if (typeof it.id !== "string" || seen.has(it.id) || typeof it.b !== "string" || !survItemBase(it.b)) continue;
    const r = typeof it.r === "number" ? Math.max(0, Math.min(3, Math.floor(it.r))) : 0;
    const d = typeof it.d === "number" ? Math.max(0, Math.min(SURV_DIFF_MAX, Math.floor(it.d))) : 0;
    const s = Array.isArray(it.s)
      ? (it.s as unknown[]).filter((p): p is [SurvGearStat, number] => Array.isArray(p) && typeof p[0] === "string" && p[0] in SURV_GEAR_STATS && typeof p[1] === "number" && Number.isFinite(p[1]))
      : [];
    seen.add(it.id);
    out.push({ id: it.id, b: it.b, r, s, d });
    if (out.length >= SURV_INV_MAX) break;
  }
  return out;
}

/* ───────────── ☠️ difficulty ───────────── */

/** the highest difficulty open on each map (0 = only normal) */
export const survDiffOpen = (diffs: Partial<Record<SurvMapId, number>> | undefined, map: SurvMapId) => Math.max(0, Math.min(SURV_DIFF_MAX, Math.floor(diffs?.[map] ?? 0)));
/** gold multiplier of a difficulty */
export const survDiffGold = (d: number) => 1 + 0.25 * d;
/** most items a game may bring home (the server's sanity ceiling) */
export const survLootCap = (bosses: number, seconds: number, won: boolean) => bosses * 2 + Math.floor(seconds / 150) + 3 + (won ? 3 : 0);

/* ───────────── 👕 what the gear looks like on the hero ───────────── */

/** "kind:base:rarity" of each worn piece, joined by "," (the sprite cache key + what co-op mates see) */
export function survLookKey(items: SurvItem[] | undefined, worn: Partial<Record<SurvGearSlot, string>> | undefined, hero: SurvHeroId): string {
  const out: string[] = [];
  const used = new Set<string>();
  for (const slot of SURV_GEAR_SLOTS) {
    const it = items?.find((i) => i.id === worn?.[slot]);
    if (!it || used.has(it.id) || !survItemFits(it, hero, slot)) continue;
    used.add(it.id);
    out.push(`${slot}:${it.b}:${it.r}`);
  }
  return out.join(",");
}
/** only well-formed looks get through (they end up in a canvas cache key) */
export const cleanSurvLook = (v: unknown): string =>
  typeof v === "string" && v.length <= 400 && /^([a-z0-9]+:[a-z]+:[0-3])?(,[a-z0-9]+:[a-z]+:[0-3])*$/.test(v) ? v : "";

/* ───────────── 🐾 pets (2026-11-27): bought for gold, one goes with you, it fetches things ───────────── */

export type SurvPetId = "svraka" | "kotarak" | "sharo" | "zmeyche";
export const SURV_PETS: { id: SurvPetId; cost: number }[] = [
  { id: "svraka", cost: 1200 },
  { id: "kotarak", cost: 1800 },
  { id: "sharo", cost: 2500 },
  { id: "zmeyche", cost: 6000 },
];
export const isSurvPet = (v: unknown): v is SurvPetId => typeof v === "string" && SURV_PETS.some((p) => p.id === v);
