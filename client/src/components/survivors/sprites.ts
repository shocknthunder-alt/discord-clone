import type { SurvHeroId } from "@discord-clone/shared";
import { HEROES, type EnemyId } from "./content";
import { GK, PK } from "./engine";

// 🧟 Шмиркленд — every picture is drawn here with canvas paths (our own folk-tale look, no image files)
// into cached off-screen canvases: normal, white "hit" flash and icy blue, each also mirrored.

const S = 2; // drawn at 2× for sharp edges when zoomed in

type Ctx = CanvasRenderingContext2D;
type Draw = (c: Ctx, frame: number) => void;

const cache = new Map<string, HTMLCanvasElement>();

function make(w: number, h: number, draw: (c: Ctx) => void): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = Math.ceil(w * S);
  cv.height = Math.ceil(h * S);
  const c = cv.getContext("2d")!;
  c.scale(S, S);
  c.translate(w / 2, h / 2);
  c.lineJoin = "round";
  c.lineCap = "round";
  draw(c);
  return cv;
}

/** variant: 0 normal · 1 white flash · 2 frozen blue */
function variant(base: HTMLCanvasElement, v: number, flip: boolean): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = base.width;
  cv.height = base.height;
  const c = cv.getContext("2d")!;
  if (flip) {
    c.translate(cv.width, 0);
    c.scale(-1, 1);
  }
  c.drawImage(base, 0, 0);
  if (v) {
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = "source-atop";
    c.fillStyle = v === 1 ? "rgba(255,255,255,0.85)" : "rgba(120,200,255,0.55)";
    c.fillRect(0, 0, cv.width, cv.height);
  }
  return cv;
}

function get(key: string, w: number, h: number, draw: (c: Ctx) => void, v = 0, flip = false): HTMLCanvasElement {
  const full = `${key}|${v}|${flip ? 1 : 0}`;
  let cv = cache.get(full);
  if (cv) return cv;
  let base = cache.get(`${key}|0|0`);
  if (!base) {
    base = make(w, h, draw);
    cache.set(`${key}|0|0`, base);
  }
  cv = v || flip ? variant(base, v, flip) : base;
  cache.set(full, cv);
  return cv;
}

/* ───────────── little helpers ───────────── */

function ell(c: Ctx, x: number, y: number, rx: number, ry: number, fill: string, stroke?: string, lw = 1.5) {
  c.beginPath();
  c.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, Math.PI * 2);
  c.fillStyle = fill;
  c.fill();
  if (stroke) {
    c.strokeStyle = stroke;
    c.lineWidth = lw;
    c.stroke();
  }
}
function poly(c: Ctx, pts: number[], fill: string, stroke?: string, lw = 1.5) {
  c.beginPath();
  c.moveTo(pts[0]!, pts[1]!);
  for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i]!, pts[i + 1]!);
  c.closePath();
  c.fillStyle = fill;
  c.fill();
  if (stroke) {
    c.strokeStyle = stroke;
    c.lineWidth = lw;
    c.stroke();
  }
}
function rr(c: Ctx, x: number, y: number, w: number, h: number, r: number, fill: string, stroke?: string, lw = 1.5) {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
  c.fillStyle = fill;
  c.fill();
  if (stroke) {
    c.strokeStyle = stroke;
    c.lineWidth = lw;
    c.stroke();
  }
}
function line(c: Ctx, pts: number[], color: string, lw: number) {
  c.beginPath();
  c.moveTo(pts[0]!, pts[1]!);
  for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i]!, pts[i + 1]!);
  c.strokeStyle = color;
  c.lineWidth = lw;
  c.stroke();
}
const OUT = "rgba(20,12,8,0.85)";

/* ───────────── heroes ───────────── */

