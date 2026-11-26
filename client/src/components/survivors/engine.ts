import type { SurvCurseId, SurvGearStat, SurvHeroId, SurvMapId, SurvMetaKey, SurvRuneId, SurvSkinId } from "@discord-clone/shared";
import { survRollRarity } from "@discord-clone/shared";
import {
  AFFIXES,
  GIFTS,
  GIFT_IDS,
  GIFT_MAX,
  GODS,
  GOD_IDS,
  MAPS,
  MISSION_ALTARS,
  MISSION_SECONDS,
  DIFF_MOVES,
  DIFF_SPELL_NAMES,
  RARITY,
  RELICS,
  TEMPERS,
  TEMPER_IDS,
  COMBOS,
  COMBO_IDS,
  TIER_ROMAN,
  comboTier,
  temperEff,
  type TemperId,
  type ComboId,
  RELIC_IDS,
  RELIC_CHANCE,
  RELIC_CHANCE_DARK,
  isRelic,
  type RelicId,
  type GiftId,
  type GodId,
  BOSS_EASY,
  BOSS_HARD,
  BOSS_WAVE_EVERY,
  WAVE_THEMES,
  type TaskKind,
  BOSS_SPELLS,
  type BossMove,
  ENEMIES,
  ENEMY_IDS,
  HEROES,
  MAX_PASSIVES,
  MAX_WEAPONS,
  MAX_WEAPON_LEVEL,
  PASSIVES,
  PASSIVE_IDS,
  WAVE_BREAK,
  WAVE_SECONDS,
  WEAPONS,
  WEAPON_IDS,
  weaponStats,
  type AffixId,
  type BlessingId,
  type EnemyId,
  type MapEventId,
  type PassiveId,
  type WeaponId,
} from "./content";

// 🧟 Шмиркленд — the simulation. No DOM: the host's browser steps it (solo or co-op), render.ts draws it.
// The hordes come in WAVES (WAVE_SECONDS of fighting, a short breather); every BOSS_WAVE_EVERY-th wave is a
// boss wave (two bosses from wave 25). Every wave is tougher. Co-op: one world, shared XP, every level-up
// pauses until each player has picked.

/* ───────────── what the renderer sees (the network snapshot decodes into the same shapes) ───────────── */

export interface RPlayer {
  uid: string;
  name: string;
  hero: SurvHeroId;
  /** 👕 the worn gear's look (survLookKey) */
  look?: string;
  x: number;
  y: number;
  face: number;
  hp: number;
  maxHp: number;
  dead: boolean;
  reviveP: number;
  invulnT: number;
  dashT: number;
  moving: boolean;
  /** garlic aura radius (0 = none) */
  auraR: number;
  auraEvo: boolean;
  /** Стана's herb cloud is on */
  herbs?: boolean;
  /** an active hero skill with a visible effect (Киро's spin) */
  skillT: number;
  hurtT: number;
  skin?: SurvSkinId;
  /** 🧶 Мокош's veil is up (takes the next hit) */
  veil?: boolean;
}
export interface REnemy {
  id: number;
  type: EnemyId;
  x: number;
  y: number;
  flash: number;
  elite: boolean;
  frozenT: number;
  face: number;
  /** elite affix index in AFFIXES, -1 = none */
  affix: number;
  /** bosses: a shield up (takes 80% less) / enraged (under half health) */
  shield?: boolean;
  rage?: boolean;
  /** 🐍 poisoned */
  poison?: boolean;
}
export interface RProj {
  id: number;
  kind: number;
  x: number;
  y: number;
  a: number;
  r: number;
}
export interface RGem {
  x: number;
  y: number;
  k: number;
}
export interface RMark {
  kind: number;
  x: number;
  y: number;
  r: number;
  p: number;
}
export interface RView {
  t: number;
  players: RPlayer[];
  enemies: REnemy[];
  projs: RProj[];
  gems: RGem[];
  marks: RMark[];
}

/** projectile kinds (small ints: they go over the network) */
export const PK = {
  tsarvul: 0,
  pig: 1,
  boar: 2,
  kob: 3,
  ring: 4,
  banitsa: 5,
  shard: 6,
  bottle: 7,
  fire: 8,
  mart: 9,
  bullet: 10,
  sheep: 11,
  eball: 12,
  ebolt: 13,
  bigTsarvul: 14,
  bigRing: 15,
  bigFire: 16,
  slash: 17,
  bigSlash: 18,
  axe: 19,
  bigAxe: 20,
  note: 21,
  bee: 22,
  cauldron: 23,
  bean: 24,
  jack: 25,
  scarecrow: 26,
  poison: 27,
  tornado: 28,
  batshot: 29,
  rock: 30,
} as const;

/** enemy projectiles that stay where they are and hurt everyone standing in them */
const ZONES = new Set<number>([PK.poison, PK.tornado]);
/** our things that never hit anything themselves */
const NO_HITS = new Set<number>([PK.cauldron, PK.jack, PK.scarecrow]);

/** gem kinds */
export const GK = { blue: 0, green: 1, red: 2, coin: 3, food: 4, magnet: 5, chest: 6, bomb: 7, bag: 8, relic: 9, item: 10 } as const;
/** 🎒 an item pickup is k = GK.item + rarity (10..13) */
export const isItemGem = (k: number) => k >= GK.item && k <= GK.item + 3;
/** map marks */
export const MK = { shrine: 0, treasure: 1, hail: 2, charge: 3, leap: 4, nova: 5, acid: 6, portal: 7 } as const;

export type { BossMove };

/** effects since the last frame: [code, ...args] (renderer: particles / text; view: sounds) */
export const FX = {
  die: 0, // x y enemyTypeIndex
  dmg: 1, // x y amount crit(0/1)
  bolt: 2, // x0 y0 x1 y1 ...
  boom: 3, // x y r kind (0 banitsa, 1 shard, 2 bomb, 3 fire, 4 hail, 5 dust/slam, 6 poison, 7 blood)
  text: 4, // x y text color
  banner: 5, // text kind(0 event, 1 boss, 2 good, 3 wave)
  hurt: 6, // playerIndex
  level: 7, // level
  chest: 8, // playerIndex texts[]
  pick: 9, // playerIndex gemKind
  skill: 10, // playerIndex
  dash: 11, // playerIndex
  down: 12, // playerIndex
  revive: 13, // playerIndex
  fire: 14, // playerIndex weaponIndex
  bossDie: 15, // x y
  evolve: 16, // playerIndex weaponIndex
  streak: 17, // count
  wave: 18, // wave boss(0/1)
  task: 19, // 1 done / 0 failed, text
} as const;
export type Fx = (number | string | string[])[];

/* ───────────── state ───────────── */

export interface Stats {
  maxHp: number;
  armor: number;
  regen: number;
  might: number;
  area: number;
  cooldown: number;
  amount: number;
  speed: number;
  magnet: number;
  luck: number;
  duration: number;
  projSpeed: number;
  xp: number;
  /** extra damage to bosses / elites (луканка) */
  slayer: number;
  /** extra chance of gold from kills (пита мед) */
  greed: number;
  /** extra critical chance (Перунов знак) */
  crit: number;
}

export interface WState {
  id: WeaponId;
  lvl: number;
  evo: boolean;
  t: number;
  t2: number;
  on: boolean;
}

export interface Player extends RPlayer {
  dirX: number;
  dirY: number;
  dashCd: number;
  dvx: number;
  dvy: number;
  skillCd: number;
  weapons: WState[];
  passives: Partial<Record<PassiveId, number>>;
  st: Stats;
  meta: Partial<Record<SurvMetaKey, number>>;
  revivals: number;
  rerolls: number;
  kills: number;
  buffs: { might: number; speed: number; shield: number; herbs: number; cheers: number };
  lastDash: number;
  lastSkill: number;
  remote: boolean;
  /** a guest's last reported position (the host glides towards it) */
  netX: number;
  netY: number;
  netInit: boolean;
  gone: boolean;
  /** Буря: lightning strikes still to come */
  storm: number;
  stormT: number;
  /** Стадото etc.: waves still to come */
  volley: number;
  volleyT: number;
  /** damage done, by weapon index (-1 = skills etc.) */
  dmgBy: Record<number, number>;
  /** weapons evolved this game */
  evos: number;
  /** ⚡ gods' gifts (level 1..3), worn runes */
  gifts: Partial<Record<GiftId, number>>;
  runes: Partial<Record<SurvRuneId, number>>;
  /** gods whose blessing (3 of their gifts) this player has */
  blessed: Set<GodId>;
  /** gift timers: lightning, sun flare, veil, storm cool-down */
  gT: { strike: number; flare: number; veil: number; storm: number };
  veilN: number;
  /** Мокош's blessing saved you already */
  saved: boolean;
  /** 💎 boss relics (this game), the dragon's heart used, the bell timer */
  relics: RelicId[];
  heartUsed: boolean;
  bellT: number;
  /** 🔨 temper cards taken; 🔗 combo timers */
  tempers: Partial<Record<TemperId, number>>;
  /** 🎒 gear stats; rarities of the items picked up this game */
  gear: Partial<Record<SurvGearStat, number>>;
  loot: number[];
  comboT: { svatba: number; prolet: number; roy: number; krik: number };
}

/** 🎯 the wave's task */
export interface Task {
  kind: TaskKind;
  text: string;
  target: number;
  progress: number;
  /** 0 running, 1 done, -1 failed */
  state: number;
  type?: EnemyId;
}

export interface Enemy extends REnemy {
  /** 🐍 poison: seconds left, damage per second, who did it (player index) */
  poisonT: number;
  poisonD: number;
  poisonBy: number;
  hp: number;
  maxHp: number;
  speed: number;
  dmg: number;
  r: number;
  xp: number;
  kx: number;
  ky: number;
  boss: boolean;
  stunT: number;
  slowT: number;
  ai: number;
  ai2: number;
  state: number;
  tx: number;
  ty: number;
  /** swarm bats: fly straight, then vanish */
  life: number;
  vx: number;
  vy: number;
  dead: boolean;
  /** treasure guards / pots don't despawn */
  stay: boolean;
  /** bosses: the extra-move timer, the shield, the move being wound up */
  exT: number;
  shieldT: number;
  moves: BossMove[];
  pending: { move: BossMove; t: number; x: number; y: number } | null;
}

export interface Proj extends RProj {
  owner: number;
  vx: number;
  vy: number;
  dmg: number;
  pierce: number;
  life: number;
  maxLife: number;
  hits: Map<number, number>;
  hitCd: number;
  enemy: boolean;
  knock: number;
  stun: number;
  slow: number;
  crit: number;
  /** kind-specific: [phase/angle, sx, sy, tx, ty, ...] */
  d: number[];
  weapon: number;
  dead: boolean;
}

export interface Gem extends RGem {
  v: number;
  mag: boolean;
  sp: number;
}

export interface Mark extends RMark {
  t: number;
  /** hail: seconds till it lands; charge: direction */
  a: number;
}

export type Offer =
  | { kind: "weapon"; id: WeaponId; lvl: number }
  | { kind: "passive"; id: PassiveId; lvl: number }
  | { kind: "gift"; id: GiftId; lvl: number }
  | { kind: "temper"; id: TemperId; n: number }
  | { kind: "gold" }
  | { kind: "heal" };

export interface Input {
  mx: number;
  my: number;
  /** counters: each press adds 1 */
  dash: number;
  skill: number;
}

export interface PlayerSetup {
  uid: string;
  name: string;
  hero: SurvHeroId;
  skin?: SurvSkinId;
  meta: Partial<Record<SurvMetaKey, number>>;
  remote: boolean;
  /** (2026-11-27+) worn runes */
  runes?: Partial<Record<SurvRuneId, number>>;
  /** (2026-11-27+) 🎒 summed stats of the gear the hero wears */
  gear?: Partial<Record<SurvGearStat, number>>;
  look?: string;
}

export interface WorldOpts {
  /** ☠️ difficulty 0..10 */
  diff?: number;
  map?: SurvMapId;
  /** 🎯 the mission: 5 sanctuaries → call the giant → win */
  mission?: boolean;
}

/** what the HUD shows of a mission */
export interface MissionView {
  left: number;
  total: number;
  /** 0 sanctuaries, 1 the portal is open, 2 the giant is out, 3 won */
  phase: number;
  /** seconds before the giant comes by itself */
  tLeft: number;
}

/* ───────────── constants ───────────── */

const PLAYER_R = 14;
const BASE_SPEED = 170;
/** picking up gems from this far (× the magnet stat) */
const BASE_MAGNET = 140;
const SPAWN_R = 770;
const DESPAWN_R = 1350;
const MAX_ENEMIES = 460;
const MAX_GEMS = 260;
/** the pig bounces inside this box around its owner (about one screen) */
const BOX_W = 520;
const BOX_H = 320;
/** kill streaks that give a bonus */
const STREAKS = [50, 100, 250, 500, 1000, 2000, 5000];

/** hero index for the skill effect over the network */
export const HEROES_ORDER = Object.keys(HEROES) as SurvHeroId[];

const dist2 = (ax: number, ay: number, bx: number, by: number) => (ax - bx) * (ax - bx) + (ay - by) * (ay - by);
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pickOne = <T,>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)]!;
const angDiff = (a: number, b: number) => {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
};

/** XP needed for the next level (fast early, so the build comes together quickly). */
export function xpFor(level: number, players: number): number {
  const base = level < 20 ? 4 + (level - 1) * 6 : level < 40 ? 118 + (level - 20) * 10 : 318 + (level - 40) * 13;
  return Math.round(base * (1 + 0.45 * (players - 1)));
}

export const isBossWave = (wave: number) => wave > 0 && wave % BOSS_WAVE_EVERY === 0;

/* ───────────── spatial grid ───────────── */

const CELL = 64;
class Grid {
  private cells = new Map<number, Enemy[]>();
  private key = (cx: number, cy: number) => ((cx + 32768) << 16) | ((cy + 32768) & 0xffff);
  build(list: Enemy[]) {
    this.cells.clear();
    for (const e of list) {
      if (e.dead) continue;
      const k = this.key(Math.floor(e.x / CELL), Math.floor(e.y / CELL));
      const c = this.cells.get(k);
      if (c) c.push(e);
      else this.cells.set(k, [e]);
    }
  }
  each(x: number, y: number, r: number, fn: (e: Enemy) => void | boolean) {
    const x0 = Math.floor((x - r) / CELL);
    const x1 = Math.floor((x + r) / CELL);
    const y0 = Math.floor((y - r) / CELL);
    const y1 = Math.floor((y + r) / CELL);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const c = this.cells.get(this.key(cx, cy));
        if (!c) continue;
        for (const e of c) if (!e.dead && fn(e) === false) return;
      }
    }
  }
}

/* ───────────── the world ───────────── */

export class World {
  t = 0;
  players: Player[] = [];
  enemies: Enemy[] = [];
  projs: Proj[] = [];
  gems: Gem[] = [];
  marks: Mark[] = [];
  fx: Fx[] = [];

  level = 1;
  xp = 0;
  xpNext: number;
  kills = 0;
  gold = 0;
  bosses = 0;
  over = false;

  /** level-up: cards are out (solo: the game waits; co-op: it goes on, the ones picking are shielded) */
  choosing = false;
  /** solo pauses for the cards, co-op doesn't */
  pauseOnLevel = true;
  pendingLevels = 0;
  offers = new Map<string, Offer[]>();
  picked = new Set<string>();
  /** +1 every time new cards are dealt */
  round = 0;

  /** the current wave (1..), seconds into it, and the breather before the next one */
  wave = 0;
  waveT = 0;
  breakT = 1.5;
  /** enemies this wave still has to send */
  waveLeft = 0;
  waveTotal = 0;
  waveBosses: Enemy[] = [];
  private waveMix: EnemyId[] = [];
  private waveElites = 0;
  private waveEvent = false;

  /** kills in a row (2.5 s without one ends it) */
  streak = 0;
  bestStreak = 0;
  private streakT = 0;

  boss: Enemy | null = null;
  /** 🎯 this wave's task, and how many were done */
  task: Task | null = null;
  tasksDone = 0;
  /** kinds of bosses beaten this game */
  bossTypes = new Set<EnemyId>();
  /** the theme of the wave */
  theme = "";
  private lastThemes: number[] = [];
  private bossQueue: EnemyId[] = [];
  private bossCycle = 0;
  /** ☠️ difficulty 0..10 */
  readonly diff: number = 0;
  private sinceHit = 0;
  /** Вела's dance: frozen enemies take double damage while this runs */
  private shatterT = 0;
  event: { id: MapEventId; t: number } | null = null;
  blessing: { id: BlessingId; t: number } | null = null;
  /** 🗺️ the map, 🎯 the mission */
  readonly map: SurvMapId;
  readonly mission: boolean;
  missionPhase = 0;
  altarsLeft = 0;
  finalBoss: Enemy | null = null;
  won = false;
  private winT = 0;
  /** level-up rounds that deal only gods' gifts (a sanctuary fell) */
  private giftRounds = 0;
  private giftRound = false;

  private nextId = 1;
  private spawnAcc = 0;
  private nextPot = 10;
  private grid = new Grid();
  private hailT = 0;
  private scarecrows: Proj[] = [];
  readonly curses: Set<SurvCurseId>;

  constructor(setup: PlayerSetup[], curses: SurvCurseId[], opts: WorldOpts = {}) {
    this.curses = new Set(curses);
    this.pauseOnLevel = setup.length <= 1;
    this.map = opts.map && MAPS[opts.map] ? opts.map : "polyana";
    this.mission = !!opts.mission;
    this.diff = Math.max(0, Math.min(10, Math.floor(opts.diff ?? 0)));
    setup.forEach((s, i) => {
      const a = (i / Math.max(1, setup.length)) * Math.PI * 2;
      const p: Player = {
        uid: s.uid,
        name: s.name,
        hero: s.hero,
        x: setup.length > 1 ? Math.cos(a) * 40 : 0,
        y: setup.length > 1 ? Math.sin(a) * 40 : 0,
        face: 1,
        hp: 100,
        maxHp: 100,
        dead: false,
        reviveP: 0,
        invulnT: 1,
        dashT: 0,
        moving: false,
        auraR: 0,
        auraEvo: false,
        skillT: 0,
        hurtT: 0,
        dirX: 1,
        dirY: 0,
        dashCd: 0,
        dvx: 0,
        dvy: 0,
        skillCd: 5,
        weapons: [],
        passives: {},
        st: null as unknown as Stats,
        meta: s.meta,
        revivals: s.meta.revival ?? 0,
        rerolls: (s.meta.reroll ?? 0) + 1,
        kills: 0,
        buffs: { might: 0, speed: 0, shield: 0, herbs: 0, cheers: 0 },
        lastDash: 0,
        lastSkill: 0,
        netX: 0,
        netY: 0,
        netInit: false,
        remote: s.remote,
        gone: false,
        storm: 0,
        stormT: 0,
        volley: 0,
        volleyT: 0,
        dmgBy: {},
        evos: 0,
        skin: s.skin ?? "classic",
        gifts: {},
        runes: s.runes ?? {},
        blessed: new Set(),
        gT: { strike: 2, flare: 3, veil: 0, storm: 0 },
        veilN: 0,
        saved: false,
        relics: [],
        heartUsed: false,
        bellT: 6,
        tempers: {},
        gear: s.gear ?? {},
        look: s.look ?? "",
        loot: [],
        comboT: { svatba: 4, prolet: 6, roy: 3, krik: 0 },
      };
      p.weapons.push({ id: HEROES[s.hero].weapon, lvl: 1, evo: false, t: 0.5, t2: 0, on: false });
      // god runes: start with one of that god's gifts
      for (const g of GOD_IDS) {
        const lvl = Math.min(GIFT_MAX, p.runes[g as SurvRuneId] ?? 0);
        if (lvl <= 0) continue;
        const own = GIFT_IDS.filter((id) => GIFTS[id].god === g && !p.gifts[id]);
        if (own.length) p.gifts[pickOne(own)] = lvl;
      }
      this.refreshStats(p);
      p.hp = p.maxHp;
      this.players.push(p);
    });
    this.xpNext = xpFor(1, this.players.length);
    if (this.mission) this.placeAltars();
  }

  get mapDef() {
    return MAPS[this.map];
  }

