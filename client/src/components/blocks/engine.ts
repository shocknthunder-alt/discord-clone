// 🧱 Шметрис — the game logic (no drawing, no DOM). A 10×20 well (+2 hidden rows on top), seven
// four-cell pieces, rotation with wall kicks, a shuffled bag of all seven, hold, 3 previews,
// ghost, lock delay, levels every 10 lines, combos and back-to-back bonuses.
// Extras: spins for every piece (+ minis), perfect clears, a back-to-back chain, the fever
// multiplier (keep clearing), bonus cells (bomb / bolt / rainbow / slow, they fire when their row
// goes, the stack then falls and may clear again = cascades), the dragon's rage (a meter; V burns
// the bottom 3 rows + double points for 10 s), missions, and golden rows rising from the bottom.

export const COLS = 10;
export const ROWS = 22; // rows 0–1 are hidden above the visible well
export const HIDDEN = 2;

export type PieceType = "I" | "J" | "L" | "O" | "S" | "T" | "Z";
export const PIECES: PieceType[] = ["I", "J", "L", "O", "S", "T", "Z"];
/** Board values: 1..7 = PIECES[v-1], then these two. */
export const GOLD = 8;
export const STONE = 9;

export type BonusKind = "bomb" | "bolt" | "rainbow" | "slow";
export interface PieceBonus {
  /** Which of the 4 cells (in the order of the unrotated shape; follows rotation). */
  i: number;
  kind: BonusKind;
}

const SHAPES: Record<PieceType, string[]> = {
  I: ["....", "XXXX", "....", "...."],
  J: ["X..", "XXX", "..."],
  L: ["..X", "XXX", "..."],
  O: ["XX", "XX"],
  S: [".XX", "XX.", "..."],
  T: [".X.", "XXX", "..."],
  Z: ["XX.", ".XX", "..."],
};

type Cells = [number, number][];

function cellsOf(rows: string[]): Cells {
  const out: Cells = [];
  rows.forEach((r, y) => [...r].forEach((ch, x) => ch === "X" && out.push([x, y])));
  return out;
}
function rotateCW(rows: string[]): string[] {
  const n = rows.length;
  return Array.from({ length: n }, (_, y) => Array.from({ length: n }, (_, x) => rows[n - 1 - x]![y]).join(""));
}

/** [type][rotation 0..3] → cells inside the piece box. */
const ROT: Record<PieceType, Cells[]> = Object.fromEntries(
  PIECES.map((t) => {
    const states: Cells[] = [];
    let s = SHAPES[t];
    for (let i = 0; i < 4; i++) {
      states.push(cellsOf(s));
      s = rotateCW(s);
    }
    return [t, states];
  }),
) as Record<PieceType, Cells[]>;

export function pieceCells(type: PieceType, rot = 0): Cells {
  return ROT[type][rot]!;
}

/** Where cell `i` of the unrotated shape is after `rot` clockwise turns (so a bonus cell follows the piece). */
export function bonusCell(type: PieceType, rot: number, i: number): [number, number] {
  const n = SHAPES[type].length;
  let [x, y] = cellsOf(SHAPES[type])[i]!;
  for (let k = 0; k < rot; k++) [x, y] = [n - 1 - y, x];
  return [x, y];
}