function drawHero(c: Ctx, hero: SurvHeroId, frame: number) {
  const L = HEROES[hero].look;
  const step = frame === 1 ? 3 : frame === 2 ? -3 : 0;
  // legs
  rr(c, -6 + step * 0.5, 6, 5, 10, 2, "#2b2420", OUT, 1);
  rr(c, 1 - step * 0.5, 6, 5, 10, 2, "#2b2420", OUT, 1);
  // цървули
  ell(c, -4 + step * 0.5, 16, 4, 2.2, "#7a4f2a");
  ell(c, 4 - step * 0.5, 16, 4, 2.2, "#7a4f2a");

  if (hero === "gosho") {
    // shaggy kuker costume
    poly(c, [-13, 10, -10, -8, 10, -8, 13, 10], L.body, OUT);
    for (let i = -11; i <= 11; i += 3) line(c, [i, -6, i + 1, 10], "#3d342e", 1.2);
    for (let i = -9; i <= 9; i += 6) ell(c, i, 4, 2.2, 2.2, "#d9b44a", OUT, 0.8);
  } else if (hero === "vela") {
    poly(c, [-11, 11, -6, -7, 6, -7, 11, 11], L.body, OUT);
    line(c, [-8, 4, 8, 4], L.trim, 1.6);
  } else {
    rr(c, -9, -7, 18, 16, 5, L.body, OUT);
    line(c, [-9, 2, 9, 2], L.trim, 2.4);
    if (hero === "tseko") line(c, [0, -6, 0, 2], L.trim, 1.6);
    if (hero === "strahil") line(c, [-9, 4, 9, 4], "#c22a2a", 3);
  }
  // arms
  ell(c, -10, 1 + step * 0.3, 3, 3, L.skin, OUT, 1);
  ell(c, 10, 1 - step * 0.3, 3, 3, L.skin, OUT, 1);

  // head
  if (hero === "gosho") {
    // the mask: red face, white teeth, horns
    poly(c, [-8, -26, 8, -26, 9, -8, -9, -8], L.hat, OUT);
    line(c, [-7, -26, -12, -36, -6, -32], "#efe6d0", 2.2);
    line(c, [7, -26, 12, -36, 6, -32], "#efe6d0", 2.2);
    ell(c, -3.5, -20, 2, 2, "#fff6c0", OUT, 0.8);
    ell(c, 3.5, -20, 2, 2, "#fff6c0", OUT, 0.8);
    rr(c, -5, -14, 10, 3, 1, "#fff", OUT, 0.8);
    return;
  }
  if (hero === "vela") ell(c, 0, -10, 10, 13, L.hat); // long hair behind
  ell(c, 0, -16, 9, 9, L.skin, OUT);
  // eyes (looking right; the mirror makes it look left)
  ell(c, 3, -17, 1.4, 1.8, "#1b1410");
  ell(c, -1.5, -17, 1.4, 1.8, "#1b1410");

  switch (hero) {
    case "peyo":
      // калпак + a shepherd's crook
      poly(c, [-8, -21, -6, -33, 6, -33, 8, -21], L.hat, OUT);
      line(c, [12, 12, 12, -20, 15, -24, 18, -21], "#6b4423", 2);
      break;
    case "tseko":
      ell(c, 0, -23, 12, 2.5, L.hat, OUT, 1);
      rr(c, -6, -31, 12, 8, 3, L.hat, OUT, 1);
      line(c, [-2, -12.5, 2, -12, 6, -12.5], "#2a1d14", 1.8);
      break;
    case "nikola":
      ell(c, -8, -21, 4, 4, L.hat);
      ell(c, 8, -21, 4, 4, L.hat);
      ell(c, 0, -25, 6, 4, L.hat);
      c.strokeStyle = "#222";
      c.lineWidth = 1;
      c.beginPath();
      c.arc(3, -17, 2.6, 0, Math.PI * 2);
      c.moveTo(0.5, -17);
      c.arc(-1.8, -17, 2.4, 0, Math.PI * 2);
      c.stroke();
      break;
    case "gitsa":
      poly(c, [-10, -15, -8, -25, 0, -27, 8, -25, 10, -15, 4, -21, -4, -21], L.hat, OUT);
      ell(c, 7, -9, 2.6, 2.6, L.hat);
      break;
    case "strahil":
      rr(c, -8, -32, 16, 10, 4, L.hat, OUT, 1);
      line(c, [-6, -12, 0, -13, 6, -12], "#1d140e", 2.4);
      line(c, [-6, -12, -8, -10], "#1d140e", 2);
      line(c, [6, -12, 8, -10], "#1d140e", 2);
      break;
    case "vela":
      for (let i = -4; i <= 4; i++) ell(c, i * 2.2, -24 + Math.abs(i) * 0.5, 1.8, 1.8, i % 2 ? "#ff7aa8" : "#ffffff");
      break;
    case "mitko":
      ell(c, 0, -23, 9, 3.5, L.hat, OUT, 1);
      ell(c, 4, -24, 6, 2, L.hat);
      ell(c, 6, -14, 2, 1.8, "#d9473a");
      break;
    case "stana":
      poly(c, [-10, -14, -8, -25, 0, -27, 8, -25, 10, -14, 4, -21, -4, -21], L.hat, OUT);
      line(c, [-12, 6, -14, -4], "#4f7a2a", 1.6);
      ell(c, -14, -5, 2.5, 2, "#8ccf5a");
      ell(c, -12, -6, 2, 1.6, "#c6e07a");
      break;
  }
}

export function heroSprite(hero: SurvHeroId, frame: number, v: number, flip: boolean) {
  return get(`h:${hero}:${frame}`, 44, 56, (c) => {
    c.translate(0, 6);
    drawHero(c, hero, frame);
  }, v, flip);
}

/* ───────────── enemies ───────────── */