  /** 🎯 five sanctuaries around the start, far apart */
  private placeAltars() {
    const a0 = Math.random() * Math.PI * 2;
    for (let i = 0; i < MISSION_ALTARS; i++) {
      const a = a0 + (i / MISSION_ALTARS) * Math.PI * 2 + rand(-0.25, 0.25);
      const r = rand(900, 1500) + i * 60;
      const hp = 1100 * this.mapDef.hpMul * (1 + 0.5 * (this.pf - 1));
      const e = this.spawn("altar", Math.cos(a) * r, Math.sin(a) * r, { hp });
      e.stay = true;
    }
    this.altarsLeft = MISSION_ALTARS;
  }

  get missionView(): MissionView | null {
    if (!this.mission) return null;
    return { left: this.altarsLeft, total: MISSION_ALTARS, phase: this.won ? 3 : this.missionPhase, tLeft: Math.max(0, MISSION_SECONDS - this.t) };
  }

  get alive() {
    return this.players.filter((p) => !p.dead && !p.gone);
  }
  private get pf() {
    return this.players.filter((p) => !p.gone).length || 1;
  }
  get minutes() {
    return this.t / 60;
  }

  /* ───────── stats ───────── */

  statsOf(p: Player): Stats {
    const h = HEROES[p.hero].stats;
    const m = p.meta;
    const pv = (id: PassiveId) => p.passives[id] ?? 0;
    const s: Stats = {
      maxHp: 100 * (1 + (h.maxHp ?? 0) + (m.health ?? 0) * 0.1 + pv("salata") * 0.15),
      armor: (h.armor ?? 0) + (m.armor ?? 0) + pv("kozhuh"),
      regen: (h.regen ?? 0) + (m.regen ?? 0) * 0.2 + pv("boza") * 0.25,
      might: 1 + (h.might ?? 0) + (m.might ?? 0) * 0.05 + pv("lyutenitsa") * 0.1,
      area: 1 + (h.area ?? 0) + pv("kiselo") * 0.1,
      cooldown: (h.cooldown ?? 0) + (m.haste ?? 0) * 0.03 + pv("kafe") * 0.08,
      amount: pv("brojenitsa"),
      speed: 1 + (h.speed ?? 0) + (m.speed ?? 0) * 0.05 + pv("galoshi") * 0.1,
      magnet: 1 + (h.magnet ?? 0) + (m.magnet ?? 0) * 0.2 + pv("rozovo") * 0.3,
      luck: (h.luck ?? 0) + (m.luck ?? 0) * 0.1 + pv("detelina") * 0.1,
      duration: 1 + pv("chasovnik") * 0.1,
      projSpeed: 1 + pv("chasovnik") * 0.1,
      xp: 1 + (m.wisdom ?? 0) * 0.05 + pv("sirene") * 0.1,
      slayer: pv("lukanka") * 0.15,
      greed: pv("med") * 0.25,
      crit: 0,
    };
    // ᚱ runes
    const r = (id: SurvRuneId) => p.runes?.[id] ?? 0;
    s.might += r("sila") * 0.06;
    s.maxHp *= 1 + r("zhivot") * 0.1;
    s.speed += r("barzina") * 0.04;
    s.cooldown += r("vreme") * 0.04;
    s.luck += r("kasmet") * 0.06;
    s.magnet += r("magnit") * 0.15;
    s.xp += r("opit") * 0.05;
    s.greed += r("zlato") * 0.1;
    // ⚡ gifts
    const g = (id: GiftId) => p.gifts?.[id] ?? 0;
    s.crit += g("perun_crit") * 0.07;
    s.armor += g("veles_skin");
    s.maxHp *= 1 + g("veles_skin") * 0.1;
    s.might += g("veles_fang") * 0.06 + g("dazh_dawn") * 0.07;
    s.speed += g("veles_fang") * 0.05;
    s.regen += g("mokosh_water") * 0.4;
    s.luck += g("mokosh_thread") * 0.08;
    s.greed += g("mokosh_thread") * 0.15;
    s.xp += g("mokosh_harvest") * 0.1;
    s.magnet += g("mokosh_harvest") * 0.15;
    s.area += g("dazh_wheel") * 0.08;
    s.projSpeed += g("dazh_wheel") * 0.08;
    s.slayer += g("dazh_dawn") * 0.1;
    // 🎒 gear (percent numbers, armor / regen / amount flat)
    const gr = (k: SurvGearStat) => p.gear?.[k] ?? 0;
    s.might += gr("might") / 100;
    s.maxHp *= 1 + gr("maxHp") / 100;
    s.armor += gr("armor");
    s.regen += gr("regen");
    s.cooldown += gr("cooldown") / 100;
    s.area += gr("area") / 100;
    s.speed += gr("speed") / 100;
    s.magnet += gr("magnet") / 100;
    s.luck += gr("luck") / 100;
    s.crit += gr("crit") / 100;
    s.xp += gr("xp") / 100;
    s.greed += gr("greed") / 100;
    s.amount += Math.min(1, gr("amount"));
    // 🔨 tempers
    const te = (id: TemperId) => temperEff(p.tempers?.[id] ?? 0) * TEMPERS[id].per;
    s.might += te("might");
    s.maxHp *= 1 + te("hp");
    s.cooldown += te("haste");
    s.crit += te("crit");
    s.area += te("area");
    s.speed += te("speed");
    // 💎 relics
    const rl = (id: RelicId) => p.relics?.includes(id) ?? false;
    if (rl("lamia")) (s.armor += 3), (s.maxHp *= 1.15);
    if (rl("hala")) (s.area += 0.2), (s.speed += 0.1);
    if (rl("wolfking")) s.speed += 0.2;
    if (rl("ispolin")) (s.might += 0.2), (s.maxHp *= 1.1);
    if (rl("samqueen")) (s.cooldown += 0.12), (s.regen += 0.5);
    if (rl("ghostking")) s.amount += 1;
    if (rl("bearking")) (s.maxHp *= 1.4), (s.armor += 2);
    if (this.curses.has("glass")) s.maxHp *= 0.5;
    if (this.curses.has("nomagnet")) s.magnet *= 0.5;
    if (this.curses.has("winter")) s.regen *= 0.5;
    if (p.buffs.might > 0) s.might *= 2;
    if (p.buffs.cheers > 0) {
      s.might *= 1.6;
      s.speed *= 1.3;
    }
    if (p.buffs.speed > 0) s.speed *= 1.4;
    s.maxHp = Math.round(s.maxHp);
    return s;
  }

  private refreshStats(p: Player) {
    const before = p.maxHp;
    p.st = this.statsOf(p);
    p.maxHp = p.st.maxHp;
    if (p.maxHp > before && !p.dead) p.hp += p.maxHp - before;
    p.hp = Math.min(p.hp, p.maxHp);
    const g = p.weapons.find((w) => w.id === "chesan");
    p.auraR = g ? 95 * weaponStats("chesan", g.lvl).area * p.st.area * (g.evo ? 1.4 : 1) : 0;
    p.auraEvo = !!g?.evo;
  }

  /* ───────── difficulty (by wave) ───────── */

  private get w() {
    return Math.max(1, this.wave);
  }
  private hpMul() {
    const w = this.w;
    return 1.3 * (1 + w * 0.27 + w * w * 0.019) * (1 + 0.5 * (this.pf - 1)) * (this.curses.has("evileye") ? 1.5 : 1) * this.mapDef.hpMul * this.giftHp() * this.diffHp();
  }
  /** ☠️ difficulty: +30% hp a level */
  private diffHp() {
    return 1 + 0.3 * this.diff;
  }

  /** the gods' gifts make heroes much stronger: the hordes toughen up with them (+5% per gift level, on average per hero) */
  private giftHp() {
    const ps = this.players.filter((p) => !p.gone);
    if (!ps.length) return 1;
    const lv = ps.reduce((s, p) => s + Object.values(p.gifts).reduce((a, b) => a + (b ?? 0), 0), 0) / ps.length;
    // 🎒 strong gear: +0.5% hp per 1% of damage it gives (on average per hero)
    const gear = ps.reduce((s, p) => s + (p.gear.might ?? 0) + (p.gear.heroWeapon ?? 0) * 0.5 + (p.gear.skillDmg ?? 0) * 0.2, 0) / ps.length;
    return (1 + 0.05 * lv) * (1 + 0.005 * gear);
  }
  private dmgMul() {
    return 1.2 * (1 + this.w * 0.13) * this.mapDef.dmgMul * (1 + 0.15 * this.diff);
  }
  private speedMul() {
    return (1.08 + Math.min(0.55, this.w * 0.022)) * (this.curses.has("wolves") ? 1.25 : 1) * (1 + 0.025 * this.diff);
  }

  /* ───────── spawning ───────── */

  private spawnPoint(around?: Player, r = SPAWN_R): [number, number] {
    const p = around ?? pickOne(this.alive.length ? this.alive : this.players);
    const a = Math.random() * Math.PI * 2;
    const rr = r + Math.random() * 60;
    // ahead of a moving player more often
    if (p.moving && Math.random() < 0.4) {
      const ang = Math.atan2(p.dirY, p.dirX) + rand(-0.8, 0.8);
      return [p.x + Math.cos(ang) * rr, p.y + Math.sin(ang) * rr];
    }
    return [p.x + Math.cos(a) * rr, p.y + Math.sin(a) * rr];
  }

  spawn(type: EnemyId, x: number, y: number, opts: { elite?: boolean; boss?: boolean; hp?: number; affix?: number } = {}): Enemy {
    const d = ENEMIES[type];
    const elite = !!opts.elite;
    const affix = elite ? (opts.affix ?? Math.floor(Math.random() * AFFIXES.length)) : -1;
    const hp = opts.hp ?? d.hp * (type === "pot" ? 1 : this.hpMul()) * (elite ? 10 : 1);
    const e: Enemy = {
      id: this.nextId++,
      type,
      x,
      y,
      flash: 0,
      elite,
      frozenT: 0,
      face: 1,
      affix,
      hp,
      maxHp: hp,
      speed: d.speed * this.speedMul() * (elite ? (AFFIXES[affix] === "fast" ? 1.6 : 0.9) : 1) * rand(0.92, 1.08),
      dmg: d.dmg * this.dmgMul() * (elite ? 1.5 : 1),
      r: d.r * (elite ? 1.6 : 1),
      xp: d.xp * (elite ? 10 : 1),
      kx: 0,
      ky: 0,
      boss: !!opts.boss,
      stunT: 0,
      slowT: 0,
      ai: rand(0.5, 2),
      ai2: rand(1, 3),
      state: 0,
      tx: 0,
      ty: 0,
      life: 0,
      vx: 0,
      vy: 0,
      dead: false,
      stay: type === "pot" || type === "altar",
      poisonT: 0,
      poisonD: 0,
      poisonBy: -1,
      exT: 5,
      shieldT: 0,
      moves: [],
      pending: null,
    };
    if (e.boss) {
      // two extra moves, fixed per kind of boss (so you can learn them)
      e.moves = (BOSS_SPELLS[type] ?? [["nova", ""], ["summon", ""]]).map((m) => m[0]);
      // ☠️ every difficulty level teaches the bosses one more spell
      for (const m of DIFF_MOVES) {
        if (e.moves.length >= 2 + this.diff) break;
        if (!e.moves.includes(m)) e.moves.push(m);
      }
    }
    this.enemies.push(e);
    return e;
  }

  /** The enemy kinds of a wave: a few of what is already out, the newest more often. */
  private mixFor(wave: number): EnemyId[] {
    const open = (Object.keys(ENEMIES) as EnemyId[]).filter((id) => ENEMIES[id].from <= wave);
    const newest = open.slice(-3);
    const kinds = new Set<EnemyId>();
    kinds.add(pickOne(newest));
    const n = wave < 3 ? 2 : wave < 8 ? 3 : 4;
    while (kinds.size < Math.min(n, open.length)) kinds.add(Math.random() < 0.5 ? pickOne(newest) : pickOne(open));
    return [...kinds];
  }

  private startWave() {
    this.wave++;
    this.waveT = 0;
    const w = this.wave;
    const pf = 1 + 0.6 * (this.pf - 1);
    const horde = this.curses.has("horde") ? 1.5 : 1;
    // a theme not seen in the last few waves
    const open = (id: EnemyId) => ENEMIES[id].from <= w;
    const usable = WAVE_THEMES.map((t, i) => ({ t, i, mobs: t.mobs.filter(open) })).filter((x) => x.mobs.length > 0);
    const fresh = usable.filter((x) => !this.lastThemes.includes(x.i));
    // prefer the newest themes (more of the newly opened mobs)
    const pool = (fresh.length ? fresh : usable).sort((a, b) => Math.max(...b.mobs.map((m) => ENEMIES[m].from)) - Math.max(...a.mobs.map((m) => ENEMIES[m].from)));
    const pick = pool[Math.floor(Math.random() * Math.min(3, pool.length))] ?? usable[0]!;
    this.lastThemes = [pick.i, ...this.lastThemes].slice(0, Math.min(6, usable.length - 1));
    this.theme = pick.t.name;
    this.waveMix = pick.mobs;
    // the map's own monsters come along (and a few waves earlier than elsewhere)
    const fav = this.mapDef.favour.filter((id) => ENEMIES[id].from <= w + 3 && !this.waveMix.includes(id));
    if (fav.length) this.waveMix = [...this.waveMix, pickOne(fav)];
    // every 4th normal wave is a swarm of the small fast ones
    const swarm = w >= 7 && w % 4 === 3;
    if (swarm) {
      this.waveMix = (["rat", "bat", "wolf", "raven", "spider"] as EnemyId[]).filter(open);
      this.theme = "Рояк";
    }
    this.waveTotal = Math.round((40 + w * 14 + w * w * 0.6) * pf * horde * (swarm ? 1.5 : 1) * (isBossWave(w) ? 0.6 : 1) * 1.2 * (1 + 0.18 * this.diff));
    this.waveLeft = this.waveTotal;
    this.waveElites = w >= 3 ? 1 + Math.floor(w / 4) + Math.floor(this.diff / 2) : this.diff >= 4 ? 1 : 0;
    this.waveEvent = !isBossWave(w) && w >= 2 && Math.random() < 0.45;
    this.waveBosses = [];
    this.spawnAcc = 0;
    this.task = null;
    if (isBossWave(w)) {
      const count = w >= 25 ? 2 : 1;
      for (let k = 0; k < count; k++) {
        const type = this.nextBossType();
        const [x, y] = this.spawnPoint(undefined, 600);
        const hp = 1.9 * ENEMIES[type].hp * (1 + 0.13 * w) * this.mapDef.hpMul * this.giftHp() * this.diffHp() * (1 + 0.6 * this.bossCycle) * (1 + 0.7 * (this.pf - 1)) * (this.curses.has("evileye") ? 1.3 : 1) * (count > 1 ? 0.8 : 1);
        const b = this.spawn(type, x, y, { boss: true, hp });
        this.waveBosses.push(b);
        this.boss = b;
      }
      const dark = this.bossCycle > 0 ? "Тъмен " : "";
      this.fx.push([FX.banner, `⚠️ Вълна ${w}: ${this.waveBosses.map((b) => dark + ENEMIES[b.type].name).join(" и ")}!`, 1]);
      this.fx.push([FX.wave, w, 1]);
    } else {
      this.fx.push([FX.banner, `${swarm ? "🦇" : "⚔️"} Вълна ${w} — ${this.theme}`, 3]);
      this.fx.push([FX.wave, w, 0]);
      if (w >= 2) this.newTask(w);
    }
  }

  /** the next boss nobody has seen yet this game (easy ones first, each group shuffled) */
  private nextBossType(): EnemyId {
    if (!this.bossQueue.length) {
      const shuffle = (xs: EnemyId[]) => [...xs].sort(() => Math.random() - 0.5);
      this.bossQueue = this.wave <= BOSS_WAVE_EVERY ? [...shuffle(BOSS_EASY), ...shuffle(BOSS_HARD)] : shuffle([...BOSS_EASY, ...BOSS_HARD]);
      if (this.wave > BOSS_WAVE_EVERY) this.bossCycle++;
    }
    return this.bossQueue.shift()!;
  }

  /* ───────── 🎯 wave tasks ───────── */

