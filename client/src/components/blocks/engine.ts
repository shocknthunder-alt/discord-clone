// 🧱 Шметрис — the game logic (no drawing, no DOM). A 10×20 well (+2 hidden rows on top), seven
// four-cell pieces, rotation with wall kicks, a shuffled bag of all seven, hold, 3 previews,
// ghost, lock delay, levels every 10 lines, combos and back-to-back bonuses.

export const COLS = 10;
export const ROWS = 22; // rows 0–1 are hidden above the visible well
export const HIDDEN = 2;

export type PieceType = "I" | "J" | "L" | "O" | "S" | "T" | "Z";
export const PIECES: PieceType[] = ["I", "J", "L", "O", "S", "T", "Z"];

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
}

export type GameEvent =
  | { kind: "move" }
  | { kind: "rotate" }
  | { kind: "hold" }
  | { kind: "lock" }
  | { kind: "harddrop"; cells: number }
  | { kind: "clear"; lines: number; tspin: boolean; b2b: boolean; combo: number; points: number; rows: number[] }
  | { kind: "level"; level: number }
  | { kind: "over" };

const LOCK_MS = 500;
const MAX_RESETS = 15;
const DAS_MS = 160;
const ARR_MS = 35;

/** Seconds a piece takes to fall one row at `level`. */
export function gravitySeconds(level: number): number {
  return Math.max(1 / 120, Math.pow(0.8 - (level - 1) * 0.007, level - 1));
}

export class BlocksGame {
  board: number[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
  active: Active | null = null;
  hold: PieceType | null = null;
  holdUsed = false;
  queue: PieceType[] = [];
  score = 0;
  lines = 0;
  level: number;
  combo = -1;
  b2b = false;
  over = false;
  paused = false;
  elapsedMs = 0;
  pieces = 0;
  /** Rows just cleared, for the flash effect (time left in ms). */
  flash: { rows: number[]; ms: number } | null = null;

  private fall = 0;
  private lockMs = 0;
  private resets = 0;
  private lastWasRotate = false;
  private lowestY = 0;
  private held: { dir: -1 | 1 | 0; ms: number; das: boolean } = { dir: 0, ms: 0, das: false };
  private soft = false;
  private rng: () => number;

  constructor(
    private emit: (e: GameEvent) => void,
    public startLevel = 1,
    rng: () => number = Math.random,
  ) {
    this.level = startLevel;
    this.rng = rng;
    this.refill();
    this.spawn();
  }

  private refill() {
    while (this.queue.length < 7) {
      const bag = [...PIECES];
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(this.rng() * (i + 1));
        [bag[i], bag[j]] = [bag[j]!, bag[i]!];
      }
      this.queue.push(...bag);
    }
  }

  private spawnOf(type: PieceType): Active {
    return { type, rot: 0, x: type === "O" ? 4 : 3, y: type === "I" ? -1 : 0 };
  }

  private spawn(type?: PieceType) {
    const t = type ?? this.queue.shift()!;
    this.refill();
    let a = this.spawnOf(t);
    // Born in the hidden rows, then straight away one row down (so it peeks into the well) if it can.
    if (this.fits(a) && this.fits({ ...a, y: a.y + 1 })) a = { ...a, y: a.y + 1 };
    this.active = a;
    this.fall = 0;
    this.lockMs = 0;
    this.resets = 0;
    this.lastWasRotate = false;
    this.lowestY = a.y;
    if (!this.fits(a)) {
      // Topped out.
      this.active = a;
      this.over = true;
      this.emit({ kind: "over" });
    }
  }

  fits(a: Active): boolean {
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
    const cur = this.active.type;
    const swap = this.hold;
    this.hold = cur;
    this.holdUsed = true;
    this.emit({ kind: "hold" });
    this.spawn(swap ?? undefined);
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

  get playing(): boolean {
    return !this.over && !this.paused;
  }

  private isTSpin(): boolean {
    const a = this.active;
    if (!a || a.type !== "T" || !this.lastWasRotate) return false;
    let corners = 0;
    for (const [cx, cy] of [[0, 0], [2, 0], [0, 2], [2, 2]]) {
      const x = a.x + cx!;
      const y = a.y + cy!;
      if (x < 0 || x >= COLS || y >= ROWS || (y >= 0 && this.board[y]![x])) corners++;
    }
    return corners >= 3;
  }

  private lock() {
    const a = this.active;
    if (!a) return;
    const tspin = this.isTSpin();
    let aboveTop = true;
    for (const [cx, cy] of pieceCells(a.type, a.rot)) {
      const y = a.y + cy;
      if (y >= 0) this.board[y]![a.x + cx] = PIECES.indexOf(a.type) + 1;
      if (y >= HIDDEN) aboveTop = false;
    }
    this.pieces++;
    this.emit({ kind: "lock" });
    const full: number[] = [];
    for (let y = 0; y < ROWS; y++) if (this.board[y]!.every((v) => v)) full.push(y);
    if (full.length || tspin) {
      const n = full.length;
      const base = tspin ? [400, 800, 1200, 1600][n]! : [0, 100, 300, 500, 800][n]!;
      const difficult = n > 0 && (n === 4 || tspin);
      const b2b = difficult && this.b2b;
      if (n > 0) {
        this.combo++;
        this.b2b = difficult;
      }
      let points = base * this.level * (b2b ? 1.5 : 1);
      if (n > 0 && this.combo > 0) points += 50 * this.combo * this.level;
      points = Math.round(points);
      this.score += points;
      if (n > 0) {
        for (const y of full) this.board.splice(y, 1);
        while (this.board.length < ROWS) this.board.unshift(Array(COLS).fill(0));
        this.flash = { rows: full, ms: 220 };
        const before = this.level;
        this.lines += n;
        this.level = Math.max(this.startLevel, 1 + Math.floor(this.lines / 10));
        if (this.level > before) this.emit({ kind: "level", level: this.level });
      }
      this.emit({ kind: "clear", lines: n, tspin, b2b, combo: Math.max(0, this.combo), points, rows: full });
    } else {
      this.combo = -1;
    }
    this.holdUsed = false;
    if (aboveTop) {
      // Locked completely above the visible well.
      this.over = true;
      this.active = null;
      this.emit({ kind: "over" });
      return;
    }
    this.spawn();
  }

  /** Advance the game by `dt` ms. */
  tick(dt: number) {
    if (this.flash) {
      this.flash.ms -= dt;
      if (this.flash.ms <= 0) this.flash = null;
    }
    if (!this.playing || !this.active) return;
    this.elapsedMs += dt;

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

    // Gravity (soft drop = 20× faster, at least a row every 40 ms).
    const g = gravitySeconds(this.level) * 1000;
    const step = this.soft ? Math.min(g / 20, 40) : g;
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
      if (this.soft) this.score += 1;
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