const ENEMY_DRAW: Record<EnemyId, { w: number; h: number; draw: Draw }> = {
  rat: {
    w: 34,
    h: 24,
    draw: (c, f) => {
      line(c, [-10, 3, -15, 0, -17, -4 + f * 2], "#d79aa0", 1.6);
      ell(c, -1, 2, 10, 6, "#7b7470", OUT);
      ell(c, 8, 0, 5.5, 4.5, "#8d8681", OUT);
      ell(c, 6, -4, 2.6, 2.6, "#d79aa0", OUT, 0.8);
      ell(c, 10, -1, 1.3, 1.3, "#ff3b3b");
      ell(c, 13, 1, 1.2, 1.2, "#2a1d1d");
      line(c, [-6, 7, -7 + f * 2, 10], "#5a5450", 1.6);
      line(c, [3, 7, 4 - f * 2, 10], "#5a5450", 1.6);
    },
  },
  bat: {
    w: 36,
    h: 26,
    draw: (c, f) => {
      const up = f === 0 ? -10 : 2;
      poly(c, [-2, -1, -16, up, -12, 4, -7, 2, -4, 5], "#4b2a5c", OUT, 1);
      poly(c, [2, -1, 16, up, 12, 4, 7, 2, 4, 5], "#4b2a5c", OUT, 1);
      ell(c, 0, 1, 5, 6, "#3a1f47", OUT);
      poly(c, [-3, -4, -4, -9, -1, -5], "#3a1f47");
      poly(c, [3, -4, 4, -9, 1, -5], "#3a1f47");
      ell(c, -2, 0, 1.2, 1.2, "#ffd33d");
      ell(c, 2, 0, 1.2, 1.2, "#ffd33d");
    },
  },
  zombie: {
    w: 34,
    h: 46,
    draw: (c, f) => {
      rr(c, -6, 6, 5, 11, 2, "#3b3a2c", OUT, 1);
      rr(c, 1, 6 + f, 5, 11 - f, 2, "#3b3a2c", OUT, 1);
      poly(c, [-9, 8, -8, -8, 8, -8, 9, 8, 4, 6, 0, 9, -4, 6], "#5d6b4a", OUT);
      rr(c, 2, -6 + f, 14, 4, 2, "#8fa07a", OUT, 1);
      rr(c, 2, -1 - f, 13, 4, 2, "#8fa07a", OUT, 1);
      ell(c, 0, -14, 8, 8, "#9aaf86", OUT);
      ell(c, 3, -15, 1.8, 1.8, "#200");
      ell(c, -2, -15, 1.4, 1.4, "#200");
      line(c, [-1, -10, 4, -10], "#3a2a20", 1.2);
    },
  },
  ghost: {
    w: 34,
    h: 42,
    draw: (c, f) => {
      c.globalAlpha = 0.85;
      c.beginPath();
      c.moveTo(-11, 12);
      c.quadraticCurveTo(-13, -18, 0, -18);
      c.quadraticCurveTo(13, -18, 11, 12);
      for (let i = 0; i < 4; i++) {
        const x0 = 11 - i * 5.5;
        c.quadraticCurveTo(x0 - 2.75, 12 + (i % 2 === f ? 5 : -2), x0 - 5.5, 12);
      }
      c.closePath();
      c.fillStyle = "#eef3ff";
      c.fill();
      c.strokeStyle = "rgba(120,140,190,0.9)";
      c.lineWidth = 1.5;
      c.stroke();
      c.globalAlpha = 1;
      ell(c, -3, -7, 2.4, 3.6, "#1a1a2a");
      ell(c, 4, -7, 2.4, 3.6, "#1a1a2a");
      ell(c, 1, 1, 3, 2.4, "#1a1a2a");
    },
  },
  vampire: {
    w: 38,
    h: 48,
    draw: (c, f) => {
      poly(c, [-14, 16, -10, -8, 10, -8, 14, 16, 0, 12], "#140b12", OUT);
      poly(c, [-10, 14, -7, -5, 7, -5, 10, 14, 0, 11], "#8c1020");
      rr(c, -6, -8, 12, 16, 3, "#1f1a24", OUT, 1);
      poly(c, [-3, -8, 0, -2, 3, -8], "#f2f2f2");
      poly(c, [-14, -6 + f, -9, -14, -7, -6], "#140b12");
      poly(c, [14, -6 + f, 9, -14, 7, -6], "#140b12");
      ell(c, 0, -15, 7.5, 8, "#e8e2ec", OUT);
      poly(c, [-7, -17, 0, -25, 7, -17, 3, -20, 0, -16, -3, -20], "#101010");
      ell(c, 3, -15, 1.4, 1.2, "#e3122a");
      ell(c, -2, -15, 1.4, 1.2, "#e3122a");
      poly(c, [0, -10, 1, -7.5, 2, -10], "#fff");
      poly(c, [-2.5, -10, -1.5, -7.5, -0.5, -10], "#fff");
    },
  },
  werewolf: {
    w: 42,
    h: 46,
    draw: (c, f) => {
      rr(c, -8, 5, 6, 12, 2, "#4a3322", OUT, 1);
      rr(c, 2, 5 + f, 6, 12 - f, 2, "#4a3322", OUT, 1);
      ell(c, 0, 0, 11, 11, "#6b4a30", OUT);
      for (let i = -8; i <= 8; i += 4) line(c, [i, -9, i + 2, -13], "#6b4a30", 2);
      ell(c, 2, -13, 8, 7, "#7a5636", OUT);
      poly(c, [7, -15, 16, -12, 15, -8, 7, -9], "#7a5636", OUT, 1);
      ell(c, 16, -11, 1.6, 1.6, "#1b1410");
      poly(c, [-3, -18, -2, -27, 3, -19], "#5a3d26", OUT, 1);
      poly(c, [4, -19, 7, -27, 9, -17], "#5a3d26", OUT, 1);
      ell(c, 6, -15, 1.5, 1.5, "#ffd23a");
      line(c, [10, -8, 12, -6], "#fff", 1.2);
      ell(c, 12, 2 - f, 3, 3, "#7a5636", OUT, 1);
    },
  },
  witch: {
    w: 38,
    h: 52,
    draw: (c, f) => {
      line(c, [-14, 14, 12, -2 + f], "#6b4423", 2.2);
      poly(c, [-12, 16, -6, -6, 6, -6, 12, 16], "#4c2a6b", OUT);
      line(c, [-8, 6, 8, 6], "#2a1840", 2);
      ell(c, 0, -12, 7, 7, "#86b86a", OUT);
      poly(c, [7, -12, 11, -10, 7, -9], "#86b86a", OUT, 1);
      ell(c, 3, -13, 1.3, 1.3, "#fff200");
      ell(c, -2, -13, 1.3, 1.3, "#fff200");
      ell(c, 0, -18, 12, 2.6, "#1e1228", OUT, 1);
      poly(c, [-6, -19, 4, -36, 6, -19], "#1e1228", OUT, 1);
    },
  },
  blatnik: {
    w: 60,
    h: 54,
    draw: (c, f) => {
      c.beginPath();
      c.moveTo(-24, 18);
      c.bezierCurveTo(-30, -6, -16, -24, 0, -24);
      c.bezierCurveTo(16, -24, 30, -6, 24, 18);
      c.quadraticCurveTo(12, 14 + f * 3, 0, 18);
      c.quadraticCurveTo(-12, 14 - f * 3, -24, 18);
      c.fillStyle = "#4f6b34";
      c.fill();
      c.strokeStyle = OUT;
      c.lineWidth = 2;
      c.stroke();
      ell(c, -10, -6, 5, 4, "#6f8f45");
      ell(c, 10, 6, 6, 4, "#3e5628");
      ell(c, 12, -12, 3, 3, "#6f8f45");
      ell(c, -6, -10, 4, 4.5, "#f6f3c8", OUT, 1);
      ell(c, 7, -10, 4, 4.5, "#f6f3c8", OUT, 1);
      ell(c, -5, -9, 1.8, 2.2, "#200");
      ell(c, 8, -9, 1.8, 2.2, "#200");
      c.beginPath();
      c.arc(1, 2, 7, 0.15 * Math.PI, 0.85 * Math.PI);
      c.strokeStyle = "#1d2a10";
      c.lineWidth = 2;
      c.stroke();
      line(c, [-16, 14, -17, 22], "#4f6b34", 2.5);
    },
  },
  kuker: {
    w: 40,
    h: 54,
    draw: (c, f) => {
      poly(c, [-15, 16, -9, -6, 9, -6, 15, 16], "#3a2b22", OUT);
      for (let i = -13; i <= 13; i += 2.6) line(c, [i * 0.7, -4, i, 16 + (Math.round(i) % 2 ? f : -f)], i % 5 < 2 ? "#e9e3d6" : "#5a463a", 1.4);
      for (let i = -8; i <= 8; i += 8) ell(c, i, 5, 3, 3, "#d9b44a", OUT, 1);
      poly(c, [-8, -28, 8, -28, 9, -6, -9, -6], "#c3262f", OUT);
      line(c, [-6, -28, -13, -40, -6, -35], "#f2ead6", 2.4);
      line(c, [6, -28, 13, -40, 6, -35], "#f2ead6", 2.4);
      ell(c, -3.5, -20, 2, 2.2, "#fff6c0", OUT, 0.8);
      ell(c, 3.5, -20, 2, 2.2, "#fff6c0", OUT, 0.8);
      poly(c, [-5, -13, 5, -13, 3, -9, -3, -9], "#fff", OUT, 0.8);
      for (let i = -6; i <= 6; i += 3) ell(c, i, -30, 1.4, 1.4, ["#ff3b3b", "#3bb3ff", "#ffe23b", "#3bff7a", "#ff3bd2"][(i + 6) / 3]!);
    },
  },
  karak: {
    w: 100,
    h: 96,
    draw: (c, f) => {
      for (let i = 0; i < 26; i++) {
        const a = (i / 26) * Math.PI * 2;
        line(c, [Math.cos(a) * 26, Math.sin(a) * 22 + 6, Math.cos(a) * 36, Math.sin(a) * 31 + 6 + (i % 2 ? f * 2 : 0)], "#1a1414", 4);
      }
      ell(c, 0, 6, 32, 28, "#231b1b", OUT, 2.5);
      rr(c, -22, 26, 9, 14, 3, "#140f0f", OUT);
      rr(c, 13, 26 - f * 2, 9, 14 + f * 2, 3, "#140f0f", OUT);
      ell(c, 18, -18, 18, 16, "#2c2222", OUT, 2.5);
      line(c, [10, -30, 2, -46, 12, -40], "#e8dcc0", 4);
      line(c, [26, -30, 34, -46, 28, -38], "#e8dcc0", 4);
      ell(c, 14, -20, 4.5, 4, "#ff2a1a");
      ell(c, 26, -20, 4.5, 4, "#ff2a1a");
      ell(c, 14, -20, 1.5, 1.5, "#ffe08a");
      ell(c, 26, -20, 1.5, 1.5, "#ffe08a");
      poly(c, [12, -8, 30, -8, 26, -2, 16, -2], "#5a0f0f", OUT, 1.5);
      for (let i = 0; i < 4; i++) poly(c, [14 + i * 4, -8, 16 + i * 4, -4, 18 + i * 4, -8], "#fff");
    },
  },
  mora: {
    w: 84,
    h: 104,
    draw: (c, f) => {
      const g = c.createRadialGradient(0, 0, 4, 0, 0, 44);
      g.addColorStop(0, "rgba(180,90,255,0.45)");
      g.addColorStop(1, "rgba(180,90,255,0)");
      c.fillStyle = g;
      c.fillRect(-42, -52, 84, 104);
      line(c, [26, 40, 30, -38], "#5a3a1e", 3.5);
      ell(c, 30, -42, 6, 6, f ? "#c78bff" : "#9b4dff", OUT, 1.5);
      poly(c, [-28, 44, -14, -12, 14, -12, 28, 44], "#3a1f55", OUT, 2.5);
      poly(c, [-20, 40, -10, 0, 10, 0, 20, 40], "#5c3388");
      line(c, [-14, 10, 14, 10], "#ffcc4d", 2);
      ell(c, 0, -22, 13, 13, "#7fa866", OUT, 2);
      poly(c, [12, -22, 20, -18, 12, -16], "#7fa866", OUT, 1.5);
      ell(c, 5, -24, 2.4, 2.4, "#ffef3a");
      ell(c, -4, -24, 2.4, 2.4, "#ffef3a");
      line(c, [-6, -14, 0, -12, 6, -14], "#2a1a10", 2);
      ell(c, 0, -33, 22, 4.5, "#180d24", OUT, 1.5);
      poly(c, [-11, -34, 6, -66, 11, -34], "#180d24", OUT, 1.5);
      line(c, [-8, -38, 9, -38], "#9b4dff", 2);
      for (let i = -12; i <= 12; i += 4) line(c, [i, -18, i * 1.6, 8], "#cfcfcf", 1);
    },
  },
  lamia: {
    w: 130,
    h: 110,
    draw: (c, f) => {
      // coiled body
      ell(c, 0, 24, 44, 22, "#2f6b3a", OUT, 2.5);
      ell(c, -6, 20, 30, 14, "#3f8a4a");
      for (let i = -36; i <= 36; i += 9) poly(c, [i, 6, i + 4, -2, i + 8, 6], "#d6c24a", OUT, 1);
      line(c, [40, 30, 56, 36 + f * 3, 62, 30], "#2f6b3a", 7);
      // three necks + heads
      const heads: [number, number][] = [
        [-26, -30],
        [0, -42],
        [26, -30],
      ];
      for (const [hx, hy] of heads) {
        line(c, [hx * 0.5, 10, hx * 0.8, hy * 0.5, hx, hy + 8], "#2f6b3a", 9);
        line(c, [hx * 0.5, 10, hx * 0.8, hy * 0.5, hx, hy + 8], "#3f8a4a", 5);
        ell(c, hx, hy, 11, 9, "#3f8a4a", OUT, 2);
        poly(c, [hx + 6, hy - 2, hx + 18, hy + 2, hx + 7, hy + 6], "#3f8a4a", OUT, 1.5);
        poly(c, [hx - 6, hy - 6, hx - 10, hy - 16, hx - 2, hy - 8], "#d6c24a", OUT, 1);
        ell(c, hx + 3, hy - 2, 2.6, 2.2, "#ffde2a");
        ell(c, hx + 3, hy - 2, 0.9, 2, "#1a1a1a");
        if (f) poly(c, [hx + 17, hy + 2, hx + 26, hy - 1, hx + 24, hy + 5], "#ff8a1a");
      }
    },
  },
  zmey: {
    w: 130,
    h: 104,
    draw: (c, f) => {
      const wy = f ? -40 : -24;
      poly(c, [-6, -8, -34, wy - 12, -54, wy + 6, -40, wy + 10, -30, wy + 22, -16, 6], "#7a1f1a", OUT, 2);
      line(c, [-6, -8, -34, wy - 12, -40, wy + 10], "#3a0d0a", 2);
      line(c, [-34, wy - 12, -30, wy + 22], "#3a0d0a", 1.5);
      line(c, [-30, 16, -52, 22, -62, 10, -58, 4], "#a3301f", 8);
      poly(c, [-58, 4, -66, -2, -62, 10], "#d6c24a", OUT, 1);
      ell(c, -4, 10, 30, 18, "#a3301f", OUT, 2.5);
      ell(c, -2, 16, 22, 9, "#e3a24a");
      rr(c, -20, 22, 9, 16, 3, "#7a1f1a", OUT, 1.5);
      rr(c, 8, 22 - f * 2, 9, 16 + f * 2, 3, "#7a1f1a", OUT, 1.5);
      line(c, [18, 0, 32, -18, 38, -26], "#a3301f", 11);
      ell(c, 44, -30, 14, 10, "#a3301f", OUT, 2.5);
      poly(c, [50, -34, 64, -28, 62, -22, 50, -24], "#a3301f", OUT, 1.5);
      line(c, [38, -38, 32, -52, 42, -44], "#e8dcc0", 3);
      line(c, [46, -38, 46, -54, 52, -44], "#e8dcc0", 3);
      ell(c, 47, -32, 2.6, 2.2, "#ffde2a");
      for (let i = -24; i <= 16; i += 8) poly(c, [i, -6, i + 4, -14, i + 8, -6], "#d6c24a", OUT, 1);
      if (f) {
        ell(c, 70, -26, 6, 4, "#ffb21a");
        ell(c, 76, -27, 4, 3, "#fff27a");
      }
    },
  },
};