// Wall kicks (x right, y UP as usually written — we flip y when applying).
const KICKS_JLSTZ: Record<string, [number, number][]> = {
  "0>1": [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  "1>0": [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  "1>2": [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  "2>1": [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  "2>3": [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  "3>2": [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  "3>0": [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  "0>3": [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
};
const KICKS_I: Record<string, [number, number][]> = {
  "0>1": [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  "1>0": [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  "1>2": [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  "2>1": [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  "2>3": [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  "3>2": [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  "3>0": [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  "0>3": [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
};

export interface Active {
  type: PieceType;
  rot: number;
  x: number;
  y: number;
  bonus: PieceBonus | null;
}

export type MissionId = "tspin" | "triple" | "tetra" | "combo3" | "lines8" | "bonus" | "spin" | "gold" | "b2b" | "fever2" | "chain3";
export interface Mission {
  id: MissionId;
  goal: number;
  progress: number;
}

export interface ClearEvent {
  kind: "clear";
  lines: number;
  /** A full T-spin (kept for the older code: sounds, the dragon). */
  tspin: boolean;
  /** Which piece span in (any piece but O), null = no spin. */
  spin: PieceType | null;
  mini: boolean;
  b2b: boolean;
  /** Hard clears in a row (2 = the first back-to-back). */
  b2bChain: number;
  combo: number;
  points: number;
  rows: number[];
  perfect: boolean;
  /** Extra clears after the bonus cells made the stack fall. */
  cascades: number;
  bonuses: BonusKind[];
  /** Gold cells in the cleared rows. */
  gold: number;
  /** The fever multiplier this clear got. */
  fever: number;
}

export type GameEvent =
  | { kind: "move" }
  | { kind: "rotate" }
  | { kind: "hold" }
  | { kind: "lock" }
  | { kind: "harddrop"; cells: number }
  | ClearEvent
  | { kind: "level"; level: number }
  | { kind: "fever"; mult: number }
  | { kind: "rageReady" }
  | { kind: "rage"; cells: number; points: number }
  | { kind: "mission"; id: MissionId; points: number }
  | { kind: "missionNew"; id: MissionId }
  | { kind: "goldRow" }
  | { kind: "stone" }
  /** ⚔️ duel: rows sent to the opponent (after cancelling your incoming ones) */
  | { kind: "attack"; lines: number }
  /** ⚔️ duel: your clear knocked out this many incoming rows */
  | { kind: "cancel"; lines: number }
  /** ⚔️ duel: garbage rows came up from the bottom */
  | { kind: "garbage"; lines: number }
  | { kind: "over" };

/** ⚔️ How many garbage rows a clear sends (before cancelling your own incoming ones). */
export function garbageOf(e: ClearEvent): number {
  const n = e.lines;
  if (!n) return 0;
  let g = e.spin && !e.mini ? n * 2 : e.mini ? n - 1 : n >= 4 ? n : n - 1;
  if (e.b2b) g += 1;
  g += [0, 0, 1, 1, 2, 2, 3, 3, 4][Math.min(8, e.combo)]!;
  if (e.perfect) g += 6;
  if (e.cascades) g += e.cascades;
  if (e.fever >= 2) g += 1;
  return Math.max(0, Math.min(12, g));
}
/** Garbage rows (grey, one hole per attack). */
export const GARBAGE = STONE;

/** Short-lived effects for the drawing (visible-well coordinates). */
export interface Fx {
  kind: BonusKind | "rage" | "perfect" | "gold";
  x: number;
  y: number;
  ms: number;
  total: number;
}

const LOCK_MS = 500;
const MAX_RESETS = 15;
const DAS_MS = 160;
const ARR_MS = 35;
/** Soft drop (↓ held): ms per row, by the "↓ speed" setting (1 = slow … 4 = fast). */
export const SOFT_DROP_MS = [0, 110, 75, 50, 30] as const;
/** A new piece doesn't start soft-dropping for this long even if ↓ is still held (no accidental drops). */
const SOFT_SPAWN_GRACE_MS = 140;

export const RAGE_MAX = 100;
const RAGE_MS = 10_000;
const SLOW_MS = 10_000;
const BONUS_CHANCE = 0.1;
const GOLD_EVERY = 30; // pieces
const GOLD_TO_STONE = 25; // pieces a golden row stays golden
const FEVER_STEPS: [number, number][] = [
  [8, 3],
  [5, 2],
  [3, 1.5],
];
const MISSIONS: { id: MissionId; goal: number }[] = [
  { id: "tspin", goal: 1 },
  { id: "triple", goal: 1 },
  { id: "tetra", goal: 1 },
  { id: "combo3", goal: 1 },
  { id: "lines8", goal: 8 },
  { id: "bonus", goal: 1 },
  { id: "spin", goal: 1 },
  { id: "b2b", goal: 1 },
  { id: "fever2", goal: 1 },
  { id: "chain3", goal: 1 },
  { id: "gold", goal: 1 },
];

/** Seconds a piece takes to fall one row at `level`. */
export function gravitySeconds(level: number): number {
  return Math.max(1 / 120, Math.pow(0.8 - (level - 1) * 0.007, level - 1));
}

export class BlocksGame {
  board: number[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
  /** Bonus cells already in the stack (same shape as `board`). */
  tags: (BonusKind | null)[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  active: Active | null = null;
  hold: PieceType | null = null;
  holdBonus: PieceBonus | null = null;
  holdUsed = false;
  queue: PieceType[] = [];
  queueBonus: (PieceBonus | null)[] = [];
  score = 0;
  lines = 0;
  level: number;
  combo = -1;
  b2b = false;
  b2bChain = 0;
  over = false;
  paused = false;
  elapsedMs = 0;
  pieces = 0;
  /** Rows just cleared, for the flash effect (time left in ms). */
  flash: { rows: number[]; ms: number } | null = null;
  fx: Fx[] = [];
  /** Fever: clears with at most one piece between them. */
  feverChain = 0;
  fever = 1;
  rage = 0;
  rageMs = 0;
  slowMs = 0;
  mission: Mission | null = null;
  missionsDone = 0;
  /** Extra growth for the dragon (missions). */
  dragonBonus = 0;
  perfects = 0;

  private piecesSinceClear = 99;
  private untilGold = GOLD_EVERY;
  private goldAge = -1; // -1 = no golden row on the board
  private untilMission = 4;
  private lastMission: MissionId | null = null;
  private fall = 0;
  private lockMs = 0;
  private resets = 0;
  private lastWasRotate = false;
  private lowestY = 0;
  private held: { dir: -1 | 1 | 0; ms: number; das: boolean } = { dir: 0, ms: 0, das: false };
  private soft = false;
  private softGrace = 0;
  /** ms per row of the current fall (for the smooth drawing). */
  private stepMs = 1000;
  /** "↓ speed" setting, 1..4. */
  softSpeed = 2;
  /** ⚔️ duel: clears send garbage rows, incoming ones wait here (they rise on a lock without a clear) */
  versus = false;
  pending: { lines: number; hole: number }[] = [];
  sent = 0;
  private rng: () => number;

  constructor(
    private emit: (e: GameEvent) => void,
    public startLevel = 1,
    rng: () => number = Math.random,
  ) {
    this.level = startLevel;
    this.rng = rng;
    this.refill(true);
    this.spawn();
  }

  private refill(first = false) {
    while (this.queue.length < 7) {
      const bag = [...PIECES];
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(this.rng() * (i + 1));
        [bag[i], bag[j]] = [bag[j]!, bag[i]!];
      }
      this.queue.push(...bag);
      for (let k = 0; k < bag.length; k++) this.queueBonus.push(first ? null : this.rollBonus());
      first = false;
    }
  }

  private rollBonus(): PieceBonus | null {
    if (this.rng() >= BONUS_CHANCE) return null;
    const r = this.rng() * 100;
    const kind: BonusKind = r < 35 ? "bomb" : r < 65 ? "bolt" : r < 85 ? "rainbow" : "slow";
    return { i: Math.floor(this.rng() * 4), kind };
  }

  private spawnOf(type: PieceType, bonus: PieceBonus | null): Active {
    return { type, rot: 0, x: type === "O" ? 4 : 3, y: type === "I" ? -1 : 0, bonus };
  }

  private spawn(type?: PieceType, bonus: PieceBonus | null = null) {
    let t = type;
    let b = bonus;
    if (!t) {
      t = this.queue.shift()!;
      b = this.queueBonus.shift() ?? null;
    }
    this.refill();
    let a = this.spawnOf(t, b);
    // Born in the hidden rows, then straight away one row down (so it peeks into the well) if it can.
    if (this.fits(a) && this.fits({ ...a, y: a.y + 1 })) a = { ...a, y: a.y + 1 };
    this.active = a;
    this.fall = 0;
    this.lockMs = 0;
    this.resets = 0;
    this.lastWasRotate = false;
    this.lowestY = a.y;
    this.softGrace = SOFT_SPAWN_GRACE_MS;
    if (!this.fits(a)) {
      // Topped out.
      this.active = a;
      this.over = true;
      this.emit({ kind: "over" });
    }
  }

  fits(a: Pick<Active, "type" | "rot" | "x" | "y">): boolean {
    for (const [cx, cy] of pieceCells(a.type, a.rot)) {
      const x = a.x + cx;
      const y = a.y + cy;
      if (x < 0 || x >= COLS || y >= ROWS) return false;
      if (y >= 0 && this.board[y]![x]) return false;
    }
    return true;
  }

  get onGround(): boolean {
    return !!this.active && !this.fits({ ...this.active, y: this.active.y + 1 });
  }

  /** Where a hard drop would put the piece. */
  ghostY(): number {
    if (!this.active) return 0;
    let y = this.active.y;
    while (this.fits({ ...this.active, y: y + 1 })) y++;
    return y;
  }

  private touched() {
    // A successful move/rotation on the ground buys more lock time (a limited number of times).
    if (this.onGround && this.resets < MAX_RESETS) {
      this.lockMs = 0;
      this.resets++;
    }
  }

  move(dx: -1 | 1): boolean {
    if (!this.playing || !this.active) return false;
    const next = { ...this.active, x: this.active.x + dx };
    if (!this.fits(next)) return false;
    this.active = next;
    this.lastWasRotate = false;
    this.touched();
    this.emit({ kind: "move" });
    return true;
  }

  rotate(dir: 1 | -1 | 2): boolean {
    if (!this.playing || !this.active) return false;
    const a = this.active;
    if (a.type === "O") return false;
    const to = (a.rot + (dir === 2 ? 2 : dir) + 4) % 4;
    const kicks =
      dir === 2
        ? ([[0, 0], [0, -1], [1, 0], [-1, 0]] as [number, number][])
        : (a.type === "I" ? KICKS_I : KICKS_JLSTZ)[`${a.rot}>${to}`]!;
    for (const [kx, ky] of kicks) {
      const next = { ...a, rot: to, x: a.x + kx, y: a.y - ky };
      if (this.fits(next)) {
        this.active = next;
        this.lastWasRotate = true;
        this.touched();
        this.emit({ kind: "rotate" });
        return true;
      }
    }
    return false;
  }

  holdPiece() {
    if (!this.playing || !this.active || this.holdUsed) return;
    const cur = this.active;
    const swap = this.hold;
    const swapBonus = this.holdBonus;
    this.hold = cur.type;
    this.holdBonus = cur.bonus;
    this.holdUsed = true;
    this.emit({ kind: "hold" });
    if (swap) this.spawn(swap, swapBonus);
    else this.spawn();
  }

  hardDrop() {
    if (!this.playing || !this.active) return;
    const y = this.ghostY();
    const cells = y - this.active.y;
    if (cells > 0) this.lastWasRotate = false;
    this.active = { ...this.active, y };
    this.score += cells * 2;
    this.emit({ kind: "harddrop", cells });
    this.lock();
  }

  /** Held left/right with auto-repeat (dir 0 = released). */
  setShift(dir: -1 | 0 | 1) {
    if (dir === this.held.dir) return;
    this.held = { dir, ms: 0, das: false };
    if (dir !== 0) this.move(dir);
  }
  get shiftDir(): -1 | 0 | 1 {
    return this.held.dir;
  }
  setSoftDrop(on: boolean) {
    this.soft = on;
  }

  /** How far (0..1 of a row) the piece has fallen towards the next row: drawn in between for a smooth fall. */
  get dropOffset(): number {
    if (!this.playing || !this.active || this.stepMs < 20 || this.onGround) return 0;
    return Math.min(0.999, Math.max(0, this.fall / this.stepMs));
  }

  get playing(): boolean {
    return !this.over && !this.paused;
  }

  get rageReady(): boolean {
    return this.rage >= RAGE_MAX;
  }

  /** All points of a clear are multiplied by this (fever × dragon's rage). */
  private get mult(): number {
    return this.fever * (this.rageMs > 0 ? 2 : 1);
  }

  /** A spin: the last action was a rotation and the piece is stuck (T: 3 of its 4 corners filled). */
  private spinOf(): { piece: PieceType; mini: boolean } | null {
    const a = this.active;
    if (!a || a.type === "O" || !this.lastWasRotate) return null;
    const stuck = !this.fits({ ...a, x: a.x - 1 }) && !this.fits({ ...a, x: a.x + 1 }) && !this.fits({ ...a, y: a.y - 1 });
    if (a.type === "T") {
      let corners = 0;
      for (const [cx, cy] of [[0, 0], [2, 0], [0, 2], [2, 2]]) {
        const x = a.x + cx!;
        const y = a.y + cy!;
        if (x < 0 || x >= COLS || y >= ROWS || (y >= 0 && this.board[y]![x])) corners++;
      }
      if (corners >= 3) return { piece: "T", mini: false };
      return stuck ? { piece: "T", mini: true } : null;
    }
    return stuck ? { piece: a.type, mini: false } : null;
  }

  private addRage(n: number) {
    if (this.rageMs > 0) return; // no charging while it burns
    const was = this.rageReady;
    this.rage = Math.min(RAGE_MAX, this.rage + n);
    if (!was && this.rageReady) this.emit({ kind: "rageReady" });
  }

  private addFx(kind: Fx["kind"], x: number, y: number, ms: number) {
    this.fx.push({ kind, x, y: y - HIDDEN, ms, total: ms });
  }

  private fullRows(): number[] {
    const full: number[] = [];
    for (let y = 0; y < ROWS; y++) if (this.board[y]!.every((v) => v)) full.push(y);
    return full;
  }

  /**
   * Removes `rows`, fires the bonus cells in them (and the ones those hit), lets the stack fall if
   * anything blew up and keeps clearing what that completes. Returns what happened.
   */
  private clearRows(first: number[]) {
    let rows = first;
    let total = 0;
    let cascades = 0;
    let killed = 0;
    let gold = 0;
    const bonuses: BonusKind[] = [];
    while (rows.length) {
      const full = new Set(rows);
      for (const y of rows) gold += this.board[y]!.filter((v) => v === GOLD).length;
      // bonus cells in the rows → what they hit (and the bonus cells they hit, too)
      const kill = new Set<number>(); // y * COLS + x, rows outside `full`
      const todo: [number, number][] = [];
      for (const y of rows) for (let x = 0; x < COLS; x++) if (this.tags[y]![x]) todo.push([x, y]);
      const fired = new Set<number>();
      const hit = (x: number, y: number) => {
        if (x < 0 || x >= COLS || y < 0 || y >= ROWS || !this.board[y]![x]) return;
        const k = y * COLS + x;
        if (!full.has(y)) kill.add(k);
        if (this.tags[y]![x] && !fired.has(k)) todo.push([x, y]);
      };
      while (todo.length) {
        const [x, y] = todo.pop()!;
        const k = y * COLS + x;
        if (fired.has(k)) continue;
        fired.add(k);
        const kind = this.tags[y]![x]!;
        bonuses.push(kind);
        this.addFx(kind, x, y, kind === "bolt" ? 450 : 600);
        if (kind === "bomb") {
          for (let dy = -1; dy <= 1; dy++) for (let dx = -2; dx <= 2; dx++) hit(x + dx, y + dy);
        } else if (kind === "bolt") {
          for (let yy = 0; yy < ROWS; yy++) hit(x, yy);
        } else if (kind === "rainbow") {
          const colour = this.board[y]![x]!;
          for (let yy = 0; yy < ROWS; yy++) for (let xx = 0; xx < COLS; xx++) if (this.board[yy]![xx] === colour) hit(xx, yy);
        } else if (kind === "slow") {
          this.slowMs = SLOW_MS;
        }
      }
      // the hit cells go, then the full rows (bottom-up, so earlier removals don't shift later indices)
      for (const k of kill) {
        const y = Math.floor(k / COLS);
        const x = k % COLS;
        if (this.board[y]![x] === GOLD) gold++;
        this.board[y]![x] = 0;
        this.tags[y]![x] = null;
      }
      killed += kill.size;
      const sorted = [...rows].sort((p, q) => p - q);
      for (let i = sorted.length - 1; i >= 0; i--) {
        this.board.splice(sorted[i]!, 1);
        this.tags.splice(sorted[i]!, 1);
      }
      while (this.board.length < ROWS) {
        this.board.unshift(Array(COLS).fill(0));
        this.tags.unshift(Array(COLS).fill(null));
      }
      total += rows.length;
      if (!kill.size) break;
      // something blew up: everything falls down its column, which may complete more rows
      for (let x = 0; x < COLS; x++) {
        let to = ROWS - 1;
        for (let y = ROWS - 1; y >= 0; y--) {
          const v = this.board[y]![x]!;
          if (!v) continue;
          const tag = this.tags[y]![x]!;
          this.board[y]![x] = 0;
          this.tags[y]![x] = null;
          this.board[to]![x] = v;
          this.tags[to]![x] = tag;
          to--;
        }
      }
      rows = this.fullRows();
      if (rows.length) cascades++;
    }
    return { total, cascades, killed, gold, bonuses };
  }

  private lock() {
    const a = this.active;
    if (!a) return;
    const spin = this.spinOf();
    let aboveTop = true;
    const value = PIECES.indexOf(a.type) + 1;
    const cells = pieceCells(a.type, a.rot);
    for (const [cx, cy] of cells) {
      const y = a.y + cy;
      if (y >= 0) {
        this.board[y]![a.x + cx] = value;
        this.tags[y]![a.x + cx] = null;
      }
      if (y >= HIDDEN) aboveTop = false;
    }
    if (a.bonus) {
      const [bx, by] = bonusCell(a.type, a.rot, a.bonus.i);
      if (a.y + by >= 0) this.tags[a.y + by]![a.x + bx] = a.bonus.kind;
    }
    this.pieces++;
    this.emit({ kind: "lock" });

    const full = this.fullRows();
    const n = full.length;
    if (n || spin) {
      const difficult = n > 0 && (n === 4 || !!spin);
      if (n > 0) {
        this.combo++;
        if (difficult) this.b2bChain = this.b2b ? this.b2bChain + 1 : 1;
        else this.b2bChain = 0;
        this.b2b = difficult;
        // fever: clears with at most one piece in between
        this.feverChain = this.piecesSinceClear <= 1 ? this.feverChain + 1 : 1;
        this.piecesSinceClear = 0;
        this.setFever();
      }
      const b2b = difficult && this.b2bChain >= 2;
      const base = !spin
        ? [0, 100, 300, 500, 800][n]!
        : spin.mini
          ? [100, 200, 400, 600][n]!
          : spin.piece === "T"
            ? [400, 800, 1200, 1600][n]!
            : [100, 500, 900, 1300][n]!;
      let points = base * this.level * (b2b ? Math.min(3, 1 + 0.5 * (this.b2bChain - 1)) : 1);
      if (n > 0 && this.combo > 0) points += 50 * this.combo * this.level;
      const flashRows = full;
      let res = { total: 0, cascades: 0, killed: 0, gold: 0, bonuses: [] as BonusKind[] };
      let perfect = false;
      if (n > 0) {
        res = this.clearRows(full);
        points += res.killed * 15 * this.level + res.gold * 150 * this.level;
        // cascade clears: each one worth more
        if (res.total > n) points += (res.total - n) * 200 * this.level * (1 + res.cascades);
        perfect = this.board.every((row) => row.every((v) => !v));
        if (perfect) {
          points += [0, 800, 1200, 1800, 2000][Math.min(4, n)]! * this.level;
          this.perfects++;
          this.addFx("perfect", 4.5, HIDDEN + 10, 1400);
        }
        if (res.gold) this.addFx("gold", 4.5, ROWS - 1, 900);
        if (this.goldAge >= 0 && !this.board.some((row) => row.includes(GOLD))) this.goldAge = -1;
        this.flash = { rows: flashRows, ms: 220 };
        const before = this.level;
        this.lines += res.total;
        this.level = Math.max(this.startLevel, 1 + Math.floor(this.lines / 10));
        if (this.level > before) this.emit({ kind: "level", level: this.level });
        this.addRage(res.total * 8 + Math.max(0, this.combo) * 4 + (difficult ? 12 : 0) + (perfect ? 40 : 0) + res.bonuses.length * 5);
      }
      const fever = n > 0 ? this.mult : 1;
      points = Math.round(points * fever);
      this.score += points;
      const ev: ClearEvent = {
        kind: "clear",
        lines: res.total || n,
        tspin: !!spin && spin.piece === "T" && !spin.mini,
        spin: spin?.piece ?? null,
        mini: !!spin?.mini,
        b2b,
        b2bChain: this.b2bChain,
        combo: Math.max(0, this.combo),
        points,
        rows: full,
        perfect,
        cascades: res.cascades,
        bonuses: res.bonuses,
        gold: res.gold,
        fever,
      };
      this.emit(ev);
      this.missionProgress(ev);
      if (this.versus && n > 0) this.sendAttack(garbageOf(ev));
    } else {
      this.combo = -1;
    }
    if (!n) {
      this.piecesSinceClear++;
      if (this.piecesSinceClear > 1 && this.feverChain) {
        this.feverChain = 0;
        this.setFever();
      }
    }
    this.holdUsed = false;
    if (aboveTop) {
      // Locked completely above the visible well.
      this.over = true;
      this.active = null;
      this.emit({ kind: "over" });
      return;
    }
    if (this.versus && !n && this.pending.length && this.riseGarbage()) return;
    this.goldTurn();
    this.missionTurn();
    this.spawn();
  }

  /** ⚔️ Rows from the opponent (they rise on your next lock that clears nothing). */
  receiveGarbage(lines: number) {
    if (this.over || lines <= 0) return;
    this.pending.push({ lines: Math.min(12, lines), hole: Math.floor(this.rng() * COLS) });
  }

  get pendingLines() {
    return this.pending.reduce((n, p) => n + p.lines, 0);
  }

  /** Your rows first knock out incoming ones; the rest go to the opponent. */
  private sendAttack(lines: number) {
    let left = lines;
    let cancelled = 0;
    while (left > 0 && this.pending.length) {
      const p = this.pending[0]!;
      const k = Math.min(left, p.lines);
      p.lines -= k;
      left -= k;
      cancelled += k;
      if (!p.lines) this.pending.shift();
    }
    if (cancelled) this.emit({ kind: "cancel", lines: cancelled });
    if (left > 0) {
      this.sent += left;
      this.emit({ kind: "attack", lines: left });
    }
  }

  /** Push the waiting garbage up from the bottom. True = it pushed the stack out of the top (game over). */
  private riseGarbage(): boolean {
    let total = 0;
    let out = false;
    for (const p of this.pending.splice(0)) {
      for (let i = 0; i < p.lines; i++) {
        const gone = this.board.shift()!;
        this.tags.shift();
        if (gone.some((v) => v)) out = true;
        const row = Array(COLS).fill(GARBAGE);
        row[p.hole] = 0;
        this.board.push(row);
        this.tags.push(Array(COLS).fill(null));
        total++;
      }
    }
    if (total) this.emit({ kind: "garbage", lines: total });
    if (out) {
      this.over = true;
      this.active = null;
      this.emit({ kind: "over" });
    }
    return out;
  }

  private setFever() {
    const was = this.fever;
    this.fever = FEVER_STEPS.find(([at]) => this.feverChain >= at)?.[1] ?? 1;
    if (this.fever !== was) this.emit({ kind: "fever", mult: this.fever });
  }

  /** Golden rows: now and then one rises from the bottom (only while the stack is low). */
  private goldTurn() {
    if (this.goldAge >= 0) {
      this.goldAge++;
      if (this.goldAge >= GOLD_TO_STONE) {
        for (const row of this.board) for (let x = 0; x < COLS; x++) if (row[x] === GOLD) row[x] = STONE;
        this.goldAge = -1;
        if (this.mission?.id === "gold") {
          // too late for that one: another mission soon
          this.mission = null;
          this.untilMission = 1;
        }
        this.emit({ kind: "stone" });
      }
      return;
    }
    if (--this.untilGold > 0) return;
    // the top half of the well must be empty
    for (let y = 0; y < HIDDEN + 10; y++) if (this.board[y]!.some((v) => v)) return;
    this.untilGold = GOLD_EVERY;
    const hole = Math.floor(this.rng() * COLS);
    this.board.shift();
    this.tags.shift();
    this.board.push(Array.from({ length: COLS }, (_, x) => (x === hole ? 0 : GOLD)));
    this.tags.push(Array(COLS).fill(null));
    this.goldAge = 0;
    this.addFx("gold", 4.5, ROWS - 1, 900);
    this.emit({ kind: "goldRow" });
  }

  private missionTurn() {
    if (this.mission || --this.untilMission > 0) return;
    const pool = MISSIONS.filter((m) => m.id !== this.lastMission && (m.id !== "gold" || this.goldAge >= 0));
    const m = pool[Math.floor(this.rng() * pool.length)]!;
    this.mission = { id: m.id, goal: m.goal, progress: 0 };
    this.emit({ kind: "missionNew", id: m.id });
  }

  private missionProgress(e: ClearEvent) {
    const m = this.mission;
    if (!m) return;
    const add = (() => {
      switch (m.id) {
        case "tspin":
          return e.tspin && e.lines > 0 ? 1 : 0;
        case "triple":
          return e.lines >= 3 ? 1 : 0;
        case "tetra":
          return e.lines >= 4 ? 1 : 0;
        case "combo3":
          return e.combo >= 3 ? 1 : 0;
        case "lines8":
          return e.lines;
        case "bonus":
          return e.bonuses.length ? 1 : 0;
        case "spin":
          return e.spin && e.lines > 0 ? 1 : 0;
        case "gold":
          return e.gold ? 1 : 0;
        case "b2b":
          return e.b2b ? 1 : 0;
        case "fever2":
          return this.fever >= 2 ? 1 : 0;
        case "chain3":
          // three pieces in a row that each clear (combo ×2)
          return e.combo >= 2 ? 1 : 0;
      }
    })();
    if (!add) return;
    m.progress = Math.min(m.goal, m.progress + add);
    if (m.progress < m.goal) return;
    const points = 500 * this.level;
    this.score += points;
    this.missionsDone++;
    this.dragonBonus += 3;
    this.addRage(30);
    this.lastMission = m.id;
    this.mission = null;
    this.untilMission = 3;
    this.emit({ kind: "mission", id: m.id, points });
  }

  /** 🔥 V: the dragon burns the bottom 3 rows; double points for 10 s. */
  unleash(): boolean {
    if (!this.playing || !this.rageReady) return false;
    let cells = 0;
    for (let y = ROWS - 3; y < ROWS; y++) cells += this.board[y]!.filter((v) => v).length;
    this.board.splice(ROWS - 3, 3);
    this.tags.splice(ROWS - 3, 3);
    for (let i = 0; i < 3; i++) {
      this.board.unshift(Array(COLS).fill(0));
      this.tags.unshift(Array(COLS).fill(null));
    }
    if (this.goldAge >= 0 && !this.board.some((row) => row.includes(GOLD))) this.goldAge = -1;
    // the piece in the air stays where it was; if the stack moved into it, lift it
    if (this.active) while (!this.fits(this.active) && this.active.y > -2) this.active = { ...this.active, y: this.active.y - 1 };
    const points = cells * 30 * this.level;
    this.score += points;
    this.rage = 0;
    this.rageMs = RAGE_MS;
    for (let x = 0; x < COLS; x += 2) this.addFx("rage", x + 0.5, ROWS - 2, 900);
    this.emit({ kind: "rage", cells, points });
    if (this.versus) this.sendAttack(3);
    return true;
  }

  /** Advance the game by `dt` ms. */
  tick(dt: number) {
    if (this.flash) {
      this.flash.ms -= dt;
      if (this.flash.ms <= 0) this.flash = null;
    }
    if (this.fx.length) {
      for (const f of this.fx) f.ms -= dt;
      this.fx = this.fx.filter((f) => f.ms > 0);
    }
    if (!this.playing || !this.active) return;
    this.elapsedMs += dt;
    if (this.rageMs > 0) this.rageMs = Math.max(0, this.rageMs - dt);
    if (this.slowMs > 0) this.slowMs = Math.max(0, this.slowMs - dt);

    // Auto-repeat of a held left/right.
    if (this.held.dir) {
      this.held.ms += dt;
      if (!this.held.das && this.held.ms >= DAS_MS) {
        this.held.das = true;
        this.held.ms = 0;
        this.move(this.held.dir);
      }
      if (this.held.das) {
        while (this.held.ms >= ARR_MS) {
          this.held.ms -= ARR_MS;
          if (!this.move(this.held.dir)) {
            this.held.ms = 0;
            break;
          }
        }
      }
    }

    // Gravity (⏳ slow bonus: 2.5× slower), soft drop by the ↓ speed setting.
    const g = gravitySeconds(this.level) * 1000 * (this.slowMs > 0 ? 2.5 : 1);
    if (this.softGrace > 0) this.softGrace -= dt;
    const soft = this.soft && this.softGrace <= 0;
    const step = soft ? Math.min(g, SOFT_DROP_MS[this.softSpeed] ?? 75) : g;
    if (step !== this.stepMs) {
      // keep the same fraction of a row when the speed changes (no jump in the smooth drawing)
      this.fall = (this.fall / this.stepMs) * step;
      this.stepMs = step;
    }
    this.fall += dt;
    while (this.fall >= step && this.active) {
      this.fall -= step;
      const next: Active = { ...this.active, y: this.active.y + 1 };
      if (!this.fits(next)) {
        this.fall = 0;
        break;
      }
      this.active = next;
      this.lastWasRotate = false;
      if (soft) this.score += 1;
      if (next.y > this.lowestY) {
        // Falling to a new lowest row gives the move/rotate resets back.
        this.lowestY = next.y;
        this.resets = 0;
      }
    }

    if (this.onGround) {
      this.lockMs += dt;
      if (this.lockMs >= LOCK_MS || this.resets >= MAX_RESETS) this.lock();
    } else {
      this.lockMs = 0;
    }
  }
}