  private newTask(w: number) {
    const kinds: TaskKind[] = ["kill", "kill", "nohit", "gems", "pots", "streak"];
    if (w >= 3) kinds.push("elite");
    const kind = pickOne(kinds);
    const t: Task = { kind, text: "", target: 1, progress: 0, state: 0 };
    switch (kind) {
      case "kill": {
        const type = pickOne(this.waveMix);
        t.type = type;
        t.target = Math.round((14 + w * 3) * (1 + 0.3 * (this.pf - 1)));
        t.text = `Убий ${t.target} × ${ENEMIES[type].name}`;
        break;
      }
      case "nohit":
        t.target = 12;
        t.text = "12 секунди без да те ударят";
        this.sinceHit = 0;
        break;
      case "gems":
        t.target = 40 + w * 6;
        t.text = `Събери ${t.target} кристала`;
        break;
      case "pots": {
        t.target = 3;
        t.text = "Счупи 3 стомни";
        const p = pickOne(this.alive.length ? this.alive : this.players);
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2 + Math.random();
          this.spawn("pot", p.x + Math.cos(a) * rand(220, 420), p.y + Math.sin(a) * rand(220, 420));
        }
        break;
      }
      case "streak":
        t.target = 50 + w * 8;
        t.text = `Серия от ${t.target} убийства`;
        break;
      case "elite": {
        t.target = 1;
        t.text = "Повали елита преди края на вълната";
        const [x, y] = this.spawnPoint(undefined, 560);
        const e = this.spawn(pickOne(this.waveMix), x, y, { elite: true });
        t.type = e.type;
        break;
      }
    }
    this.task = t;
  }

  private taskStep(kind: TaskKind, amount = 1, type?: EnemyId) {
    const t = this.task;
    if (!t || t.state !== 0 || t.kind !== kind) return;
    if (kind === "kill" && type !== t.type) return;
    if (kind === "streak") t.progress = Math.max(t.progress, amount);
    else t.progress += amount;
    if (t.progress >= t.target) this.taskDone();
  }

  private taskDone() {
    const t = this.task!;
    t.state = 1;
    t.progress = t.target;
    this.tasksDone++;
    const p = pickOne(this.alive.length ? this.alive : this.players);
    const gold = 10 + this.wave * 2;
    this.gold += gold;
    // the reward: a chest next to you (most tasks) or a heal, and a burst of XP
    if (t.kind === "kill" || t.kind === "pots" || t.kind === "elite") this.gems.push({ x: p.x + rand(-60, 60), y: p.y + rand(-60, 60), k: GK.chest, v: 0, mag: true, sp: 0 });
    else for (const q of this.alive) this.heal(q, q.maxHp * 0.35);
    for (let i = 0; i < 8; i++) this.gems.push({ x: p.x + rand(-90, 90), y: p.y + rand(-90, 90), k: GK.green, v: 3 + this.wave, mag: true, sp: 0 });
    this.fx.push([FX.task, 1, `🎯 Задачата е изпълнена! +${gold} 🪙`]);
  }

  private director(dt: number) {
    // between waves
    if (this.breakT > 0) {
      this.breakT -= dt;
      if (this.breakT <= 0) this.startWave();
      return;
    }
    this.waveT += dt;
    const w = this.wave;
    const pf = 1 + 0.6 * (this.pf - 1);
    const cap = Math.min(MAX_ENEMIES, (56 + w * 18) * pf * (this.curses.has("horde") ? 1.4 : 1) * (1 + 0.18 * this.diff));
    // most of the wave arrives in the first 70% of it
    const rate = this.waveTotal / (WAVE_SECONDS * 0.7);
    this.spawnAcc += dt * rate;
    let n = 0;
    while (this.spawnAcc >= 1 && this.waveLeft > 0 && this.enemies.length < cap && n < 25) {
      this.spawnAcc -= 1;
      this.waveLeft--;
      n++;
      const [x, y] = this.spawnPoint();
      this.spawn(pickOne(this.waveMix), x, y);
      // they come in little groups
      if (this.waveLeft > 0 && Math.random() < 0.35) {
        this.waveLeft--;
        this.spawn(pickOne(this.waveMix), x + rand(-30, 30), y + rand(-30, 30));
      }
    }
    if (this.spawnAcc > 6) this.spawnAcc = 6;

    // elites in the middle of the wave
    if (this.waveElites > 0 && this.waveT > 10) {
      this.waveElites--;
      const [x, y] = this.spawnPoint();
      this.spawn(pickOne(this.waveMix), x, y, { elite: true });
    }
    if (this.waveEvent && this.waveT > 6 && !this.event) {
      this.waveEvent = false;
      const pool: MapEventId[] = ["shrine", "treasure", "swarm"];
      if (w >= 6) pool.push("kukeri");
      if (w >= 8) pool.push("hail");
      this.startEvent(pickOne(pool));
    }
    // pots to break
    if (this.t >= this.nextPot) {
      this.nextPot = this.t + rand(12, 18);
      if (this.enemies.filter((e) => e.type === "pot").length < 4) {
        const p = pickOne(this.alive.length ? this.alive : this.players);
        const a = Math.random() * Math.PI * 2;
        const r = rand(260, 480);
        this.spawn("pot", p.x + Math.cos(a) * r, p.y + Math.sin(a) * r);
      }
    }

    const bossAlive = this.waveBosses.some((b) => !b.dead);
    this.boss = this.waveBosses.find((b) => !b.dead) ?? null;
    if (isBossWave(w)) {
      // a boss wave goes on until the bosses fall (and keeps sending escorts)
      if (bossAlive) {
        if (this.waveLeft <= 0 && this.waveT > WAVE_SECONDS) {
          this.waveLeft = Math.round(10 * pf);
          this.waveT = WAVE_SECONDS * 0.5;
        }
        return;
      }
      if (this.waveT > 3) this.endWave();
    } else if (this.waveT >= WAVE_SECONDS) this.endWave();
  }

  private endWave() {
    if (this.task && this.task.state === 0) {
      if (this.task.kind === "nohit" && this.task.progress >= this.task.target) this.taskDone();
      else {
        this.task.state = -1;
        this.fx.push([FX.task, 0, "🎯 Задачата не стана…"]);
      }
    }
    this.breakT = isBossWave(this.wave) ? WAVE_BREAK + 2 : WAVE_BREAK;
    this.waveLeft = 0;
    this.boss = null;
  }

  private startEvent(id: MapEventId) {
    const p = pickOne(this.alive.length ? this.alive : this.players);
    const names = { shrine: "🕯️ Оброк", treasure: "💰 Заровено имане", swarm: "🦇 Ято прилепи", kukeri: "👹 Кукерско шествие", hail: "🌨️ Градушка" };
    this.fx.push([FX.banner, names[id], 0]);
    if (id === "shrine") {
      const a = Math.random() * Math.PI * 2;
      this.marks.push({ kind: MK.shrine, x: p.x + Math.cos(a) * 380, y: p.y + Math.sin(a) * 380, r: 56, p: 0, t: 40, a: 0 });
      this.event = { id, t: 40 };
    } else if (id === "treasure") {
      const a = Math.random() * Math.PI * 2;
      const x = p.x + Math.cos(a) * 850;
      const y = p.y + Math.sin(a) * 850;
      this.marks.push({ kind: MK.treasure, x, y, r: 30, p: 0, t: 80, a: 0 });
      this.gems.push({ x, y, k: GK.chest, v: 0, mag: false, sp: 0 });
      for (let i = 0; i < 3; i++) {
        const e = this.spawn(pickOne(this.waveMix.length ? this.waveMix : ["zombie" as EnemyId]), x + rand(-90, 90), y + rand(-90, 90), { elite: true });
        e.stay = true;
      }
      this.event = { id, t: 80 };
    } else if (id === "swarm") {
      const a = Math.random() * Math.PI * 2;
      const n = Math.round((30 + this.wave * 3) * (1 + 0.4 * (this.pf - 1)));
      const sx = p.x - Math.cos(a) * 780;
      const sy = p.y - Math.sin(a) * 780;
      const px = -Math.sin(a);
      const py = Math.cos(a);
      for (let i = 0; i < n; i++) {
        const off = (i / n - 0.5) * 900 + rand(-30, 30);
        const e = this.spawn("bat", sx + px * off - Math.cos(a) * rand(0, 160), sy + py * off - Math.sin(a) * rand(0, 160));
        e.life = 14;
        e.vx = Math.cos(a) * 200;
        e.vy = Math.sin(a) * 200;
      }
      this.event = { id, t: 12 };
    } else if (id === "kukeri") {
      const n = Math.round((24 + this.wave * 1.5) * (1 + 0.3 * (this.pf - 1)));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        this.spawn("kuker", p.x + Math.cos(a) * 500, p.y + Math.sin(a) * 500);
      }
      this.event = { id, t: 20 };
    } else {
      this.event = { id, t: 12 };
      this.hailT = 0;
    }
  }

  /* ───────── damage ───────── */

  private hurt(e: Enemy, dmg: number, p: Player | null, kx = 0, ky = 0, knock = 0, critMul = 2, wi = -1) {
    if (e.dead) return;
    let d = dmg;
    let crit = false;
    if (p) {
      if (Math.random() < 0.05 + p.st.luck * 0.4 + p.st.crit) {
        d *= critMul;
        crit = true;
      }
      if (p.st.slayer && (e.boss || e.elite)) d *= 1 + p.st.slayer;
      const vp = p.gifts.veles_poison ?? 0;
      if (vp && e.type !== "altar") {
        e.poisonT = 3;
        e.poisonD = Math.max(e.poisonD, (3 + 4 * vp) * p.st.might * (p.blessed.has("veles") ? 2 : 1));
        e.poisonBy = this.players.indexOf(p);
      }
      if (p.relics.includes("chuma") && e.type !== "altar" && e.type !== "pot") {
        e.poisonT = 3;
        e.poisonD = Math.max(e.poisonD, 6 * p.st.might * (1 + this.wave * 0.05));
        e.poisonBy = this.players.indexOf(p);
      }
    }
    if (e.type === "altar" && e.state === 0) {
      // the sanctuary's guards wake up
      e.state = 1;
      const mix = this.waveMix.length ? this.waveMix : (["zombie", "skeleton"] as EnemyId[]);
      for (let i = 0; i < 6 + this.pf * 2; i++) {
        const a = Math.random() * Math.PI * 2;
        this.spawn(pickOne(mix), e.x + Math.cos(a) * rand(80, 160), e.y + Math.sin(a) * rand(80, 160));
      }
      this.spawn(pickOne(mix), e.x + rand(-60, 60), e.y + 90, { elite: true });
      this.fx.push([FX.banner, "🗿 Пазителите на капището се събуждат!", 0]);
    }
    if (e.affix >= 0 && AFFIXES[e.affix] === "armored") d *= 0.5;
    if (e.shieldT > 0) d *= 0.2;
    if (this.shatterT > 0 && e.frozenT > 0) d *= 2;
    if (p) {
      p.dmgBy[wi] = (p.dmgBy[wi] ?? 0) + Math.min(d, Math.max(0, e.hp));
      if (p.relics.includes("vampking") && e.type !== "pot") this.heal(p, Math.min(2, Math.min(d, Math.max(0, e.hp)) * 0.02));
    }
    e.hp -= d;
    e.flash = 0.12;
    if (knock && (kx || ky) && e.type !== "pot" && e.type !== "altar") {
      const len = Math.hypot(kx, ky) || 1;
      const k = knock * (e.boss ? 0.05 : e.elite ? 0.35 : 1);
      e.kx += (kx / len) * k;
      e.ky += (ky / len) * k;
    }
    if (d >= 3 || crit) this.fx.push([FX.dmg, Math.round(e.x), Math.round(e.y - e.r), Math.round(d), crit ? 1 : 0]);
    if (p && wi >= 0 && e.type !== "pot") this.comboHit(p, e, d, wi);
    if (e.hp <= 0) this.kill(e, p);
    else if (crit && p && p.gifts.perun_crit && wi !== -3) {
      // Перунов знак: a crit jumps to a neighbour as lightning
      const n = this.nearest(e.x, e.y, 220, new Set([e.id]));
      if (n) {
        this.fx.push([FX.bolt, Math.round(e.x), Math.round(e.y), Math.round(n.x), Math.round(n.y)]);
        this.hurt(n, d * 0.5 * (p.blessed.has("perun") ? 1.5 : 1), p, 0, 0, 0, 1, -3);
      }
    }
  }

  /** 🔗 weapon combos that fire when a weapon hits (their own damage is index -5, so they never chain) */
  private comboHit(p: Player, e: Enemy, d: number, wi: number) {
    const wid = WEAPON_IDS[wi];
    if (!wid) return;
    const t = (c: ComboId) => comboTier(p.weapons, c);
    const grow = 1 + this.wave * 0.05;
    let k = 0;
    if (wid === "tesla" && (k = t("gorburya")) && Math.random() < 0.2 + 0.15 * k) {
      this.addProj(p, PK.fire, e.x, e.y, 0, 0, { dmg: 6 * k * p.st.might * grow, pierce: 999, life: 2, r: 38 * p.st.area, hitCd: 0.4, weapon: -5 });
    }
    if (wid === "prase" && (k = t("chesanprase")) && e.type !== "altar") {
      e.poisonT = 3;
      e.poisonD = Math.max(e.poisonD, 10 * k * p.st.might * grow);
      e.poisonBy = this.players.indexOf(p);
      if (!e.boss) e.slowT = Math.max(e.slowT, 1.2);
    }
    if ((wid === "banitsa" || wid === "kazan") && (k = t("zakuska")) && Math.random() < 0.5) {
      this.explode(p, e.x, e.y, (35 + 30 * k) * p.st.area, d * 0.5, 0, -5);
    }
    if ((wid === "sarp" || wid === "bradva") && (k = t("zhatva")) && !e.boss && !e.elite && e.type !== "altar" && e.hp > 0 && e.hp < e.maxHp * (k === 1 ? 0.15 : 0.25)) {
      p.dmgBy[-5] = (p.dmgBy[-5] ?? 0) + e.hp;
      e.hp = 0;
      this.fx.push([FX.text, Math.round(e.x), Math.round(e.y - e.r - 8), "🌾", "#ffe08a"]);
    }
    if ((wid === "pishtov" || wid === "tsarvul") && (k = t("haiduti")) && !e.boss && e.type !== "altar") {
      e.stunT = Math.max(e.stunT, 0.4 * k);
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      const len = Math.hypot(dx, dy) || 1;
      const kb = (e.elite ? 60 : 200) * k;
      e.kx += (dx / len) * kb;
      e.ky += (dy / len) * kb;
    }
    if (wid === "krik" && (k = t("gramkrik")) && p.comboT.krik <= 0) {
      p.comboT.krik = 0.4;
      const near = this.within(e.x, e.y, 280).filter((q) => q !== e && q.type !== "pot");
      near.sort(() => Math.random() - 0.5);
      for (const q of near.slice(0, k === 1 ? 3 : 5)) {
        this.fx.push([FX.bolt, Math.round(e.x), Math.round(e.y), Math.round(q.x), Math.round(q.y)]);
        this.hurt(q, this.skillDmg(p, 14 * k), p, 0, 0, 0, 2, -5);
      }
    }
    if (wid === "kazan" && (k = t("ognenkazan")) && Math.random() < 0.25 + 0.15 * k) {
      this.explode(p, e.x, e.y, 65 * p.st.area, this.skillDmg(p, 10 * k), 3, -5);
    }
  }

  /** ⚡ lightning from the sky onto a few enemies near (x, y) */
  private strike(p: Player, x: number, y: number, r: number, n: number, dmg: number) {
    const bless = p.blessed.has("perun");
    const near = this.within(x, y, r).filter((e) => e.type !== "altar" || this.altarsLeft > 0);
    near.sort(() => Math.random() - 0.5);
    for (const e of near.slice(0, n + (bless ? 2 : 0))) {
      this.fx.push([FX.bolt, Math.round(e.x + rand(-30, 30)), Math.round(e.y - 420), Math.round(e.x + rand(-12, 12)), Math.round(e.y - 160), Math.round(e.x), Math.round(e.y)]);
      this.hurt(e, dmg * (bless ? 1.5 : 1), p, 0, 0, 0, 2, -3);
      e.stunT = Math.max(e.stunT, 0.25);
    }
  }

  /** the gods' gifts that run by themselves */
  private stepGifts(p: Player, dt: number) {
    const g = p.gifts;
    const T = p.gT;
    const might = p.st.might;
    if (g.perun_strike) {
      T.strike -= dt;
      if (T.strike <= 0) {
        T.strike = 4 - 0.7 * g.perun_strike;
        this.strike(p, p.x, p.y, 450, 1 + g.perun_strike, (25 + 20 * g.perun_strike) * might);
      }
    }
    T.storm = Math.max(0, T.storm - dt);
    if (g.dazh_flare) {
      T.flare -= dt;
      if (T.flare <= 0) {
        T.flare = 6 - g.dazh_flare;
        const r = (110 + 25 * g.dazh_flare) * p.st.area * (p.blessed.has("dazhbog") ? 1.5 : 1);
        this.explode(p, p.x, p.y, r, (20 + 18 * g.dazh_flare) * might, 3, -3);
      }
    }
    if (g.mokosh_veil) {
      const max = p.blessed.has("mokosh") ? 2 : 1;
      if (p.veilN < max) {
        T.veil -= dt * (p.blessed.has("mokosh") ? 2 : 1);
        if (T.veil <= 0) {
          T.veil = 14 - 2 * g.mokosh_veil;
          p.veilN++;
        }
      }
    }
    p.veil = p.veilN > 0;
    this.stepRelics(p, dt);
  }

  /** 🔗 combos that run by themselves */
  private stepCombos(p: Player, dt: number) {
    const T = p.comboT;
    T.krik = Math.max(0, T.krik - dt);
    if (p.dead) return;
    const grow = 1 + this.wave * 0.05;
    let k = comboTier(p.weapons, "svatba");
    if (k && (T.svatba -= dt) <= 0) {
      T.svatba = k === 1 ? 8 : 5;
      this.explode(p, p.x, p.y, 240 * p.st.area, this.skillDmg(p, 30 * k), 5, -5, 0.5);
      for (const e of this.within(p.x, p.y, 240 * p.st.area)) {
        if (e.boss || e.type === "altar" || e.type === "pot") continue;
        const dx = e.x - p.x;
        const dy = e.y - p.y;
        const len = Math.hypot(dx, dy) || 1;
        e.kx += (dx / len) * 260;
        e.ky += (dy / len) * 260;
      }
      this.fx.push([FX.text, Math.round(p.x), Math.round(p.y - 50), "🎶", "#ffe08a"]);
    }
    k = comboTier(p.weapons, "prolet");
    if (k && (T.prolet -= dt) <= 0) {
      T.prolet = k === 1 ? 10 : 6;
      this.heal(p, p.maxHp * (k === 1 ? 0.06 : 0.1));
      for (const e of this.within(p.x, p.y, 300)) if (!e.boss) e.slowT = Math.max(e.slowT, 2);
      this.fx.push([FX.text, Math.round(p.x), Math.round(p.y - 50), "🌸", "#ff9ad0"]);
    }
    k = comboTier(p.weapons, "roy");
    if (k && (T.roy -= dt) <= 0) {
      T.roy = k === 1 ? 4 : 2.5;
      const r = 160 * p.st.area;
      this.fx.push([FX.boom, Math.round(p.x), Math.round(p.y), Math.round(r), 6]);
      for (const e of this.within(p.x, p.y, r)) {
        if (e.type === "pot" || e.type === "altar") continue;
        e.poisonT = 3;
        e.poisonD = Math.max(e.poisonD, 8 * k * p.st.might * grow);
        e.poisonBy = this.players.indexOf(p);
      }
    }
  }

  /** 🔗 a weapon levelled / evolved: say which combos just woke up */
  private announceCombos(p: Player, before: number[]) {
    COMBO_IDS.forEach((c, i) => {
      const t = comboTier(p.weapons, c);
      if (t <= before[i]!) return;
      const C = COMBOS[c];
      this.fx.push([FX.banner, `🔗 Съчетание ${C.icon} ${C.name} ${TIER_ROMAN[t]}${this.players.length > 1 ? ` (${p.name})` : ""}: ${C.desc(t)}`, 2]);
      this.fx.push([FX.text, Math.round(p.x), Math.round(p.y - 50), `🔗 ${C.name} ${TIER_ROMAN[t]}`, "#ffb86b"]);
    });
  }

  /** 💎 relics that run by themselves */
  private stepRelics(p: Player, dt: number) {
    this.stepCombos(p, dt);
    if (!p.relics.length || p.dead) return;
    if (p.relics.includes("swampking")) {
      for (const e of this.within(p.x, p.y, 160 * p.st.area)) if (!e.boss) e.slowT = Math.max(e.slowT, 0.3);
    }
    if (p.relics.includes("kukerchief")) {
      p.bellT -= dt;
      if (p.bellT <= 0) {
        p.bellT = 6;
        this.explode(p, p.x, p.y, 170 * p.st.area, this.skillDmg(p, 28), 5, -4, 0.6);
        this.fx.push([FX.text, Math.round(p.x), Math.round(p.y - 46), "🔔", "#ffe08a"]);
      }
    }
  }

  /** a gift picked: does a god's blessing (3 of their gifts) come with it? */
  private checkBlessings(p: Player) {
    for (const god of GOD_IDS) {
      if (p.blessed.has(god)) continue;
      const n = GIFT_IDS.filter((id) => GIFTS[id].god === god && (p.gifts[id] ?? 0) > 0).length;
      if (n >= 3) {
        p.blessed.add(god);
        this.fx.push([FX.banner, `${GODS[god].icon} ${p.name}: благословията на ${GODS[god].name} — ${GODS[god].blessing}!`, 2]);
      }
    }
  }

  private kill(e: Enemy, p: Player | null) {
    e.dead = true;
    const luck = p?.st.luck ?? 0;
    this.fx.push([FX.die, Math.round(e.x), Math.round(e.y), ENEMY_IDS.indexOf(e.type)]);
    if (e.type === "altar") {
      this.altarDown(e);
      return;
    }
    if (e === this.finalBoss) {
      this.finalBoss = null;
      this.won = true;
      this.missionPhase = 3;
      this.winT = 4;
      this.bosses++;
      this.bossTypes.add(e.type);
      this.fx.push([FX.bossDie, Math.round(e.x), Math.round(e.y)]);
      this.fx.push([FX.banner, `🏆 ПОБЕДА! ${ENEMIES[e.type].name} падна — ${this.mapDef.name} е свободна!`, 2]);
      for (const q of this.enemies) if (!q.dead && q !== e && !q.boss && q.type !== "pot") q.hp = 0, q.dead = true;
      for (let i = 0; i < 16; i++) this.gems.push({ x: e.x + rand(-90, 90), y: e.y + rand(-90, 90), k: GK.bag, v: 8, mag: true, sp: 0 });
      // 🎒 the giant's treasure: 2 items for everyone (at least rare), straight into the bag
      for (let i = 0; i < 2; i++) this.giveItem(Math.max(1, survRollRarity(Math.random, this.diff, p?.st.luck ?? 0)));
      return;
    }
    if (p && e.type !== "pot") {
      const g = p.gifts;
      if (g.veles_bloom && Math.random() < 0.08 * g.veles_bloom) this.explode(p, e.x, e.y, 70 + 10 * g.veles_bloom, (20 + 15 * g.veles_bloom) * p.st.might, 6, -3);
      else if (g.dazh_burn && Math.random() < 0.1 * g.dazh_burn) this.explode(p, e.x, e.y, (60 + 10 * g.dazh_burn) * (p.blessed.has("dazhbog") ? 1.5 : 1), (15 + 15 * g.dazh_burn) * p.st.might, 3, -3);
    }
    if (e.type === "pot") {
      this.taskStep("pots");
      // a pot: always something inside
      const r = Math.random();
      const k = r < 0.32 ? GK.food : r < 0.58 ? GK.bag : r < 0.74 ? GK.magnet : r < 0.86 ? GK.bomb : r < 0.9 + luck * 0.1 ? GK.chest : GK.coin;
      this.gems.push({ x: e.x, y: e.y, k, v: k === GK.bag ? 5 : 1, mag: false, sp: 0 });
      return;
    }
    this.kills++;
    if (p) {
      p.kills++;
      if (p.relics.includes("wolfking") && p.kills % 10 === 0) this.heal(p, p.maxHp * 0.04);
    }
    this.streak++;
    this.streakT = 2.5;
    this.taskStep("kill", 1, e.type);
    this.taskStep("streak", this.streak);
    if (e.elite && this.task?.kind === "elite") this.taskStep("elite");
    if (STREAKS.includes(this.streak)) {
      const bonus = Math.round(this.streak / 10);
      this.gold += bonus;
      this.fx.push([FX.streak, this.streak]);
      this.fx.push([FX.banner, `🔥 Серия ${this.streak}! +${bonus} 🪙`, 2]);
    }
    if (e.affix >= 0 && AFFIXES[e.affix] === "explosive") {
      this.fx.push([FX.boom, Math.round(e.x), Math.round(e.y), 95, 3]);
      for (const q of this.alive) if (dist2(q.x, q.y, e.x, e.y) < 95 * 95) this.hurtPlayer(q, e.dmg * 1.2);
    }
    if (e.life > 0) {
      // swarm bats still give a little XP
      this.dropGem(e.x, e.y, 1);
      return;
    }
    if (e.boss) {
      this.bosses++;
      this.bossTypes.add(e.type);
      this.fx.push([FX.bossDie, Math.round(e.x), Math.round(e.y)]);
      this.fx.push([FX.banner, `🏆 ${ENEMIES[e.type].name} е повален!`, 2]);
      this.gems.push({ x: e.x, y: e.y, k: GK.chest, v: 0, mag: false, sp: 0 });
      for (let i = 0; i < 8; i++) this.gems.push({ x: e.x + rand(-60, 60), y: e.y + rand(-60, 60), k: GK.bag, v: 5, mag: false, sp: 0 });
      this.bossLoot(e);
      this.gems.push({ x: e.x - 30, y: e.y + 10, k: GK.food, v: 0, mag: false, sp: 0 });
      this.dropGem(e.x + 20, e.y, e.xp);
      if (Math.random() < 0.5 + 0.04 * this.diff) this.dropItem(e.x + 30, e.y + 30, p);
      if (Math.random() < 0.05 * this.diff) this.dropItem(e.x - 40, e.y - 20, p);
      return;
    }
    if (e.elite) {
      if (Math.random() < 0.03 + 0.006 * this.diff) this.dropItem(e.x + 10, e.y + 10, p);
      if (Math.random() < 0.35 + luck) this.gems.push({ x: e.x, y: e.y, k: GK.chest, v: 0, mag: false, sp: 0 });
      else this.dropGem(e.x, e.y, e.xp);
      for (let i = 0; i < 3; i++) this.gems.push({ x: e.x + rand(-30, 30), y: e.y + rand(-30, 30), k: GK.coin, v: 1, mag: false, sp: 0 });
      return;
    }
    this.dropGem(e.x, e.y, e.xp);
    const greed = 1 + (p?.st.greed ?? 0);
    const r = Math.random();
    if (r < (0.025 + luck * 0.03) * greed) this.gems.push({ x: e.x + 8, y: e.y, k: GK.coin, v: 1, mag: false, sp: 0 });
    else if (r < 0.03 + luck * 0.03 + 0.06) {
      const r2 = Math.random();
      if (r2 < 0.06) this.gems.push({ x: e.x, y: e.y, k: GK.food, v: 0, mag: false, sp: 0 });
      else if (r2 < 0.08) this.gems.push({ x: e.x, y: e.y, k: GK.magnet, v: 0, mag: false, sp: 0 });
      else if (r2 < 0.095) this.gems.push({ x: e.x, y: e.y, k: GK.bomb, v: 0, mag: false, sp: 0 });
    }
  }

  /** 🎒 an item on the ground (its rarity is rolled now; the server rolls the item itself after the game) */
  private dropItem(x: number, y: number, p: Player | null) {
    const r = survRollRarity(Math.random, this.diff, p?.st.luck ?? 0);
    this.gems.push({ x, y, k: GK.item + r, v: r, mag: false, sp: 0 });
    if (r >= 2) this.fx.push([FX.text, Math.round(x), Math.round(y - 30), `🎒 ${RARITY[r]!.name}!`, RARITY[r]!.color]);
  }

  /** 🎒 everyone in the party gets an item of that rarity */
  private giveItem(r: number) {
    this.players.forEach((p, pi) => {
      if (p.gone) return;
      p.loot.push(r);
      this.fx.push([FX.chest, pi, [`🎒 ${RARITY[r]!.name} предмет!`, "ще го намериш в Снаряжение след играта"]]);
    });
  }

  /** 💰 gold rain (more from a dark boss) + 💎 a chance of the boss's relic */
  private bossLoot(e: Enemy) {
    const dark = this.bossCycle > 0;
    const m = dark ? 2 : 1;
    const coins = (8 + Math.floor(Math.random() * 8)) * m;
    for (let i = 0; i < coins; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = rand(30, 130);
      this.gems.push({ x: e.x + Math.cos(a) * r, y: e.y + Math.sin(a) * r, k: GK.coin, v: 1, mag: false, sp: 0 });
    }
    this.gems.push({ x: e.x + 30, y: e.y - 20, k: GK.bag, v: 15 * m, mag: false, sp: 0 });
    this.fx.push([FX.text, Math.round(e.x), Math.round(e.y - e.r - 30), `💰 Златен дъжд${dark ? " ×2" : ""}!`, "#ffd34d"]);
    if (!isRelic(e.type)) return;
    const id = e.type;
    const ps = this.players.filter((p) => !p.gone);
    if (ps.every((p) => p.relics.includes(id))) return;
    if (this.gems.some((g) => g.k === GK.relic && RELIC_IDS[g.v] === id)) return;
    const luck = Math.max(0, ...ps.map((p) => p.st.luck));
    if (Math.random() >= (dark ? RELIC_CHANCE_DARK : RELIC_CHANCE) + luck * 0.1) return;
    this.gems.push({ x: e.x - 20, y: e.y + 30, k: GK.relic, v: RELIC_IDS.indexOf(id), mag: false, sp: 0 });
    this.fx.push([FX.banner, `💎 ${ENEMIES[e.type].name} изпусна реликва: ${RELICS[id].name}!`, 2]);
  }

  /** 💎 a relic picked up: everyone in the party gets their own */
  private takeRelic(id: RelicId) {
    const r = RELICS[id];
    this.players.forEach((p, pi) => {
      if (p.gone || p.relics.includes(id)) return;
      p.relics.push(id);
      this.refreshStats(p);
      this.fx.push([FX.chest, pi, [`💎 ${r.icon} ${r.name}`, r.desc]]);
    });
  }

  /** 🗿 a sanctuary fell: gods' gifts for everyone, and when all are down the portal opens */
  private altarDown(e: Enemy) {
    this.altarsLeft = Math.max(0, this.altarsLeft - 1);
    const done = MISSION_ALTARS - this.altarsLeft;
    this.fx.push([FX.bossDie, Math.round(e.x), Math.round(e.y)]);
    this.fx.push([FX.banner, `🗿 Капище разрушено! (${done}/${MISSION_ALTARS}) — боговете ви даряват`, 2]);
    for (const q of this.alive) this.heal(q, q.maxHp * 0.25);
    for (let i = 0; i < 6; i++) this.gems.push({ x: e.x + rand(-50, 50), y: e.y + rand(-50, 50), k: GK.green, v: 4 + this.wave, mag: true, sp: 0 });
    this.giftRounds++;
    this.pendingLevels++;
    if (!this.choosing) this.openOffers();
    if (this.altarsLeft === 0 && this.missionPhase === 0) this.openPortal();
  }

  private openPortal() {
    this.missionPhase = 1;
    const p = pickOne(this.alive.length ? this.alive : this.players);
    const a = Math.random() * Math.PI * 2;
    this.marks.push({ kind: MK.portal, x: p.x + Math.cos(a) * 420, y: p.y + Math.sin(a) * 420, r: 70, p: 0, t: 1e9, a: 0 });
    this.fx.push([FX.banner, `🌀 Всички капища паднаха! Застанете в кръга, за да призовете ${ENEMIES[this.mapDef.final].name}`, 1]);
  }

  /** the map's giant comes out (from the portal, or by itself when time runs out) */
  private summonFinal(x: number, y: number, late: boolean) {
    this.missionPhase = 2;
    this.marks = this.marks.filter((m) => m.kind !== MK.portal);
    const type = this.mapDef.final;
    const hp = 2.2 * ENEMIES[type].hp * (1 + 0.04 * this.wave) * this.giftHp() * this.diffHp() * (1 + 0.7 * (this.pf - 1)) * (this.curses.has("evileye") ? 1.3 : 1) * (late ? 1.4 : 1);
    const b = this.spawn(type, x, y, { boss: true, hp });
    this.finalBoss = b;
    this.boss = b;
    this.fx.push([FX.banner, late ? `⚠️ Времето изтече — ${ENEMIES[type].name} идва сам и е бесен!` : `⚠️ ${ENEMIES[type].name} се надига!`, 1]);
    this.fx.push([FX.wave, this.wave, 1]);
  }

  private dropGem(x: number, y: number, v: number) {
    if (v <= 0) return;
    if (this.gems.length >= MAX_GEMS) {
      // fold it into the nearest XP gem instead of making a new one
      let g: Gem | null = null;
      let bd = Infinity;
      for (const q of this.gems) {
        if (q.k > GK.red || q.mag) continue;
        const d = dist2(q.x, q.y, x, y);
        if (d < bd) {
          bd = d;
          g = q;
        }
      }
      if (g) {
        g.v += v;
        g.k = g.v >= 10 ? GK.red : g.v >= 3 ? GK.green : GK.blue;
        return;
      }
    }
    this.gems.push({ x: x + rand(-4, 4), y: y + rand(-4, 4), k: v >= 10 ? GK.red : v >= 3 ? GK.green : GK.blue, v, mag: false, sp: 0 });
  }

  private hurtPlayer(p: Player, dmg: number) {
    if (p.dead || p.invulnT > 0 || p.buffs.shield > 0 || (p.skillT > 0 && p.hero === "tseko")) return;
    if (p.veilN > 0) {
      // 🧶 the veil takes the hit
      p.veilN--;
      p.veil = p.veilN > 0;
      p.invulnT = 0.6;
      this.fx.push([FX.text, Math.round(p.x), Math.round(p.y - 40), "🧶", "#f2c86a"]);
      return;
    }
    if (p.relics.includes("mora") && Math.random() < 0.2) {
      p.invulnT = 0.4;
      this.fx.push([FX.text, Math.round(p.x), Math.round(p.y - 40), "🪞", "#c8a8ff"]);
      return;
    }
    let d = Math.max(1, dmg - p.st.armor);
    if (p.skillT > 0 && p.hero === "strahil") d *= 0.5;
    if (p.gifts.perun_storm && p.gT.storm <= 0) {
      p.gT.storm = 1.2;
      this.strike(p, p.x, p.y, 320, 3 + p.gifts.perun_storm, (20 + 15 * p.gifts.perun_storm) * p.st.might);
    }
    if (p.blessed.has("mokosh") && !p.saved && p.hp - d <= p.maxHp * 0.2) {
      p.saved = true;
      p.hp = p.maxHp;
      p.invulnT = 2;
      this.fx.push([FX.banner, `🌾 Мокош закриля ${p.name}!`, 2]);
      this.fx.push([FX.revive, this.players.indexOf(p)]);
      return;
    }
    if (p.relics.includes("zmey") && !p.heartUsed && p.hp - d <= 0) {
      p.heartUsed = true;
      p.hp = p.maxHp * 0.5;
      p.invulnT = 2;
      this.explode(p, p.x, p.y, 220 * p.st.area, this.skillDmg(p, 60), 3, -4, 0.8);
      this.fx.push([FX.banner, `❤️‍🔥 Сърцето на Змея връща ${p.name}!`, 2]);
      this.fx.push([FX.revive, this.players.indexOf(p)]);
      return;
    }
    p.hp -= d;
    p.invulnT = 0.45;
    p.hurtT = 0.25;
    this.sinceHit = 0;
    if (this.task?.kind === "nohit" && this.task.state === 0) this.task.progress = 0;
    this.fx.push([FX.hurt, this.players.indexOf(p)]);
    if (p.hp <= 0) this.down(p);
  }

  private down(p: Player) {
    p.hp = 0;
    p.dead = true;
    p.reviveP = 0;
    this.fx.push([FX.down, this.players.indexOf(p)]);
    if (this.alive.length > 0) return;
    // everyone is down: a "second birth" saves the one who has it
    const saver = this.players.find((q) => !q.gone && q.revivals > 0);
    if (saver) {
      saver.revivals--;
      this.revive(saver, 1);
      this.fx.push([FX.banner, `🕯️ Второ раждане — ${saver.name}`, 2]);
      for (const e of this.enemies) {
        if (dist2(e.x, e.y, saver.x, saver.y) < 400 * 400) this.hurt(e, e.boss || e.type === "altar" ? e.maxHp * 0.05 : 9999, null);
      }
      return;
    }
    this.over = true;
  }

  private revive(p: Player, frac: number) {
    p.dead = false;
    p.hp = Math.max(1, p.maxHp * frac);
    p.invulnT = 2;
    p.reviveP = 0;
    this.fx.push([FX.revive, this.players.indexOf(p)]);
  }

  private heal(p: Player, amount: number) {
    if (p.dead) return;
    p.hp = Math.min(p.maxHp, p.hp + amount * (this.curses.has("winter") ? 0.5 : 1));
  }

  /* ───────── co-op hooks ───────── */

  /** A guest's own position (guests move themselves; the host runs everything else). */
  setRemote(uid: string, x: number, y: number, face: number, moving: boolean, dirX: number, dirY: number, dashing: boolean, skill: number) {
    const p = this.players.find((q) => q.uid === uid);
    if (!p || p.dead || p.gone) return;
    if (Number.isFinite(x) && Number.isFinite(y)) {
      if (!p.netInit || Math.hypot(x - p.x, y - p.y) > 300) {
        p.x = x;
        p.y = y;
      }
      p.netX = x;
      p.netY = y;
      p.netInit = true;
    }
    p.face = face < 0 ? -1 : 1;
    p.moving = moving;
    if (dirX || dirY) {
      p.dirX = dirX;
      p.dirY = dirY;
    }
    if (dashing) {
      p.dashT = 0.18;
      p.invulnT = Math.max(p.invulnT, 0.25);
    }
    if (skill > p.lastSkill) {
      p.lastSkill = skill;
      this.castSkill(p);
    }
  }

  setGone(uid: string, gone: boolean) {
    const p = this.players.find((q) => q.uid === uid);
    if (!p) return;
    p.gone = gone;
    if (gone) {
      this.picked.add(uid);
      this.checkPicks();
      if (!this.alive.length && !this.players.every((q) => q.gone)) this.over = true;
    }
  }

  /* ───────── the step ───────── */

  step(dt: number, inputs: Map<string, Input>) {
    if (this.over || (this.choosing && this.pauseOnLevel)) return;
    dt = Math.min(dt, 0.05);
    if (this.choosing) {
      // co-op: whoever still has cards open can't be hurt meanwhile
      for (const p of this.players) if (!p.gone && !p.dead && !this.picked.has(p.uid)) p.buffs.shield = Math.max(p.buffs.shield, 0.2);
    }
    this.t += dt;
    this.shatterT = Math.max(0, this.shatterT - dt);
    if (this.streakT > 0) {
      this.streakT -= dt;
      if (this.streakT <= 0) {
        this.bestStreak = Math.max(this.bestStreak, this.streak);
        this.streak = 0;
      }
    }

    for (const p of this.players) this.stepPlayer(p, dt, inputs.get(p.uid));
    this.director(dt);
    if (this.mission) {
      if (this.won) {
        this.winT -= dt;
        if (this.winT <= 0) this.over = true;
      } else if (this.missionPhase < 2 && this.t >= MISSION_SECONDS) {
        const p = pickOne(this.alive.length ? this.alive : this.players);
        const [x, y] = this.spawnPoint(p, 500);
        this.summonFinal(x, y, true);
      }
      if (this.finalBoss && !this.finalBoss.dead) this.boss = this.finalBoss;
    }
    if (this.task?.kind === "nohit" && this.task.state === 0 && this.breakT <= 0) {
      this.sinceHit += dt;
      this.task.progress = Math.min(this.task.target, this.sinceHit);
      if (this.sinceHit >= this.task.target) this.taskDone();
    }
    this.grid.build(this.enemies);
    this.scarecrows = this.projs.filter((q) => q.kind === PK.scarecrow && !q.dead);
    this.stepEnemies(dt);
    for (const p of this.players) if (!p.dead && !p.gone) this.stepWeapons(p, dt);
    this.stepProjs(dt);
    this.stepGems(dt);
    this.stepMarks(dt);

    if (this.enemies.some((e) => e.dead)) this.enemies = this.enemies.filter((e) => !e.dead);
    if (this.projs.some((q) => q.dead)) this.projs = this.projs.filter((q) => !q.dead);

    if (this.xp >= this.xpNext) {
      while (this.xp >= this.xpNext) {
        this.xp -= this.xpNext;
        this.level++;
        this.pendingLevels++;
        this.xpNext = xpFor(this.level, this.players.length);
      }
      this.fx.push([FX.level, this.level]);
      if (!this.choosing) this.openOffers();
    }
  }

  private stepPlayer(p: Player, dt: number, inp: Input | undefined) {
    if (p.gone) return;
    p.hurtT = Math.max(0, p.hurtT - dt);
    p.invulnT = Math.max(0, p.invulnT - dt);
    p.dashCd = Math.max(0, p.dashCd - dt);
    p.skillCd = Math.max(0, p.skillCd - dt);
    const wasSkill = p.skillT;
    p.skillT = Math.max(0, p.skillT - dt);
    if (wasSkill > 0 && p.skillT === 0 && !p.dead) {
      if (p.hero === "strahil") {
        // the end of the whirlwind: 12 axes in every direction
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          this.addProj(p, PK.bigAxe, p.x, p.y - 8, Math.cos(a) * 520, Math.sin(a) * 520, {
            dmg: this.skillDmg(p, 90),
            pierce: 999,
            life: 1.1,
            r: 30,
            hitCd: 0.4,
            knock: 220,
            stun: 0.4,
            d: [i % 2 ? 1 : -1, i % 2 ? 1 : -1],
          });
        }
      } else if (p.hero === "tseko") {
        const r = 320 * p.st.area;
        this.fx.push([FX.boom, Math.round(p.x), Math.round(p.y), Math.round(r), 5]);
        this.fx.push([FX.boom, Math.round(p.x), Math.round(p.y), Math.round(r * 0.6), 0]);
        for (const e of this.within(p.x, p.y, r)) {
          this.hurt(e, this.skillDmg(p, 220), p, e.x - p.x, e.y - p.y, 600);
          if (!e.boss) e.stunT = Math.max(e.stunT, 1.2);
        }
      }
    }
    const b = p.buffs;
    const hadBuff = b.might > 0 || b.speed > 0 || b.cheers > 0;
    for (const k of Object.keys(b) as (keyof typeof b)[]) b[k] = Math.max(0, b[k] - dt);
    if (hadBuff !== (b.might > 0 || b.speed > 0 || b.cheers > 0)) this.refreshStats(p);
    p.herbs = b.herbs > 0 && p.hero === "stana";

    if (p.dead) {
      // a teammate standing next to you brings you back
      const helper = this.alive.find((q) => dist2(q.x, q.y, p.x, p.y) < 60 * 60);
      p.reviveP = helper ? p.reviveP + dt / 3 : Math.max(0, p.reviveP - dt / 6);
      if (p.reviveP >= 1) this.revive(p, 0.5);
      return;
    }

    if (p.st.regen > 0) this.heal(p, p.st.regen * dt);
    if (b.herbs > 0) this.heal(p, p.maxHp * 0.05 * dt);
    this.stepGifts(p, dt);
    const dashing = p.dashT > 0;

    if (!p.remote && inp) {
      let mx = inp.mx;
      let my = inp.my;
      const len = Math.hypot(mx, my);
      if (len > 1) {
        mx /= len;
        my /= len;
      }
      p.moving = len > 0.05;
      if (p.moving) {
        const dl = Math.hypot(mx, my) || 1;
        p.dirX = mx / dl;
        p.dirY = my / dl;
        if (Math.abs(mx) > 0.1) p.face = mx < 0 ? -1 : 1;
      }
      if (inp.dash > p.lastDash) {
        p.lastDash = inp.dash;
        if (p.dashCd <= 0) {
          p.dashT = 0.18;
          p.dashCd = 2.2;
          p.invulnT = Math.max(p.invulnT, 0.3);
          p.dvx = p.dirX * 900;
          p.dvy = p.dirY * 900;
          this.fx.push([FX.dash, this.players.indexOf(p)]);
        }
      }
      if (inp.skill > p.lastSkill) {
        p.lastSkill = inp.skill;
        this.castSkill(p);
      }
      const sp = BASE_SPEED * p.st.speed;
      if (p.dashT > 0) {
        p.dashT -= dt;
        p.x += p.dvx * dt;
        p.y += p.dvy * dt;
        if (p.dashT <= 0) this.dashEnd(p);
      } else {
        p.x += mx * sp * dt;
        p.y += my * sp * dt;
      }
    } else if (p.remote) {
      p.dashT = Math.max(0, p.dashT - dt);
      if (dashing && p.dashT <= 0) this.dashEnd(p);
      if (p.netInit) {
        // predict along the way it walks, then glide towards it
        if (p.moving) {
          const sp = p.dashT > 0 ? 900 : BASE_SPEED * p.st.speed;
          p.netX += p.dirX * sp * dt;
          p.netY += p.dirY * sp * dt;
        }
        const k = Math.min(1, dt * 14);
        p.x += (p.netX - p.x) * k;
        p.y += (p.netY - p.y) * k;
      }
    }

    // skill effects over time
    if (p.storm > 0 && p.hero === "gosho") {
      p.stormT -= dt;
      if (p.stormT <= 0) {
        p.stormT = 0.55;
        p.storm--;
        this.fx.push([FX.boom, Math.round(p.x), Math.round(p.y), 450, 1]);
        for (const e of this.enemies) {
          if (e.dead || e.type === "pot" || dist2(e.x, e.y, p.x, p.y) > 450 * 450) continue;
          e.stunT = e.boss ? 0.5 : 2.2;
          this.hurt(e, this.skillDmg(p, 60), p, e.x - p.x, e.y - p.y, 600);
        }
      }
    } else if (p.storm > 0) {
      p.stormT -= dt;
      if (p.stormT <= 0) {
        p.stormT = 0.08;
        p.storm--;
        const near = this.enemies.filter((e) => !e.dead && e.type !== "pot" && dist2(e.x, e.y, p.x, p.y) < 650 * 650);
        if (near.length) {
          const t = pickOne(near);
          this.fx.push([FX.bolt, Math.round(t.x + rand(-40, 40)), Math.round(t.y - 500), Math.round(t.x), Math.round(t.y)]);
          this.fx.push([FX.boom, Math.round(t.x), Math.round(t.y), 60, 4]);
          const dmg = this.skillDmg(p, 90);
          this.grid.each(t.x, t.y, 70, (e) => {
            if (dist2(e.x, e.y, t.x, t.y) < 70 * 70) this.hurt(e, e === t ? dmg : dmg * 0.5, p);
          });
        }
      }
    }
    if (p.skillT > 0 && p.hero === "tseko") {
      // Брейк на главата: a vortex — pulls the crowd in, grinds what's close, a shock ring every second
      const inner = 190 * p.st.area;
      const outer = 400 * p.st.area;
      const dmg = this.skillDmg(p, 60);
      this.grid.each(p.x, p.y, outer, (e) => {
        const d2 = dist2(e.x, e.y, p.x, p.y);
        if (d2 > outer * outer) return;
        if (d2 < inner * inner) {
          if (Math.random() < dt * 6) this.hurt(e, dmg, p, e.x - p.x, e.y - p.y, 60);
        } else if (!e.boss && e.type !== "altar" && e.type !== "pot") {
          const d = Math.sqrt(d2) || 1;
          e.x += ((p.x - e.x) / d) * 190 * dt;
          e.y += ((p.y - e.y) / d) * 190 * dt;
        }
      });
      if (Math.floor(p.skillT) !== Math.floor(p.skillT + dt)) {
        this.fx.push([FX.boom, Math.round(p.x), Math.round(p.y), Math.round(inner * 1.3), 5]);
        for (const e of this.within(p.x, p.y, inner * 1.3)) this.hurt(e, this.skillDmg(p, 70), p, e.x - p.x, e.y - p.y, 160);
      }
    }
    if (p.volley > 0 && p.hero === "gitsa") {
      // Тава баница: rings of hot banitsas, each one wider
      p.volleyT -= dt;
      if (p.volleyT <= 0) {
        const ring = 3 - p.volley;
        p.volley--;
        p.volleyT = 0.55;
        const n = 16 + ring * 4;
        const R = (230 + ring * 130) * p.st.area;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + ring * 0.2;
          const tx = p.x + Math.cos(a) * R;
          const ty = p.y + Math.sin(a) * R;
          this.addProj(p, PK.banitsa, p.x, p.y, 0, 0, { dmg: this.skillDmg(p, 110), pierce: 999, life: 1.1, r: 20, d: [p.x, p.y, tx, ty, 110 * p.st.area, 0], hitCd: 0.3 });
        }
      }
    }
    if (p.skillT > 0 && p.hero === "strahil") {
      // Вихър от брадви: grinds everything close, pulls the rest in
      const dmg = this.skillDmg(p, 55);
      this.grid.each(p.x, p.y, 330, (e) => {
        const d2 = dist2(e.x, e.y, p.x, p.y);
        if (d2 > 330 * 330) return;
        if (d2 < 175 * 175) {
          if (Math.random() < dt * 5) this.hurt(e, dmg, p, e.x - p.x, e.y - p.y, 90);
        } else if (!e.boss) {
          const d = Math.sqrt(d2) || 1;
          e.x += ((p.x - e.x) / d) * 150 * dt;
          e.y += ((p.y - e.y) / d) * 150 * dt;
        }
      });
    }
    if (p.buffs.herbs > 0 && p.hero === "stana") {
      // a cloud of bitter herbs poisons everything near
      const dmg = this.skillDmg(p, 30);
      this.grid.each(p.x, p.y, 230, (e) => {
        if (dist2(e.x, e.y, p.x, p.y) < 230 * 230 && Math.random() < dt * 2.5) {
          this.hurt(e, dmg, p);
          e.slowT = Math.max(e.slowT, 0.6);
        }
      });
    }
  }

  /** skill damage: might + grows with the wave (enemies get tougher every wave) */
  /** ⚡ Гръмовен скок */
  private dashEnd(p: Player) {
    if (p.relics.includes("karak")) this.explode(p, p.x, p.y, 120 * p.st.area, this.skillDmg(p, 30), 3, -4, 0.3);
    const l = p.gifts.perun_dash ?? 0;
    if (!l) return;
    const r = (90 + 20 * l) * p.st.area;
    this.explode(p, p.x, p.y, r, (30 + 25 * l) * p.st.might * (p.blessed.has("perun") ? 1.5 : 1), 4, -3, 0.4);
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * Math.PI * 2;
      this.fx.push([FX.bolt, Math.round(p.x), Math.round(p.y - 300), Math.round(p.x + Math.cos(a) * r * 0.6), Math.round(p.y + Math.sin(a) * r * 0.5)]);
    }
  }

  private skillDmg(p: Player, base: number) {
    return base * p.st.might * (1 + this.wave * 0.14) * (1 + (p.gear.skillDmg ?? 0) / 100);
  }

  castSkill(p: Player) {
    if (p.dead || p.skillCd > 0) return;
    const def = HEROES[p.hero].skill;
    p.skillCd = def.cd * Math.max(0.5, 1 - (p.gear.skillCd ?? 0) / 100);
    const pi = this.players.indexOf(p);
    this.fx.push([FX.skill, pi, Math.round(p.x), Math.round(p.y), HEROES_ORDER.indexOf(p.hero)]);
    this.fx.push([FX.text, Math.round(p.x), Math.round(p.y - 40), `✨ ${def.name}!`, "#ffe27a"]);
    switch (p.hero) {
      case "peyo": {
        for (const dir of [1, -1]) {
          for (let i = 0; i < 12; i++) {
            const y = p.y + (i - 6) * 44 + rand(-12, 12);
            this.addProj(p, PK.sheep, p.x - dir * (680 + rand(0, 160)), y, dir * 560, 0, { dmg: this.skillDmg(p, 70), pierce: 999, life: 3.4, r: 22, knock: 300, hitCd: 0.4 });
          }
        }
        break;
      }
      case "tseko":
        p.skillT = 6;
        p.buffs.speed = Math.max(p.buffs.speed, 6);
        this.refreshStats(p);
        break;
      case "nikola":
        p.storm = 30;
        p.stormT = 0;
        break;
      case "gitsa":
        // a feast: everyone healed / back up, +60% damage and +30% speed for 8 s, three rings of banitsas
        for (const q of this.players) {
          if (q.gone) continue;
          if (q.dead) this.revive(q, 0.6);
          else this.heal(q, q.maxHp * 0.6);
          q.buffs.cheers = Math.max(q.buffs.cheers, 8);
          this.refreshStats(q);
        }
        p.volley = 3;
        p.volleyT = 0;
        break;
      case "strahil":
        // Вихър от брадви: 5 s of spinning with two big axes (see stepPlayer), 12 axes at the end
        p.skillT = 5;
        this.fx.push([FX.boom, Math.round(p.x), Math.round(p.y), 180, 5]);
        break;
      case "vela":
        this.shatterT = 5;
        for (const e of this.enemies) {
          if (e.dead || e.type === "pot" || dist2(e.x, e.y, p.x, p.y) > 800 * 800) continue;
          e.frozenT = e.boss ? 2 : 5;
          this.hurt(e, this.skillDmg(p, 40), p);
        }
        break;
      case "gosho":
        // three waves of bells (stepPlayer, the same counter as the storm)
        p.storm = 3;
        p.stormT = 0;
        break;
      case "mitko":
        for (const q of this.players) {
          if (q.gone || q.dead) continue;
          q.buffs.cheers = 10;
          this.heal(q, q.maxHp * 0.15);
          this.refreshStats(q);
        }
        break;
      case "stana":
        p.buffs.herbs = 8;
        for (const g of this.gems) if (g.k <= GK.red || g.k === GK.coin || g.k === GK.bag) g.mag = true;
        break;
    }
  }

  private stepEnemies(dt: number) {
    const alive = this.alive;
    for (const e of this.enemies) {
      if (e.dead) continue;
      e.flash = Math.max(0, e.flash - dt);
      if (e.type === "altar") continue;
      if (e.type === "pot") {
        if (!alive.some((p) => dist2(p.x, p.y, e.x, e.y) < 1600 * 1600)) e.dead = true;
        continue;
      }
      if (e.poisonT > 0) {
        e.poisonT -= dt;
        e.poison = true;
        e.hp -= e.poisonD * dt;
        const by = this.players[e.poisonBy] ?? null;
        if (by) by.dmgBy[-3] = (by.dmgBy[-3] ?? 0) + e.poisonD * dt;
        if (e.hp <= 0) {
          this.kill(e, by);
          continue;
        }
        if (e.poisonT <= 0) {
          e.poison = false;
          e.poisonD = 0;
        }
      }
      e.frozenT = Math.max(0, e.frozenT - dt);
      e.stunT = Math.max(0, e.stunT - dt);
      e.slowT = Math.max(0, e.slowT - dt);
      // knockback
      e.x += e.kx * dt;
      e.y += e.ky * dt;
      const decay = Math.exp(-dt * 9);
      e.kx *= decay;
      e.ky *= decay;

      // elite affixes
      if (e.affix >= 0) {
        const af = AFFIXES[e.affix] as AffixId;
        if (af === "tireless") e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.03 * dt);
        if (af === "leader") {
          e.ai2 -= dt;
          if (e.ai2 <= 0) {
            e.ai2 = 5;
            for (let i = 0; i < 3; i++) this.spawn(e.type, e.x + rand(-40, 40), e.y + rand(-40, 40));
          }
        }
      }

      if (e.life > 0) {
        e.life -= dt;
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        if (e.life <= 0) e.dead = true;
        this.touch(e);
        continue;
      }

      // nearest living player
      let tgt: Player | null = null;
      let best = Infinity;
      for (const p of alive) {
        const d = dist2(p.x, p.y, e.x, e.y);
        if (d < best) {
          best = d;
          tgt = p;
        }
      }
      if (!tgt) continue;
      const dist = Math.sqrt(best);

      // too far from everyone: come back around somebody
      if (!e.boss && !e.stay && dist > DESPAWN_R) {
        const [x, y] = this.spawnPoint();
        e.x = x;
        e.y = y;
        continue;
      }
      if (e.frozenT > 0 || e.stunT > 0) continue;

      let gx = tgt.x;
      let gy = tgt.y;
      // a scarecrow nearby pulls them in instead
      if (!e.boss && this.scarecrows.length) {
        for (const s of this.scarecrows) {
          if (dist2(s.x, s.y, e.x, e.y) < 280 * 280) {
            gx = s.x;
            gy = s.y;
            break;
          }
        }
      }
      const gd = Math.hypot(gx - e.x, gy - e.y) || 1;
      const dx = (gx - e.x) / gd;
      const dy = (gy - e.y) / gd;
      let sp = e.speed * (e.slowT > 0 ? 0.5 : 1);
      let mx = dx;
      let my = dy;
      e.ai -= dt;

      if (e.boss) {
        const tx = (tgt.x - e.x) / (dist || 1);
        const ty = (tgt.y - e.y) / (dist || 1);
        this.bossAI(e, tgt, tx, ty, dist, dt);
        this.touch(e);
        continue;
      }

      if (e.type === "bat" || e.type === "raven") {
        const w = Math.sin(this.t * (e.type === "raven" ? 4 : 6) + e.id) * 0.8;
        mx = dx - dy * w;
        my = dy + dx * w;
      } else if (e.type === "spider") {
        // scuttles in bursts
        sp *= Math.sin(this.t * 5 + e.id) > 0 ? 1.5 : 0.35;
        const w = Math.sin(this.t * 2 + e.id) * 0.6;
        mx = dx - dy * w;
        my = dy + dx * w;
      } else if (e.type === "witch" || e.type === "yuda" || e.type === "firespirit") {
        const keep = e.type === "yuda" ? 250 : e.type === "firespirit" ? 200 : 220;
        if (dist < keep) {
          mx = -dx;
          my = -dy;
        } else if (dist < keep + 100) {
          mx = -dy;
          my = dx;
          sp *= 0.5;
        }
        if (e.ai <= 0 && dist < 460) {
          e.ai = e.type === "yuda" ? 2.4 : e.type === "firespirit" ? 2.8 : 3;
          const tx = (tgt.x - e.x) / (dist || 1);
          const ty = (tgt.y - e.y) / (dist || 1);
          this.enemyShot(e, tx, ty, e.type === "yuda" ? 240 : 210, e.type === "firespirit" ? PK.eball : PK.ebolt, 9);
        }
      }

      const ml = Math.hypot(mx, my) || 1;
      e.x += (mx / ml) * sp * dt;
      e.y += (my / ml) * sp * dt;
      if (Math.abs(dx) > 0.15) e.face = dx < 0 ? -1 : 1;

      // keep apart (cheap: a few neighbours)
      if (!ENEMIES[e.type].ghost) {
        let n = 0;
        this.grid.each(e.x, e.y, e.r * 2, (o) => {
          if (o === e || ENEMIES[o.type].ghost || o.type === "pot" || o.type === "altar") return;
          const ox = e.x - o.x;
          const oy = e.y - o.y;
          const rr = e.r + o.r;
          const d2 = ox * ox + oy * oy;
          if (d2 < rr * rr && d2 > 0.01) {
            const d = Math.sqrt(d2);
            const push = ((rr - d) / d) * 0.5 * (o.boss ? 1.6 : 1);
            e.x += ox * push * 0.5;
            e.y += oy * push * 0.5;
          }
          if (++n > 8) return false;
        });
      }
      this.touch(e);
    }
  }

  /** contact damage */
  private touch(e: Enemy) {
    if (e.frozenT > 0 || e.stunT > 0 || e.dmg <= 0) return;
    for (const p of this.players) {
      if (p.dead || p.gone) continue;
      const rr = e.r + PLAYER_R - 4;
      if (dist2(p.x, p.y, e.x, e.y) < rr * rr) this.hurtPlayer(p, e.dmg);
    }
  }

  private enemyShot(e: { x: number; y: number }, dx: number, dy: number, speed: number, kind: number, dmg: number, life = 5) {
    this.projs.push({
      id: this.nextId++,
      kind,
      x: e.x,
      y: e.y,
      a: Math.atan2(dy, dx),
      r: kind === PK.eball ? 11 : kind === PK.poison ? 58 : kind === PK.tornado ? 26 : kind === PK.rock ? 12 : 8,
      owner: -1,
      vx: dx * speed,
      vy: dy * speed,
      dmg: dmg * this.dmgMul(),
      pierce: 1,
      life,
      maxLife: life,
      hits: new Map(),
      hitCd: 0,
      enemy: true,
      knock: 0,
      stun: 0,
      slow: 0,
      crit: 2,
      d: [],
      weapon: -1,
      dead: false,
    });
  }

  /** the boss's two extra moves + rage under half health; true = busy (skip its normal attacks this frame) */
  private bossExtras(e: Enemy, tgt: Player, dt: number): boolean {
    e.shieldT = Math.max(0, e.shieldT - dt);
    e.shield = e.shieldT > 0;
    if (!e.rage && e.hp < e.maxHp * (this.diff >= 3 ? 0.7 : 0.5)) {
      e.rage = true;
      e.speed *= 1.35;
      this.fx.push([FX.banner, `😡 ${ENEMIES[e.type].name} побесня!`, 1]);
      this.fx.push([FX.boom, Math.round(e.x), Math.round(e.y), 120, 7]);
    }
    // a move being wound up (the warning mark is on the ground)
    if (e.pending) {
      const pm = e.pending;
      pm.t -= dt;
      if (pm.move === "spiral") {
        // stands and spins arms of shots (x = angle, y = shot timer)
        pm.y -= dt;
        if (pm.y <= 0) {
          pm.y = e.rage ? 0.07 : 0.09;
          pm.x += 0.23;
          const arms = e.rage ? 4 : 3;
          for (let k = 0; k < arms; k++) {
            const a = pm.x + (k * Math.PI * 2) / arms;
            this.enemyShot(e, Math.cos(a), Math.sin(a), 175, PK.ebolt, 11, 4);
          }
        }
        if (pm.t > 0) return true;
        e.pending = null;
        return false;
      }
      if (pm.t > 0) return pm.move === "leap" || pm.move === "nova";
      e.pending = null;
      if (pm.move === "leap") {
        e.x = pm.x;
        e.y = pm.y;
        this.fx.push([FX.boom, Math.round(pm.x), Math.round(pm.y), 110, 5]);
        for (const p of this.alive) if (dist2(p.x, p.y, pm.x, pm.y) < (110 + PLAYER_R) ** 2) this.hurtPlayer(p, e.dmg * (this.wave <= 10 ? 1 : 1.3));
      } else if (pm.move === "nova") {
        this.fx.push([FX.boom, Math.round(e.x), Math.round(e.y), 210, 3]);
        for (const p of this.alive) if (dist2(p.x, p.y, e.x, e.y) < (210 + PLAYER_R) ** 2) this.hurtPlayer(p, e.dmg * 1.5);
      } else if (pm.move === "blink") {
        this.fx.push([FX.boom, Math.round(e.x), Math.round(e.y), 70, 7]);
        e.x = pm.x;
        e.y = pm.y;
        this.fx.push([FX.boom, Math.round(e.x), Math.round(e.y), 80, 7]);
        for (const p of this.alive) if (dist2(p.x, p.y, e.x, e.y) < (80 + PLAYER_R) ** 2) this.hurtPlayer(p, e.dmg);
        const n = e.rage ? 20 : 14;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          this.enemyShot(e, Math.cos(a), Math.sin(a), 200, PK.ebolt, 11);
        }
      }
      return false;
    }
    e.exT -= dt;
    if (e.exT > 0) return false;
    // the first bosses cast less often (you learn them first)
    e.exT = ((e.rage ? 4 : 6.5) + rand(0, 1.5) + (this.wave <= 10 ? 2.5 : 0)) * (1 - 0.035 * this.diff);
    const spells = BOSS_SPELLS[e.type] ?? [];
    const move = pickOne(e.moves);
    const name = spells.find((m) => m[0] === move)?.[1] || DIFF_SPELL_NAMES[move] || "💥";
    this.fx.push([FX.text, Math.round(e.x), Math.round(e.y - e.r - 24), `${name}!`, "#ff8a6a"]);
    switch (move) {
      case "spiral":
        e.pending = { move, t: e.rage ? 3 : 2.4, x: Math.random() * 6, y: 0 };
        return true;
      case "blink": {
        const a = Math.random() * Math.PI * 2;
        const x = tgt.x + Math.cos(a) * 200;
        const y = tgt.y + Math.sin(a) * 200;
        e.pending = { move, t: 0.8, x, y };
        this.marks.push({ kind: MK.leap, x, y, r: 80, p: 0, t: 0.8, a: 0.8 });
        return false;
      }
      case "wall": {
        // a row of shots across your way with one gap — find it
        const ddx = tgt.x - e.x;
        const ddy = tgt.y - e.y;
        const dl = Math.hypot(ddx, ddy) || 1;
        const ux = ddx / dl;
        const uy = ddy / dl;
        const cx = tgt.x - ux * 420;
        const cy = tgt.y - uy * 420;
        const n = 19;
        const gap = Math.floor(rand(3, n - 5));
        const walls = e.rage ? 2 : 1;
        for (let w = 0; w < walls; w++) {
          for (let i = 0; i < n; i++) {
            if (i >= gap + w * 3 - 1 && i <= gap + w * 3 + 1) continue;
            const off = (i - (n - 1) / 2) * 42;
            this.enemyShot({ x: cx - uy * off - ux * w * 160, y: cy + ux * off - uy * w * 160 }, ux, uy, 170, PK.eball, 13, 5.5);
          }
        }
        return false;
      }
      case "acid":
        for (let i = 0; i < (e.rage ? 9 : 6); i++) {
          const t = 1.2 + i * 0.12;
          this.marks.push({ kind: MK.acid, x: tgt.x + rand(-200, 200), y: tgt.y + rand(-160, 160), r: 58, p: 0, t, a: t });
        }
        return false;
      case "leap":
        e.pending = { move, t: 1.1, x: tgt.x, y: tgt.y };
        this.marks.push({ kind: MK.leap, x: tgt.x, y: tgt.y, r: 110, p: 0, t: 1.1, a: 1.1 });
        return true;
      case "nova":
        e.pending = { move, t: 1.3, x: e.x, y: e.y };
        this.marks.push({ kind: MK.nova, x: e.x, y: e.y, r: 210, p: 0, t: 1.3, a: 1.3 });
        return true;
      case "firering": {
        // a ring of fire that closes in on you — dash through it
        const n = e.rage ? 30 : 24;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          const sx = tgt.x + Math.cos(a) * 430;
          const sy = tgt.y + Math.sin(a) * 430;
          this.enemyShot({ x: sx, y: sy }, -Math.cos(a), -Math.sin(a), 150, PK.eball, 13, 4.2);
        }
        return false;
      }
      case "meteors":
        for (let i = 0; i < (e.rage ? 12 : 8); i++) this.marks.push({ kind: MK.hail, x: tgt.x + rand(-220, 220), y: tgt.y + rand(-170, 170), r: 48, p: 0, t: 1 + i * 0.1, a: 1 + i * 0.1 });
        return false;
      case "shield":
        e.shieldT = e.rage ? 5 : 4;
        return false;
      case "summon": {
        const mix = this.waveMix.length ? this.waveMix : (["zombie"] as EnemyId[]);
        const n = Math.round((6 + this.wave * 0.3) * (1 + 0.4 * (this.pf - 1)));
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          this.spawn(pickOne(mix), tgt.x + Math.cos(a) * 340, tgt.y + Math.sin(a) * 340);
        }
        return false;
      }
    }
    return false;
  }

  private bossAI(e: Enemy, tgt: Player, dx: number, dy: number, dist: number, dt: number) {
    if (this.bossExtras(e, tgt, dt)) return;
    if (e.rage) {
      // enraged: its own attacks come faster too
      e.ai -= dt * 0.5;
      e.ai2 -= dt * 0.5;
    }
    const sp = e.speed * (e.slowT > 0 ? 0.6 : 1);
    if (Math.abs(dx) > 0.15) e.face = dx < 0 ? -1 : 1;
    const walk = (k = 1) => {
      e.x += dx * sp * k * dt;
      e.y += dy * sp * k * dt;
    };
    const charge = (every: number, speed = 560) => {
      // 0 walk → 1 aim (a warning line) → 2 charge
      if (e.state === 0 && e.ai <= 0) {
        e.state = 1;
        e.ai = 0.8;
        e.tx = dx;
        e.ty = dy;
        this.marks.push({ kind: MK.charge, x: e.x, y: e.y, r: e.r, p: 0, t: 0.8, a: Math.atan2(dy, dx) });
        return true;
      }
      if (e.state === 1) {
        if (e.ai <= 0) {
          e.state = 2;
          e.ai = 0.75;
        }
        return true;
      }
      if (e.state === 2) {
        e.x += e.tx * speed * dt;
        e.y += e.ty * speed * dt;
        if (e.ai <= 0) {
          e.state = 0;
          e.ai = every;
        }
        return true;
      }
      return false;
    };
    const ring = (n: number, speed: number, kind: number, dmg: number, off = 0) => {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + off;
        this.enemyShot(e, Math.cos(a), Math.sin(a), speed, kind, dmg);
      }
    };
    const fan = (n: number, spread: number, speed: number, kind: number, dmg: number) => {
      const base = Math.atan2(dy, dx);
      for (let i = 0; i < n; i++) {
        const a = base + (i - (n - 1) / 2) * spread;
        this.enemyShot(e, Math.cos(a), Math.sin(a), speed, kind, dmg);
      }
    };
    e.ai2 -= dt;
    switch (e.type) {
      case "karak":
        if (charge(3.8)) return;
        walk();
        return;
      case "mora": {
        if (dist < 240) walk(-1);
        else if (dist > 320) walk();
        else {
          e.x += -dy * sp * 0.6 * dt;
          e.y += dx * sp * 0.6 * dt;
        }
        if (e.ai <= 0) {
          e.ai = 2.3;
          e.state = (e.state + 1) % 4;
          ring(16, 170, PK.ebolt, 10, e.state * 0.2);
          if (e.state === 0) for (let i = 0; i < 6; i++) this.spawn("bat", e.x + rand(-60, 60), e.y + rand(-60, 60));
        }
        return;
      }
      case "lamia":
        walk();
        if (e.ai <= 0) {
          e.ai = 2;
          fan(5, 0.22, 230, PK.eball, 14);
        }
        return;
      case "zmey": {
        if (charge(5.5)) return;
        // circles around its target and spits fire
        const ang = Math.atan2(e.y - tgt.y, e.x - tgt.x) + dt * 0.9;
        const r = dist + (300 - dist) * Math.min(1, dt * 1.5);
        const mx = tgt.x + Math.cos(ang) * r - e.x;
        const my = tgt.y + Math.sin(ang) * r - e.y;
        const ml = Math.hypot(mx, my) || 1;
        const step = Math.min(ml, sp * 2.2 * dt);
        e.x += (mx / ml) * step;
        e.y += (my / ml) * step;
        if (e.ai2 <= 0) {
          e.ai2 = 2.2;
          fan(3, 0.18, 260, PK.eball, 16);
        }
        return;
      }
      case "hala":
        // a storm: drifts after you, sends whirlwinds and hail
        walk(0.8);
        if (e.ai <= 0) {
          e.ai = 1.6;
          this.enemyShot(e, dx, dy, 90, PK.tornado, 12, 6);
        }
        if (e.ai2 <= 0) {
          e.ai2 = 4;
          for (let i = 0; i < 7; i++) this.marks.push({ kind: MK.hail, x: tgt.x + rand(-220, 220), y: tgt.y + rand(-180, 180), r: 44, p: 0, t: 1.1 + i * 0.08, a: 1.1 + i * 0.08 });
        }
        return;
      case "chuma":
        // the plague: slow, leaves poison, brings rats
        walk(0.9);
        if (e.ai <= 0) {
          e.ai = 1.8;
          this.enemyShot(e, 0, 0, 0, PK.poison, 8, 7);
          fan(3, 0.3, 190, PK.ebolt, 10);
        }
        if (e.ai2 <= 0) {
          e.ai2 = 6;
          for (let i = 0; i < 8; i++) this.spawn("rat", e.x + rand(-80, 80), e.y + rand(-80, 80));
        }
        return;
      case "wolfking":
        if (e.ai2 <= 0) {
          e.ai2 = 7;
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            this.spawn("wolf", tgt.x + Math.cos(a) * 420, tgt.y + Math.sin(a) * 420);
          }
          this.fx.push([FX.text, Math.round(e.x), Math.round(e.y - 50), "🐺 Ауууу!", "#ff8a6a"]);
        }
        if (charge(3, 640)) return;
        walk();
        return;
      case "vampking":
        // blinks next to you, then a fan of bats
        if (e.ai <= 0) {
          e.ai = 4.2;
          this.fx.push([FX.boom, Math.round(e.x), Math.round(e.y), 60, 7]);
          const a = Math.random() * Math.PI * 2;
          e.x = tgt.x + Math.cos(a) * 260;
          e.y = tgt.y + Math.sin(a) * 260;
          this.fx.push([FX.boom, Math.round(e.x), Math.round(e.y), 60, 7]);
          e.ai2 = 0.6;
          e.state = 1;
        }
        if (e.state === 1 && e.ai2 <= 0) {
          e.state = 0;
          fan(9, 0.16, 250, PK.batshot, 14);
        }
        walk(0.7);
        return;
      case "ispolin":
        // the giant: slow, stamps the ground (a ring of rocks) and throws boulders at you
        walk(0.9);
        if (e.ai <= 0) {
          e.ai = 3.4;
          this.fx.push([FX.boom, Math.round(e.x), Math.round(e.y + 20), 140, 5]);
          ring(14, 210, PK.rock, 16, Math.random());
        }
        if (e.ai2 <= 0) {
          e.ai2 = 5;
          for (let i = 0; i < 5; i++) this.marks.push({ kind: MK.hail, x: tgt.x + rand(-150, 150), y: tgt.y + rand(-120, 120), r: 50, p: 0, t: 1.2 + i * 0.12, a: 1.2 + i * 0.12 });
        }
        return;
      case "samqueen":
        // the samodiva queen: dances around, blinks, a ring of thorns, calls the юди
        e.x += -dy * sp * dt + dx * sp * 0.3 * dt;
        e.y += dx * sp * dt + dy * sp * 0.3 * dt;
        if (e.ai <= 0) {
          e.ai = 2.6;
          ring(18, 180, PK.ebolt, 11, this.t);
        }
        if (e.ai2 <= 0) {
          e.ai2 = 8;
          this.fx.push([FX.boom, Math.round(e.x), Math.round(e.y), 60, 4]);
          const a = Math.random() * Math.PI * 2;
          e.x = tgt.x + Math.cos(a) * 300;
          e.y = tgt.y + Math.sin(a) * 300;
          for (let i = 0; i < 4; i++) this.spawn("yuda", e.x + rand(-60, 60), e.y + rand(-60, 60));
        }
        return;
      case "swampking":
        walk(0.8);
        if (e.ai <= 0) {
          e.ai = 1.6;
          this.enemyShot({ x: e.x + rand(-60, 60), y: e.y + rand(-40, 40) }, 0, 0, 0, PK.poison, 9, 8);
          fan(7, 0.15, 200, PK.ebolt, 11);
        }
        if (e.ai2 <= 0) {
          e.ai2 = 10;
          for (let i = 0; i < 3; i++) this.spawn("blatnik", e.x + rand(-80, 80), e.y + rand(-80, 80));
        }
        return;
      case "kukerchief":
        if (e.ai2 <= 0) {
          e.ai2 = 9;
          const n = 10;
          for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2;
            this.spawn("kuker", tgt.x + Math.cos(a) * 380, tgt.y + Math.sin(a) * 380);
          }
          // the bells: a shock wave of fire balls
          ring(20, 170, PK.eball, 12, 0);
        }
        if (charge(3.2, 600)) return;
        walk();
        return;
      case "ghostking": {
        // drifts through everything and spins a spiral of ghost bolts
        walk(0.7);
        e.tx += dt;
        if (e.tx > 0.22 && Math.sin(this.t * 0.8) > -0.2) {
          e.tx = 0;
          const a = this.t * 3.1;
          for (let k = 0; k < 3; k++) this.enemyShot(e, Math.cos(a + (k * Math.PI * 2) / 3), Math.sin(a + (k * Math.PI * 2) / 3), 170, PK.ebolt, 10);
        }
        if (e.ai2 <= 0) {
          e.ai2 = 7;
          for (let i = 0; i < 6; i++) this.spawn("ghost", e.x + rand(-80, 80), e.y + rand(-80, 80));
        }
        return;
      }
      case "bearking":
        if (e.ai2 <= 0) {
          e.ai2 = 6;
          // the roar: pushes and hurts everyone close
          this.fx.push([FX.boom, Math.round(e.x), Math.round(e.y), 220, 5]);
          this.fx.push([FX.text, Math.round(e.x), Math.round(e.y - 60), "🐻 РРРРААА!", "#ff8a6a"]);
          for (const pl of this.alive) if (dist2(pl.x, pl.y, e.x, e.y) < 220 * 220) this.hurtPlayer(pl, e.dmg * 0.8);
          if (Math.random() < 0.5) for (let i = 0; i < 2; i++) this.spawn("bear", e.x + rand(-100, 100), e.y + rand(-100, 100));
        }
        if (charge(4, 520)) return;
        walk();
        return;
      // ── the missions' giants ──
      case "velikan":
        // the Balkan giant: stamps (a ring of rocks), boulders from the sky, charges when enraged
        if (e.rage && charge(5, 480)) return;
        walk(0.9);
        if (e.ai <= 0) {
          e.ai = 3;
          this.fx.push([FX.boom, Math.round(e.x), Math.round(e.y + 20), 170, 5]);
          ring(18, 220, PK.rock, 18, Math.random());
        }
        if (e.ai2 <= 0) {
          e.ai2 = 4.5;
          for (let i = 0; i < 7; i++) this.marks.push({ kind: MK.hail, x: tgt.x + rand(-170, 170), y: tgt.y + rand(-130, 130), r: 56, p: 0, t: 1.2 + i * 0.12, a: 1.2 + i * 0.12 });
        }
        return;
      case "gorskicar":
        // the forest king: charges through the trees, thorns, his wolves
        if (e.ai2 <= 0) {
          e.ai2 = 6;
          for (let i = 0; i < 4 + this.pf; i++) this.spawn("wolf", e.x + rand(-90, 90), e.y + rand(-90, 90));
          fan(11, 0.13, 260, PK.ebolt, 13);
        }
        if (charge(3.4, 620)) return;
        walk();
        return;
      case "blatnamaika":
        // the swamp mother: poison everywhere, a fan of slime, her children
        walk(0.6);
        if (e.ai <= 0) {
          e.ai = 1.4;
          for (let i = 0; i < 2; i++) this.enemyShot({ x: tgt.x + rand(-160, 160), y: tgt.y + rand(-120, 120) }, 0, 0, 0, PK.poison, 10, 7);
          fan(9, 0.14, 210, PK.ebolt, 12);
        }
        if (e.ai2 <= 0) {
          e.ai2 = 9;
          for (let i = 0; i < 3; i++) this.spawn("blatnik", e.x + rand(-100, 100), e.y + rand(-100, 100));
          for (let i = 0; i < 6; i++) this.spawn("zombie", e.x + rand(-140, 140), e.y + rand(-140, 140));
        }
        return;
      case "ledenvelikan":
        // the ice giant: rings of ice, ice blocks from the sky, a freezing blast
        walk(0.8);
        if (e.ai <= 0) {
          e.ai = 2.4;
          ring(22, 190, PK.ebolt, 13, this.t * 0.7);
        }
        if (e.ai2 <= 0) {
          e.ai2 = 4;
          for (let i = 0; i < 6; i++) this.marks.push({ kind: MK.hail, x: tgt.x + rand(-160, 160), y: tgt.y + rand(-120, 120), r: 50, p: 0, t: 1.1 + i * 0.1, a: 1.1 + i * 0.1 });
        }
        e.tx += dt;
        if (e.tx > 8) {
          e.tx = 0;
          e.vy = 1.4;
          this.marks.push({ kind: MK.nova, x: e.x, y: e.y, r: 260, p: 0, t: 1.4, a: 1.4 });
        }
        if (e.vy > 0) {
          e.vy -= dt;
          if (e.vy <= 0) {
            this.fx.push([FX.boom, Math.round(e.x), Math.round(e.y), 260, 4]);
            for (const pl of this.alive) if (dist2(pl.x, pl.y, e.x, e.y) < 260 * 260) this.hurtPlayer(pl, e.dmg * 1.1);
          }
        }
        return;
    }
  }

  /* ───────── weapons ───────── */

  private nearest(x: number, y: number, maxR: number, skip?: Set<number>): Enemy | null {
    let best: Enemy | null = null;
    let bd = maxR * maxR;
    for (const e of this.enemies) {
      if (e.dead || e.type === "pot" || skip?.has(e.id)) continue;
      const d = dist2(e.x, e.y, x, y);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  private within(x: number, y: number, r: number): Enemy[] {
    return this.enemies.filter((e) => !e.dead && e.type !== "pot" && dist2(e.x, e.y, x, y) < r * r);
  }

  private addProj(p: Player, kind: number, x: number, y: number, vx: number, vy: number, o: Partial<Proj> & { dmg: number; life: number; r: number }): Proj {
    const q: Proj = {
      id: this.nextId++,
      kind,
      x,
      y,
      a: Math.atan2(vy, vx),
      owner: this.players.indexOf(p),
      vx,
      vy,
      pierce: 1,
      maxLife: o.life,
      hits: new Map(),
      hitCd: 999,
      enemy: false,
      knock: 0,
      stun: 0,
      slow: 0,
      crit: 2,
      d: [],
      weapon: -1,
      dead: false,
      ...o,
    };
    this.projs.push(q);
    return q;
  }

  /** persistent things that circle the player (кобилица, пчели): keep exactly n of them */
  private keepCount(p: Player, kind: number, n: number, make: (i: number) => void) {
    const pi = this.players.indexOf(p);
    const mine = this.projs.filter((q) => !q.dead && q.owner === pi && q.kind === kind);
    if (mine.length === n) return;
    for (const q of mine) q.dead = true;
    for (let i = 0; i < n; i++) make(i);
  }

  private stepWeapons(p: Player, dt: number) {
    const pi = this.players.indexOf(p);
    for (const w of p.weapons) {
      w.t -= dt;
      const s = weaponStats(w.id, w.lvl);
      const cd = s.cd * Math.max(0.35, 1 - p.st.cooldown);
      const amount = s.amount + p.st.amount;
      const dmg = s.dmg * p.st.might * (w.id === HEROES[p.hero].weapon ? 1 + (p.gear.heroWeapon ?? 0) / 100 : 1);
      const area = s.area * p.st.area;
      const wi = WEAPON_IDS.indexOf(w.id);
      const face = Math.atan2(p.dirY, p.dirX);

      // Тесла's evolution: a bolt from the sky every 0.5 s on top of the chains
      if (w.id === "tesla" && w.evo) {
        w.t2 -= dt;
        if (w.t2 <= 0) {
          w.t2 = 0.5;
          const near = this.within(p.x, p.y, 600);
          if (near.length) {
            const e = pickOne(near);
            this.fx.push([FX.bolt, Math.round(e.x + rand(-30, 30)), Math.round(e.y - 420), Math.round(e.x), Math.round(e.y)]);
            this.hurt(e, dmg * 1.2, p, 0, 0, 0, 2, wi);
            e.stunT = Math.max(e.stunT, 0.3);
          }
        }
      }
      // Кобилица: spinning while "on"; its evolution never stops
      if (w.id === "kobilitsa") {
        const n = amount + (w.evo ? 2 : 0);
        if (w.evo) this.keepCount(p, PK.kob, n, (i) => this.kob(p, i, n, s, dmg * 1.4, area * 1.2, Infinity, wi));
        if (w.evo || w.t > 0) continue;
        w.t = cd + s.dur * p.st.duration;
        for (const q of this.projs) if (q.owner === pi && q.kind === PK.kob) q.dead = true;
        for (let i = 0; i < n; i++) this.kob(p, i, n, s, dmg, area, s.dur * p.st.duration, wi);
        this.fx.push([FX.fire, pi, wi]);
        continue;
      }
      // Кошер: the bees are always out
      if (w.id === "kosher") {
        const n = Math.min(24, amount * (w.evo ? 2 : 1));
        const sp = s.speed * p.st.projSpeed;
        this.keepCount(p, PK.bee, n, (i) =>
          this.addProj(p, PK.bee, p.x, p.y, 0, 0, { dmg, pierce: 999, life: Infinity, r: 6 * area, hitCd: s.cd, slow: w.evo ? 1.5 : 0, d: [(i / n) * Math.PI * 2, sp, -1], weapon: wi }),
        );
        // keep their damage up to date (levels / might)
        for (const q of this.projs) if (q.owner === pi && q.kind === PK.bee) q.dmg = dmg;
        continue;
      }
      if (w.t > 0) continue;
      w.t = cd;
      this.fx.push([FX.fire, pi, wi]);

      switch (w.id) {
        case "tsarvul": {
          const n = amount + (w.evo ? 2 : 0);
          const tgt = this.nearest(p.x, p.y, 500);
          const base = tgt ? Math.atan2(tgt.y - p.y, tgt.x - p.x) : face;
          for (let i = 0; i < n; i++) {
            const a = w.evo ? base + (i / n) * Math.PI * 2 : base + (i - (n - 1) / 2) * 0.35;
            const sp = s.speed * p.st.projSpeed;
            this.addProj(p, w.evo ? PK.bigTsarvul : PK.tsarvul, p.x, p.y, Math.cos(a) * sp, Math.sin(a) * sp, {
              dmg: dmg * (w.evo ? 1.5 : 1),
              pierce: 999,
              life: 4,
              r: 13 * area * (w.evo ? 1.5 : 1),
              hitCd: 0.5,
              knock: 60,
              d: [0, 0.42 * s.dur * p.st.duration, sp],
              weapon: wi,
            });
          }
          break;
        }
        case "prase": {
          for (let i = 0; i < amount; i++) {
            const tgt = this.nearest(p.x, p.y, 600);
            const base = tgt && i === 0 ? Math.atan2(tgt.y - p.y, tgt.x - p.x) : Math.random() * Math.PI * 2;
            const sp = s.speed * p.st.projSpeed;
            this.addProj(p, w.evo ? PK.boar : PK.pig, p.x, p.y, Math.cos(base) * sp, Math.sin(base) * sp, {
              dmg: dmg * (w.evo ? 2 : 1),
              pierce: 999,
              life: s.dur * p.st.duration,
              r: 18 * area * (w.evo ? 1.6 : 1),
              hitCd: 0.6,
              knock: w.evo ? 380 : 260,
              stun: w.evo ? 0.6 : 0,
              weapon: wi,
            });
          }
          break;
        }
        case "tesla": {
          const n = amount + (w.evo ? 2 : 0);
          const jumps = s.pierce * (w.evo ? 2 : 1);
          const used = new Set<number>();
          for (let i = 0; i < n; i++) {
            const near = this.within(p.x, p.y, 430 * area).filter((e) => !used.has(e.id));
            if (!near.length) break;
            near.sort((a, b) => dist2(a.x, a.y, p.x, p.y) - dist2(b.x, b.y, p.x, p.y));
            let cur = near[Math.floor(Math.random() * Math.min(4, near.length))]!;
            const pts: number[] = [Math.round(p.x), Math.round(p.y - 10)];
            for (let j = 0; j <= jumps; j++) {
              used.add(cur.id);
              pts.push(Math.round(cur.x), Math.round(cur.y));
              this.hurt(cur, dmg, p, 0, 0, 0, 2, wi);
              if (w.evo) cur.stunT = Math.max(cur.stunT, 0.3);
              const next = this.nearest(cur.x, cur.y, 170 * area, used);
              if (!next) break;
              cur = next;
            }
            this.fx.push([FX.bolt, ...pts]);
          }
          break;
        }
        case "gaida": {
          const big = w.evo;
          this.addProj(p, big ? PK.bigRing : PK.ring, p.x, p.y, 0, 0, {
            dmg: dmg * (big ? 1.5 : 1),
            pierce: 999,
            life: s.dur,
            r: 10,
            knock: 240,
            slow: big ? 2 : 0,
            d: [150 * area * (big ? 1.5 : 1)],
            weapon: wi,
          });
          break;
        }
        case "banitsa": {
          for (let i = 0; i < amount; i++) {
            const near = this.within(p.x, p.y, 420);
            const t = near.length ? pickOne(near) : null;
            const tx = t ? t.x : p.x + rand(-250, 250);
            const ty = t ? t.y : p.y + rand(-250, 250);
            this.addProj(p, PK.banitsa, p.x, p.y, 0, 0, { dmg, pierce: 999, life: s.dur, r: 14, d: [p.x, p.y, tx, ty, 70 * area, w.evo ? 1 : 0], weapon: wi });
          }
          break;
        }
        case "chesan": {
          let hit = 0;
          const r = p.auraR;
          this.grid.each(p.x, p.y, r + 20, (e) => {
            if (dist2(e.x, e.y, p.x, p.y) < (r + e.r) ** 2) {
              hit++;
              this.hurt(e, dmg, p, e.x - p.x, e.y - p.y, 40, 2, wi);
            }
          });
          if (w.evo && hit) this.heal(p, 1);
          break;
        }
        case "rakia": {
          const n = amount + (w.evo ? 1 : 0);
          for (let i = 0; i < n; i++) {
            const near = this.within(p.x, p.y, 360);
            const t = near.length ? pickOne(near) : null;
            const tx = t ? t.x + rand(-20, 20) : p.x + rand(-260, 260);
            const ty = t ? t.y + rand(-20, 20) : p.y + rand(-260, 260);
            this.addProj(p, PK.bottle, p.x, p.y, 0, 0, {
              dmg,
              pierce: 999,
              life: 0.6,
              r: 8,
              d: [p.x, p.y, tx, ty, 55 * area * (w.evo ? 1.6 : 1), (s.dur + (w.evo ? 2 : 0)) * p.st.duration, w.evo ? 1 : 0],
              weapon: wi,
            });
          }
          break;
        }
        case "martenitsa": {
          const n = amount + (w.evo ? 3 : 0);
          for (let i = 0; i < n; i++) {
            const a = Math.random() * Math.PI * 2;
            const sp = s.speed * p.st.projSpeed;
            this.addProj(p, PK.mart, p.x, p.y, Math.cos(a) * sp, Math.sin(a) * sp, {
              dmg,
              pierce: s.pierce + (w.evo ? 2 : 0),
              life: s.dur * p.st.duration,
              r: 9 * area,
              crit: w.evo ? 3 : 2,
              d: [sp, 0],
              weapon: wi,
            });
          }
          break;
        }
        case "pishtov": {
          const dirs = w.evo ? 8 : 1;
          const sp = s.speed * p.st.projSpeed;
          for (let d = 0; d < dirs; d++) {
            for (let i = 0; i < amount; i++) {
              const a = face + (d / dirs) * Math.PI * 2 + (i - (amount - 1) / 2) * 0.12;
              this.addProj(p, PK.bullet, p.x, p.y, Math.cos(a) * sp, Math.sin(a) * sp, { dmg, pierce: s.pierce + (w.evo ? 3 : 0), life: s.dur * p.st.duration, r: 6 * area, knock: 30, weapon: wi });
            }
          }
          break;
        }
        case "sarp": {
          // a slash in front (more of them: behind, then the sides); the scythe goes all the way round
          const n = w.evo ? 1 : amount;
          for (let i = 0; i < n; i++) {
            const a = face + (i % 2 ? Math.PI : 0) + (i >= 2 ? Math.PI / 2 : 0);
            this.addProj(p, w.evo ? PK.bigSlash : PK.slash, p.x, p.y, 0, 0, {
              dmg: dmg * (w.evo ? 1.6 : 1),
              pierce: 999,
              life: s.dur,
              r: 95 * area * (w.evo ? 1.4 : 1),
              knock: 150,
              d: [a, w.evo ? 1 : 0],
              weapon: wi,
            });
          }
          break;
        }
        case "bradva": {
          // big two-handed axes hurled at the enemies: low through the crowd, curving, spinning
          const near = this.within(p.x, p.y, 520).sort((a, b) => dist2(a.x, a.y, p.x, p.y) - dist2(b.x, b.y, p.x, p.y));
          const sp = s.speed * p.st.projSpeed;
          for (let i = 0; i < amount; i++) {
            const t = near.length ? near[Math.min(near.length - 1, i * 2 + Math.floor(Math.random() * 2))]! : null;
            const base = t ? Math.atan2(t.y - p.y, t.x - p.x) : face + (i - (amount - 1) / 2) * 0.5;
            const curve = i % 2 ? -1 : 1;
            const a = base - curve * 0.35;
            const d = t ? Math.hypot(t.x - p.x, t.y - p.y) : 300;
            this.addProj(p, w.evo ? PK.bigAxe : PK.axe, p.x, p.y - 8, Math.cos(a) * sp, Math.sin(a) * sp, {
              dmg: dmg * (w.evo ? 2 : 1),
              pierce: 999,
              life: Math.min(1.4, d / sp + 0.55),
              r: 20 * area * (w.evo ? 1.8 : 1),
              hitCd: w.evo ? 0.4 : 999,
              knock: 170,
              stun: 0.25,
              d: [curve, curve],
              weapon: wi,
            });
          }
          break;
        }
        case "kaval": {
          const spirals = w.evo ? 2 : 1;
          const sp = s.speed * p.st.projSpeed;
          for (let k = 0; k < spirals; k++) {
            for (let i = 0; i < amount; i++) {
              const a = w.t2 + k * Math.PI + (i / amount) * Math.PI * 2;
              this.addProj(p, PK.note, p.x, p.y, Math.cos(a) * sp, Math.sin(a) * sp, { dmg, pierce: s.pierce + (w.evo ? 2 : 0), life: s.dur * p.st.duration, r: 8 * area, weapon: wi });
            }
          }
          w.t2 += 0.55;
          break;
        }
        case "kazan": {
          for (let i = 0; i < amount; i++) {
            const a = (i / amount) * Math.PI * 2 + rand(-0.4, 0.4);
            this.addProj(p, PK.cauldron, p.x + Math.cos(a) * 50, p.y + Math.sin(a) * 50, 0, 0, {
              dmg,
              pierce: s.pierce,
              life: s.dur * p.st.duration,
              r: 18,
              d: [0, s.speed * p.st.projSpeed, w.evo ? 1 : 0],
              weapon: wi,
            });
          }
          break;
        }
        case "krik": {
          const n = amount * (w.evo ? 3 : 1);
          const near = this.within(p.x, p.y, 340).sort((a, b) => dist2(a.x, a.y, p.x, p.y) - dist2(b.x, b.y, p.x, p.y));
          for (let i = 0; i < n; i++) {
            const t = near.length ? near[Math.floor(Math.random() * Math.min(6, near.length))]! : null;
            const x = t ? t.x : p.x + rand(-160, 160);
            const y = t ? t.y : p.y + rand(-160, 160);
            const delay = 0.3 + i * 0.22;
            this.addProj(p, PK.jack, x, y, 0, 0, { dmg, pierce: 999, life: delay + 0.3, r: 75 * area * (w.evo ? 1.4 : 1), stun: s.dur, d: [delay, 0], weapon: wi });
          }
          break;
        }
        case "plashilo": {
          for (let i = 0; i < amount; i++) {
            const a = face + (i - (amount - 1) / 2) * 1.2;
            this.addProj(p, PK.scarecrow, p.x + Math.cos(a) * 90, p.y + Math.sin(a) * 90, 0, 0, {
              dmg,
              pierce: 999,
              life: s.dur * p.st.duration,
              r: 55 * area * (w.evo ? 1.5 : 1),
              d: [0, w.evo ? 1 : 0],
              weapon: wi,
            });
          }
          break;
        }
      }
    }
  }

  private kob(p: Player, i: number, n: number, s: ReturnType<typeof weaponStats>, dmg: number, area: number, life: number, wi: number) {
    this.addProj(p, PK.kob, p.x, p.y, 0, 0, { dmg, pierce: 999, life, r: 16 * area, hitCd: 0.45, knock: 120, d: [(i / n) * Math.PI * 2, 88 * area, s.speed], weapon: wi });
  }

  private explode(p: Player | null, x: number, y: number, r: number, dmg: number, kind: number, wi = -1, stun = 0) {
    this.fx.push([FX.boom, Math.round(x), Math.round(y), Math.round(r), kind]);
    this.grid.each(x, y, r + 30, (e) => {
      if (dist2(e.x, e.y, x, y) < (r + e.r) ** 2) {
        this.hurt(e, dmg, p, e.x - x, e.y - y, 160, 2, wi);
        if (stun) e.stunT = Math.max(e.stunT, e.boss ? stun * 0.3 : stun);
      }
    });
  }

  private stepProjs(dt: number) {
    for (const q of this.projs) {
      if (q.dead) continue;
      q.life -= dt;
      const p = q.owner >= 0 ? this.players[q.owner] : undefined;
      if (q.life <= 0 || (p && (p.gone || (p.dead && (q.kind === PK.kob || q.kind === PK.bee))))) {
        // the evolved scarecrow goes out with a bang
        if (q.kind === PK.scarecrow && q.d[1] === 1 && p && q.life <= 0) this.explode(p, q.x, q.y, 170, q.dmg * 14, 2, q.weapon);
        q.dead = true;
        continue;
      }

      switch (q.kind) {
        case PK.tsarvul:
        case PK.bigTsarvul: {
          // out, then back to the owner
          q.d[0]! += dt;
          q.a += dt * 14;
          if (q.d[0]! > q.d[1]! && p) {
            const dx = p.x - q.x;
            const dy = p.y - q.y;
            const l = Math.hypot(dx, dy) || 1;
            const sp = q.d[2]! * 1.25;
            q.vx += ((dx / l) * sp - q.vx) * Math.min(1, dt * 6);
            q.vy += ((dy / l) * sp - q.vy) * Math.min(1, dt * 6);
            if (l < 22) q.dead = true;
          } else {
            q.vx *= 1 - dt * 0.9;
            q.vy *= 1 - dt * 0.9;
          }
          q.x += q.vx * dt;
          q.y += q.vy * dt;
          break;
        }
        case PK.pig:
        case PK.boar:
          q.x += q.vx * dt;
          q.y += q.vy * dt;
          if (p) {
            if (q.x < p.x - BOX_W && q.vx < 0) q.vx = -q.vx;
            if (q.x > p.x + BOX_W && q.vx > 0) q.vx = -q.vx;
            if (q.y < p.y - BOX_H && q.vy < 0) q.vy = -q.vy;
            if (q.y > p.y + BOX_H && q.vy > 0) q.vy = -q.vy;
          }
          q.a = q.vx < 0 ? Math.PI : 0;
          break;
        case PK.kob:
          if (p) {
            q.d[0]! += q.d[2]! * dt;
            q.x = p.x + Math.cos(q.d[0]!) * q.d[1]!;
            q.y = p.y + Math.sin(q.d[0]!) * q.d[1]!;
            q.a = q.d[0]! + Math.PI / 2;
          }
          break;
        case PK.ring:
        case PK.bigRing:
          if (p) {
            q.x = p.x;
            q.y = p.y;
          }
          q.r = 10 + (q.d[0]! - 10) * (1 - q.life / q.maxLife);
          break;
        case PK.slash:
        case PK.bigSlash:
          if (p) {
            q.x = p.x;
            q.y = p.y;
          }
          q.a = q.d[0]! + (q.kind === PK.bigSlash ? (1 - q.life / q.maxLife) * Math.PI * 2 : 0);
          break;
        case PK.axe:
        case PK.bigAxe: {
          // curve a little to the side, slow down at the end of the throw
          const turn = (q.d[0] ?? 1) * 0.9 * dt;
          const c0 = Math.cos(turn);
          const s0 = Math.sin(turn);
          const vx = q.vx * c0 - q.vy * s0;
          q.vy = q.vx * s0 + q.vy * c0;
          q.vx = vx;
          if (q.life < 0.35) {
            q.vx *= 1 - dt * 4;
            q.vy *= 1 - dt * 4;
          }
          q.x += q.vx * dt;
          q.y += q.vy * dt;
          q.a += dt * 19 * (q.d[1] ?? 1);
          break;
        }
        case PK.bee: {
          if (!p) break;
          // fly at the nearest enemy around the owner, otherwise buzz around them
          const t = this.nearest(p.x, p.y, 330);
          const sp = q.d[1]!;
          let tx: number;
          let ty: number;
          if (t) {
            tx = t.x + Math.cos(this.t * 9 + q.id) * 10;
            ty = t.y + Math.sin(this.t * 9 + q.id) * 10;
          } else {
            q.d[0]! += dt * 3;
            tx = p.x + Math.cos(q.d[0]!) * 46;
            ty = p.y + Math.sin(q.d[0]!) * 46;
          }
          const dx = tx - q.x;
          const dy = ty - q.y;
          const l = Math.hypot(dx, dy) || 1;
          const step = Math.min(l, sp * dt * (t ? 1.4 : 1.8));
          q.x += (dx / l) * step;
          q.y += (dy / l) * step;
          q.a = Math.atan2(dy, dx);
          break;
        }
        case PK.cauldron: {
          // shoots beans at the nearest enemy; the evolved one heals everyone around
          q.d[0]! -= dt;
          if (q.d[0]! <= 0 && p) {
            q.d[0] = 0.45;
            const t = this.nearest(q.x, q.y, 400);
            if (t) {
              const base = Math.atan2(t.y - q.y, t.x - q.x);
              const n = q.d[2] === 1 ? 3 : 1;
              for (let i = 0; i < n; i++) {
                const a = base + (i - (n - 1) / 2) * 0.2;
                this.addProj(p, PK.bean, q.x, q.y - 14, Math.cos(a) * q.d[1]!, Math.sin(a) * q.d[1]!, { dmg: q.dmg, pierce: q.pierce, life: 1.2, r: 6, knock: 40, weapon: q.weapon });
              }
            }
          }
          if (q.d[2] === 1) for (const pl of this.alive) if (dist2(pl.x, pl.y, q.x, q.y) < 130 * 130) this.heal(pl, 3 * dt);
          continue;
        }
        case PK.jack: {
          // waits, then slams
          q.d[0]! -= dt;
          if (q.d[0]! <= 0 && q.d[1] === 0) {
            q.d[1] = 1;
            this.explode(p ?? null, q.x, q.y, q.r, q.dmg, 5, q.weapon, q.stun);
          }
          continue;
        }
        case PK.scarecrow: {
          q.d[0]! -= dt;
          if (q.d[0]! <= 0) {
            q.d[0] = 0.5;
            this.grid.each(q.x, q.y, q.r + 20, (e) => {
              if (dist2(e.x, e.y, q.x, q.y) < (q.r + e.r) ** 2) this.hurt(e, q.dmg, p ?? null, 0, 0, 0, 2, q.weapon);
            });
          }
          continue;
        }
        case PK.banitsa:
        case PK.shard:
        case PK.bottle: {
          const k = 1 - q.life / q.maxLife;
          const [sx, sy, tx, ty] = q.d as [number, number, number, number];
          q.x = sx + (tx - sx) * k;
          q.y = sy + (ty - sy) * k - Math.sin(k * Math.PI) * (q.kind === PK.shard ? 40 : 80);
          q.a += dt * 9;
          if (q.life <= dt) {
            q.dead = true;
            if (q.kind === PK.bottle) {
              const evo = q.d[6] === 1;
              this.fx.push([FX.boom, Math.round(tx), Math.round(ty), Math.round(q.d[4]!), 3]);
              if (p) this.addProj(p, evo ? PK.bigFire : PK.fire, tx, ty, 0, 0, { dmg: q.dmg, pierce: 999, life: q.d[5]!, r: q.d[4]!, hitCd: 0.4, weapon: q.weapon });
            } else {
              this.explode(p ?? null, tx, ty, q.kind === PK.shard ? 45 : q.d[4]!, q.kind === PK.shard ? q.dmg * 0.6 : q.dmg, q.kind === PK.shard ? 1 : 0, q.weapon);
              if (q.kind === PK.banitsa && q.d[5] === 1 && p) {
                for (let i = 0; i < 5; i++) {
                  const a = (i / 5) * Math.PI * 2 + Math.random();
                  const r = rand(70, 130);
                  this.addProj(p, PK.shard, tx, ty, 0, 0, { dmg: q.dmg, pierce: 999, life: 0.45, r: 8, d: [tx, ty, tx + Math.cos(a) * r, ty + Math.sin(a) * r], weapon: q.weapon });
                }
              }
            }
          }
          continue; // no hits in the air
        }
        case PK.mart: {
          // homes in on the nearest enemy
          const t = this.nearest(q.x, q.y, 380);
          const sp = q.d[0]!;
          if (t) {
            const dx = t.x - q.x;
            const dy = t.y - q.y;
            const l = Math.hypot(dx, dy) || 1;
            q.vx += ((dx / l) * sp - q.vx) * Math.min(1, dt * 5);
            q.vy += ((dy / l) * sp - q.vy) * Math.min(1, dt * 5);
          }
          q.x += q.vx * dt;
          q.y += q.vy * dt;
          q.a = Math.atan2(q.vy, q.vx);
          break;
        }
        case PK.tornado: {
          // creeps after the nearest player
          let best: Player | null = null;
          let bd = Infinity;
          for (const pl of this.alive) {
            const d = dist2(pl.x, pl.y, q.x, q.y);
            if (d < bd) {
              bd = d;
              best = pl;
            }
          }
          if (best) {
            const l = Math.sqrt(bd) || 1;
            q.vx += (((best.x - q.x) / l) * 110 - q.vx) * Math.min(1, dt * 1.2);
            q.vy += (((best.y - q.y) / l) * 110 - q.vy) * Math.min(1, dt * 1.2);
          }
          q.x += q.vx * dt;
          q.y += q.vy * dt;
          q.a += dt * 8;
          break;
        }
        default:
          q.x += q.vx * dt;
          q.y += q.vy * dt;
      }

      if (q.enemy) {
        for (const pl of this.players) {
          if (pl.dead || pl.gone) continue;
          if (dist2(pl.x, pl.y, q.x, q.y) < (q.r + PLAYER_R - 3) ** 2) {
            this.hurtPlayer(pl, q.dmg);
            if (!ZONES.has(q.kind)) {
              q.dead = true;
              break;
            }
          }
        }
        continue;
      }
      if (NO_HITS.has(q.kind)) continue;

      // hits
      const ring = q.kind === PK.ring || q.kind === PK.bigRing;
      const slash = q.kind === PK.slash || q.kind === PK.bigSlash;
      const reach = q.r + 26;
      this.grid.each(q.x, q.y, reach, (e) => {
        if (q.dead) return false;
        const rr = q.r + e.r;
        const d2 = dist2(e.x, e.y, q.x, q.y);
        if (ring ? d2 > rr * rr || d2 < (q.r - 30) ** 2 : d2 > rr * rr) return;
        // the sickle only cuts in front (the scythe all round)
        if (slash && q.kind === PK.slash && angDiff(Math.atan2(e.y - q.y, e.x - q.x), q.a) > 1.25) return;
        const next = q.hits.get(e.id);
        if (next !== undefined && next > this.t) return;
        q.hits.set(e.id, q.hitCd >= 999 ? Infinity : this.t + q.hitCd);
        const radial = ring || slash || q.kind === PK.kob || q.kind === PK.bee || q.kind === PK.fire || q.kind === PK.bigFire;
        const kx = radial ? e.x - q.x : q.vx || e.x - q.x;
        const ky = radial ? e.y - q.y : q.vy || e.y - q.y;
        this.hurt(e, q.dmg, p ?? null, kx, ky, q.knock, q.crit, q.weapon);
        if (q.stun) e.stunT = Math.max(e.stunT, q.stun);
        if (q.slow) e.slowT = Math.max(e.slowT, q.slow);
        if (q.pierce < 999) {
          q.pierce--;
          if (q.pierce <= 0) {
            q.dead = true;
            return false;
          }
        }
      });
      // big rings / slashes: the grid query only looks near the centre, so also walk the edge
      if ((ring || slash) && q.r > 40) {
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          if (q.kind === PK.slash && angDiff(a, q.a) > 1.3) continue;
          const x = q.x + Math.cos(a) * q.r * (slash ? 0.7 : 1);
          const y = q.y + Math.sin(a) * q.r * (slash ? 0.7 : 1);
          this.grid.each(x, y, 40, (e) => {
            const d2 = dist2(e.x, e.y, q.x, q.y);
            if (d2 > (q.r + e.r) ** 2 || (ring && d2 < (q.r - 30) ** 2) || q.hits.has(e.id)) return;
            if (q.kind === PK.slash && angDiff(Math.atan2(e.y - q.y, e.x - q.x), q.a) > 1.25) return;
            q.hits.set(e.id, Infinity);
            this.hurt(e, q.dmg, p ?? null, e.x - q.x, e.y - q.y, q.knock, 2, q.weapon);
            if (q.slow) e.slowT = Math.max(e.slowT, q.slow);
          });
        }
      }
    }
  }

  private stepGems(dt: number) {
    const alive = this.alive;
    if (!alive.length) return;
    for (let i = this.gems.length - 1; i >= 0; i--) {
      const g = this.gems[i]!;
      let tgt: Player | null = null;
      let best = Infinity;
      for (const p of alive) {
        const d = dist2(p.x, p.y, g.x, g.y);
        if (d < best) {
          best = d;
          tgt = p;
        }
      }
      if (!tgt) continue;
      const big = g.k === GK.chest || g.k === GK.relic || isItemGem(g.k) ? 0.35 : 1;
      if (!g.mag && best < (BASE_MAGNET * tgt.st.magnet * big) ** 2) g.mag = true;
      if (g.mag) {
        g.sp = Math.min(1000, g.sp + dt * 1300);
        const d = Math.sqrt(best) || 1;
        const step = Math.min(d, (220 + g.sp) * dt);
        g.x += ((tgt.x - g.x) / d) * step;
        g.y += ((tgt.y - g.y) / d) * step;
      }
      if (best < 22 * 22) {
        this.gems.splice(i, 1);
        this.collect(tgt, g);
      }
    }
  }

  private collect(p: Player, g: Gem) {
    const pi = this.players.indexOf(p);
    this.fx.push([FX.pick, pi, g.k]);
    switch (g.k) {
      case GK.blue:
      case GK.green:
      case GK.red:
        this.xp += g.v * p.st.xp;
        this.taskStep("gems");
        break;
      case GK.coin:
        this.gold += 1;
        break;
      case GK.bag:
        this.gold += g.v;
        this.fx.push([FX.text, Math.round(p.x), Math.round(p.y - 30), `+${g.v} 🪙`, "#ffd34d"]);
        break;
      case GK.food:
        this.heal(p, p.maxHp * 0.3);
        this.fx.push([FX.text, Math.round(p.x), Math.round(p.y - 30), "+30% ❤️", "#7cff8a"]);
        break;
      case GK.magnet:
        for (const q of this.gems) if (q.k <= GK.red) q.mag = true;
        break;
      case GK.bomb:
        this.fx.push([FX.boom, Math.round(p.x), Math.round(p.y), 650, 2]);
        for (const e of this.enemies) {
          if (e.type !== "pot" && dist2(e.x, e.y, p.x, p.y) < 700 * 700) this.hurt(e, e.boss || e.type === "altar" ? e.maxHp * 0.05 : 99999, p);
        }
        break;
      case GK.chest:
        this.openChest(p);
        break;
      case GK.item:
      case GK.item + 1:
      case GK.item + 2:
      case GK.item + 3:
        this.giveItem(g.k - GK.item);
        break;
      case GK.relic: {
        const id = RELIC_IDS[g.v];
        if (id) this.takeRelic(id);
        break;
      }
    }
  }

  /** A chest: an evolution if one is ready, otherwise 1 / 3 / 5 random upgrades. */
  private openChest(p: Player) {
    const pi = this.players.indexOf(p);
    const texts: string[] = [];
    const ready = p.weapons.find((w) => !w.evo && w.lvl >= MAX_WEAPON_LEVEL && (p.passives[WEAPONS[w.id].evo.passive] ?? 0) > 0);
    const combosBefore = COMBO_IDS.map((c) => comboTier(p.weapons, c));
    if (ready) {
      ready.evo = true;
      p.evos++;
      texts.push(`🌟 ${WEAPONS[ready.id].evo.name}!`);
      this.fx.push([FX.evolve, pi, WEAPON_IDS.indexOf(ready.id)]);
      this.refreshStats(p);
    } else {
      const r = Math.random() - p.st.luck * 0.3;
      const n = r < 0.05 ? 5 : r < 0.25 ? 3 : 1;
      for (let i = 0; i < n; i++) {
        const opts = this.candidates(p, true);
        if (!opts.length) {
          const o = this.temperOffers(p, 1)[0]!;
          this.apply(p, o);
          texts.push(offerTitle(o));
          continue;
        }
        const o = pickOne(opts);
        this.apply(p, o);
        texts.push(offerTitle(o));
      }
    }
    this.gold += 5;
    this.announceCombos(p, combosBefore);
    this.fx.push([FX.chest, pi, texts]);
  }

  private stepMarks(dt: number) {
    if (this.event) {
      this.event.t -= dt;
      if (this.event.id === "hail") {
        this.hailT -= dt;
        if (this.hailT <= 0 && this.event.t > 1.2) {
          this.hailT = 0.28;
          const p = pickOne(this.alive.length ? this.alive : this.players);
          this.marks.push({ kind: MK.hail, x: p.x + rand(-260, 260), y: p.y + rand(-200, 200), r: 42, p: 0, t: 1.1, a: 1.1 });
        }
      }
      if (this.event.t <= 0) this.event = null;
    }
    if (this.blessing) {
      this.blessing.t -= dt;
      if (this.blessing.t <= 0) this.blessing = null;
    }
    for (const m of this.marks) {
      m.t -= dt;
      if (m.kind === MK.shrine) {
        const inside = this.alive.some((p) => dist2(p.x, p.y, m.x, m.y) < m.r * m.r);
        m.p = inside ? m.p + dt / 3 : Math.max(0, m.p - dt / 6);
        if (m.p >= 1) {
          m.t = 0;
          this.bless();
        }
      } else if (m.kind === MK.portal) {
        const inside = this.alive.some((p) => dist2(p.x, p.y, m.x, m.y) < m.r * m.r);
        m.p = inside ? m.p + dt / 4 : Math.max(0, m.p - dt / 8);
        if (m.p >= 1) {
          m.t = 0;
          this.summonFinal(m.x, m.y - 40, false);
        }
      } else if (m.kind === MK.hail) {
        m.p = 1 - m.t / m.a;
        if (m.t <= 0) {
          this.fx.push([FX.boom, Math.round(m.x), Math.round(m.y), m.r, 4]);
          for (const p of this.alive) if (dist2(p.x, p.y, m.x, m.y) < (m.r + PLAYER_R) ** 2) this.hurtPlayer(p, 14 * this.dmgMul());
          this.grid.each(m.x, m.y, m.r + 20, (e) => {
            if (dist2(e.x, e.y, m.x, m.y) < (m.r + e.r) ** 2 && !e.boss) this.hurt(e, 40, null);
          });
        }
      } else if (m.kind === MK.treasure) {
        if (!this.gems.some((g) => g.k === GK.chest && Math.abs(g.x - m.x) < 1 && Math.abs(g.y - m.y) < 1)) m.t = 0;
      } else if (m.kind === MK.charge) {
        m.p = 1 - m.t / 0.8;
      } else if (m.kind === MK.leap || m.kind === MK.nova) {
        m.p = 1 - m.t / m.a;
      } else if (m.kind === MK.acid) {
        m.p = 1 - m.t / m.a;
        if (m.t <= 0) {
          this.fx.push([FX.boom, Math.round(m.x), Math.round(m.y), m.r, 6]);
          for (const p of this.alive) if (dist2(p.x, p.y, m.x, m.y) < (m.r + PLAYER_R) ** 2) this.hurtPlayer(p, 10 * this.dmgMul());
          this.enemyShot({ x: m.x, y: m.y }, 0, 0, 0, PK.poison, 8, 5);
        }
      }
    }
    if (this.marks.some((m) => m.t <= 0)) this.marks = this.marks.filter((m) => m.t > 0);
  }

  private bless() {
    const id = pickOne(["might", "speed", "gather", "shield"] as BlessingId[]);
    this.blessing = { id, t: id === "shield" ? 8 : 30 };
    this.fx.push([FX.banner, `🕯️ ${({ might: "Сила на юнаците — двойни щети", speed: "Крилати цървули — +40% бързина", gather: "Голямо събиране", shield: "Закрила на самодивите" } as const)[id]}`, 2]);
    for (const p of this.players) {
      if (p.gone) continue;
      if (id === "might") p.buffs.might = 30;
      if (id === "speed") p.buffs.speed = 30;
      if (id === "shield") p.buffs.shield = 8;
      this.refreshStats(p);
    }
    if (id === "gather") for (const g of this.gems) if (g.k !== GK.chest) g.mag = true;
  }

  /* ───────── level-ups ───────── */

  /** What a player could get: upgrades of what they have, new things if there's room. */
  candidates(p: Player, ownedOnly = false): Offer[] {
    const out: Offer[] = [];
    for (const w of p.weapons) if (!w.evo && w.lvl < MAX_WEAPON_LEVEL) out.push({ kind: "weapon", id: w.id, lvl: w.lvl + 1 });
    for (const id of PASSIVE_IDS) {
      const l = p.passives[id] ?? 0;
      if (l > 0 && l < PASSIVES[id].max) out.push({ kind: "passive", id, lvl: l + 1 });
    }
    if (ownedOnly) return out;
    if (p.weapons.length < MAX_WEAPONS) for (const id of WEAPON_IDS) if (!p.weapons.some((w) => w.id === id)) out.push({ kind: "weapon", id, lvl: 1 });
    if (Object.keys(p.passives).length < MAX_PASSIVES) for (const id of PASSIVE_IDS) if (!p.passives[id]) out.push({ kind: "passive", id, lvl: 1 });
    return out;
  }

  /** ⚡ gods' gifts that could come: new ones, or the next level of yours (different gods first) */
  giftOffers(p: Player, n: number): Offer[] {
    const can = GIFT_IDS.filter((id) => (p.gifts[id] ?? 0) < GIFT_MAX).map((id) => ({ kind: "gift" as const, id, lvl: (p.gifts[id] ?? 0) + 1 }));
    const out: Offer[] = [];
    const gods = new Set<GodId>();
    const pool = can.sort(() => Math.random() - 0.5).sort((a, b) => (b.lvl > 1 ? 1 : 0) - (a.lvl > 1 ? 1 : 0) || 0);
    // owned gifts a bit more often, but mixed
    pool.sort(() => Math.random() - 0.55);
    for (const o of pool) {
      if (out.length >= n) break;
      if (gods.has(GIFTS[o.id].god) && pool.some((x) => !gods.has(GIFTS[x.id].god) && !out.includes(x))) continue;
      gods.add(GIFTS[o.id].god);
      out.push(o);
    }
    for (const o of pool) if (out.length < n && !out.includes(o)) out.push(o);
    return out;
  }

  makeOffers(p: Player): Offer[] {
    const n = p.st.luck >= 0.3 ? 4 : 3;
    // a sanctuary fell, or every 5th level: the gods speak
    if (this.giftRound || this.level % 5 === 0) {
      const g = this.giftOffers(p, n);
      if (g.length) return g;
    }
    const all = this.candidates(p);
    const out: Offer[] = [];
    // what you have levels up more often; a passive that evolves one of your weapons too
    const evoPassives = new Set(p.weapons.map((w) => WEAPONS[w.id].evo.passive));
    const pool = all.map((o) => ({
      o,
      w: "lvl" in o && o.lvl > 1 ? 1.6 : o.kind === "passive" && evoPassives.has(o.id) ? 1.4 : o.kind === "weapon" ? 1.1 : 1,
    }));
    while (out.length < n && pool.length) {
      let r = Math.random() * pool.reduce((s, x) => s + x.w, 0);
      let i = 0;
      for (; i < pool.length - 1; i++) {
        r -= pool[i]!.w;
        if (r <= 0) break;
      }
      out.push(pool[i]!.o);
      pool.splice(i, 1);
    }
    // now and then one of the cards is a god's gift
    if (out.length >= 2 && Math.random() < 0.22) {
      const g = this.giftOffers(p, 1)[0];
      if (g) out[out.length - 1] = g;
    }
    // a full build: temper cards, and the bread always among them
    if (!out.length) out.push(...this.temperOffers(p, n - 1), { kind: "heal" });
    return out;
  }

  /** 🔨 temper cards (endless, a little less each): the ones you're building come more often */
  temperOffers(p: Player, n: number): Offer[] {
    const pool = TEMPER_IDS.map((id) => ({ id, w: 1 + (p.tempers[id] ?? 0) * 0.12 }));
    const out: Offer[] = [];
    while (out.length < n && pool.length) {
      let r = Math.random() * pool.reduce((a, x) => a + x.w, 0);
      let i = 0;
      for (; i < pool.length - 1; i++) {
        r -= pool[i]!.w;
        if (r <= 0) break;
      }
      const id = pool[i]!.id;
      out.push({ kind: "temper", id, n: (p.tempers[id] ?? 0) + 1 });
      pool.splice(i, 1);
    }
    return out;
  }

  private openOffers() {
    if (this.pendingLevels <= 0) return;
    this.choosing = true;
    this.round++;
    this.giftRound = this.giftRounds > 0;
    if (this.giftRound) this.giftRounds--;
    this.offers.clear();
    this.picked.clear();
    for (const p of this.players) {
      if (p.gone) this.picked.add(p.uid);
      else this.offers.set(p.uid, this.makeOffers(p));
    }
  }

  /** index = -1 → skip (a little gold instead) */
  pick(uid: string, index: number) {
    if (!this.choosing || this.picked.has(uid)) return;
    const p = this.players.find((q) => q.uid === uid);
    const offers = this.offers.get(uid);
    if (!p || !offers) return;
    const o = offers[index];
    if (o) this.apply(p, o);
    else this.gold += 3;
    this.picked.add(uid);
    this.checkPicks();
  }

  reroll(uid: string): Offer[] | null {
    const p = this.players.find((q) => q.uid === uid);
    if (!this.choosing || !p || p.rerolls <= 0 || this.picked.has(uid)) return null;
    p.rerolls--;
    const o = this.makeOffers(p);
    this.offers.set(uid, o);
    return o;
  }

  private checkPicks() {
    if (!this.choosing) return;
    if (this.players.every((p) => p.gone || this.picked.has(p.uid))) {
      this.pendingLevels--;
      this.choosing = false;
      if (this.pendingLevels > 0) this.openOffers();
    }
  }

  apply(p: Player, o: Offer) {
    if (o.kind === "weapon") {
      const before = COMBO_IDS.map((c) => comboTier(p.weapons, c));
      const w = p.weapons.find((x) => x.id === o.id);
      if (w) w.lvl = Math.min(MAX_WEAPON_LEVEL, w.lvl + 1);
      else if (p.weapons.length < MAX_WEAPONS) p.weapons.push({ id: o.id, lvl: 1, evo: false, t: 0.3, t2: 0, on: false });
      this.announceCombos(p, before);
    } else if (o.kind === "passive") {
      p.passives[o.id] = Math.min(PASSIVES[o.id].max, (p.passives[o.id] ?? 0) + 1);
    } else if (o.kind === "gift") {
      p.gifts[o.id] = Math.min(GIFT_MAX, Math.max(p.gifts[o.id] ?? 0, o.lvl));
      this.checkBlessings(p);
    } else if (o.kind === "temper") {
      p.tempers[o.id] = (p.tempers[o.id] ?? 0) + 1;
    } else if (o.kind === "gold") {
      this.gold += 25;
    } else {
      this.heal(p, p.maxHp * 0.5);
    }
    this.refreshStats(p);
  }

  drainFx(): Fx[] {
    const f = this.fx;
    this.fx = [];
    return f;
  }
}

export function offerTitle(o: Offer): string {
  if (o.kind === "gift") return `${GIFTS[o.id].icon} ${GIFTS[o.id].name}${o.lvl > 1 ? ` ${o.lvl}` : ""}`;
  if (o.kind === "weapon") return `${WEAPONS[o.id].name}${o.lvl > 1 ? ` ${o.lvl}` : ""}`;
  if (o.kind === "passive") return `${PASSIVES[o.id].icon} ${PASSIVES[o.id].name}${o.lvl > 1 ? ` ${o.lvl}` : ""}`;
  if (o.kind === "temper") return `${TEMPERS[o.id].icon} ${TEMPERS[o.id].name} ×${o.n}`;
  return o.kind === "gold" ? "🪙 +25 злато" : "❤️ Хляб и сол (+50% живот)";
}