export function enemySize(type: EnemyId) {
  return ENEMY_DRAW[type];
}

export function enemySprite(type: EnemyId, frame: number, v: number, flip: boolean) {
  const d = ENEMY_DRAW[type];
  return get(`e:${type}:${frame}`, d.w, d.h, (c) => d.draw(c, frame), v, flip);
}

/* ───────────── projectiles ───────────── */

const PROJ_DRAW: Record<number, { w: number; h: number; draw: Draw }> = {
  [PK.tsarvul]: {
    w: 30,
    h: 20,
    draw: (c) => {
      c.beginPath();
      c.moveTo(-12, 3);
      c.quadraticCurveTo(-13, -6, -4, -6);
      c.lineTo(9, -3);
      c.quadraticCurveTo(14, -1, 12, 4);
      c.quadraticCurveTo(0, 8, -12, 3);
      c.fillStyle = "#8b5a2b";
      c.fill();
      c.strokeStyle = OUT;
      c.lineWidth = 1.5;
      c.stroke();
      for (let i = -7; i <= 7; i += 3.5) line(c, [i, -5, i + 2, 5], "#e9dcc0", 1);
      line(c, [9, -3, 15, -7], "#e9dcc0", 1.2);
    },
  },
  [PK.pig]: {
    w: 44,
    h: 32,
    draw: (c, f) => {
      line(c, [-16, -2, -20, -6, -18, -9], "#e88aa0", 1.8);
      rr(c, -10, 6, 5, 8 - f * 2, 2, "#e07a92", OUT, 1);
      rr(c, 4, 6, 5, 8 + f * 2 - 2, 2, "#e07a92", OUT, 1);
      ell(c, -2, 0, 16, 10, "#f7a6b8", OUT);
      ell(c, 13, -2, 7, 7, "#f7a6b8", OUT);
      poly(c, [10, -8, 12, -15, 15, -8], "#e88aa0", OUT, 1);
      ell(c, 19, 0, 3.5, 3, "#ec8ea3", OUT, 1);
      ell(c, 18.5, -0.5, 0.7, 0.9, "#7a2a3a");
      ell(c, 20, -0.5, 0.7, 0.9, "#7a2a3a");
      ell(c, 14, -4, 1.3, 1.3, "#1a1010");
    },
  },
  [PK.boar]: {
    w: 70,
    h: 48,
    draw: (c, f) => {
      line(c, [-26, -4, -32, -8], "#4a3020", 2.5);
      rr(c, -16, 10, 8, 12 - f * 2, 2, "#3a2618", OUT, 1.5);
      rr(c, 8, 10, 8, 10 + f * 2, 2, "#3a2618", OUT, 1.5);
      ell(c, -2, 0, 26, 16, "#5c3d28", OUT, 2);
      for (let i = -20; i <= 12; i += 4) line(c, [i, -14, i + 2, -19], "#3a2618", 2);
      ell(c, 22, -2, 11, 11, "#6b4a32", OUT, 2);
      ell(c, 31, 2, 5, 4.5, "#8a6248", OUT, 1.5);
      line(c, [27, 6, 33, -4], "#f4eedd", 3);
      ell(c, 24, -6, 2, 2, "#ff3a1a");
      poly(c, [16, -12, 18, -22, 22, -12], "#5c3d28", OUT, 1.5);
    },
  },
  [PK.kob]: {
    w: 46,
    h: 34,
    draw: (c) => {
      c.beginPath();
      c.moveTo(-20, 2);
      c.quadraticCurveTo(0, -14, 20, 2);
      c.strokeStyle = "#5a3a1e";
      c.lineWidth = 6;
      c.stroke();
      c.strokeStyle = "#a8743c";
      c.lineWidth = 3.5;
      c.stroke();
      for (const x of [-20, 20]) {
        line(c, [x, 2, x, 6], "#555", 1.2);
        poly(c, [x - 6, 6, x + 6, 6, x + 5, 16, x - 5, 16], "#9aa3ab", OUT, 1.2);
        line(c, [x - 6, 9, x + 6, 9], "#6b747c", 1.2);
        ell(c, x, 6, 6, 1.6, "#5fb8ff");
      }
    },
  },
  [PK.banitsa]: {
    w: 30,
    h: 30,
    draw: (c) => {
      ell(c, 0, 0, 12, 12, "#e8b04a", OUT);
      c.beginPath();
      for (let a = 0; a < Math.PI * 6; a += 0.2) {
        const r = 1 + a * 0.55;
        c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      c.strokeStyle = "#a8661c";
      c.lineWidth = 1.6;
      c.stroke();
      ell(c, -4, -4, 2.5, 1.6, "rgba(255,240,190,0.7)");
    },
  },
  [PK.shard]: {
    w: 16,
    h: 16,
    draw: (c) => {
      poly(c, [-5, 4, 0, -6, 6, 3], "#e8b04a", OUT, 1);
      line(c, [-2, 2, 2, -2], "#a8661c", 1);
    },
  },
  [PK.bottle]: {
    w: 18,
    h: 30,
    draw: (c) => {
      rr(c, -6, -4, 12, 16, 4, "rgba(230,170,70,0.9)", OUT);
      rr(c, -2.5, -13, 5, 10, 1.5, "rgba(230,170,70,0.9)", OUT, 1);
      rr(c, -3, -15, 6, 3, 1, "#7a4a22");
      rr(c, -5, 1, 10, 6, 1, "#f2e6c6");
      ell(c, -3, 6, 1.4, 4, "rgba(255,255,255,0.5)");
    },
  },
  [PK.mart]: {
    w: 26,
    h: 26,
    draw: (c) => {
      // Пижо (white) and Пенда (red) on a twisted cord
      line(c, [-8, -8, 8, -8], "#c8102e", 1.6);
      line(c, [-8, -7, 8, -9], "#fff", 1.2);
      for (const [x, col] of [
        [-5, "#ffffff"],
        [5, "#d4102e"],
      ] as [number, string][]) {
        ell(c, x, -3, 3.5, 3.5, col, OUT, 1);
        poly(c, [x - 4, 0, x + 4, 0, x + 5, 10, x - 5, 10], col, OUT, 1);
        for (let i = -4; i <= 4; i += 2) line(c, [x + i, 9, x + i * 1.2, 12], col, 1.2);
      }
    },
  },
  [PK.bullet]: {
    w: 20,
    h: 12,
    draw: (c) => {
      line(c, [-9, 0, 0, 0], "rgba(255,230,160,0.55)", 3);
      ell(c, 2, 0, 4, 4, "#8f969c", OUT, 1);
      ell(c, 1, -1.2, 1.4, 1.2, "#dfe6ea");
    },
  },
  [PK.sheep]: {
    w: 50,
    h: 40,
    draw: (c, f) => {
      line(c, [-10, 8, -11, 16 - f * 2], "#222", 3);
      line(c, [8, 8, 9, 14 + f * 2], "#222", 3);
      for (const [x, y] of [
        [-10, -2],
        [-2, -7],
        [7, -4],
        [-6, 5],
        [5, 5],
        [12, 2],
      ])
        ell(c, x!, y!, 8, 7, "#f6f4ee", "rgba(80,70,60,0.6)", 1);
      ell(c, 18, -3, 6, 5, "#2a2422", OUT, 1);
      ell(c, 15, -8, 3, 1.8, "#2a2422");
      ell(c, 20, -4, 1.1, 1.1, "#fff");
    },
  },
  [PK.eball]: {
    w: 34,
    h: 34,
    draw: (c) => {
      const g = c.createRadialGradient(0, 0, 1, 0, 0, 15);
      g.addColorStop(0, "#fff7b0");
      g.addColorStop(0.35, "#ffb21a");
      g.addColorStop(0.75, "rgba(255,70,20,0.85)");
      g.addColorStop(1, "rgba(255,40,10,0)");
      c.fillStyle = g;
      c.beginPath();
      c.arc(0, 0, 15, 0, Math.PI * 2);
      c.fill();
    },
  },
  [PK.ebolt]: {
    w: 26,
    h: 26,
    draw: (c) => {
      const g = c.createRadialGradient(0, 0, 1, 0, 0, 11);
      g.addColorStop(0, "#f2ffd0");
      g.addColorStop(0.4, "#8cff4a");
      g.addColorStop(1, "rgba(80,200,40,0)");
      c.fillStyle = g;
      c.beginPath();
      c.arc(0, 0, 11, 0, Math.PI * 2);
      c.fill();
    },
  },
};
PROJ_DRAW[PK.bigTsarvul] = PROJ_DRAW[PK.tsarvul]!;

export function projSprite(kind: number, frame: number) {
  const d = PROJ_DRAW[kind];
  if (!d) return null;
  return get(`p:${kind}:${frame}`, d.w, d.h, (c) => d.draw(c, frame));
}

/* ───────────── pickups ───────────── */

const GEM_COL = ["#4aa8ff", "#4aff8a", "#ff4a6a"];

const PICK_DRAW: Record<number, { w: number; h: number; draw: Draw }> = {
  [GK.coin]: {
    w: 16,
    h: 16,
    draw: (c) => {
      ell(c, 0, 0, 6, 6, "#f2c230", "#8a6410", 1.2);
      ell(c, 0, 0, 3.6, 3.6, "#ffd95a");
      line(c, [-1, -2.5, 1.5, -2.5], "#fff3b0", 1);
    },
  },
  [GK.bag]: {
    w: 24,
    h: 24,
    draw: (c) => {
      ell(c, 0, 3, 8, 7, "#a0763c", OUT);
      poly(c, [-3, -4, 3, -4, 5, -8, -5, -8], "#8a6230", OUT, 1);
      line(c, [-4, -4, 4, -4], "#e8c25a", 1.6);
      ell(c, 0, 4, 3, 3, "#f2c230");
    },
  },
  [GK.food]: {
    w: 26,
    h: 20,
    draw: (c) => {
      // a round loaf with salt on top (хляб и сол)
      ell(c, 0, 2, 11, 7, "#c98a3a", OUT);
      ell(c, 0, 0, 9, 5, "#e0a650");
      for (let i = -6; i <= 6; i += 3) line(c, [i, -2, i + 1.5, 2], "#a8661c", 1);
      ell(c, 0, -3, 3, 1.4, "#ffffff");
    },
  },
  [GK.magnet]: {
    w: 22,
    h: 22,
    draw: (c) => {
      c.beginPath();
      c.arc(0, -1, 7, Math.PI, 0);
      c.strokeStyle = "#d4202a";
      c.lineWidth = 5;
      c.stroke();
      rr(c, -9.5, -1, 5, 8, 1, "#d4202a");
      rr(c, 4.5, -1, 5, 8, 1, "#d4202a");
      rr(c, -9.5, 5, 5, 3, 0.5, "#e8e8e8");
      rr(c, 4.5, 5, 5, 3, 0.5, "#e8e8e8");
    },
  },
  [GK.chest]: {
    w: 34,
    h: 30,
    draw: (c) => {
      rr(c, -13, -2, 26, 14, 2, "#8b5a2b", OUT);
      c.beginPath();
      c.moveTo(-13, -2);
      c.quadraticCurveTo(0, -16, 13, -2);
      c.closePath();
      c.fillStyle = "#a36a32";
      c.fill();
      c.strokeStyle = OUT;
      c.lineWidth = 1.5;
      c.stroke();
      line(c, [-13, 3, 13, 3], "#f2c230", 2.2);
      line(c, [-7, -8, -7, 12], "#f2c230", 2);
      line(c, [7, -8, 7, 12], "#f2c230", 2);
      rr(c, -2.5, 0, 5, 6, 1, "#f2c230", OUT, 1);
    },
  },
  [GK.bomb]: {
    w: 24,
    h: 26,
    draw: (c) => {
      // a clay pot of embers with a fuse
      ell(c, 0, 4, 9, 8, "#b5652e", OUT);
      rr(c, -5, -6, 10, 4, 1.5, "#9a5426", OUT, 1);
      line(c, [-6, 3, 6, 3], "#7a3e1a", 1.5);
      line(c, [1, -6, 4, -10, 2, -12], "#5a4030", 1.5);
      ell(c, 2, -12, 2.4, 2.4, "#ffcc33");
    },
  },
};

export function pickupSprite(k: number) {
  if (k <= GK.red) {
    return get(`g:${k}`, 18, 20, (c) => {
      const col = GEM_COL[k]!;
      const s = k === 2 ? 1.25 : k === 1 ? 1.1 : 1;
      poly(c, [0, -7 * s, 5 * s, 0, 0, 7 * s, -5 * s, 0], col, "rgba(10,10,30,0.8)", 1.2);
      poly(c, [0, -7 * s, 5 * s, 0, 0, 0], "rgba(255,255,255,0.45)");
      poly(c, [0, 7 * s, -5 * s, 0, 0, 0], "rgba(0,0,40,0.25)");
    });
  }
  const d = PICK_DRAW[k];
  if (!d) return null;
  return get(`k:${k}`, d.w, d.h, (c) => d.draw(c, 0));
}

/* ───────────── map ───────────── */

export function shrineSprite() {
  return get("m:shrine", 60, 70, (c) => {
    // a stone with ribbons on an old tree stump (оброк)
    rr(c, -8, -20, 16, 36, 3, "#8a8378", OUT);
    line(c, [-8, -10, 8, -10], "#6f695f", 1.5);
    poly(c, [-3, -26, 3, -26, 2, -20, -2, -20], "#f6e9c8", OUT, 1);
    ell(c, 0, -29, 2, 3.5, "#ffcf4a");
    for (const [x, col] of [
      [-12, "#d4202a"],
      [-6, "#ffffff"],
      [6, "#3a8a2a"],
      [12, "#d4202a"],
    ] as [number, string][]) {
      line(c, [x * 0.6, -14, x, 4 + Math.abs(x) * 0.3], col, 2.2);
    }
  });
}

/** Scenery (no collisions): picked from the world position, so everyone sees the same field. */
export function decorSprite(kind: number) {
  return get(`d:${kind}`, 90, 100, (c) => {
    switch (kind) {
      case 0: // an old pear tree
        rr(c, -5, 4, 10, 30, 3, "#5a3d26", OUT);
        ell(c, 0, -14, 30, 24, "#2f5a2a", OUT, 2);
        ell(c, -10, -20, 14, 11, "#3c7034");
        ell(c, 10, -8, 12, 10, "#3c7034");
        for (const [x, y] of [
          [-14, -6],
          [6, -24],
          [16, -14],
          [-4, -2],
        ])
          ell(c, x!, y!, 2.6, 3, "#d8c24a");
        break;
      case 1: // haystack (копа)
        ell(c, 0, 18, 24, 6, "rgba(0,0,0,0.2)");
        c.beginPath();
        c.moveTo(-24, 18);
        c.quadraticCurveTo(-22, -26, 0, -30);
        c.quadraticCurveTo(22, -26, 24, 18);
        c.closePath();
        c.fillStyle = "#c9a54a";
        c.fill();
        c.strokeStyle = OUT;
        c.lineWidth = 1.5;
        c.stroke();
        for (let i = -18; i <= 18; i += 5) line(c, [i, 14, i * 0.6, -20], "#a8842e", 1);
        line(c, [0, -30, 0, -40], "#5a3d26", 2);
        break;
      case 2: // rocks
        poly(c, [-18, 10, -14, -4, -2, -8, 8, -2, 16, 10], "#7d7a72", OUT);
        poly(c, [-14, -4, -2, -8, 2, 0, -8, 2], "#99958c");
        ell(c, 18, 12, 6, 4, "#6d6a63", OUT, 1);
        break;
      case 3: // bush with berries
        ell(c, -8, 4, 12, 10, "#2e5a2c", OUT);
        ell(c, 8, 2, 13, 11, "#356a30", OUT);
        ell(c, 0, -6, 11, 9, "#3c7a36", OUT);
        for (const [x, y] of [
          [-10, 2],
          [6, -4],
          [12, 6],
          [-2, -8],
        ])
          ell(c, x!, y!, 1.8, 1.8, "#c8203a");
        break;
      case 4: // wattle fence (плет)
        for (let i = -30; i <= 30; i += 12) rr(c, i - 2, -16, 4, 30, 1, "#6b4a2b", OUT, 1);
        for (let r = -10; r <= 8; r += 6) {
          c.beginPath();
          for (let x = -32; x <= 32; x += 6) c.lineTo(x, r + (Math.round(x / 6) % 2 ? 2 : -2));
          c.strokeStyle = "#8b6238";
          c.lineWidth = 2.4;
          c.stroke();
        }
        break;
      default: // wild flowers
        for (const [x, y, col] of [
          [-12, 4, "#ffffff"],
          [-4, -6, "#ffd23a"],
          [6, 2, "#c86bff"],
          [14, -4, "#ffffff"],
          [0, 10, "#ff6b8a"],
        ] as [number, number, string][]) {
          line(c, [x, y + 2, x, y + 10], "#3c7a36", 1.2);
          for (let a = 0; a < 5; a++) ell(c, x + Math.cos(a * 1.26) * 2.4, y + Math.sin(a * 1.26) * 2.4, 1.8, 1.8, col);
          ell(c, x, y, 1.3, 1.3, "#ffb21a");
        }
    }
  });
}

/** A tile of meadow (grass blades, dirt, little flowers) for the ground pattern. */
export function groundTile(): HTMLCanvasElement {
  const key = "ground";
  const hit = cache.get(key);
  if (hit) return hit;
  const N = 512;
  const cv = document.createElement("canvas");
  cv.width = N;
  cv.height = N;
  const c = cv.getContext("2d")!;
  c.fillStyle = "#3b5a2c";
  c.fillRect(0, 0, N, N);
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  // soft patches
  for (let i = 0; i < 26; i++) {
    const x = rnd() * N;
    const y = rnd() * N;
    const r = 30 + rnd() * 70;
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    const col = rnd() < 0.3 ? "rgba(110,90,50,0.22)" : rnd() < 0.5 ? "rgba(70,110,50,0.25)" : "rgba(40,70,30,0.25)";
    g.addColorStop(0, col);
    g.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = g;
    for (const dx of [-N, 0, N]) for (const dy of [-N, 0, N]) {
      c.save();
      c.translate(dx, dy);
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.fill();
      c.restore();
    }
  }
  // grass blades
  for (let i = 0; i < 1400; i++) {
    const x = rnd() * N;
    const y = rnd() * N;
    const h = 3 + rnd() * 5;
    c.strokeStyle = rnd() < 0.5 ? "rgba(90,140,60,0.55)" : "rgba(30,60,25,0.5)";
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + (rnd() - 0.5) * 3, y - h);
    c.stroke();
  }
  for (let i = 0; i < 40; i++) {
    c.fillStyle = ["#fff", "#ffd23a", "#c86bff", "#ff8aa0"][Math.floor(rnd() * 4)]!;
    c.globalAlpha = 0.7;
    c.beginPath();
    c.arc(rnd() * N, rnd() * N, 1.3, 0, Math.PI * 2);
    c.fill();
  }
  c.globalAlpha = 1;
  cache.set(key, cv);
  return cv;
}

