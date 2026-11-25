import type { SurvCurseId, SurvHeroId, SurvMetaKey } from "@discord-clone/shared";
import {
  BOSS_EVERY,
  BOSS_ORDER,
  ENEMIES,
  ENEMY_IDS,
  HEROES,
  MAX_PASSIVES,
  MAX_WEAPONS,
  MAX_WEAPON_LEVEL,
  PASSIVES,
  PASSIVE_IDS,
  WEAPONS,
  WEAPON_IDS,
  weaponStats,
  type BlessingId,
  type EnemyId,
  type MapEventId,
  type PassiveId,
  type WeaponId,
} from "./content";

// 🧟 Шмиркленд — the simulation. No DOM: the host's browser steps it (solo or co-op), render.ts draws it.
// Endless: enemies get tougher and more numerous every minute, a boss every BOSS_EVERY seconds, map
// events in between. Co-op: one world, shared XP, every level-up pauses until each player has picked.

/* ───────────── what the renderer sees (the network snapshot decodes into the same shapes) ───────────── */

export interface RPlayer {
  uid: string;
  name: string;
  hero: SurvHeroId;
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
  /** an active hero skill with a visible effect (Цеко's aura) */
  skillT: number;
  hurtT: number;
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
} as const;

/** gem kinds */
export const GK = { blue: 0, green: 1, red: 2, coin: 3, food: 4, magnet: 5, chest: 6, bomb: 7, bag: 8 } as const;
/** map marks */
export const MK = { shrine: 0, treasure: 1, hail: 2, charge: 3 } as const;

/** effects since the last frame: [code, ...args] (renderer: particles / text; view: sounds) */
export const FX = {
  die: 0, // x y enemyTypeIndex
  dmg: 1, // x y amount crit(0/1)
  bolt: 2, // x0 y0 x1 y1 ...
  boom: 3, // x y r kind
  text: 4, // x y text color
  banner: 5, // text kind(0 event, 1 boss, 2 good)
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
  gone: boolean;
  /** Буря: lightning strikes still to come */
  storm: number;
  stormT: number;
  /** Залп: waves still to come */
  volley: number;
  volleyT: number;
}

export interface Enemy extends REnemy {
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
  state: number;
  tx: number;
  ty: number;
  /** swarm bats: fly straight, then vanish */
  life: number;
  vx: number;
  vy: number;
  dead: boolean;
  /** treasure guards don't despawn */
  stay: boolean;
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
  meta: Partial<Record<SurvMetaKey, number>>;
  remote: boolean;
}

/* ───────────── constants ───────────── */

const PLAYER_R = 14;
const BASE_SPEED = 165;
const BASE_MAGNET = 90;
const SPAWN_R = 780;
const DESPAWN_R = 1450;
const MAX_ENEMIES = 420;
const MAX_GEMS = 260;
/** the pig bounces inside this box around its owner (about one screen) */
const BOX_W = 600;
const BOX_H = 360;

const dist2 = (ax: number, ay: number, bx: number, by: number) => (ax - bx) * (ax - bx) + (ay - by) * (ay - by);
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pickOne = <T,>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)]!;

