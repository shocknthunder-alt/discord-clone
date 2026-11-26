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

/** a darker / lighter shade of a #rrggbb colour */
function tone(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(k < 1 ? v * k : v + (255 - v) * (k - 1))));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

interface Body {
  skin: string;
  shirt: string;
  pants: string;
  boots: string;
  /** half the width at the shoulders / hips */
  sw: number;
  hip: number;
  /** a skirt / dress instead of trousers: how low it goes */
  skirt?: { color: string; to: number };
  /** a long coat over the shirt */
  coat?: { color: string; to: number };
  sleeve?: string;
}

/** An angular figure in a three-quarter view, facing right (the mirror makes it face left). */
function figure(c: Ctx, b: Body, frame: number) {
  const s = frame === 1 ? 1 : frame === 2 ? -1 : 0;
  const sleeve = b.sleeve ?? b.coat?.color ?? b.shirt;
  const leg = (x: number, sw: number, dark: boolean) => {
    const col = dark ? tone(b.pants, 0.7) : b.pants;
    poly(c, [x - 3.2, 3, x + 3.2, 3, x + 3 + sw * 2.5, 19, x - 2.6 + sw * 2.5, 19], col, OUT, 1);
    poly(c, [x - 3.4 + sw * 2.5, 18.5, x + 4 + sw * 2.5, 18.5, x + 7 + sw * 2.5, 22.5, x + 6.5 + sw * 2.5, 24, x - 3.6 + sw * 2.5, 24], dark ? tone(b.boots, 0.75) : b.boots, OUT, 1);
  };
  const arm = (x: number, sw: number, dark: boolean) => {
    const col = dark ? tone(sleeve, 0.72) : sleeve;
    const hx = x + sw * 3.2;
    poly(c, [x - 2.8, -12.5, x + 2.8, -12.5, hx + 2.4, 0, hx - 2.4, 0.5], col, OUT, 1);
    poly(c, [hx - 2.4, 0, hx + 2.6, -0.5, hx + 2.8, 3.5, hx - 1.8, 4], dark ? tone(b.skin, 0.8) : b.skin, OUT, 0.9);
  };
  // back arm + legs
  arm(-b.sw + 2.5, -s, true);
  if (!b.skirt) {
    leg(-b.hip * 0.45, -s, true);
    leg(b.hip * 0.45, s, false);
  } else {
    // only the feet show under a skirt
    poly(c, [-5 - s, 19, 1 - s, 19, 2 - s, 24, -5.5 - s, 24], tone(b.boots, 0.75), OUT, 1);
    poly(c, [0 + s, 19, 6 + s, 19, 8 + s, 24, -0.5 + s, 24], b.boots, OUT, 1);
  }
  // torso with the light from the right
  poly(c, [-b.sw, -13, b.sw, -13, b.hip + 0.5, 5, -b.hip - 0.5, 5], b.shirt, OUT, 1.3);
  poly(c, [-b.sw, -13, -b.sw * 0.2, -13, -b.hip * 0.25, 5, -b.hip - 0.5, 5], "rgba(0,0,0,0.22)");
  if (b.skirt) {
    poly(c, [-b.hip - 0.5, 2, b.hip + 0.5, 2, b.hip + 5.5, b.skirt.to, -b.hip - 5.5, b.skirt.to], b.skirt.color, OUT, 1.3);
    poly(c, [-b.hip - 0.5, 2, -1, 2, -2, b.skirt.to, -b.hip - 5.5, b.skirt.to], "rgba(0,0,0,0.22)");
  }
  if (b.coat) {
    poly(c, [-b.sw - 0.8, -13, -1.5, -13, -0.5, b.coat.to, -b.hip - 4, b.coat.to], b.coat.color, OUT, 1.2);
    poly(c, [2.5, -13, b.sw + 0.8, -13, b.hip + 4, b.coat.to, 3, b.coat.to], tone(b.coat.color, 1.08), OUT, 1.2);
    poly(c, [-b.sw - 0.8, -13, -b.sw * 0.3, -13, -b.hip * 0.4, b.coat.to, -b.hip - 4, b.coat.to], "rgba(0,0,0,0.16)");
  }
  // front arm
  arm(b.sw - 2.5, s, false);
  // neck + head (an angular jaw, not a ball)
  poly(c, [-2.6, -17, 3, -17, 3.2, -12.5, -2.8, -12.5], tone(b.skin, 0.82));
  poly(c, [-6, -15.5, -7.5, -22, -6.8, -28.5, -2.5, -32, 3.5, -31.8, 7.4, -28.5, 8.6, -22.5, 8.2, -18.5, 5.4, -15.4, 0.5, -14.2], b.skin, OUT, 1.3);
  poly(c, [-6, -15.5, -7.5, -22, -6.8, -28.5, -2.5, -32, -0.5, -24, -1.5, -15], "rgba(0,0,0,0.14)");
  poly(c, [-2.6, -24.5, -0.6, -25, 0, -21.5, -2.2, -20.8], tone(b.skin, 0.8), "rgba(20,12,8,0.5)", 0.8);
  // face
  poly(c, [2.4, -24.8, 6.4, -25, 6.2, -22.8, 2.6, -22.6], "#ffffff");
  rr(c, 4.3, -24.7, 1.8, 2, 0.4, "#1b1410");
  line(c, [1.8, -26.8, 6.8, -26.6], "rgba(30,18,10,0.9)", 1.3);
  poly(c, [7.6, -23.6, 10.2, -19.8, 7.8, -19.4], tone(b.skin, 0.88), "rgba(20,12,8,0.6)", 0.8);
  line(c, [4.6, -17.6, 7.4, -17.9], "rgba(80,30,20,0.85)", 1);
}