/** Icons for the HUD / level-up cards (data URLs of the same pictures). */
const iconCache = new Map<string, string>();
export function weaponIcon(id: string): string {
  const hit = iconCache.get(id);
  if (hit) return hit;
  const kind = { tsarvul: PK.tsarvul, prase: PK.pig, kobilitsa: PK.kob, banitsa: PK.banitsa, rakia: PK.bottle, martenitsa: PK.mart, pishtov: PK.bullet }[id];
  const cv = document.createElement("canvas");
  cv.width = 64;
  cv.height = 64;
  const c = cv.getContext("2d")!;
  if (kind !== undefined) {
    const sp = projSprite(kind, 0)!;
    const s = Math.min(56 / sp.width, 56 / sp.height) * (id === "pishtov" ? 0.9 : 1);
    c.drawImage(sp, 32 - (sp.width * s) / 2, 32 - (sp.height * s) / 2, sp.width * s, sp.height * s);
  } else {
    c.translate(32, 32);
    c.scale(2, 2);
    c.lineCap = "round";
    if (id === "tesla") {
      // a coil with a spark
      for (let i = 0; i < 5; i++) ell(c, 0, 8 - i * 4, 8 - i * 0.6, 2.4, i % 2 ? "#c98a3a" : "#e0a650", OUT, 1);
      ell(c, 0, -14, 4, 4, "#bfe8ff", "#4aa8ff", 1.2);
      line(c, [3, -14, 10, -18, 7, -10, 13, -12], "#9fdcff", 1.5);
    } else if (id === "gaida") {
      ell(c, -2, 4, 10, 8, "#7a4a2a", OUT, 1.2);
      line(c, [6, 0, 12, -12], "#c9a54a", 2.4);
      line(c, [-6, 8, -12, 14], "#c9a54a", 2.4);
      line(c, [-4, -3, -8, -12], "#c9a54a", 2);
      c.strokeStyle = "#ffe27a";
      c.lineWidth = 1.2;
      c.beginPath();
      c.arc(10, -4, 4, -0.9, 0.9);
      c.stroke();
      c.beginPath();
      c.arc(10, -4, 8, -0.8, 0.8);
      c.stroke();
    } else if (id === "chesan") {
      ell(c, 0, 4, 10, 9, "#f4efe4", "rgba(80,70,60,0.8)", 1.2);
      for (const x of [-5, 0, 5]) line(c, [x, -2, x * 0.4, 12], "rgba(170,150,120,0.8)", 1);
      line(c, [0, -5, 0, -13], "#8cb85a", 2);
    }
  }
  const url = cv.toDataURL();
  iconCache.set(id, url);
  return url;
}

export function heroIcon(hero: SurvHeroId): string {
  const key = `hero:${hero}`;
  const hit = iconCache.get(key);
  if (hit) return hit;
  const sp = heroSprite(hero, 0, 0, false);
  const cv = document.createElement("canvas");
  cv.width = sp.width;
  cv.height = sp.height;
  cv.getContext("2d")!.drawImage(sp, 0, 0);
  const url = cv.toDataURL();
  iconCache.set(key, url);
  return url;
}

export function enemyIcon(type: EnemyId): string {
  const key = `enemy:${type}`;
  const hit = iconCache.get(key);
  if (hit) return hit;
  const sp = enemySprite(type, 0, 0, false);
  const cv = document.createElement("canvas");
  cv.width = sp.width;
  cv.height = sp.height;
  cv.getContext("2d")!.drawImage(sp, 0, 0);
  const url = cv.toDataURL();
  iconCache.set(key, url);
  return url;
}
