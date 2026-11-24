/**
 * 🍬 Шмиксер engine — an 8×8 match-3 board, no DOM. A move returns a list of steps (what pops,
 * which specials go off, where everything falls, what comes in from the top) so the view can animate
 * them one after the other.
 *
 * Specials: 4 in a row → rocket (clears its row, or its column for a vertical match); an L / T shape
 * → bomb (3×3); 5 in a row → prism (swap it with a gem: every gem of that colour). Two specials
 * swapped together: rocket+rocket = cross, bomb+rocket = 3 rows + 3 cols, bomb+bomb = 5×5,
 * prism+special = all of that colour turn into that special and go off, prism+prism = the whole board.
 * A 2×2 square → firefly: pops its four neighbours and flies to a far gem and pops it (with a rocket
 * or bomb swapped onto it, it carries that there; two fireflies = three of them).
 * Fever: strong moves in a row (a cascade or a special going off) → ×1.5 (3) / ×2 (5) / ×3 (8).
 * Move bonuses: two+ specials made in one move ("Двоен удар"), 30+ gems in one move ("Мега ход");
 * long combos give extra seconds in the time mode.
 * Duel attacks (from the other player): 🧊 ice = a gem can't be moved (it still matches / pops),
 * 🪨 stone = a block that never matches and can't be moved; a match next to it or a blast breaks it.
 */

export const SIZE = 8;
export const COLORS = 6;

export type Special = "rowRocket" | "colRocket" | "bomb" | "prism" | "firefly" | "stone";
export interface Tile {
  id: number;
  color: number; // 0..5 (-1 for a prism, -2 for a stone)
  special: Special | null;
  /** 🧊 frozen by the opponent: can't be swapped */
  ice?: boolean;
}
/** Tiles that can't be swapped (stones, frozen gems). */
const stuck = (t: Tile | null | undefined) => !t || t.special === "stone" || !!t.ice;
export type Grid = (Tile | null)[][]; // [row][col]
export interface Pos {
  r: number;
  c: number;
}

export interface Popped {
  tile: Tile;
  r: number;
  c: number;
}
export interface Step {
  popped: Popped[];
  /** specials that went off this step (for sounds / effects) */
  blasts: { kind: Special | "cross" | "bigBomb" | "allColor" | "board"; r: number; c: number; /** firefly: where it flew */ tr?: number; tc?: number }[];
  /** new specials made from a match (they stay on the board) */
  made: { tile: Tile; r: number; c: number }[];
  /** after popping: every remaining tile's new row (by id) and the new tiles from above (with their start row) */
  falls: { id: number; r: number; c: number }[];
  spawned: { tile: Tile; r: number; c: number; fromR: number }[];
  combo: number; // 1 = the move itself, 2+ = cascades
  points: number;
}
export interface MoveBonus {
  kind: "double" | "mega";
  points: number;
}
export interface MoveResult {
  ok: boolean;
  steps: Step[];
  shuffled: boolean;
  /** the fever multiplier this move got (1 = none) */
  fever?: number;
  /** strong moves in a row so far */
  streak?: number;
  bonuses?: MoveBonus[];
  /** extra seconds (time mode) */
  timeBonus?: number;
}

/** Strong moves in a row → multiplier. */
export function feverOf(streak: number): number {
  return streak >= 8 ? 3 : streak >= 5 ? 2 : streak >= 3 ? 1.5 : 1;
}

let nextId = 1;
const rnd = (n: number) => Math.floor(Math.random() * n);
const inside = (r: number, c: number) => r >= 0 && r < SIZE && c >= 0 && c < SIZE;

export class MatchBoard {
  grid: Grid = [];
  score = 0;
  bestCombo = 0;
  moves = 0;
  /** strong moves in a row (a cascade or a special going off) */
  streak = 0;

  constructor() {
    this.fill();
  }

  private newTile(color = rnd(COLORS), special: Special | null = null): Tile {
    return { id: nextId++, color, special };
  }

