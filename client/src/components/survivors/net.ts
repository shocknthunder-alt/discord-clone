import type { SurvHeroId, SurvSkinId } from "@discord-clone/shared";
import { ENEMY_IDS, WEAPON_IDS, PASSIVE_IDS, type PassiveId, type WeaponId } from "./content";
import { FX, type Fx, type Offer, type REnemy, type RGem, type RMark, type RPlayer, type RProj, type RView, type World } from "./engine";

// 🧟 Шмиркленд co-op: the host sends ~12 snapshots a second. Enemies / projectiles / gems are packed
// into Int16 arrays relative to an origin (positions rounded to whole pixels); players, the boss bar,
// effects and HUD numbers go as plain JSON. Guests draw between the last two snapshots.

export const SNAP_HZ = 12;
const MAX_FX = 70;
const MAX_DMG_FX = 30;

/** What a guest shows in the HUD for a player (the host's world has it all). */
export interface NetPlayer extends RPlayer {
  weapons: { id: WeaponId; lvl: number; evo: boolean }[];
  passives: Partial<Record<PassiveId, number>>;
  speed: number;
  skillCd: number;
  skillMax: number;
  dashCd: number;
  rerolls: number;
  kills: number;
  /** damage by weapon index (-1 = skills) */
  dmgBy: Record<number, number>;
  evos: number;
}

export interface Snapshot {
  view: Omit<RView, "players"> & { players: NetPlayer[] };
  level: number;
  xp: number;
  xpNext: number;
  kills: number;
  gold: number;
  bosses: number;
  wave: number;
  waveT: number;
  breakT: number;
  waveLeft: number;
  waveTotal: number;
  streak: number;
  task: { text: string; progress: number; target: number; state: number } | null;
  theme: string;
  tasksDone: number;
  bestStreak: number;
  bossTypes: string[];
  boss: { type: string; hp: number; max: number } | null;
  choosing: boolean;
  /** uids still picking */
  waiting: string[];
  blessing: string | null;
  over: boolean;
  fx: Fx[];
}

interface Wire {
  t: number;
  ox: number;
  oy: number;
  e: ArrayBuffer;
  p: ArrayBuffer;
  g?: ArrayBuffer;
  m: number[];
  pl: unknown[];
  h: number[]; // level xp xpNext kills gold bosses wave waveT breakT waveLeft waveTotal streak
  b: [string, number, number] | null;
  c: [number, string[]];
  bl: string | null;
  tk?: [string, number, number, number] | null;
  th?: string;
  /** tasks done, best streak, kinds of bosses beaten */
  ac?: [number, number, string[]];
  o: number;
  fx: Fx[];
}

const clamp16 = (v: number) => Math.max(-32767, Math.min(32767, Math.round(v)));