const HAIR = "#2a1d14";

function drawHero(c: Ctx, hero: SurvHeroId, frame: number) {
  const L = HEROES[hero].look;
  const s = frame === 1 ? 1 : frame === 2 ? -1 : 0;
  switch (hero) {
    case "peyo": {
      // the shepherd: linen shirt, a sheepskin vest, a tall black калпак, a crook
      figure(c, { skin: L.skin, shirt: "#e9dcc0", pants: "#5a3d26", boots: "#7a4f2a", sw: 10, hip: 7, sleeve: "#e9dcc0" }, frame);
      poly(c, [-10.5, -13, -3, -13, -2.5, 4, -8.5, 5], "#d6c094", OUT, 1);
      poly(c, [3, -13, 10.5, -13, 8.5, 5, 2.5, 4], "#e2cea2", OUT, 1);
      for (let y = -10; y <= 2; y += 3) {
        line(c, [-9, y, -5, y + 1.5], "rgba(140,110,70,0.6)", 1);
        line(c, [4.5, y, 8.5, y + 1.5], "rgba(140,110,70,0.6)", 1);
      }
      line(c, [-7, 3, 7, 3], "#b3262b", 2.2);
      for (const x of [-3.5, 3.5]) line(c, [x + s * 0.5, 12, x + 1.5 + s * 0.5, 18], "#e9dcc0", 0.9);
      poly(c, [-7.2, -28.5, -6.5, -42, 6.5, -43, 8, -28.5], L.hat, OUT, 1.2);
      for (let x = -5; x <= 6; x += 2.2) line(c, [x, -41, x + 0.6, -30], "rgba(255,255,255,0.08)", 1);
      poly(c, [1.5, -18.8, 9.5, -18.5, 10, -16, 6, -17, 2.5, -16.2], "#1f1612", OUT, 0.8);
      line(c, [15, 24, 15, -36], "#6b4423", 2.2);
      line(c, [15, -36, 15.5, -41, 19.5, -42, 21, -38.5], "#6b4423", 2.2);
      break;
    }
    case "tseko": {
      // Киро Брейка: hoodie with stripes, baggy trousers, chunky sneakers, a cap backwards, a gold chain
      figure(c, { skin: L.skin, shirt: L.body, pants: "#3a3d44", boots: "#f2f2f2", sw: 10.5, hip: 7.5 }, frame);
      line(c, [10, -11, 11.5 + s * 3, -1], "#ffffff", 1.4);
      line(c, [-8, -11, -9.5 - s * 3, -1], "rgba(255,255,255,0.7)", 1.4);
      poly(c, [-4, -13, 4, -13, 2.5, -7, -2.5, -7], tone(L.body, 0.75));
      poly(c, [-5, -1, 5, -1, 4, 4, -4, 4], tone(L.body, 0.82), OUT, 0.8);
      c.beginPath();
      c.moveTo(-4.5, -12.5);
      c.quadraticCurveTo(0, -3, 5, -12.5);
      c.strokeStyle = "#f2c230";
      c.lineWidth = 1.6;
      c.stroke();
      rr(c, -1.3, -6.3, 2.6, 3, 0.6, "#f2c230", OUT, 0.6);
      // headphones round the neck
      c.beginPath();
      c.arc(0.5, -15, 6.5, 0.15 * Math.PI, 0.85 * Math.PI, true);
      c.strokeStyle = "#151515";
      c.lineWidth = 1.6;
      c.stroke();
      rr(c, -7.5, -16.5, 3, 4, 1, "#151515");
      rr(c, 5.5, -16.5, 3, 4, 1, "#151515");
      // cap, backwards
      poly(c, [-7.2, -27, -5.8, -33.2, 1, -34.4, 6.8, -32, 8.2, -27], L.hat, OUT, 1.2);
      poly(c, [-6.5, -28, -14, -27, -13.4, -24.6, -6.2, -25.6], tone(L.hat, 0.7), OUT, 1);
      line(c, [-5.5, -28, 7.5, -28], "rgba(255,255,255,0.5)", 1);
      line(c, [5, -15.8, 7.5, -15], "#2a1d14", 1.6);
      for (const x of [-6, 2]) line(c, [x - s * 2.5, 21.5, x + 6 - s * 2.5, 21.5], "#d9262e", 1);
      break;
    }
    case "nikola": {
      // the physics teacher: a lab coat, a tie, wild grey hair, square glasses
      figure(c, { skin: L.skin, shirt: "#3b4a6b", pants: "#2d2f36", boots: "#1b1b1d", sw: 9.5, hip: 7, coat: { color: L.body, to: 13 } }, frame);
      poly(c, [-0.3, -12.5, 2.3, -12.5, 2, -3, 1, -1, 0, -3], "#b3262b", OUT, 0.7);
      rr(c, 4.5, -8, 4, 4.5, 0.6, "rgba(0,0,0,0.12)");
      line(c, [5.5, -8, 6, -10.5], "#3a6bd9", 1.2);
      for (const [x0, y0, x1, y1] of [
        [-7, -27, -12, -31],
        [-5, -31, -8, -37],
        [-1, -32, -1, -38.5],
        [3, -32, 5, -38],
        [6.5, -30, 11, -34],
        [-7.5, -22, -12.5, -22],
        [-7, -18, -11.5, -16],
      ])
        poly(c, [x0! - 1.8, y0!, x0! + 1.8, y0!, x1!, y1!], L.hat, "rgba(90,90,90,0.8)", 0.8);
      poly(c, [-6.5, -27.5, -2, -32.5, 4, -32, 7, -28.5, 2, -29.5, -3, -28], L.hat);
      c.strokeStyle = "#15161a";
      c.lineWidth = 1.1;
      c.strokeRect(2, -25.6, 4.8, 3.6);
      line(c, [6.8, -24, 9.2, -24.6], "#15161a", 1);
      line(c, [2, -24, -1, -24.6], "#15161a", 1);
      line(c, [4.5, -15.6, 7.6, -16], "#9a9a9a", 1.4);
      break;
    }
    case "gitsa": {
      // Спаска: embroidered blouse, a dark сукман, a red apron with a pattern, a long braid
      poly(c, [-6.5, -26, -9, -14, -8, 0, -6, 4, -4.5, 0, -5, -14, -3.5, -24], HAIR, OUT, 1);
      line(c, [-8, -10, -5, -9], "#c62f3a", 1.5);
      line(c, [-7.5, -4, -4.6, -3], "#c62f3a", 1.5);
      figure(c, { skin: L.skin, shirt: L.trim, pants: L.body, boots: "#3a2418", sw: 8.8, hip: 6.5, skirt: { color: L.body, to: 19 }, sleeve: L.trim }, frame);
      poly(c, [-8.8, -13, -2.5, -13, -3, -2, -7.5, -2], L.body, OUT, 1);
      poly(c, [2.5, -13, 8.8, -13, 7.5, -2, 3, -2], tone(L.body, 1.15), OUT, 1);
      poly(c, [-3, 2, 5, 2, 7, 17, -3.5, 17], L.hat, OUT, 1);
      for (let y = 5; y <= 15; y += 4) {
        c.beginPath();
        for (let x = -2.5; x <= 6; x += 1.5) c.lineTo(x, y + ((x * 2) % 2 ? 1.2 : -1.2));
        c.strokeStyle = "#f2c230";
        c.lineWidth = 0.9;
        c.stroke();
      }
      for (const x of [8.5 + s * 3.2, -6 - s * 3.2]) line(c, [x - 2, -2.5, x + 2, -2.5], "#c62f3a", 1.4);
      // hair parted under a red kerchief
      poly(c, [-7.2, -24, -6.4, -30.5, -1.5, -33, 4.5, -32.5, 8, -28.5, 7.6, -27, 2, -29.5, -4.5, -27], HAIR, OUT, 1);
      poly(c, [-7.8, -27, -5.5, -33.5, 2, -35, 8.6, -29.5, 7.5, -27.8, 1.5, -31, -4, -29.6], L.hat, OUT, 1);
      ell(c, -0.5, -21.5, 1.2, 1.6, "#f2c230", "rgba(80,50,10,0.8)", 0.6);
      break;
    }
    case "strahil": {
      // Баткан: broad shoulders, an open leather jacket, a white tee, a thick chain, bald with a beard
      figure(c, { skin: L.skin, shirt: L.trim, pants: "#2e4a7a", boots: "#141414", sw: 12.5, hip: 8, coat: { color: L.body, to: 6 } }, frame);
      poly(c, [-7, -13, -2.5, -13, -4, -7], "#2a2a2c", OUT, 0.8);
      poly(c, [3.5, -13, 8, -13, 5, -7], "#2a2a2c", OUT, 0.8);
      c.beginPath();
      c.moveTo(-3.5, -12.5);
      c.quadraticCurveTo(0.5, -2, 4.5, -12.5);
      c.strokeStyle = L.hat;
      c.lineWidth = 2.4;
      c.stroke();
      line(c, [-8, 3.5, 8, 3.5], "#5a3a1e", 2.2);
      rr(c, -1.5, 2.2, 3, 2.6, 0.5, "#c9c9c9");
      poly(c, [-5, -18, 0.5, -14, 5.4, -15.4, 8.2, -18.5, 8.4, -20.5, 3, -19.5, -2, -21], "#2a1d14", OUT, 0.8);
      poly(c, [-6.8, -28.5, -2.5, -32, 3.5, -31.8, 7.4, -28.5, 2, -30.5, -4, -30], "rgba(255,255,255,0.25)");
      line(c, [1.8, -27.2, 6.8, -26.9], "#1a120c", 2);
      line(c, [-3.5, -26, -1, -22.5], "rgba(160,60,50,0.7)", 1);
      // a hatchet in the hand
      line(c, [13 + s * 3.2, 4, 13 + s * 3.2, -10], "#6b4423", 2.2);
      poly(c, [12 + s * 3.2, -10, 19 + s * 3.2, -12, 19 + s * 3.2, -4, 12 + s * 3.2, -6], "#a9b1b8", OUT, 1);
      break;
    }
    case "vela": {
      // the samodiva: a long white dress, golden hair to the waist, a wreath, a faint glow
      const g = c.createRadialGradient(0, -6, 3, 0, -6, 30);
      g.addColorStop(0, "rgba(200,255,220,0.35)");
      g.addColorStop(1, "rgba(200,255,220,0)");
      c.fillStyle = g;
      c.fillRect(-28, -36, 56, 60);
      poly(c, [-7.5, -27, -11, -10, -9, 4, -4, 0, -4.5, -14, -2, -26], L.hat, OUT, 1);
      figure(c, { skin: L.skin, shirt: L.body, pants: L.body, boots: L.skin, sw: 8.5, hip: 6.2, skirt: { color: L.body, to: 21 }, sleeve: L.skin }, frame);
      line(c, [-10, 19, 11, 19], L.trim, 1.6);
      for (let x = -9; x <= 10; x += 3) poly(c, [x, 17, x + 1.5, 15, x + 3, 17], L.trim);
      line(c, [-6.5, 2, 6.5, 2], L.trim, 1.6);
      poly(c, [-7, -24, -6.5, -30.5, -1.5, -33, 4.5, -32.5, 8, -28.5, 6, -28.4, 1, -30, -4, -27.6], L.hat, OUT, 1);
      for (let i = 0; i < 7; i++) {
        const x = -6 + i * 2.3;
        const y = -31.5 - Math.sin((i / 6) * Math.PI) * 1.5;
        poly(c, [x - 1.4, y, x, y - 1.8, x + 1.4, y, x, y + 1.6], i % 2 ? "#ff7aa8" : "#ffffff", "rgba(80,40,60,0.5)", 0.5);
      }
      break;
    }
    case "gosho": {
      // Бай Гошууу the kuker: a shaggy costume, a belt of bells, a tall red mask with horns
      figure(c, { skin: L.skin, shirt: L.body, pants: "#2b2420", boots: "#5a3a1e", sw: 11.5, hip: 9 }, frame);
      for (let i = 0; i < 22; i++) {
        const x = -12 + (i % 11) * 2.4;
        const y = i < 11 ? -10 : 0;
        line(c, [x, y, x + (i % 2 ? 1 : -1), y + 9 + (i % 3)], i % 4 === 0 ? L.trim : "#3a312b", 1.4);
      }
      for (const x of [-8, -2.5, 3, 8.5]) {
        ell(c, x, 5, 2.6, 2.6, "#d9b44a", OUT, 0.9);
        line(c, [x - 1, 6, x + 1, 6], "#7a5a1e", 0.8);
      }
      poly(c, [-8.5, -37, 9, -37, 10, -14, 6, -11, -6, -11, -9.5, -14], L.hat, OUT, 1.3);
      poly(c, [-8.5, -37, -1, -37, -2, -11, -6, -11, -9.5, -14], "rgba(0,0,0,0.18)");
      for (const [hx, dir] of [
        [-6, -1],
        [6.5, 1],
      ] as [number, number][]) {
        poly(c, [hx - 2, -36, hx + 2, -36, hx + dir * 8, -46, hx + dir * 12, -44, hx + dir * 7, -40], "#efe6d0", OUT, 1);
      }
      poly(c, [-4.5, -30, -0.5, -30, -1, -26.5, -4.5, -27], "#fff6c0", OUT, 0.8);
      poly(c, [2.5, -30, 7, -30, 6.5, -26.8, 3, -26.5], "#fff6c0", OUT, 0.8);
      rr(c, -1.2, -29, 2, 2, 0.4, "#111");
      rr(c, 4, -29, 2, 2, 0.4, "#111");
      poly(c, [-5, -19, 7, -19, 5.5, -14.5, -3.5, -14.5], "#fff", OUT, 0.8);
      for (let x = -3; x <= 5; x += 2) line(c, [x, -19, x, -14.5], "rgba(0,0,0,0.5)", 0.6);
      line(c, [-8, -33, 9, -33], "#f2c230", 1.2);
      for (let i = 0; i < 5; i++) line(c, [-6 + i * 3, -37, -7 + i * 3, -41], ["#ff3b3b", "#3bb3ff", "#ffe23b", "#3bff7a", "#ff3bd2"][i]!, 1.6);
      break;
    }
    case "mitko": {
      // Митьо Крика: a tracksuit with side stripes, a flat cap, a big moustache, a car jack in hand
      figure(c, { skin: L.skin, shirt: L.body, pants: L.body, boots: "#e8e8e8", sw: 10.5, hip: 8.5 }, frame);
      poly(c, [-8.8, -2, 9.4, -2, 10.4, 3, 9, 5.5, -9, 5.5], tone(L.body, 1.12), OUT, 1);
      for (const [x, sw] of [
        [-3.8, -s],
        [3.8, s],
      ] as [number, number][]) {
        line(c, [x + 2.6, 4, x + 2.6 + sw * 2.5, 18], "#ffffff", 0.9);
        line(c, [x + 1.6, 4, x + 1.6 + sw * 2.5, 18], "#ffffff", 0.9);
      }
      line(c, [9.5, -11, 11 + s * 3.2, -1], "#ffffff", 0.9);
      line(c, [8.5, -11, 10 + s * 3.2, -1], "#ffffff", 0.9);
      line(c, [0.5, -13, 0.5, 2], "rgba(255,255,255,0.6)", 0.9);
      poly(c, [-7.6, -27, -6.5, -31.5, 2, -33, 8, -30.5, 12.5, -28.4, 12, -27, -7.4, -26], L.hat, OUT, 1.1);
      line(c, [-6.8, -29, 8, -29.5], "rgba(255,255,255,0.15)", 1);
      poly(c, [1, -19.4, 10.5, -19, 11.5, -15.8, 8, -16.8, 5, -16, 2, -16.8], "#3a2418", OUT, 0.8);
      ell(c, 9.4, -20.5, 1.6, 1.4, "#d9473a");
      // the jack
      const jx = 12.5 + s * 3.2;
      poly(c, [jx - 5, 6, jx + 5, 6, jx + 4, 8, jx - 4, 8], "#555", OUT, 0.8);
      line(c, [jx - 4, 6, jx, 1, jx + 4, 6], "#d4202a", 1.8);
      line(c, [jx - 4, -4, jx, 1, jx + 4, -4], "#d4202a", 1.8);
      poly(c, [jx - 4, -5, jx + 4, -5, jx + 3, -3.5, jx - 3, -3.5], "#555", OUT, 0.8);
      break;
    }
    case "stana": {
      // the herb woman: a long hooded green cloak, a staff with a bunch of herbs
      line(c, [-12, 24, -12.5, -30], "#6b4423", 2);
      poly(c, [-15, -30, -10, -30, -9.5, -26, -12.5, -24, -15.5, -26], "#5f8a3a", OUT, 0.8);
      ell(c, -14, -32, 2.4, 2, "#c6e07a");
      ell(c, -11, -32.5, 2, 1.8, "#8ccf5a");
      figure(c, { skin: L.skin, shirt: L.trim, pants: L.body, boots: "#3a2418", sw: 9, hip: 6.5, skirt: { color: L.trim, to: 19 }, coat: { color: L.body, to: 21 } }, frame);
      poly(c, [-8.8, -15, -9.2, -28, -4, -35, 4, -35, 9.6, -29, 9.8, -24, 7.5, -27.5, 2, -31, -4, -29, -6, -22, -5.5, -14], L.hat, OUT, 1.2);
      poly(c, [-8.8, -15, -9.2, -28, -4, -35, -3, -30, -6, -22, -5.5, -14], "rgba(0,0,0,0.2)");
      line(c, [3, -20.5, 6, -20.8], "rgba(90,50,30,0.6)", 0.8);
      line(c, [2.4, -27.6, 4.5, -28], "rgba(90,50,30,0.5)", 0.8);
      rr(c, -4, 2, 5, 5, 1.2, "#8a6238", OUT, 0.8);
      break;
    }
  }
}