  /** A fresh board with no ready-made matches and at least one possible move. */
  fill() {
    do {
      this.grid = [];
      for (let r = 0; r < SIZE; r++) {
        const row: Tile[] = [];
        for (let c = 0; c < SIZE; c++) {
          let color: number;
          do color = rnd(COLORS);
          while (
            (c >= 2 && row[c - 1]!.color === color && row[c - 2]!.color === color) ||
            (r >= 2 && this.grid[r - 1]![c]!.color === color && this.grid[r - 2]![c]!.color === color) ||
            (r >= 1 && c >= 1 && row[c - 1]!.color === color && this.grid[r - 1]![c]!.color === color && this.grid[r - 1]![c - 1]!.color === color)
          );
          row.push(this.newTile(color));
        }
        this.grid.push(row);
      }
    } while (!this.findMove());
  }

  at(p: Pos) {
    return this.grid[p.r]?.[p.c] ?? null;
  }

  /** Mix the colours (specials stay) until there is no match and some move exists. */
  shuffle() {
    const tiles = this.grid.flat().filter((t): t is Tile => !!t && t.special !== "prism" && t.special !== "stone");
    for (let tries = 0; tries < 200; tries++) {
      const colors = tiles.map((t) => t.color).sort(() => Math.random() - 0.5);
      tiles.forEach((t, i) => (t.color = colors[i]!));
      if (this.findMatches().length === 0 && this.findMove()) return;
    }
    this.fill();
  }