/** XP needed for the next level. */
export function xpFor(level: number, players: number): number {
  const base = level < 20 ? 5 + (level - 1) * 8 : level < 40 ? 157 + (level - 20) * 12 : 397 + (level - 40) * 15;
  return Math.round(base * (1 + 0.45 * (players - 1)));
}

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

  /** level-up: the game waits until everyone picked */
  choosing = false;
  pendingLevels = 0;
  offers = new Map<string, Offer[]>();
  picked = new Set<string>();
  /** +1 every time new cards are dealt */
  round = 0;

  boss: Enemy | null = null;
  event: { id: MapEventId; t: number } | null = null;
  blessing: { id: BlessingId; t: number } | null = null;

  private nextId = 1;
  private spawnAcc = 0;
  private nextBoss = BOSS_EVERY;
  private nextElite = 120;
  private nextEvent = rand(70, 100);
  private grid = new Grid();
  private hailT = 0;
  readonly curses: Set<SurvCurseId>;

  constructor(setup: PlayerSetup[], curses: SurvCurseId[]) {
    this.curses = new Set(curses);
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
        skillCd: 8,
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
        remote: s.remote,
        gone: false,
        storm: 0,
        stormT: 0,
        volley: 0,
        volleyT: 0,
      };
      p.weapons.push({ id: HEROES[s.hero].weapon, lvl: 1, evo: false, t: 0.5, t2: 0, on: false });
      this.refreshStats(p);
      p.hp = p.maxHp;
      this.players.push(p);
    });
    this.xpNext = xpFor(1, this.players.length);
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
      xp: 1 + (m.wisdom ?? 0) * 0.05,
    };
    if (this.curses.has("glass")) s.maxHp *= 0.5;
    if (this.curses.has("nomagnet")) s.magnet *= 0.5;
    if (this.curses.has("winter")) s.regen *= 0.5;
    if (p.buffs.might > 0) s.might *= 2;
    if (p.buffs.cheers > 0) {
      s.might *= 1.5;
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
    p.auraR = g ? 62 * weaponStats("chesan", g.lvl).area * p.st.area * (g.evo ? 1.4 : 1) : 0;
    p.auraEvo = !!g?.evo;
  }

  /* ───────── difficulty ───────── */

  private hpMul() {
    const m = this.minutes;
    return (1 + m * 0.18 + m * m * 0.012) * (1 + 0.5 * (this.pf - 1)) * (this.curses.has("evileye") ? 1.5 : 1);
  }
  private dmgMul() {
    return 1 + this.minutes * 0.07;
  }
  private speedMul() {
    return (1 + Math.min(0.4, this.minutes * 0.015)) * (this.curses.has("wolves") ? 1.25 : 1);
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

  spawn(type: EnemyId, x: number, y: number, opts: { elite?: boolean; boss?: boolean; hp?: number } = {}): Enemy {
    const d = ENEMIES[type];
    const elite = !!opts.elite;
    const hp = opts.hp ?? d.hp * this.hpMul() * (elite ? 10 : 1);
    const e: Enemy = {
      id: this.nextId++,
      type,
      x,
      y,
      flash: 0,
      elite,
      frozenT: 0,
      face: 1,
      hp,
      maxHp: hp,
      speed: d.speed * this.speedMul() * (elite ? 0.9 : 1) * rand(0.92, 1.08),
      dmg: d.dmg * this.dmgMul() * (elite ? 1.5 : 1),
      r: d.r * (elite ? 1.6 : 1),
      xp: d.xp * (elite ? 10 : 1),
      kx: 0,
      ky: 0,
      boss: !!opts.boss,
      stunT: 0,
      slowT: 0,
      ai: rand(0, 2),
      state: 0,
      tx: 0,
      ty: 0,
      life: 0,
      vx: 0,
      vy: 0,
      dead: false,
      stay: false,
    };
    this.enemies.push(e);
    return e;
  }

  private pickType(): EnemyId {
    const m = this.minutes;
    const open = ENEMY_IDS.filter((id) => ENEMIES[id].from <= m);
    const weights = open.map((id, i) => {
      let w = i >= open.length - 2 ? 2 : 1;
      if (id === "rat" && m > 8) w = 0.3;
      if (id === "bat" && m > 10) w = 0.4;
      return w;
    });
    let r = Math.random() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < open.length; i++) {
      r -= weights[i]!;
      if (r <= 0) return open[i]!;
    }
    return open[open.length - 1]!;
  }

  private director(dt: number) {
    const m = this.minutes;
    const pf = 1 + 0.6 * (this.pf - 1);
    const horde = this.curses.has("horde") ? 1.5 : 1;
    let target = Math.min(MAX_ENEMIES, (22 + m * 16 + m * m * 0.6) * pf * horde);
    if (this.boss) target *= 0.6;
    this.spawnAcc += dt * (3 + m * 1.6) * pf * horde;
    let n = 0;
    while (this.spawnAcc >= 1 && this.enemies.length < target && n < 20) {
      this.spawnAcc -= 1;
      n++;
      const [x, y] = this.spawnPoint();
      this.spawn(this.pickType(), x, y);
    }
    if (this.spawnAcc > 5) this.spawnAcc = 5;

    // elites
    if (this.t >= this.nextElite) {
      this.nextElite = this.t + rand(26, 36);
      const [x, y] = this.spawnPoint();
      this.spawn(this.pickType(), x, y, { elite: true });
    }

    // bosses
    if (this.t >= this.nextBoss) {
      const i = Math.round(this.nextBoss / BOSS_EVERY) - 1;
      this.nextBoss += BOSS_EVERY;
      const type = BOSS_ORDER[i % BOSS_ORDER.length]!;
      const cycle = Math.floor(i / BOSS_ORDER.length);
      const [x, y] = this.spawnPoint(undefined, 640);
      const hp = ENEMIES[type].hp * (1 + cycle) * (1 + 0.1 * m) * (1 + 0.7 * (this.pf - 1)) * (this.curses.has("evileye") ? 1.3 : 1);
      this.boss = this.spawn(type, x, y, { boss: true, hp });
      this.fx.push([FX.banner, `⚠️ Идва ${ENEMIES[type].name}!`, 1]);
    }

    // map events
    if (this.t >= this.nextEvent && !this.boss && !this.event) {
      this.nextEvent = this.t + rand(70, 110);
      const pool: MapEventId[] = ["shrine", "treasure", "swarm"];
      if (m >= 4) pool.push("kukeri");
      if (m >= 6) pool.push("hail");
      this.startEvent(pickOne(pool));
    }
  }

  private startEvent(id: MapEventId) {
    const p = pickOne(this.alive.length ? this.alive : this.players);
    const names = { shrine: "🕯️ Оброк", treasure: "💰 Заровено имане", swarm: "🦇 Ято прилепи", kukeri: "👹 Кукерско шествие", hail: "🌨️ Градушка" };
    this.fx.push([FX.banner, names[id], 0]);
    if (id === "shrine") {
      const a = Math.random() * Math.PI * 2;
      this.marks.push({ kind: MK.shrine, x: p.x + Math.cos(a) * 420, y: p.y + Math.sin(a) * 420, r: 56, p: 0, t: 45, a: 0 });
      this.event = { id, t: 45 };
    } else if (id === "treasure") {
      const a = Math.random() * Math.PI * 2;
      const x = p.x + Math.cos(a) * 950;
      const y = p.y + Math.sin(a) * 950;
      this.marks.push({ kind: MK.treasure, x, y, r: 30, p: 0, t: 90, a: 0 });
      this.gems.push({ x, y, k: GK.chest, v: 0, mag: false, sp: 0 });
      for (let i = 0; i < 3; i++) {
        const e = this.spawn(this.pickType(), x + rand(-90, 90), y + rand(-90, 90), { elite: true });
        e.stay = true;
      }
      this.event = { id, t: 90 };
    } else if (id === "swarm") {
      const a = Math.random() * Math.PI * 2;
      const n = Math.round(30 + this.minutes * 2) * (1 + 0.4 * (this.pf - 1));
      const sx = p.x - Math.cos(a) * 820;
      const sy = p.y - Math.sin(a) * 820;
      const px = -Math.sin(a);
      const py = Math.cos(a);
      for (let i = 0; i < n; i++) {
        const off = (i / n - 0.5) * 900 + rand(-30, 30);
        const e = this.spawn("bat", sx + px * off - Math.cos(a) * rand(0, 160), sy + py * off - Math.sin(a) * rand(0, 160));
        e.life = 14;
        e.vx = Math.cos(a) * 190;
        e.vy = Math.sin(a) * 190;
      }
      this.event = { id, t: 12 };
    } else if (id === "kukeri") {
      const n = Math.round((22 + this.minutes * 1.2) * (1 + 0.3 * (this.pf - 1)));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        this.spawn("kuker", p.x + Math.cos(a) * 520, p.y + Math.sin(a) * 520);
      }
      this.event = { id, t: 20 };
    } else {
      this.event = { id, t: 12 };
      this.hailT = 0;
    }
  }

  /* ───────── damage ───────── */

  private hurt(e: Enemy, dmg: number, p: Player | null, kx = 0, ky = 0, knock = 0, critMul = 2) {
    if (e.dead) return;
    let d = dmg;
    let crit = false;
    if (p && Math.random() < 0.05 + p.st.luck * 0.4) {
      d *= critMul;
      crit = true;
    }
    e.hp -= d;
    e.flash = 0.12;
    if (knock && (kx || ky)) {
      const len = Math.hypot(kx, ky) || 1;
      const k = knock * (e.boss ? 0.05 : e.elite ? 0.35 : 1);
      e.kx += (kx / len) * k;
      e.ky += (ky / len) * k;
    }
    if (d >= 3 || crit) this.fx.push([FX.dmg, Math.round(e.x), Math.round(e.y - e.r), Math.round(d), crit ? 1 : 0]);
    if (e.hp <= 0) this.kill(e, p);
  }

  private kill(e: Enemy, p: Player | null) {
    e.dead = true;
    if (e.life > 0) {
      // swarm bats still give a little XP
      this.dropGem(e.x, e.y, 1);
      this.kills++;
      if (p) p.kills++;
      this.fx.push([FX.die, Math.round(e.x), Math.round(e.y), ENEMY_IDS.indexOf(e.type)]);
      return;
    }
    this.kills++;
    if (p) p.kills++;
    this.fx.push([FX.die, Math.round(e.x), Math.round(e.y), ENEMY_IDS.indexOf(e.type)]);
    const luck = p?.st.luck ?? 0;
    if (e.boss) {
      this.bosses++;
      if (this.boss === e) this.boss = null;
      this.fx.push([FX.bossDie, Math.round(e.x), Math.round(e.y)]);
      this.fx.push([FX.banner, `🏆 ${ENEMIES[e.type].name} е повален!`, 2]);
      this.gems.push({ x: e.x, y: e.y, k: GK.chest, v: 0, mag: false, sp: 0 });
      for (let i = 0; i < 6; i++) this.gems.push({ x: e.x + rand(-60, 60), y: e.y + rand(-60, 60), k: GK.bag, v: 5, mag: false, sp: 0 });
      this.dropGem(e.x + 20, e.y, e.xp);
      return;
    }
    if (e.elite) {
      if (Math.random() < 0.35 + luck) this.gems.push({ x: e.x, y: e.y, k: GK.chest, v: 0, mag: false, sp: 0 });
      else this.dropGem(e.x, e.y, e.xp);
      for (let i = 0; i < 3; i++) this.gems.push({ x: e.x + rand(-30, 30), y: e.y + rand(-30, 30), k: GK.coin, v: 1, mag: false, sp: 0 });
      return;
    }
    this.dropGem(e.x, e.y, e.xp);
    const r = Math.random();
    if (r < 0.025 + luck * 0.03) this.gems.push({ x: e.x + 8, y: e.y, k: GK.coin, v: 1, mag: false, sp: 0 });
    else if (r < 0.03 + luck * 0.03) this.gems.push({ x: e.x, y: e.y, k: GK.food, v: 0, mag: false, sp: 0 });
    else if (r < 0.0315 + luck * 0.03) this.gems.push({ x: e.x, y: e.y, k: GK.magnet, v: 0, mag: false, sp: 0 });
    else if (r < 0.0325 + luck * 0.03) this.gems.push({ x: e.x, y: e.y, k: GK.bomb, v: 0, mag: false, sp: 0 });
  }

  private dropGem(x: number, y: number, v: number) {
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
    const d = Math.max(1, dmg - p.st.armor);
    p.hp -= d;
    p.invulnT = 0.45;
    p.hurtT = 0.25;
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
        if (dist2(e.x, e.y, saver.x, saver.y) < 400 * 400) this.hurt(e, e.boss ? e.maxHp * 0.05 : 9999, null);
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
      p.x = x;
      p.y = y;
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
    if (this.over || this.choosing) return;
    dt = Math.min(dt, 0.05);
    this.t += dt;

    for (const p of this.players) this.stepPlayer(p, dt, inputs.get(p.uid));
    this.director(dt);
    this.grid.build(this.enemies);
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
      this.openOffers();
    }
  }

  private stepPlayer(p: Player, dt: number, inp: Input | undefined) {
    if (p.gone) return;
    p.hurtT = Math.max(0, p.hurtT - dt);
    p.invulnT = Math.max(0, p.invulnT - dt);
    p.dashCd = Math.max(0, p.dashCd - dt);
    p.skillCd = Math.max(0, p.skillCd - dt);
    p.skillT = Math.max(0, p.skillT - dt);
    const b = p.buffs;
    const hadBuff = b.might > 0 || b.speed > 0 || b.cheers > 0;
    for (const k of Object.keys(b) as (keyof typeof b)[]) b[k] = Math.max(0, b[k] - dt);
    if (hadBuff !== (b.might > 0 || b.speed > 0 || b.cheers > 0)) this.refreshStats(p);

    if (p.dead) {
      // a teammate standing next to you brings you back
      const helper = this.alive.find((q) => dist2(q.x, q.y, p.x, p.y) < 60 * 60);
      p.reviveP = helper ? p.reviveP + dt / 3 : Math.max(0, p.reviveP - dt / 6);
      if (p.reviveP >= 1) this.revive(p, 0.5);
      return;
    }

    if (p.st.regen > 0) this.heal(p, p.st.regen * dt);
    if (b.herbs > 0) this.heal(p, p.maxHp * 0.05 * dt);

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
        p.dirX = mx / (len > 1 ? 1 : len || 1);
        p.dirY = my / (len > 1 ? 1 : len || 1);
        const dl = Math.hypot(p.dirX, p.dirY) || 1;
        p.dirX /= dl;
        p.dirY /= dl;
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
      } else {
        p.x += mx * sp * dt;
        p.y += my * sp * dt;
      }
    } else if (p.remote) {
      p.dashT = Math.max(0, p.dashT - dt);
    }

    // skill effects over time
    if (p.storm > 0) {
      p.stormT -= dt;
      if (p.stormT <= 0) {
        p.stormT = 0.1;
        p.storm--;
        const near = this.enemies.filter((e) => !e.dead && dist2(e.x, e.y, p.x, p.y) < 650 * 650);
        if (near.length) {
          const e = pickOne(near);
          this.fx.push([FX.bolt, Math.round(e.x + rand(-40, 40)), Math.round(e.y - 500), Math.round(e.x), Math.round(e.y)]);
          this.hurt(e, 60 * p.st.might, p);
        }
      }
    }
    if (p.volley > 0) {
      p.volleyT -= dt;
      if (p.volleyT <= 0) {
        p.volleyT = 0.25;
        p.volley--;
        for (let i = 0; i < 24; i++) {
          const a = (i / 24) * Math.PI * 2 + p.volley * 0.13;
          this.addProj(p, PK.bullet, p.x, p.y, Math.cos(a) * 650, Math.sin(a) * 650, { dmg: 30 * p.st.might, pierce: 3, life: 1.1, r: 6 });
        }
      }
    }
    if (p.skillT > 0 && p.hero === "tseko") {
      // Шопски инат: everything close burns
      this.grid.each(p.x, p.y, 110, (e) => {
        if (dist2(e.x, e.y, p.x, p.y) < 110 * 110 && Math.random() < dt * 4) this.hurt(e, 20 * p.st.might, p, e.x - p.x, e.y - p.y, 80);
      });
    }
  }

  castSkill(p: Player) {
    if (p.dead || p.skillCd > 0) return;
    const def = HEROES[p.hero].skill;
    p.skillCd = def.cd;
    const pi = this.players.indexOf(p);
    this.fx.push([FX.skill, pi]);
    this.fx.push([FX.text, Math.round(p.x), Math.round(p.y - 40), `✨ ${def.name}!`, "#ffe27a"]);
    switch (p.hero) {
      case "peyo": {
        const dir = p.face || 1;
        for (let i = 0; i < 14; i++) {
          const y = p.y + (i - 7) * 40 + rand(-12, 12);
          this.addProj(p, PK.sheep, p.x - dir * (700 + rand(0, 160)), y, dir * 520, 0, { dmg: 40 * p.st.might, pierce: 999, life: 3.4, r: 22, knock: 300, hitCd: 0.5 });
        }
        break;
      }
      case "tseko":
        p.skillT = 4;
        break;
      case "nikola":
        p.storm = 20;
        p.stormT = 0;
        break;
      case "gitsa":
        for (const q of this.players) {
          if (q.gone) continue;
          if (q.dead) this.revive(q, 0.4);
          else this.heal(q, q.maxHp * 0.4);
        }
        break;
      case "strahil":
        p.volley = 3;
        p.volleyT = 0;
        break;
      case "vela":
        for (const e of this.enemies) if (dist2(e.x, e.y, p.x, p.y) < 800 * 800) e.frozenT = e.boss ? 1.5 : 4;
        break;
      case "gosho":
        for (const e of this.enemies) {
          if (dist2(e.x, e.y, p.x, p.y) < 450 * 450) {
            e.stunT = e.boss ? 0.5 : 2;
            this.hurt(e, 20 * p.st.might, p, e.x - p.x, e.y - p.y, 700);
          }
        }
        break;
      case "mitko":
        for (const q of this.players) {
          if (q.gone) continue;
          q.buffs.cheers = 10;
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
      e.frozenT = Math.max(0, e.frozenT - dt);
      e.stunT = Math.max(0, e.stunT - dt);
      e.slowT = Math.max(0, e.slowT - dt);
      // knockback
      e.x += e.kx * dt;
      e.y += e.ky * dt;
      const decay = Math.exp(-dt * 9);
      e.kx *= decay;
      e.ky *= decay;

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

      const dx = (tgt.x - e.x) / (dist || 1);
      const dy = (tgt.y - e.y) / (dist || 1);
      let sp = e.speed * (e.slowT > 0 ? 0.5 : 1);
      let mx = dx;
      let my = dy;
      e.ai -= dt;

      if (e.boss) {
        this.bossAI(e, tgt, dx, dy, dist, dt);
        this.touch(e);
        continue;
      }

      if (e.type === "bat") {
        const w = Math.sin(this.t * 6 + e.id) * 0.8;
        mx = dx - dy * w;
        my = dy + dx * w;
      } else if (e.type === "witch") {
        if (dist < 220) {
          mx = -dx;
          my = -dy;
        } else if (dist < 320) sp *= 0.2;
        if (e.ai <= 0 && dist < 440) {
          e.ai = 3;
          this.enemyShot(e, dx, dy, 210, PK.ebolt, 9);
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
          if (o === e || ENEMIES[o.type].ghost) return;
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
    if (e.frozenT > 0 || e.stunT > 0) return;
    for (const p of this.players) {
      if (p.dead || p.gone) continue;
      const rr = e.r + PLAYER_R - 4;
      if (dist2(p.x, p.y, e.x, e.y) < rr * rr) this.hurtPlayer(p, e.dmg);
    }
  }

  private enemyShot(e: Enemy, dx: number, dy: number, speed: number, kind: number, dmg: number) {
    this.projs.push({
      id: this.nextId++,
      kind,
      x: e.x,
      y: e.y,
      a: Math.atan2(dy, dx),
      r: kind === PK.eball ? 11 : 8,
      owner: -1,
      vx: dx * speed,
      vy: dy * speed,
      dmg: dmg * this.dmgMul(),
      pierce: 1,
      life: 5,
      maxLife: 5,
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

  private bossAI(e: Enemy, tgt: Player, dx: number, dy: number, dist: number, dt: number) {
    const sp = e.speed * (e.slowT > 0 ? 0.6 : 1);
    if (Math.abs(dx) > 0.15) e.face = dx < 0 ? -1 : 1;
    const charge = (every: number) => {
      // 0 walk → 1 aim (a warning line) → 2 charge
      if (e.state === 0 && e.ai <= 0) {
        e.state = 1;
        e.ai = 0.85;
        e.tx = dx;
        e.ty = dy;
        this.marks.push({ kind: MK.charge, x: e.x, y: e.y, r: e.r, p: 0, t: 0.85, a: Math.atan2(dy, dx) });
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
        e.x += e.tx * 560 * dt;
        e.y += e.ty * 560 * dt;
        if (e.ai <= 0) {
          e.state = 0;
          e.ai = every;
        }
        return true;
      }
      return false;
    };
    switch (e.type) {
      case "karak":
        if (charge(4.2)) return;
        e.x += dx * sp * dt;
        e.y += dy * sp * dt;
        return;
      case "mora": {
        if (dist < 240) {
          e.x -= dx * sp * dt;
          e.y -= dy * sp * dt;
        } else if (dist > 320) {
          e.x += dx * sp * dt;
          e.y += dy * sp * dt;
        } else {
          e.x += -dy * sp * 0.6 * dt;
          e.y += dx * sp * 0.6 * dt;
        }
        if (e.ai <= 0) {
          e.ai = 2.6;
          e.state = (e.state + 1) % 4;
          for (let i = 0; i < 14; i++) {
            const a = (i / 14) * Math.PI * 2 + e.state * 0.2;
            this.enemyShot(e, Math.cos(a), Math.sin(a), 170, PK.ebolt, 10);
          }
          if (e.state === 0) for (let i = 0; i < 6; i++) this.spawn("bat", e.x + rand(-60, 60), e.y + rand(-60, 60));
        }
        return;
      }
      case "lamia":
        e.x += dx * sp * dt;
        e.y += dy * sp * dt;
        if (e.ai <= 0) {
          e.ai = 2.2;
          const base = Math.atan2(dy, dx);
          for (let i = -2; i <= 2; i++) this.enemyShot(e, Math.cos(base + i * 0.22), Math.sin(base + i * 0.22), 230, PK.eball, 14);
        }
        return;
      case "zmey": {
        if (charge(6)) return;
        // circles around its target and spits fire
        const ang = Math.atan2(e.y - tgt.y, e.x - tgt.x) + dt * 0.9;
        const want = 300;
        const r = dist + (want - dist) * Math.min(1, dt * 1.5);
        const nx = tgt.x + Math.cos(ang) * r;
        const ny = tgt.y + Math.sin(ang) * r;
        const mx = nx - e.x;
        const my = ny - e.y;
        const ml = Math.hypot(mx, my) || 1;
        const step = Math.min(ml, sp * 2.2 * dt);
        e.x += (mx / ml) * step;
        e.y += (my / ml) * step;
        e.tx += dt;
        if (e.tx > 2.4) {
          e.tx = 0;
          const base = Math.atan2(dy, dx);
          for (let i = -1; i <= 1; i++) this.enemyShot(e, Math.cos(base + i * 0.18), Math.sin(base + i * 0.18), 260, PK.eball, 16);
        }
        return;
      }
    }
  }

  /* ───────── weapons ───────── */

  private nearest(x: number, y: number, maxR: number, skip?: Set<number>): Enemy | null {
    let best: Enemy | null = null;
    let bd = maxR * maxR;
    for (const e of this.enemies) {
      if (e.dead || skip?.has(e.id)) continue;
      const d = dist2(e.x, e.y, x, y);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
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

  private stepWeapons(p: Player, dt: number) {
    for (const w of p.weapons) {
      w.t -= dt;
      const s = weaponStats(w.id, w.lvl);
      const cd = s.cd * Math.max(0.35, 1 - p.st.cooldown);
      const amount = s.amount + p.st.amount;
      const dmg = s.dmg * p.st.might;
      const area = s.area * p.st.area;
      const wi = WEAPON_IDS.indexOf(w.id);

      // Тесла's evolution: a bolt from the sky every 0.5 s on top of the chains
      if (w.id === "tesla" && w.evo) {
        w.t2 -= dt;
        if (w.t2 <= 0) {
          w.t2 = 0.5;
          const near = this.enemies.filter((e) => !e.dead && dist2(e.x, e.y, p.x, p.y) < 600 * 600);
          if (near.length) {
            const e = pickOne(near);
            this.fx.push([FX.bolt, Math.round(e.x + rand(-30, 30)), Math.round(e.y - 420), Math.round(e.x), Math.round(e.y)]);
            this.hurt(e, dmg * 1.2, p);
            e.stunT = Math.max(e.stunT, 0.3);
          }
        }
      }
      // Кобилица: spinning while "on"; its evolution never stops
      if (w.id === "kobilitsa") {
        const n = amount + (w.evo ? 2 : 0);
        const mine = this.projs.filter((q) => !q.dead && q.owner === this.players.indexOf(p) && q.kind === PK.kob);
        if (w.evo && mine.length !== n) {
          for (const q of mine) q.dead = true;
          this.spawnKob(p, n, s, dmg * 1.4, area * 1.2, Infinity);
        }
        if (w.evo || w.t > 0) continue;
        w.t = cd + s.dur * p.st.duration;
        for (const q of mine) q.dead = true;
        this.spawnKob(p, n, s, dmg, area, s.dur * p.st.duration);
        this.fx.push([FX.fire, this.players.indexOf(p), wi]);
        continue;
      }
      if (w.t > 0) continue;
      w.t = cd;
      this.fx.push([FX.fire, this.players.indexOf(p), wi]);

      switch (w.id) {
        case "tsarvul": {
          const n = amount + (w.evo ? 2 : 0);
          const tgt = this.nearest(p.x, p.y, 500);
          const base = tgt ? Math.atan2(tgt.y - p.y, tgt.x - p.x) : Math.atan2(p.dirY, p.dirX);
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
          const n = amount;
          for (let i = 0; i < n; i++) {
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
            const near = this.enemies.filter((e) => !e.dead && !used.has(e.id) && dist2(e.x, e.y, p.x, p.y) < (430 * area) ** 2);
            if (!near.length) break;
            near.sort((a, b) => dist2(a.x, a.y, p.x, p.y) - dist2(b.x, b.y, p.x, p.y));
            let cur = near[Math.floor(Math.random() * Math.min(4, near.length))]!;
            const pts: number[] = [Math.round(p.x), Math.round(p.y - 10)];
            for (let j = 0; j <= jumps; j++) {
              used.add(cur.id);
              pts.push(Math.round(cur.x), Math.round(cur.y));
              this.hurt(cur, dmg, p);
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
            const near = this.enemies.filter((e) => !e.dead && dist2(e.x, e.y, p.x, p.y) < 420 * 420);
            const t = near.length ? pickOne(near) : null;
            const tx = t ? t.x : p.x + rand(-250, 250);
            const ty = t ? t.y : p.y + rand(-250, 250);
            this.addProj(p, PK.banitsa, p.x, p.y, 0, 0, {
              dmg,
              pierce: 999,
              life: s.dur,
              r: 14,
              d: [p.x, p.y, tx, ty, 70 * area, w.evo ? 1 : 0],
              weapon: wi,
            });
          }
          break;
        }
        case "chesan": {
          let hit = 0;
          const r = p.auraR;
          this.grid.each(p.x, p.y, r + 20, (e) => {
            if (dist2(e.x, e.y, p.x, p.y) < (r + e.r) ** 2) {
              hit++;
              this.hurt(e, dmg, p, e.x - p.x, e.y - p.y, 40);
            }
          });
          if (w.evo && hit) this.heal(p, 1);
          break;
        }
        case "rakia": {
          const n = amount + (w.evo ? 1 : 0);
          for (let i = 0; i < n; i++) {
            const near = this.enemies.filter((e) => !e.dead && dist2(e.x, e.y, p.x, p.y) < 360 * 360);
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
          const base = Math.atan2(p.dirY, p.dirX);
          const dirs = w.evo ? 8 : 1;
          const sp = s.speed * p.st.projSpeed;
          for (let d = 0; d < dirs; d++) {
            for (let i = 0; i < amount; i++) {
              const a = base + (d / dirs) * Math.PI * 2 + (i - (amount - 1) / 2) * 0.12;
              this.addProj(p, PK.bullet, p.x, p.y, Math.cos(a) * sp, Math.sin(a) * sp, {
                dmg,
                pierce: s.pierce + (w.evo ? 3 : 0),
                life: s.dur * p.st.duration,
                r: 6 * area,
                knock: 30,
                weapon: wi,
              });
            }
          }
          break;
        }
      }
    }
  }

  private spawnKob(p: Player, n: number, s: ReturnType<typeof weaponStats>, dmg: number, area: number, life: number) {
    for (let i = 0; i < n; i++) {
      this.addProj(p, PK.kob, p.x, p.y, 0, 0, {
        dmg,
        pierce: 999,
        life,
        r: 16 * area,
        hitCd: 0.45,
        knock: 120,
        d: [(i / n) * Math.PI * 2, 88 * area, s.speed],
        weapon: WEAPON_IDS.indexOf("kobilitsa"),
      });
    }
  }

  private explode(p: Player | null, x: number, y: number, r: number, dmg: number, kind: number) {
    this.fx.push([FX.boom, Math.round(x), Math.round(y), Math.round(r), kind]);
    this.grid.each(x, y, r + 30, (e) => {
      if (dist2(e.x, e.y, x, y) < (r + e.r) ** 2) this.hurt(e, dmg, p, e.x - x, e.y - y, 160);
    });
  }

  private stepProjs(dt: number) {
    for (const q of this.projs) {
      if (q.dead) continue;
      q.life -= dt;
      const p = q.owner >= 0 ? this.players[q.owner] : undefined;
      if (q.life <= 0 || (p && (p.gone || (p.dead && q.kind === PK.kob)))) {
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
              this.addProj(p!, evo ? PK.bigFire : PK.fire, tx, ty, 0, 0, { dmg: q.dmg, pierce: 999, life: q.d[5]!, r: q.d[4]!, hitCd: 0.4, weapon: q.weapon });
            } else {
              this.explode(p ?? null, tx, ty, q.kind === PK.shard ? 45 : q.d[4]!, q.kind === PK.shard ? q.dmg * 0.6 : q.dmg, q.kind === PK.shard ? 1 : 0);
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
        default:
          q.x += q.vx * dt;
          q.y += q.vy * dt;
      }

      if (q.enemy) {
        for (const pl of this.players) {
          if (pl.dead || pl.gone) continue;
          if (dist2(pl.x, pl.y, q.x, q.y) < (q.r + PLAYER_R - 3) ** 2) {
            this.hurtPlayer(pl, q.dmg);
            q.dead = true;
            break;
          }
        }
        continue;
      }

      // hits
      const ring = q.kind === PK.ring || q.kind === PK.bigRing;
      const reach = q.r + 26;
      this.grid.each(q.x, q.y, reach, (e) => {
        if (q.dead) return false;
        const rr = q.r + e.r;
        const d2 = dist2(e.x, e.y, q.x, q.y);
        if (ring ? d2 > rr * rr || d2 < (q.r - 30) ** 2 : d2 > rr * rr) return;
        const next = q.hits.get(e.id);
        if (next !== undefined && next > this.t) return;
        q.hits.set(e.id, q.hitCd >= 999 ? Infinity : this.t + q.hitCd);
        const kx = ring || q.kind === PK.kob ? e.x - q.x : q.vx || e.x - q.x;
        const ky = ring || q.kind === PK.kob ? e.y - q.y : q.vy || e.y - q.y;
        this.hurt(e, q.dmg, p ?? null, kx, ky, q.knock, q.crit);
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
      // the ring's grid query only looks near its centre: also walk its edge
      if (ring && q.r > 40) {
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          const x = q.x + Math.cos(a) * q.r;
          const y = q.y + Math.sin(a) * q.r;
          this.grid.each(x, y, 40, (e) => {
            const d2 = dist2(e.x, e.y, q.x, q.y);
            if (d2 > (q.r + e.r) ** 2 || d2 < (q.r - 30) ** 2 || q.hits.has(e.id)) return;
            q.hits.set(e.id, Infinity);
            this.hurt(e, q.dmg, p ?? null, e.x - q.x, e.y - q.y, q.knock);
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
      const big = g.k === GK.chest ? 0.4 : 1;
      if (!g.mag && best < (BASE_MAGNET * tgt.st.magnet * big) ** 2) g.mag = true;
      if (g.mag) {
        g.sp = Math.min(900, g.sp + dt * 1100 + 120 * dt);
        const d = Math.sqrt(best) || 1;
        const step = Math.min(d, (180 + g.sp) * dt);
        g.x += ((tgt.x - g.x) / d) * step;
        g.y += ((tgt.y - g.y) / d) * step;
      }
      if (best < 20 * 20) {
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
          if (dist2(e.x, e.y, p.x, p.y) < 700 * 700) this.hurt(e, e.boss ? e.maxHp * 0.05 : 99999, p);
        }
        break;
      case GK.chest:
        this.openChest(p);
        break;
    }
  }

  /** A chest: an evolution if one is ready, otherwise 1 / 3 / 5 random upgrades. */
  private openChest(p: Player) {
    const pi = this.players.indexOf(p);
    const texts: string[] = [];
    const ready = p.weapons.find((w) => !w.evo && w.lvl >= MAX_WEAPON_LEVEL && (p.passives[WEAPONS[w.id].evo.passive] ?? 0) > 0);
    if (ready) {
      ready.evo = true;
      texts.push(`🌟 ${WEAPONS[ready.id].evo.name}!`);
      this.fx.push([FX.evolve, pi, WEAPON_IDS.indexOf(ready.id)]);
      this.refreshStats(p);
    } else {
      const r = Math.random() - p.st.luck * 0.3;
      const n = r < 0.04 ? 5 : r < 0.22 ? 3 : 1;
      for (let i = 0; i < n; i++) {
        const opts = this.candidates(p, true);
        if (!opts.length) {
          this.gold += 10;
          texts.push("🪙 +10 злато");
          continue;
        }
        const o = pickOne(opts);
        this.apply(p, o);
        texts.push(offerTitle(o));
      }
    }
    this.gold += 5;
    this.fx.push([FX.chest, pi, texts]);
  }

  private stepMarks(dt: number) {
    if (this.event) {
      this.event.t -= dt;
      if (this.event.id === "hail") {
        this.hailT -= dt;
        if (this.hailT <= 0 && this.event.t > 1.2) {
          this.hailT = 0.3;
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
      } else if (m.kind === MK.hail) {
        m.p = 1 - m.t / m.a;
        if (m.t <= 0) {
          this.fx.push([FX.boom, Math.round(m.x), Math.round(m.y), m.r, 4]);
          for (const p of this.alive) if (dist2(p.x, p.y, m.x, m.y) < (m.r + PLAYER_R) ** 2) this.hurtPlayer(p, 14 * this.dmgMul());
          this.grid.each(m.x, m.y, m.r + 20, (e) => {
            if (dist2(e.x, e.y, m.x, m.y) < (m.r + e.r) ** 2) this.hurt(e, 40, null);
          });
        }
      } else if (m.kind === MK.treasure) {
        if (!this.gems.some((g) => g.k === GK.chest && Math.abs(g.x - m.x) < 1 && Math.abs(g.y - m.y) < 1)) m.t = 0;
      } else if (m.kind === MK.charge) {
        m.p = 1 - m.t / 0.85;
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

  makeOffers(p: Player): Offer[] {
    const all = this.candidates(p);
    const n = p.st.luck >= 0.3 ? 4 : 3;
    const out: Offer[] = [];
    const pool = all.map((o) => ({ o, w: "lvl" in o && o.lvl > 1 ? 1.6 : o.kind === "weapon" ? 1.1 : 1 }));
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
    if (!out.length) out.push({ kind: "gold" }, { kind: "heal" });
    return out;
  }

  private openOffers() {
    if (this.pendingLevels <= 0) return;
    this.choosing = true;
    this.round++;
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
      const w = p.weapons.find((x) => x.id === o.id);
      if (w) w.lvl = Math.min(MAX_WEAPON_LEVEL, w.lvl + 1);
      else if (p.weapons.length < MAX_WEAPONS) p.weapons.push({ id: o.id, lvl: 1, evo: false, t: 0.3, t2: 0, on: false });
    } else if (o.kind === "passive") {
      p.passives[o.id] = Math.min(PASSIVES[o.id].max, (p.passives[o.id] ?? 0) + 1);
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
  if (o.kind === "weapon") return `${WEAPONS[o.id].name}${o.lvl > 1 ? ` ${o.lvl}` : ""}`;
  if (o.kind === "passive") return `${PASSIVES[o.id].icon} ${PASSIVES[o.id].name}${o.lvl > 1 ? ` ${o.lvl}` : ""}`;
  return o.kind === "gold" ? "🪙 +25 злато" : "❤️ Хляб и сол (+50% живот)";
}