export function encodeSnapshot(w: World, fx: Fx[], withGems: boolean): Wire {
  const alive = w.players.filter((p) => !p.gone);
  const ox = Math.round(alive.reduce((s, p) => s + p.x, 0) / (alive.length || 1));
  const oy = Math.round(alive.reduce((s, p) => s + p.y, 0) / (alive.length || 1));

  const en = w.enemies.filter((e) => !e.dead);
  const e = new Int16Array(en.length * 4);
  en.forEach((x, i) => {
    e[i * 4] = x.id & 0x7fff;
    e[i * 4 + 1] = ENEMY_IDS.indexOf(x.type) | (x.elite ? 32 : 0) | (x.flash > 0 ? 64 : 0) | (x.frozenT > 0 ? 128 : 0) | (x.face < 0 ? 256 : 0) | ((x.affix + 1) << 9) | (x.shieldT > 0 ? 4096 : 0) | (x.rage ? 8192 : 0);
    e[i * 4 + 2] = clamp16(x.x - ox);
    e[i * 4 + 3] = clamp16(x.y - oy);
  });

  const pr = w.projs.filter((q) => !q.dead);
  const p = new Int16Array(pr.length * 6);
  pr.forEach((q, i) => {
    p[i * 6] = q.id & 0x7fff;
    p[i * 6 + 1] = q.kind;
    p[i * 6 + 2] = clamp16(q.x - ox);
    p[i * 6 + 3] = clamp16(q.y - oy);
    p[i * 6 + 4] = Math.round((((q.a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) * 1000);
    p[i * 6 + 5] = Math.min(32767, Math.round(q.r * 10));
  });

  let g: Int16Array<ArrayBuffer> | undefined;
  if (withGems) {
    g = new Int16Array(w.gems.length * 3);
    w.gems.forEach((x, i) => {
      g![i * 3] = clamp16(x.x - ox);
      g![i * 3 + 1] = clamp16(x.y - oy);
      g![i * 3 + 2] = x.k;
    });
  }

  const m: number[] = [];
  for (const k of w.marks) m.push(k.kind, Math.round(k.x - ox), Math.round(k.y - oy), Math.round(k.r), Math.round(k.p * 100), Math.round((k as { a?: number }).a ? (k as { a: number }).a * 100 : 0));

  const pl = w.players.map((x) => [
    x.uid,
    x.name,
    x.hero,
    Math.round(x.x - ox),
    Math.round(x.y - oy),
    x.face,
    Math.round(x.hp * 10) / 10,
    x.maxHp,
    (x.dead ? 1 : 0) | (x.moving ? 2 : 0) | (x.gone ? 4 : 0) | (x.auraEvo ? 8 : 0),
    Math.round(x.reviveP * 100),
    Math.round(x.invulnT * 100),
    Math.round(x.dashT * 100),
    Math.round(x.auraR),
    Math.round(x.skillT * 10),
    Math.round(x.hurtT * 100),
    x.weapons.map((v) => [WEAPON_IDS.indexOf(v.id), v.lvl, v.evo ? 1 : 0]),
    Object.entries(x.passives).map(([id, l]) => [PASSIVE_IDS.indexOf(id as PassiveId), l]),
    Math.round(x.st.speed * 100),
    Math.round(x.skillCd * 10),
    Math.round(x.dashCd * 10),
    x.rerolls,
    x.kills,
    x.buffs.shield > 0 ? 1 : 0,
    Object.entries(x.dmgBy).map(([k, v]) => [Number(k), Math.round(v)]),
    x.skin ?? "classic",
    x.evos,
  ]);

  // effects: cap the floating numbers, they're the bulk
  let dmg = 0;
  const outFx: Fx[] = [];
  for (const f of fx) {
    if (f[0] === FX.dmg && ++dmg > MAX_DMG_FX) continue;
    if (f[0] === FX.fire) continue; // guests don't need the host's weapon sounds
    outFx.push(f);
    if (outFx.length >= MAX_FX) break;
  }

  return {
    t: Math.round(w.t * 100) / 100,
    ox,
    oy,
    e: e.buffer,
    p: p.buffer,
    ...(g ? { g: g.buffer } : {}),
    m,
    pl,
    h: [w.level, Math.round(w.xp * 10) / 10, w.xpNext, w.kills, w.gold, w.bosses, w.wave, Math.round(w.waveT * 10) / 10, Math.round(w.breakT * 10) / 10, w.waveLeft, w.waveTotal, w.streak],
    b: w.boss && !w.boss.dead ? [w.boss.type, Math.max(0, Math.round(w.boss.hp)), Math.round(w.boss.maxHp)] : null,
    c: [w.choosing ? 1 : 0, w.choosing ? w.players.filter((x) => !x.gone && !w.picked.has(x.uid)).map((x) => x.uid) : []],
    bl: w.blessing?.id ?? null,
    tk: w.task ? [w.task.text, Math.floor(w.task.progress), w.task.target, w.task.state] : null,
    th: w.theme,
    ac: [w.tasksDone, Math.max(w.bestStreak, w.streak), [...w.bossTypes]],
    o: w.over ? 1 : 0,
    fx: outFx,
  };
}

const i16 = (b: unknown): Int16Array => {
  if (b instanceof ArrayBuffer) return new Int16Array(b);
  if (ArrayBuffer.isView(b)) return new Int16Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  return new Int16Array(0);
};

export function decodeSnapshot(raw: unknown, prevGems: RGem[]): Snapshot | null {
  const w = raw as Wire;
  if (!w || typeof w !== "object" || !Array.isArray(w.pl)) return null;
  const { ox, oy } = w;
  const e = i16(w.e);
  const enemies: REnemy[] = [];
  for (let i = 0; i + 3 < e.length; i += 4) {
    const f = e[i + 1]!;
    enemies.push({
      id: e[i]!,
      type: ENEMY_IDS[f & 31] ?? "rat",
      elite: (f & 32) !== 0,
      flash: f & 64 ? 0.1 : 0,
      frozenT: f & 128 ? 1 : 0,
      face: f & 256 ? -1 : 1,
      affix: ((f >> 9) & 7) - 1,
      shield: (f & 4096) !== 0,
      rage: (f & 8192) !== 0,
      x: e[i + 2]! + ox,
      y: e[i + 3]! + oy,
    });
  }
  const p = i16(w.p);
  const projs: RProj[] = [];
  for (let i = 0; i + 5 < p.length; i += 6) projs.push({ id: p[i]!, kind: p[i + 1]!, x: p[i + 2]! + ox, y: p[i + 3]! + oy, a: p[i + 4]! / 1000, r: p[i + 5]! / 10 });
  let gems = prevGems;
  if (w.g) {
    const g = i16(w.g);
    gems = [];
    for (let i = 0; i + 2 < g.length; i += 3) gems.push({ x: g[i]! + ox, y: g[i + 1]! + oy, k: g[i + 2]! });
  }
  const marks: RMark[] = [];
  for (let i = 0; i + 5 < (w.m?.length ?? 0); i += 6) marks.push({ kind: w.m[i]!, x: w.m[i + 1]! + ox, y: w.m[i + 2]! + oy, r: w.m[i + 3]!, p: w.m[i + 4]! / 100, ...({ a: w.m[i + 5]! / 100 } as object) });
  const players: NetPlayer[] = w.pl.map((r) => {
    const a = r as unknown[];
    const flags = a[8] as number;
    return {
      uid: a[0] as string,
      name: a[1] as string,
      hero: a[2] as SurvHeroId,
      x: (a[3] as number) + ox,
      y: (a[4] as number) + oy,
      face: a[5] as number,
      hp: a[6] as number,
      maxHp: a[7] as number,
      dead: (flags & 1) !== 0,
      moving: (flags & 2) !== 0,
      auraEvo: (flags & 8) !== 0,
      reviveP: (a[9] as number) / 100,
      invulnT: (a[10] as number) / 100,
      dashT: (a[11] as number) / 100,
      auraR: a[12] as number,
      skillT: (a[13] as number) / 10,
      hurtT: (a[14] as number) / 100,
      weapons: (a[15] as number[][]).map(([id, lvl, evo]) => ({ id: WEAPON_IDS[id!]!, lvl: lvl!, evo: evo === 1 })).filter((x) => x.id),
      passives: Object.fromEntries((a[16] as number[][]).map(([id, l]) => [PASSIVE_IDS[id!]!, l!])),
      speed: (a[17] as number) / 100,
      skillCd: (a[18] as number) / 10,
      skillMax: 0,
      dashCd: (a[19] as number) / 10,
      rerolls: a[20] as number,
      kills: a[21] as number,
      gone: (flags & 4) !== 0,
      shield: a[22] === 1,
      dmgBy: Object.fromEntries(((a[23] as number[][] | undefined) ?? []).map(([k, v]) => [k!, v!])),
      skin: (a[24] as SurvSkinId | undefined) ?? "classic",
      evos: (a[25] as number | undefined) ?? 0,
    } as NetPlayer & { gone: boolean; shield: boolean };
  });
  const [level, xp, xpNext, kills, gold, bosses, wave, waveT, breakT, waveLeft, waveTotal, streak] = w.h;
  return {
    view: { t: w.t, players, enemies, projs, gems, marks },
    level: level!,
    xp: xp!,
    xpNext: xpNext!,
    kills: kills!,
    gold: gold!,
    bosses: bosses!,
    wave: wave ?? 0,
    waveT: waveT ?? 0,
    breakT: breakT ?? 0,
    waveLeft: waveLeft ?? 0,
    waveTotal: waveTotal ?? 0,
    streak: streak ?? 0,
    task: w.tk ? { text: w.tk[0], progress: w.tk[1], target: w.tk[2], state: w.tk[3] } : null,
    theme: w.th ?? "",
    tasksDone: w.ac?.[0] ?? 0,
    bestStreak: w.ac?.[1] ?? 0,
    bossTypes: w.ac?.[2] ?? [],
    boss: w.b ? { type: w.b[0], hp: w.b[1], max: w.b[2] } : null,
    choosing: w.c?.[0] === 1,
    waiting: w.c?.[1] ?? [],
    blessing: w.bl,
    over: w.o === 1,
    fx: Array.isArray(w.fx) ? w.fx : [],
  };
}

/** Draw between two snapshots (by id); things without a match just show where they are. */
export function lerpView(a: Snapshot | null, b: Snapshot, k: number): RView {
  if (!a || k >= 1) return b.view;
  const t = Math.max(0, Math.min(1, k));
  const lerp = (x: number, y: number) => x + (y - x) * t;
  const ea = new Map<number, REnemy>();
  for (const e of a.view.enemies) ea.set(e.id, e);
  const enemies = b.view.enemies.map((e) => {
    const o = ea.get(e.id);
    return o ? { ...e, x: lerp(o.x, e.x), y: lerp(o.y, e.y) } : e;
  });
  const pa = new Map<number, RProj>();
  for (const q of a.view.projs) pa.set(q.id, q);
  const projs = b.view.projs.map((q) => {
    const o = pa.get(q.id);
    if (!o) return q;
    let da = q.a - o.a;
    if (da > Math.PI) da -= Math.PI * 2;
    if (da < -Math.PI) da += Math.PI * 2;
    return { ...q, x: lerp(o.x, q.x), y: lerp(o.y, q.y), a: o.a + da * t, r: lerp(o.r, q.r) };
  });
  const pla = new Map<string, RPlayer>();
  for (const p of a.view.players) pla.set(p.uid, p);
  const players = b.view.players.map((p) => {
    const o = pla.get(p.uid);
    return o ? { ...p, x: lerp(o.x, p.x), y: lerp(o.y, p.y) } : p;
  });
  return { ...b.view, t: lerp(a.view.t, b.view.t), enemies, projs, players };
}

/* ───────── reliable messages (surv:msg) ───────── */

export type HostMsg =
  | { k: "offer"; offers: Offer[]; level: number; rerolls: number }
  | { k: "offerDone" };
export type GuestMsg = { k: "pick"; i: number } | { k: "reroll" };

/** guest → host input (volatile, ~20/s) */
export interface GuestInput {
  x: number;
  y: number;
  f: number;
  m: number;
  dx: number;
  dy: number;
  dash: number;
  sk: number;
}