  /** Any swap that would make a match (or uses a special pair / a prism) — for the hint. */
  findMove(): [Pos, Pos] | null {
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++)
        for (const [dr, dc] of [
          [0, 1],
          [1, 0],
        ] as const) {
          const a = { r, c };
          const b = { r: r + dr, c: c + dc };
          if (!inside(b.r, b.c)) continue;
          const ta = this.at(a)!;
          const tb = this.at(b)!;
          if (stuck(ta) || stuck(tb)) continue;
          if (ta.special === "prism" || tb.special === "prism" || (ta.special && tb.special)) return [a, b];
          this.swapRaw(a, b);
          const ok = this.findMatches().length > 0;
          this.swapRaw(a, b);
          if (ok) return [a, b];
        }
    return null;
  }

  private swapRaw(a: Pos, b: Pos) {
    const t = this.grid[a.r]![a.c]!;
    this.grid[a.r]![a.c] = this.grid[b.r]![b.c]!;
    this.grid[b.r]![b.c] = t;
  }

  /** Groups of matching cells: each group = the cells + whether it has a horizontal / vertical run of 3+. */
  findMatches(): { cells: Pos[]; h: number; v: number; sq?: boolean }[] {
    const mark: number[][] = Array.from({ length: SIZE }, () => Array(SIZE).fill(-1));
    const runs: { cells: Pos[]; dir: "h" | "v" | "sq" }[] = [];
    const color = (r: number, c: number) => {
      const t = this.grid[r]?.[c];
      return t && t.special !== "prism" ? t.color : -9;
    };
    for (let r = 0; r < SIZE; r++) {
      let c = 0;
      while (c < SIZE) {
        let e = c + 1;
        while (e < SIZE && color(r, e) === color(r, c) && color(r, c) >= 0) e++;
        if (e - c >= 3) runs.push({ cells: Array.from({ length: e - c }, (_, i) => ({ r, c: c + i })), dir: "h" });
        c = e;
      }
    }
    for (let c = 0; c < SIZE; c++) {
      let r = 0;
      while (r < SIZE) {
        let e = r + 1;
        while (e < SIZE && color(e, c) === color(r, c) && color(r, c) >= 0) e++;
        if (e - r >= 3) runs.push({ cells: Array.from({ length: e - r }, (_, i) => ({ r: r + i, c })), dir: "v" });
        r = e;
      }
    }
    // 2×2 squares of one colour (→ firefly)
    for (let r = 0; r + 1 < SIZE; r++)
      for (let c = 0; c + 1 < SIZE; c++) {
        const k = color(r, c);
        if (k >= 0 && color(r, c + 1) === k && color(r + 1, c) === k && color(r + 1, c + 1) === k)
          runs.push({ cells: [{ r, c }, { r, c: c + 1 }, { r: r + 1, c }, { r: r + 1, c: c + 1 }], dir: "sq" });
      }
    // join runs that share a cell (L / T / + shapes)
    const groups: { cells: Pos[]; h: number; v: number; sq?: boolean }[] = [];
    for (const run of runs) {
      const hit = new Set<number>();
      for (const p of run.cells) if (mark[p.r]![p.c]! >= 0) hit.add(mark[p.r]![p.c]!);
      let g: { cells: Pos[]; h: number; v: number; sq?: boolean };
      if (hit.size === 0) {
        g = { cells: [], h: 0, v: 0 };
        groups.push(g);
      } else {
        const ids = [...hit];
        g = groups[ids[0]!]!;
        for (const id of ids.slice(1)) {
          const o = groups[id]!;
          for (const p of o.cells) if (!g.cells.some((q) => q.r === p.r && q.c === p.c)) g.cells.push(p);
          g.h = Math.max(g.h, o.h);
          g.v = Math.max(g.v, o.v);
          g.sq = g.sq || o.sq;
          o.cells = [];
        }
      }
      const gi = groups.indexOf(g);
      for (const p of run.cells) {
        if (!g.cells.some((q) => q.r === p.r && q.c === p.c)) g.cells.push(p);
        mark[p.r]![p.c] = gi;
      }
      if (run.dir === "h") g.h = Math.max(g.h, run.cells.length);
      else if (run.dir === "v") g.v = Math.max(g.v, run.cells.length);
      else g.sq = true;
      for (const p of g.cells) mark[p.r]![p.c] = gi;
    }
    return groups.filter((g) => g.cells.length > 0);
  }

  /** Swap two neighbours. Not a match (and no specials) → { ok: false } and nothing changes. */
  swap(a: Pos, b: Pos): MoveResult {
    if (!inside(a.r, a.c) || !inside(b.r, b.c) || Math.abs(a.r - b.r) + Math.abs(a.c - b.c) !== 1) return { ok: false, steps: [], shuffled: false };
    const ta = this.at(a)!;
    const tb = this.at(b)!;
    if (stuck(ta) || stuck(tb)) return { ok: false, steps: [], shuffled: false };
    this.swapRaw(a, b);
    // a and b now hold each other's tiles: tb sits at a, ta sits at b
    const steps: Step[] = [];
    let first: { clear: Set<string>; blasts: Step["blasts"]; made: Step["made"] } | null = null;

    if (ta.special === "prism" || tb.special === "prism" || (ta.special && tb.special)) {
      first = this.comboOf(ta, b, tb, a);
    } else {
      const groups = this.findMatches();
      if (groups.length === 0) {
        this.swapRaw(a, b);
        return { ok: false, steps: [], shuffled: false };
      }
      first = this.fromGroups(groups, [b, a]);
    }
    this.moves++;
    let combo = 1;
    let cur: typeof first | null = first;
    while (cur) {
      steps.push(this.resolve(cur, combo));
      combo++;
      const groups = this.findMatches();
      cur = groups.length ? this.fromGroups(groups, []) : null;
      if (combo > 60) break;
    }
    this.bestCombo = Math.max(this.bestCombo, steps.length);
    // fever: strong moves in a row multiply this move's points
    const strong = steps.length >= 2 || steps.some((st) => st.blasts.length > 0);
    this.streak = strong ? this.streak + 1 : 0;
    const fever = feverOf(this.streak);
    if (fever > 1)
      for (const st of steps) {
        const extra = Math.round(st.points * (fever - 1));
        st.points += extra;
        this.score += extra;
      }
    const bonuses: MoveBonus[] = [];
    const made = steps.reduce((n, st) => n + st.made.length, 0);
    const popped = steps.reduce((n, st) => n + st.popped.length, 0);
    if (made >= 2) bonuses.push({ kind: "double", points: 250 * made });
    if (popped >= 30) bonuses.push({ kind: "mega", points: 30 * popped });
    for (const b of bonuses) this.score += b.points;
    const timeBonus = Math.min(8, Math.max(0, steps.length - 3)) + (popped >= 30 ? 3 : 0);
    let shuffled = false;
    if (!this.findMove()) {
      this.shuffle();
      shuffled = true;
    }
    return { ok: true, steps, shuffled, fever, streak: this.streak, bonuses, timeBonus };
  }

  /** A far gem for a firefly to fly to (not already going; often a special if there is one). */
  private fireflyTarget(r: number, c: number, taken: Set<string>): Pos | null {
    const options: Pos[] = [];
    const specials: Pos[] = [];
    for (let rr = 0; rr < SIZE; rr++)
      for (let cc = 0; cc < SIZE; cc++) {
        if (taken.has(this.key(rr, cc)) || Math.abs(rr - r) + Math.abs(cc - c) < 3) continue;
        const t = this.grid[rr]![cc];
        if (!t) continue;
        options.push({ r: rr, c: cc });
        if (t.special && t.special !== "firefly") specials.push({ r: rr, c: cc }); // (stones too: it breaks them)
      }
    const pool = specials.length && Math.random() < 0.5 ? specials : options;
    return pool.length ? pool[rnd(pool.length)]! : null;
  }

  private key = (r: number, c: number) => `${r},${c}`;

  /** Two specials (or a prism) swapped together. */
  private comboOf(t1: Tile, p1: Pos, t2: Tile, p2: Pos) {
    const clear = new Set<string>();
    const blasts: Step["blasts"] = [];
    const add = (r: number, c: number) => inside(r, c) && clear.add(this.key(r, c));
    const row = (r: number) => {
      for (let c = 0; c < SIZE; c++) add(r, c);
    };
    const col = (c: number) => {
      for (let r = 0; r < SIZE; r++) add(r, c);
    };
    const s1 = t1.special;
    const s2 = t2.special;
    // a prism is used up by the swap itself (it must not go off again with a random colour)
    if (s1 === "prism") t1.special = null;
    if (s2 === "prism") t2.special = null;
    const at = p1; // where the moved tile landed
    add(p1.r, p1.c);
    add(p2.r, p2.c);
    if (s1 === "prism" && s2 === "prism") {
      for (let r = 0; r < SIZE; r++) row(r);
      blasts.push({ kind: "board", r: at.r, c: at.c });
    } else if (s1 === "prism" || s2 === "prism") {
      const other = s1 === "prism" ? t2 : t1;
      const prismPos = s1 === "prism" ? p1 : p2;
      blasts.push({ kind: "allColor", r: prismPos.r, c: prismPos.c });
      for (let r = 0; r < SIZE; r++)
        for (let c = 0; c < SIZE; c++) {
          const t = this.grid[r]![c]!;
          if (t.color === other.color && t.color >= 0 && t.special !== "prism") {
            // prism + special: every gem of that colour becomes that special and goes off
            if (other.special && other.special !== "prism" && !t.special)
              t.special =
                other.special === "bomb" ? "bomb" : other.special === "firefly" ? "firefly" : Math.random() < 0.5 ? "rowRocket" : "colRocket";
            add(r, c);
          }
        }
    } else if (s1 === "firefly" || s2 === "firefly") {
      // the firefly carries the other special to a far gem (two fireflies = three of them)
      const other = s1 === "firefly" ? s2 : s1;
      t1.special = null;
      t2.special = null;
      const flights = other === "firefly" ? 3 : 1;
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) add(at.r + dr, at.c + dc);
      for (let i = 0; i < flights; i++) {
        const to = this.fireflyTarget(at.r, at.c, clear);
        if (!to) break;
        blasts.push({ kind: "firefly", r: at.r, c: at.c, tr: to.r, tc: to.c });
        if (other === "rowRocket") row(to.r);
        else if (other === "colRocket") col(to.c);
        else if (other === "bomb") {
          for (let r = to.r - 1; r <= to.r + 1; r++) for (let c = to.c - 1; c <= to.c + 1; c++) add(r, c);
          blasts.push({ kind: "bomb", r: to.r, c: to.c });
        } else for (const [dr, dc] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] as const) add(to.r + dr, to.c + dc);
      }
    } else {
      const kinds = [s1, s2];
      const rockets = kinds.filter((k) => k === "rowRocket" || k === "colRocket").length;
      const bombs = kinds.filter((k) => k === "bomb").length;
      t1.special = null; // they go off as the combo, not one by one
      t2.special = null;
      if (rockets === 2) {
        row(at.r);
        col(at.c);
        blasts.push({ kind: "cross", r: at.r, c: at.c });
      } else if (bombs === 2) {
        for (let r = at.r - 2; r <= at.r + 2; r++) for (let c = at.c - 2; c <= at.c + 2; c++) add(r, c);
        blasts.push({ kind: "bigBomb", r: at.r, c: at.c });
      } else {
        for (let d = -1; d <= 1; d++) {
          if (inside(at.r + d, 0)) row(at.r + d);
          if (inside(0, at.c + d)) col(at.c + d);
        }
        blasts.push({ kind: "cross", r: at.r, c: at.c });
      }
    }
    return { clear, blasts, made: [] as Step["made"] };
  }

  /** Matched groups → cells to clear + specials to make (at the moved cell if it is in the group). */
  private fromGroups(groups: { cells: Pos[]; h: number; v: number; sq?: boolean }[], prefer: Pos[]) {
    const clear = new Set<string>();
    const made: Step["made"] = [];
    for (const g of groups) {
      for (const p of g.cells) clear.add(this.key(p.r, p.c));
      let special: Special | null = null;
      if (g.h >= 5 || g.v >= 5) special = "prism";
      else if (g.h >= 3 && g.v >= 3) special = "bomb";
      else if (g.h === 4) special = "rowRocket";
      else if (g.v === 4) special = "colRocket";
      else if (g.sq) special = "firefly";
      if (!special) continue;
      const spot = prefer.find((p) => g.cells.some((q) => q.r === p.r && q.c === p.c)) ?? g.cells[Math.floor(g.cells.length / 2)]!;
      const base = this.grid[spot.r]![spot.c]!;
      made.push({ tile: this.newTile(special === "prism" ? -1 : base.color, special), r: spot.r, c: spot.c });
    }
    return { clear, blasts: [] as Step["blasts"], made };
  }

  /** Pop the cells (specials among them go off, chaining), drop the rest, fill from the top. */
  private resolve(plan: { clear: Set<string>; blasts: Step["blasts"]; made: Step["made"] }, combo: number): Step {
    const { clear, blasts, made } = plan;
    // 🪨 a stone next to a popped gem breaks
    for (const k of [...clear]) {
      const [r, c] = k.split(",").map(Number) as [number, number];
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const)
        if (this.grid[r + dr]?.[c + dc]?.special === "stone") clear.add(this.key(r + dr, c + dc));
    }
    // chain: specials inside the clear area go off too
    const queue = [...clear];
    const fired = new Set<string>();
    while (queue.length) {
      const k = queue.pop()!;
      if (fired.has(k)) continue;
      const [r, c] = k.split(",").map(Number) as [number, number];
      const t = this.grid[r]![c];
      if (!t?.special || t.special === "stone") continue;
      fired.add(k);
      const push = (rr: number, cc: number) => {
        if (!inside(rr, cc)) return;
        const kk = this.key(rr, cc);
        if (!clear.has(kk)) {
          clear.add(kk);
          queue.push(kk);
        }
      };
      if (t.special === "rowRocket") for (let cc = 0; cc < SIZE; cc++) push(r, cc);
      else if (t.special === "colRocket") for (let rr = 0; rr < SIZE; rr++) push(rr, c);
      else if (t.special === "bomb") for (let rr = r - 1; rr <= r + 1; rr++) for (let cc = c - 1; cc <= c + 1; cc++) push(rr, cc);
      else if (t.special === "prism") {
        const col = rnd(COLORS);
        for (let rr = 0; rr < SIZE; rr++) for (let cc = 0; cc < SIZE; cc++) if (this.grid[rr]![cc]?.color === col) push(rr, cc);
      } else if (t.special === "firefly") {
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) push(r + dr, c + dc);
        const to = this.fireflyTarget(r, c, clear);
        if (to) {
          push(to.r, to.c);
          blasts.push({ kind: "firefly", r, c, tr: to.r, tc: to.c });
          continue;
        }
      }
      blasts.push({ kind: t.special, r, c });
    }

    const popped: Popped[] = [];
    for (const k of clear) {
      const [r, c] = k.split(",").map(Number) as [number, number];
      const t = this.grid[r]![c];
      if (t) popped.push({ tile: t, r, c });
      this.grid[r]![c] = null;
    }
    for (const m of made) this.grid[m.r]![m.c] = m.tile;

    const points = popped.length * 20 * combo + made.length * 60 + blasts.length * 80 * combo;
    this.score += points;

    // gravity + refill
    const falls: Step["falls"] = [];
    const spawned: Step["spawned"] = [];
    for (let c = 0; c < SIZE; c++) {
      let write = SIZE - 1;
      for (let r = SIZE - 1; r >= 0; r--) {
        const t = this.grid[r]![c];
        if (!t) continue;
        if (write !== r) {
          this.grid[write]![c] = t;
          this.grid[r]![c] = null;
          falls.push({ id: t.id, r: write, c });
        }
        write--;
      }
      for (let r = write, n = 1; r >= 0; r--, n++) {
        const t = this.newTile();
        this.grid[r]![c] = t;
        spawned.push({ tile: t, r, c, fromR: -n });
      }
    }
    return { popped, blasts: [...blasts], made, falls, spawned, combo, points };
  }

  /** Plain gems (no special, not frozen) — candidates for an attack. */
  private plain(): Tile[] {
    return this.grid.flat().filter((t): t is Tile => !!t && !t.special && !t.ice);
  }

  /** Make sure a move is left after an attack (otherwise mix the colours). */
  private keepPlayable() {
    if (this.findMatches().length || !this.findMove()) this.shuffle();
  }

  /** ⚔️ 🧊 freeze n random gems (they can't be moved). Returns their ids. */
  freeze(n: number): number[] {
    const pool = this.plain().sort(() => Math.random() - 0.5).slice(0, n);
    for (const t of pool) t.ice = true;
    this.keepPlayable();
    return pool.map((t) => t.id);
  }

  /** ⚔️ 🪨 turn n random gems (top half first) into stones. Returns their ids. */
  stones(n: number): number[] {
    const top = this.grid.slice(0, SIZE / 2).flat().filter((t): t is Tile => !!t && !t.special && !t.ice);
    const pool = (top.length >= n ? top : this.plain()).sort(() => Math.random() - 0.5).slice(0, n);
    for (const t of pool) {
      t.special = "stone";
      t.color = -2;
    }
    this.keepPlayable();
    return pool.map((t) => t.id);
  }

  /** ⚔️ 🌀 the opponent mixed your board (specials, ice and stones stay where they are). */
  scramble() {
    this.shuffle();
  }

  /** A tiny picture of the board for the opponent: 0..5 colour, 6 prism, 7 stone; +10 special, +20 ice. */
  codes(): number[] {
    return this.grid.flat().map((t) => {
      if (!t) return 0;
      if (t.special === "stone") return 7;
      if (t.special === "prism") return 6;
      return t.color + (t.special ? 10 : 0) + (t.ice ? 20 : 0);
    });
  }
}