export function heroSprite(hero: SurvHeroId, frame: number, v: number, flip: boolean) {
  return get(`h2:${hero}:${frame}`, 52, 72, (c) => {
    c.translate(0, 8);
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
  wolf: {
    w: 44,
    h: 30,
    draw: (c, f) => {
      line(c, [-14, -2, -21, -7 + f * 2, -19, -1], "#6d6a66", 3);
      for (const [x, k] of [
        [-9, f],
        [-4, -f],
        [6, -f],
        [10, f],
      ] as [number, number][])
        poly(c, [x - 1.6, 3, x + 1.6, 3, x + 1.6 + k * 2, 12, x - 1 + k * 2, 12], "#55524e", OUT, 0.8);
      poly(c, [-15, -4, -6, -8, 8, -7, 13, -2, 10, 5, -13, 5], "#86827c", OUT, 1.3);
      poly(c, [-15, -4, -6, -8, 0, -7, -2, 5, -13, 5], "rgba(0,0,0,0.18)");
      poly(c, [9, -10, 14, -14, 18, -11, 23, -9, 23, -6, 17, -4, 11, -3], "#94908a", OUT, 1.2);
      poly(c, [11, -11, 12, -18, 15, -12], "#6d6a66", OUT, 0.9);
      poly(c, [14, -12, 16.5, -18, 17.5, -11], "#6d6a66", OUT, 0.9);
      poly(c, [16, -10.5, 18.5, -10.5, 18, -9.2], "#ffd23a");
      rr(c, 22, -9, 2, 2, 0.6, "#1a1a1a");
      line(c, [18, -5, 22.5, -6], "#fff", 1);
    },
  },
  yuda: {
    w: 38,
    h: 50,
    draw: (c, f) => {
      c.globalAlpha = 0.88;
      poly(c, [-10, -6, 10, -6, 13, 12, 7, 20 + f * 2, 2, 14, -3, 21 - f * 2, -8, 14, -13, 18], "#b9d8ff", "rgba(80,110,170,0.9)", 1.2);
      poly(c, [-10, -6, -1, -6, -3, 14, -8, 14, -13, 18], "rgba(40,60,120,0.25)");
      c.globalAlpha = 1;
      poly(c, [-7, -10, -12, 6, -9, 10, -5, -2], "#101820", OUT, 0.8);
      poly(c, [-5.5, -9, -6, -16, -3, -21, 3, -21, 6.5, -16.5, 6.5, -11, 3, -8], "#e6eefa", OUT, 1.1);
      poly(c, [-7, -10, -7.5, -19, -3, -24, 4, -23.5, 7.5, -19, 4, -20, -2, -19.5, -4, -12], "#101820", OUT, 0.8);
      poly(c, [1, -16.5, 4.5, -16.5, 4.3, -14.8, 1.2, -14.8], "#7affff");
      for (const [x, y] of [
        [-12, 2 - f * 3],
        [12, 1 + f * 3],
      ])
        poly(c, [0, -4, x!, y!, x! * 0.8, y! + 4], "rgba(190,220,255,0.7)");
    },
  },
  pot: {
    w: 30,
    h: 34,
    draw: (c) => {
      // a painted clay стомна
      poly(c, [-4, -12, 4, -12, 5, -9, 9, -4, 10, 4, 7, 11, -7, 11, -10, 4, -9, -4, -5, -9], "#b5652e", OUT, 1.3);
      poly(c, [-4, -12, 0, -12, -1, 11, -7, 11, -10, 4, -9, -4, -5, -9], "rgba(0,0,0,0.15)");
      rr(c, -5, -14, 10, 3, 1, "#9a5426", OUT, 1);
      line(c, [-9.5, -1, 9.8, -1], "#f2e6c6", 1.6);
      for (let x = -8; x <= 8; x += 3) poly(c, [x, 2, x + 1.5, 4.5, x + 3, 2], "#1f2a5a");
      c.beginPath();
      c.moveTo(6, -9);
      c.quadraticCurveTo(14, -8, 10, 1);
      c.strokeStyle = "#9a5426";
      c.lineWidth = 2.2;
      c.stroke();
    },
  },
  hala: {
    w: 120,
    h: 96,
    draw: (c, f) => {
      // a living storm cloud
      for (const [x, y, r] of [
        [-30, 4, 22],
        [-10, -12, 28],
        [16, -8, 26],
        [34, 6, 20],
        [0, 10, 26],
      ])
        ell(c, x!, y!, r!, r! * 0.8, "#4a4f63", "rgba(10,10,25,0.85)", 2);
      for (const [x, y, r] of [
        [-14, -18, 14],
        [12, -14, 12],
      ])
        ell(c, x!, y!, r!, r! * 0.6, "#6a7088");
      poly(c, [-16, -4, -4, 0, -16, 3], "#ffef6a");
      poly(c, [16, -4, 4, 0, 16, 3], "#ffef6a");
      poly(c, [-10, 12, 10, 12, 6, 18, -6, 18], "#151824");
      for (let x = -8; x <= 6; x += 4) poly(c, [x, 12, x + 2, 15, x + 4, 12], "#e8e8e8");
      line(c, [-24 + f * 6, 26, -30 + f * 6, 38, -22 + f * 6, 38, -28 + f * 6, 48], "#cfe9ff", 2.5);
      line(c, [26 - f * 6, 24, 20 - f * 6, 36, 28 - f * 6, 36, 22 - f * 6, 46], "#cfe9ff", 2.5);
    },
  },
  chuma: {
    w: 84,
    h: 104,
    draw: (c, f) => {
      const g = c.createRadialGradient(0, 20, 4, 0, 20, 44);
      g.addColorStop(0, "rgba(120,200,60,0.4)");
      g.addColorStop(1, "rgba(120,200,60,0)");
      c.fillStyle = g;
      c.fillRect(-42, -30, 84, 80);
      line(c, [22, 44, 26, -36], "#3a2a1c", 3);
      ell(c, 26, -40, 6, 6, "#e8e2cc", OUT, 1.2);
      ell(c, 24, -41, 1.5, 1.5, "#111");
      ell(c, 28, -41, 1.5, 1.5, "#111");
      poly(c, [-26, 46, -16, -10, -8, -30, 8, -30, 16, -10, 26, 46, 10, 40 + f * 2, 0, 46, -10, 40 - f * 2], "#2a2c24", OUT, 2);
      poly(c, [-26, 46, -16, -10, -8, -30, -2, -30, -6, 40, -10, 40], "rgba(0,0,0,0.25)");
      poly(c, [-9, -30, -12, -18, -6, -8, 8, -8, 12, -18, 9, -30, 0, -38], "#1d1f18", OUT, 1.5);
      poly(c, [-5, -26, 6, -26, 7, -16, 3, -11, -4, -11, -6, -17], "#c9d1b0", OUT, 1.2);
      poly(c, [4, -21, 13, -15, 5, -15], "#b8c09e", OUT, 1);
      poly(c, [-3, -23, 0, -23, 0, -21, -3, -21], "#8cff4a");
      poly(c, [2.5, -23, 5.5, -23, 5.5, -21, 2.5, -21], "#8cff4a");
      line(c, [-3, -14, 3, -13.5], "#3a2a1c", 1.2);
      for (let i = -12; i <= 12; i += 6) ell(c, i, 30 + (i % 4), 2.6, 2.6, "rgba(140,220,80,0.8)");
    },
  },
  wolfking: {
    w: 124,
    h: 84,
    draw: (c, f) => {
      line(c, [-40, -4, -58, -16 + f * 4, -54, -4], "#1c1a1a", 7);
      for (const [x, k] of [
        [-28, f],
        [-14, -f],
        [16, -f],
        [28, f],
      ] as [number, number][])
        poly(c, [x - 4, 6, x + 4, 6, x + 4 + k * 4, 30, x - 3 + k * 4, 30], "#141212", OUT, 1.5);
      poly(c, [-42, -10, -18, -22, 22, -20, 36, -8, 30, 12, -38, 12], "#262323", OUT, 2.5);
      for (let x = -34; x <= 26; x += 6) poly(c, [x, -18, x + 3, -27, x + 6, -18], "#262323");
      poly(c, [-42, -10, -18, -22, -2, -20, -6, 12, -38, 12], "rgba(0,0,0,0.3)");
      poly(c, [26, -26, 40, -36, 50, -30, 62, -26, 62, -18, 46, -12, 30, -10], "#302c2c", OUT, 2.2);
      poly(c, [32, -30, 34, -46, 42, -32], "#262323", OUT, 1.5);
      poly(c, [42, -32, 47, -46, 50, -30], "#262323", OUT, 1.5);
      poly(c, [44, -27, 50, -27, 49, -24], "#ff2a1a");
      poly(c, [48, -18, 62, -20, 60, -15, 50, -14], "#5a0f0f", OUT, 1);
      for (let x = 50; x < 60; x += 3) poly(c, [x, -19, x + 1.5, -16, x + 3, -19], "#fff");
      // the crown
      poly(c, [32, -38, 34, -48, 38, -42, 41, -51, 44, -42, 48, -49, 49, -38], "#f2c230", OUT, 1.2);
      ell(c, 41, -42, 1.8, 1.8, "#d4202a");
    },
  },
  vampking: {
    w: 100,
    h: 116,
    draw: (c, f) => {
      const wy = f ? -6 : 4;
      poly(c, [-6, -26, -46, wy - 20, -40, wy, -30, wy + 6, -24, wy + 22, -14, 30, -6, 40], "#1a0a12", OUT, 2);
      poly(c, [6, -26, 46, wy - 20, 40, wy, 30, wy + 6, 24, wy + 22, 14, 30, 6, 40], "#1a0a12", OUT, 2);
      poly(c, [-4, -22, -34, wy - 14, -20, wy + 16, -6, 32], "#8c1020");
      poly(c, [4, -22, 34, wy - 14, 20, wy + 16, 6, 32], "#a3142a");
      poly(c, [-12, -26, 12, -26, 14, 44, -14, 44], "#1f1a24", OUT, 2);
      poly(c, [-12, -26, 0, -26, -2, 44, -14, 44], "rgba(0,0,0,0.3)");
      poly(c, [-6, -26, 0, -14, 6, -26], "#f2f2f2");
      line(c, [-3, -18, 3, -18], "#d4202a", 2);
      poly(c, [-14, -26, -22, -46, -10, -30], "#1a0a12", OUT, 1.2);
      poly(c, [14, -26, 22, -46, 10, -30], "#1a0a12", OUT, 1.2);
      poly(c, [-8, -30, -9, -40, -6, -48, 6, -48, 9, -41, 9, -34, 5, -28, -4, -28], "#e8e2ec", OUT, 1.6);
      poly(c, [-9, -40, -6, -52, 6, -52, 10, -42, 5, -44, 0, -42, -4, -46], "#101010", OUT, 1);
      poly(c, [-8, -50, -6, -58, -3, -53, 0, -60, 3, -53, 6, -58, 8, -50], "#f2c230", OUT, 1);
      poly(c, [2, -42, 6, -42, 6, -40, 2, -40], "#e3122a");
      poly(c, [-4, -42, 0, -42, 0, -40, -4, -40], "#e3122a");
      poly(c, [-2, -33, 0, -29.5, 1, -33], "#fff");
      poly(c, [2, -33, 4, -29.5, 5, -33], "#fff");
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
  [PK.axe]: {
    w: 32,
    h: 32,
    draw: (c) => {
      line(c, [-10, 10, 8, -8], "#6b4423", 3);
      line(c, [-10, 10, 8, -8], "#8b5a2b", 1.4);
      poly(c, [3, -12, 13, -10, 14, 0, 8, 2, 4, -3], "#aeb6bd", OUT, 1.2);
      poly(c, [11, -10, 14, -9, 14, 0, 12, 0], "#e8eef2");
    },
  },
  [PK.note]: {
    w: 20,
    h: 22,
    draw: (c) => {
      ell(c, -3, 5, 4, 3, "#ffe27a", OUT, 1);
      line(c, [0.5, 5, 0.5, -8], "#ffe27a", 1.8);
      poly(c, [0.5, -8, 7, -5, 7, -2, 0.5, -4.5], "#ffe27a", OUT, 0.8);
    },
  },
  [PK.bee]: {
    w: 16,
    h: 14,
    draw: (c) => {
      ell(c, -1, -4, 3, 2.2, "rgba(230,245,255,0.8)");
      ell(c, 2, -4, 3, 2.2, "rgba(230,245,255,0.8)");
      poly(c, [-5, 0, -2, -3, 4, -3, 6, 0, 4, 3, -2, 3], "#f2c230", OUT, 0.9);
      line(c, [-1, -2.8, -1.5, 2.8], "#1a1a1a", 1.4);
      line(c, [2, -3, 1.6, 3], "#1a1a1a", 1.4);
      poly(c, [-5, 0, -8, -1, -8, 1], "#1a1a1a");
    },
  },
  [PK.cauldron]: {
    w: 40,
    h: 40,
    draw: (c) => {
      line(c, [-12, 14, -8, 6], "#3a2a1c", 2);
      line(c, [12, 14, 8, 6], "#3a2a1c", 2);
      poly(c, [-13, -4, 13, -4, 11, 8, 6, 12, -6, 12, -11, 8], "#2a2a2c", OUT, 1.4);
      poly(c, [-13, -4, 0, -4, -1, 12, -6, 12, -11, 8], "rgba(255,255,255,0.06)");
      ell(c, 0, -4, 13, 3.4, "#9a5426", OUT, 1.2);
      for (const [x, y] of [
        [-6, -4.5],
        [-1, -3],
        [4, -5],
        [8, -3.5],
      ])
        ell(c, x!, y!, 1.8, 1.2, "#e8c29a");
      for (const x of [-5, 1, 6]) line(c, [x, -9, x + 2, -15, x, -19], "rgba(240,240,240,0.5)", 1.4);
      ell(c, 0, 14, 8, 2, "#ff8a2a");
    },
  },
  [PK.bean]: {
    w: 12,
    h: 10,
    draw: (c) => {
      ell(c, 0, 0, 4, 3, "#c9a074", "#5a3a1e", 1);
      line(c, [-1.5, -1, 1.5, -1.5], "#f2e0c6", 0.8);
    },
  },
  [PK.jack]: {
    w: 36,
    h: 30,
    draw: (c) => {
      rr(c, -13, 8, 26, 4, 1, "#555", OUT, 1);
      line(c, [-10, 8, 0, -2, 10, 8], "#d4202a", 3);
      line(c, [-10, -10, 0, -2, 10, -10], "#d4202a", 3);
      rr(c, -11, -13, 22, 4, 1, "#555", OUT, 1);
      line(c, [-14, -2, 14, -2], "#9a9a9a", 1.4);
      ell(c, 0, -2, 2, 2, "#333");
    },
  },
  [PK.scarecrow]: {
    w: 46,
    h: 60,
    draw: (c) => {
      line(c, [0, 26, 0, -20], "#6b4423", 3);
      line(c, [-18, -8, 18, -8], "#6b4423", 3);
      poly(c, [-12, -12, 12, -12, 10, 10, 6, 6, 2, 12, -3, 6, -7, 11, -10, 6], "#a5452a", OUT, 1.2);
      rr(c, -4, -12, 8, 4, 1, "#2a3a6a");
      for (const x of [-18, 18]) for (let i = -2; i <= 2; i++) line(c, [x, -8, x + (x < 0 ? -3 : 3), -8 + i * 2.5], "#d8b44a", 1);
      ell(c, 0, -19, 7, 7, "#d8c48a", OUT, 1.2);
      line(c, [-3, -21, -1, -19], "#2a1d14", 1.2);
      line(c, [-1, -21, -3, -19], "#2a1d14", 1.2);
      line(c, [2, -21, 4, -19], "#2a1d14", 1.2);
      line(c, [4, -21, 2, -19], "#2a1d14", 1.2);
      line(c, [-3, -15.5, 3, -15.5], "#2a1d14", 1);
      poly(c, [-11, -24, 11, -24, 7, -27, 4, -34, -4, -34, -7, -27], "#7a5a2a", OUT, 1.2);
    },
  },
  [PK.batshot]: {
    w: 22,
    h: 14,
    draw: (c) => {
      poly(c, [-1, 0, -9, -5, -7, 2, -3, 3], "#3a0a1a", OUT, 0.8);
      poly(c, [1, 0, 9, -5, 7, 2, 3, 3], "#3a0a1a", OUT, 0.8);
      ell(c, 0, 1, 3, 3.4, "#5a0f22", OUT, 0.8);
      ell(c, 1, 0, 0.8, 0.8, "#ff3a3a");
    },
  },
};
PROJ_DRAW[PK.bigTsarvul] = PROJ_DRAW[PK.tsarvul]!;
PROJ_DRAW[PK.bigAxe] = PROJ_DRAW[PK.axe]!;

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
  const kind = { tsarvul: PK.tsarvul, prase: PK.pig, kobilitsa: PK.kob, banitsa: PK.banitsa, rakia: PK.bottle, martenitsa: PK.mart, pishtov: PK.bullet, bradva: PK.axe, kazan: PK.cauldron, krik: PK.jack, plashilo: PK.scarecrow }[id];
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
    } else if (id === "sarp") {
      c.beginPath();
      c.arc(2, -2, 11, -2.6, 0.6);
      c.strokeStyle = "#cfd6dc";
      c.lineWidth = 3.2;
      c.stroke();
      c.strokeStyle = "rgba(20,12,8,0.8)";
      c.lineWidth = 0.8;
      c.stroke();
      line(c, [10, 5, 3, 14], "#6b4423", 3);
    } else if (id === "kaval") {
      line(c, [-13, 11, 13, -11], "#8b5a2b", 4);
      line(c, [-13, 11, 13, -11], "#c08a4a", 2);
      for (let i = -1; i <= 2; i++) ell(c, i * 4.2, -i * 3.6 + 0.5, 1, 1, "#2a1d14");
      line(c, [-10, 8.5, -8, 6.8], "#d4202a", 1.6);
      line(c, [7, -6, 9, -7.7], "#d4202a", 1.6);
    } else if (id === "kosher") {
      for (let i = 0; i < 4; i++) ell(c, 0, -8 + i * 5, 11 - Math.abs(i - 1.5) * 2, 3.2, i % 2 ? "#d8a13a" : "#e8b84a", OUT, 0.8);
      ell(c, 0, 4, 2.4, 2, "#3a2418");
      ell(c, 9, -12, 2, 1.6, "#f2c230", OUT, 0.6);
      ell(c, -10, -6, 2, 1.6, "#f2c230", OUT, 0.6);
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
