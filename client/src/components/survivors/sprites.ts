import type { SurvHeroId, SurvMapId, SurvSkinId } from "@discord-clone/shared";
import { HEROES, MAPS, type EnemyId } from "./content";
import { GK, PK } from "./engine";

// 🧟 Шмиркленд — every picture is drawn here with canvas paths (our own folk-tale look, no image files)
// into cached off-screen canvases: normal, white "hit" flash and icy blue, each also mirrored.

const S = 2; // drawn at 2× for sharp edges when zoomed in

type Ctx = CanvasRenderingContext2D;
type Draw = (c: Ctx, frame: number) => void;

const cache = new Map<string, HTMLCanvasElement>();

function make(w: number, h: number, draw: (c: Ctx) => void, volume = false): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = Math.ceil(w * S);
  cv.height = Math.ceil(h * S);
  const c = cv.getContext("2d")!;
  c.scale(S, S);
  c.translate(w / 2, h / 2);
  c.lineJoin = "round";
  c.lineCap = "round";
  draw(c);
  if (volume) {
    // fake 3D: a soft highlight up-right, a shadow down-left, only over what was drawn
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = "source-atop";
    const W = cv.width;
    const H = cv.height;
    const g = c.createLinearGradient(W * 0.85, H * 0.05, W * 0.15, H * 0.95);
    g.addColorStop(0, "rgba(255,250,235,0.32)");
    g.addColorStop(0.45, "rgba(255,255,255,0)");
    g.addColorStop(0.7, "rgba(0,0,0,0.08)");
    g.addColorStop(1, "rgba(0,0,0,0.42)");
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    const rg = c.createRadialGradient(W * 0.62, H * 0.3, 1, W * 0.62, H * 0.3, Math.max(W, H) * 0.35);
    rg.addColorStop(0, "rgba(255,255,255,0.16)");
    rg.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = rg;
    c.fillRect(0, 0, W, H);
    c.globalCompositeOperation = "source-over";
  }
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

function get(key: string, w: number, h: number, draw: (c: Ctx) => void, v = 0, flip = false, volume = key.startsWith("e:") || key.startsWith("p:")): HTMLCanvasElement {
  const full = `${key}|${v}|${flip ? 1 : 0}`;
  let cv = cache.get(full);
  if (cv) return cv;
  let base = cache.get(`${key}|0|0`);
  if (!base) {
    base = make(w, h, draw, volume);
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

/** a darker (k < 1) / lighter (k > 1) shade of a #rrggbb colour */
function tone(hex: string, k: number, a = 1): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(k < 1 ? v * k : v + (255 - v) * (k - 1))));
  return a < 1 ? `rgba(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)},${a})` : `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

type P = { x: number; y: number };

/** A limb as a tapered tube, shaded like a cylinder lit from the upper right. */
function tube(c: Ctx, a: P, b: P, r1: number, r2: number, col: string, outline = true) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const ang = Math.atan2(dy, dx);
  c.beginPath();
  c.moveTo(a.x + nx * r1, a.y + ny * r1);
  c.lineTo(b.x + nx * r2, b.y + ny * r2);
  c.arc(b.x, b.y, r2, ang + Math.PI / 2, ang - Math.PI / 2, true);
  c.lineTo(a.x - nx * r1, a.y - ny * r1);
  c.arc(a.x, a.y, r1, ang - Math.PI / 2, ang + Math.PI / 2, true);
  c.closePath();
  const r = Math.max(r1, r2);
  const g = c.createLinearGradient(a.x - nx * r, a.y - ny * r, a.x + nx * r, a.y + ny * r);
  g.addColorStop(0, tone(col, 1.28));
  g.addColorStop(0.35, col);
  g.addColorStop(0.8, tone(col, 0.62));
  g.addColorStop(1, tone(col, 0.45));
  c.fillStyle = g;
  c.fill();
  if (outline) {
    c.strokeStyle = "rgba(15,8,5,0.75)";
    c.lineWidth = 0.9;
    c.stroke();
  }
}

/** A filled shape with a soft light from the upper right and shadow lower left. */
function shaded(c: Ctx, pts: number[], col: string, cx: number, cy: number, w: number, h: number, outline = true) {
  c.beginPath();
  c.moveTo(pts[0]!, pts[1]!);
  for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i]!, pts[i + 1]!);
  c.closePath();
  const g = c.createLinearGradient(cx - w, cy + h * 0.3, cx + w, cy - h * 0.3);
  g.addColorStop(0, tone(col, 0.5));
  g.addColorStop(0.45, col);
  g.addColorStop(0.8, tone(col, 1.2));
  g.addColorStop(1, tone(col, 1.05));
  c.fillStyle = g;
  c.fill();
  if (outline) {
    c.strokeStyle = "rgba(15,8,5,0.8)";
    c.lineWidth = 1.1;
    c.stroke();
  }
}

/** Where the joints are for a frame: 0..7 walking, 8..9 standing (breathing). */
interface Rig {
  hip: P;
  sh: P;
  head: P;
  bKnee: P;
  bFoot: P;
  fKnee: P;
  fFoot: P;
  bElbow: P;
  bHand: P;
  fElbow: P;
  fHand: P;
  bob: number;
}
function rig(frame: number, sw: number, armOut = 0): Rig {
  const walking = frame < 8;
  const ph = walking ? (frame / 8) * Math.PI * 2 : 0;
  const breathe = walking ? 0 : frame === 9 ? 0.6 : 0;
  const bob = walking ? -Math.abs(Math.sin(ph)) * 1.6 : breathe;
  const hip = { x: 0, y: 3 + bob };
  const sh = { x: 1, y: -13 + bob * 0.9 - breathe * 0.3 };
  const leg = (phase: number, dx: number) => {
    const t = walking ? Math.sin(phase) * 0.5 : 0;
    const lift = walking ? Math.max(0, Math.cos(phase)) * 0.75 : 0;
    const top = { x: hip.x + dx, y: hip.y };
    const knee = { x: top.x + Math.sin(t) * 10.5, y: top.y + Math.cos(t) * 10.5 };
    const s = t - lift;
    return [knee, { x: knee.x + Math.sin(s) * 10.5, y: knee.y + Math.cos(s) * 10.5 }] as [P, P];
  };
  const arm = (phase: number, dx: number) => {
    const u = walking ? -Math.sin(phase) * 0.45 : 0.05;
    const top = { x: sh.x + dx, y: sh.y + 1.5 };
    const elbow = { x: top.x + Math.sin(u + armOut) * 8.5, y: top.y + Math.cos(u + armOut) * 8.5 };
    const f = u + 0.45 + armOut * 0.5;
    return [elbow, { x: elbow.x + Math.sin(f) * 8, y: elbow.y + Math.cos(f) * 8 }] as [P, P];
  };
  const [bKnee, bFoot] = leg(ph + Math.PI, -2);
  const [fKnee, fFoot] = leg(ph, 2);
  const [bElbow, bHand] = arm(ph, -sw + 2);
  const [fElbow, fHand] = arm(ph + Math.PI, sw - 2);
  return { hip, sh, head: { x: sh.x + 1.2, y: sh.y - 10.5 }, bKnee, bFoot, fKnee, fFoot, bElbow, bHand, fElbow, fHand, bob };
}

interface Body {
  skin: string;
  shirt: string;
  pants: string;
  boots: string;
  sw: number;
  hip: number;
  sleeve?: string;
  /** a skirt / dress instead of trousers, down to this y */
  skirt?: { color: string; to: number };
  /** a long coat over the shirt, down to this y */
  coat?: { color: string; to: number };
  /** limb thickness */
  limb?: number;
  armOut?: number;
}

/** Draws the body and returns where the joints ended up (for hats, tools…). */
function body(c: Ctx, b: Body, frame: number, before?: (r: Rig) => void): Rig {
  const r = rig(frame, b.sw, b.armOut ?? 0);
  const L = b.limb ?? 1;
  const sleeve = b.sleeve ?? b.coat?.color ?? b.shirt;
  const hipL = { x: r.hip.x - 2, y: r.hip.y };
  const hipR = { x: r.hip.x + 2, y: r.hip.y };
  const boot = (knee: P, foot: P, dark: boolean) => {
    const col = dark ? tone(b.boots, 0.7) : b.boots;
    tube(c, { x: (knee.x + foot.x * 2) / 3, y: (knee.y + foot.y * 2) / 3 }, foot, 2.6 * L, 2.6 * L, col);
    shaded(c, [foot.x - 3, foot.y - 1.5, foot.x + 5.5, foot.y - 1, foot.x + 7, foot.y + 2.4, foot.x - 3.2, foot.y + 2.6], col, foot.x + 2, foot.y, 5, 3);
  };
  // ground shadow under the feet is drawn by the renderer; here: what's behind the body
  before?.(r);
  tube(c, { x: r.sh.x - b.sw + 2, y: r.sh.y + 1.5 }, r.bElbow, 2.7 * L, 2.4 * L, tone(sleeve, 0.72));
  tube(c, r.bElbow, r.bHand, 2.4 * L, 2 * L, tone(sleeve, 0.72));
  tube(c, r.bHand, { x: r.bHand.x + 0.5, y: r.bHand.y + 1.5 }, 2.1 * L, 1.9 * L, tone(b.skin, 0.75));
  if (!b.skirt) {
    tube(c, hipL, r.bKnee, 3.3 * L, 2.9 * L, tone(b.pants, 0.7));
    tube(c, r.bKnee, r.bFoot, 2.9 * L, 2.5 * L, tone(b.pants, 0.7));
    boot(r.bKnee, r.bFoot, true);
    tube(c, hipR, r.fKnee, 3.3 * L, 2.9 * L, b.pants);
    tube(c, r.fKnee, r.fFoot, 2.9 * L, 2.5 * L, b.pants);
    boot(r.fKnee, r.fFoot, false);
  } else {
    boot({ x: r.bFoot.x, y: r.bFoot.y - 5 }, r.bFoot, true);
    boot({ x: r.fFoot.x, y: r.fFoot.y - 5 }, r.fFoot, false);
  }
  // torso
  const s = r.sh;
  const h = r.hip;
  shaded(c, [s.x - b.sw, s.y, s.x - b.sw + 2, s.y - 1.5, s.x + b.sw - 2, s.y - 1.5, s.x + b.sw, s.y, h.x + b.hip + 0.5, h.y + 2, h.x - b.hip - 0.5, h.y + 2], b.shirt, 0, (s.y + h.y) / 2, b.sw, 16);
  if (b.skirt) {
    const to = b.skirt.to + r.bob * 0.5;
    shaded(c, [h.x - b.hip - 0.5, h.y - 1, h.x + b.hip + 0.5, h.y - 1, h.x + b.hip + 6, to, h.x + 1, to + 1.2, h.x - b.hip - 6, to], b.skirt.color, 0, (h.y + to) / 2, b.hip + 4, to - h.y);
  }
  if (b.coat) {
    const to = b.coat.to + r.bob;
    shaded(c, [s.x - b.sw - 0.8, s.y, s.x - 1.2, s.y - 1, h.x - 0.4, to, h.x - b.hip - 4, to], b.coat.color, h.x - b.hip / 2, (s.y + to) / 2, b.sw / 2 + 2, to - s.y);
    shaded(c, [s.x + 2.4, s.y - 1, s.x + b.sw + 0.8, s.y, h.x + b.hip + 4, to, h.x + 3, to], b.coat.color, h.x + b.hip / 2 + 2, (s.y + to) / 2, b.sw / 2 + 2, to - s.y);
  }
  // neck
  tube(c, { x: s.x + 0.6, y: s.y + 0.5 }, { x: r.head.x - 0.4, y: r.head.y + 5 }, 2.6, 2.4, tone(b.skin, 0.8), false);
  return r;
}

/** The head: an angular jaw, shaded, with a face looking to the right. */
function head(c: Ctx, r: Rig, skin: string, o: { brow?: string; noEyes?: boolean; old?: boolean } = {}) {
  const x = r.head.x;
  const y = r.head.y;
  c.beginPath();
  c.moveTo(x - 6, y + 4.5);
  c.quadraticCurveTo(x - 8, y - 1, x - 6.8, y - 6.5);
  c.quadraticCurveTo(x - 4, y - 10.5, x + 1.5, y - 10.4);
  c.quadraticCurveTo(x + 7, y - 9.6, x + 7.8, y - 4.5);
  c.lineTo(x + 8.6, y + 0.5);
  c.quadraticCurveTo(x + 8.4, y + 4.4, x + 5.2, y + 6.6);
  c.quadraticCurveTo(x + 1.5, y + 8.2, x - 2, y + 7);
  c.closePath();
  const g = c.createRadialGradient(x + 3.5, y - 4.5, 1, x + 1, y, 11);
  g.addColorStop(0, tone(skin, 1.18));
  g.addColorStop(0.55, skin);
  g.addColorStop(1, tone(skin, 0.6));
  c.fillStyle = g;
  c.fill();
  c.strokeStyle = "rgba(15,8,5,0.8)";
  c.lineWidth = 1.1;
  c.stroke();
  // ear
  c.beginPath();
  c.ellipse(x - 2.2, y - 0.5, 1.6, 2.6, 0.2, 0, Math.PI * 2);
  c.fillStyle = tone(skin, 0.78);
  c.fill();
  c.strokeStyle = "rgba(20,10,5,0.5)";
  c.lineWidth = 0.7;
  c.stroke();
  if (o.noEyes) return;
  // eye
  c.beginPath();
  c.ellipse(x + 4.6, y - 1.8, 1.9, 1.3, 0, 0, Math.PI * 2);
  c.fillStyle = "#fbf8f2";
  c.fill();
  c.beginPath();
  c.arc(x + 5.2, y - 1.8, 0.95, 0, Math.PI * 2);
  c.fillStyle = "#3a2a1a";
  c.fill();
  c.beginPath();
  c.arc(x + 5.5, y - 2.15, 0.3, 0, Math.PI * 2);
  c.fillStyle = "#fff";
  c.fill();
  line(c, [x + 2.6, y - 4.2, x + 7, y - 4], o.brow ?? "rgba(40,22,12,0.95)", 1.3);
  // nose with a shadow
  c.beginPath();
  c.moveTo(x + 7.6, y - 1.5);
  c.quadraticCurveTo(x + 10.4, y + 1.6, x + 8.2, y + 2.4);
  c.lineTo(x + 7.2, y + 2);
  c.fillStyle = tone(skin, 0.86);
  c.fill();
  c.strokeStyle = "rgba(40,20,10,0.55)";
  c.lineWidth = 0.7;
  c.stroke();
  // mouth
  line(c, [x + 4.6, y + 4.6, x + 7.4, y + 4.2], "rgba(110,40,30,0.9)", 1);
  if (o.old) {
    line(c, [x + 2.2, y + 1, x + 3.2, y + 3.4], "rgba(80,40,20,0.35)", 0.7);
    line(c, [x + 6.4, y - 5.5, x + 3.6, y - 5.6], "rgba(80,40,20,0.3)", 0.6);
  }
}

/** a shape of hair / hat with a sheen on top */
function hair(c: Ctx, pts: number[], col: string, r: Rig) {
  shaded(c, pts.map((v, i) => v + (i % 2 ? r.head.y : r.head.x)), col, r.head.x, r.head.y - 6, 8, 8);
}

const HAIR = "#2a1d14";

type Look = (typeof HEROES)[SurvHeroId]["look"];

/** 🎨 a skin's clothes (palette skins) */
export function skinLook(hero: SurvHeroId, skin: SurvSkinId): Look {
  const L = HEROES[hero].look;
  switch (skin) {
    case "night":
      return { ...L, body: "#1a1d22", trim: "#5a5f66", hat: "#0e1010", skin: tone(L.skin, 0.8) };
    case "fest":
      return { ...L, body: "#f4efe4", trim: "#d9262e", hat: "#d9262e" };
    case "royal":
      return { ...L, body: "#4b1a6a", trim: "#f2c230", hat: "#7a1020" };
    case "fire":
      return { ...L, body: "#2a1a14", trim: "#4a2a1a", hat: "#1a100c" };
    default:
      return L;
  }
}

/** 🎨 a tint over the whole picture (achievement skins) */
const SKIN_TINT: Partial<Record<SurvSkinId, string>> = {
  night: "rgba(20,30,60,0.32)",
  gold: "rgba(255,196,40,0.6)",
  fire: "rgba(40,16,10,0.6)",
  ghost: "rgba(170,230,255,0.62)",
};

/* ───────────── 🎭 skins = whole costumes (2026-11-27) ───────────── */

/** how high each hero's hat / hair goes above the head's centre (for crowns, hoods, wreaths) */
const HAT_TOP: Record<SurvHeroId, number> = { peyo: -20, tseko: -12, nikola: -12, gitsa: -12.6, strahil: -10.5, vela: -11, gosho: -17, mitko: -11, stana: -13 };

function feetY(r: Rig) {
  return Math.max(r.bFoot.y, r.fFoot.y) + 1;
}

/** behind the body: cloaks, capes, ribbons, halos, flames */
function costumeBack(c: Ctx, hero: SurvHeroId, frame: number, skin: SurvSkinId) {
  const r = rig(frame, 10);
  const s = r.sh;
  const h = r.hip;
  const fy = feetY(r);
  const sway = frame < 8 ? Math.sin((frame / 8) * Math.PI * 2) * 1.8 : 0;
  const top = r.head.y + HAT_TOP[hero];
  switch (skin) {
    case "night": {
      // a long ragged outlaw's cloak, red inside
      const pts = [s.x + 5, s.y - 1.5, s.x - 9, s.y - 1, h.x - 14 + sway, fy - 1];
      for (let i = 0; i < 6; i++) pts.push(h.x - 12 + sway + i * 3.6, fy + (i % 2 ? -3.5 : 1));
      pts.push(h.x + 9, fy - 3);
      shaded(c, pts, "#151a16", h.x - 4, (s.y + fy) / 2, 10, 20);
      poly(c, [s.x - 7, s.y + 1, h.x - 12 + sway, fy - 2, h.x - 8 + sway, fy - 2.5, s.x - 4, s.y + 2], "#7a1018");
      break;
    }
    case "fest": {
      // long ribbons in the colours of a fair, waving from the wreath
      const cols = ["#d9262e", "#f4efe4", "#2f9a48", "#f2c230", "#2f6fd9"];
      for (let i = 0; i < cols.length; i++) {
        const x0 = r.head.x - 5 + i * 0.6;
        const y0 = top + 3 + i * 0.8;
        const w = Math.sin(frame * 0.9 + i) * 2.5;
        c.beginPath();
        c.moveTo(x0, y0);
        c.bezierCurveTo(x0 - 8, y0 + 8 + w, x0 - 4, y0 + 18 - w, x0 - 12 - i * 1.2, y0 + 30 + w);
        c.strokeStyle = cols[i]!;
        c.lineWidth = 2;
        c.stroke();
      }
      break;
    }
    case "royal": {
      // a red velvet cape with a gold edge
      const pts = [s.x + 6, s.y - 1.5, s.x - 10, s.y - 1, h.x - 15 + sway, fy, h.x - 4 + sway * 0.5, fy + 1.5, h.x + 10, fy - 1];
      shaded(c, pts, "#a3121e", h.x - 4, (s.y + fy) / 2, 12, 20);
      c.beginPath();
      c.moveTo(h.x - 15 + sway, fy);
      c.lineTo(h.x - 4 + sway * 0.5, fy + 1.5);
      c.lineTo(h.x + 10, fy - 1);
      c.strokeStyle = "#f2c230";
      c.lineWidth = 1.8;
      c.stroke();
      break;
    }
    case "gold": {
      // a halo of light behind the head + a golden cape
      shaded(c, [s.x + 5, s.y - 1.5, s.x - 9, s.y - 1, h.x - 13 + sway, fy - 1, h.x + 8, fy - 2], "#d9a520", h.x - 3, (s.y + fy) / 2, 10, 20);
      const g = c.createRadialGradient(r.head.x, top + 6, 2, r.head.x, top + 6, 17);
      g.addColorStop(0, "rgba(255,250,200,0.9)");
      g.addColorStop(0.6, "rgba(255,215,90,0.45)");
      g.addColorStop(1, "rgba(255,200,60,0)");
      c.fillStyle = g;
      c.beginPath();
      c.arc(r.head.x, top + 6, 17, 0, Math.PI * 2);
      c.fill();
      c.beginPath();
      c.ellipse(r.head.x, top + 2, 10, 3.2, 0, 0, Math.PI * 2);
      c.strokeStyle = "#fff3a0";
      c.lineWidth = 1.6;
      c.stroke();
      break;
    }
    case "fire": {
      // flames rising behind the whole body
      for (let i = 0; i < 7; i++) {
        const x = h.x - 12 + i * 4;
        const hgt = 20 + ((i * 7 + frame * 3) % 9) * 2.4;
        const base = fy - 2;
        c.beginPath();
        c.moveTo(x - 4, base);
        c.quadraticCurveTo(x - 5, base - hgt * 0.6, x + Math.sin(frame + i) * 2, base - hgt);
        c.quadraticCurveTo(x + 5, base - hgt * 0.55, x + 4, base);
        c.closePath();
        const g = c.createLinearGradient(x, base, x, base - hgt);
        g.addColorStop(0, "rgba(255,90,20,0.95)");
        g.addColorStop(0.6, "rgba(255,170,40,0.8)");
        g.addColorStop(1, "rgba(255,240,140,0)");
        c.fillStyle = g;
        c.fill();
      }
      break;
    }
    default:
      break;
  }
}

/** over the body, before the tint: hoods, crowns, wreaths, collars, sashes */
function costumeFront(c: Ctx, hero: SurvHeroId, frame: number, skin: SurvSkinId) {
  const r = rig(frame, 10);
  const s = r.sh;
  const h = r.hip;
  const x = r.head.x;
  const y = r.head.y;
  const top = y + HAT_TOP[hero];
  switch (skin) {
    case "night": {
      // a red sash, a deep hood over whatever is on the head, a black mask over the eyes
      line(c, [s.x - 8, s.y + 1, h.x + 7, h.y - 1], "#9a1520", 2.6);
      shaded(c, [x - 9.5, y + 6, x - 10, y - 4, x - 6, top - 2, x + 1, top - 3.5, x + 7.5, top + 1, x + 10, y - 6, x + 6.5, y - 8.5, x - 1, y - 9.5, x - 5, y - 4, x - 5, y + 7], "#1b211c", x - 2, (top + y) / 2, 9, 10);
      line(c, [x - 0.5, y - 2.4, x + 9, y - 2.4], "#0c0c0e", 3.2);
      ell(c, x + 5.2, y - 2.3, 1.2, 0.8, "#ff3a3a");
      break;
    }
    case "fest": {
      // an embroidered sash + a gold buckle (пафти) + a wreath of flowers
      line(c, [s.x - 8, s.y + 1, h.x + 7, h.y - 1], "#d9262e", 2.4);
      for (let i = 0; i < 5; i++) {
        const t = i / 4;
        ell(c, s.x - 8 + (h.x + 7 - s.x + 8) * t, s.y + 1 + (h.y - 1 - s.y - 1) * t, 0.9, 0.9, "#f4efe4");
      }
      ell(c, h.x - 2.5, h.y, 3, 2.2, "#f2c230", OUT, 0.7);
      ell(c, h.x + 2.5, h.y, 3, 2.2, "#f2c230", OUT, 0.7);
      const fl = ["#d9262e", "#f2c230", "#f4efe4", "#2f6fd9", "#d9262e", "#ff7ab8"];
      for (let i = 0; i < 9; i++) {
        const a = Math.PI + (i / 8) * Math.PI;
        const fx = x + 0.5 + Math.cos(a) * 9;
        const fyy = top + 2.5 + Math.sin(a) * 2.6;
        ell(c, fx - 1.6, fyy + 1, 1.8, 1, "#3d8a2a");
        ell(c, fx, fyy, 2.1, 2.1, fl[i % fl.length]!, OUT, 0.5);
        ell(c, fx, fyy, 0.7, 0.7, "#fff6b0");
      }
      break;
    }
    case "royal": {
      // an ermine collar, a gold chain and a crown with gems
      shaded(c, [s.x - 10, s.y - 2, s.x + 10, s.y - 2, s.x + 9, s.y + 3.5, s.x - 9, s.y + 3.5], "#f4f1ea", s.x, s.y, 10, 3);
      for (const dx of [-7, -3, 1.5, 6]) ell(c, s.x + dx, s.y + 0.8, 0.7, 1.1, "#151515");
      c.beginPath();
      c.moveTo(s.x - 5, s.y + 3);
      c.quadraticCurveTo(s.x + 0.5, s.y + 11, s.x + 6, s.y + 3);
      c.strokeStyle = "#f2c230";
      c.lineWidth = 1.4;
      c.stroke();
      ell(c, s.x + 0.6, s.y + 8.5, 2, 2, "#f2c230", OUT, 0.6);
      const b = top + 3;
      shaded(c, [x - 7.5, b + 3, x - 8, b - 4, x - 5, b - 1, x - 2.5, b - 6.5, x + 0.5, b - 1.5, x + 3.5, b - 6.5, x + 6, b - 1, x + 9, b - 4, x + 8.5, b + 3], "#f2c230", x, b - 2, 8, 4);
      ell(c, x + 0.5, b + 0.8, 1.3, 1.3, "#d9262e");
      ell(c, x - 4.5, b + 1, 1, 1, "#2f6fd9");
      ell(c, x + 5.5, b + 1, 1, 1, "#2f9a48");
      for (const px of [-8, -2.5, 3.5, 9]) ell(c, x + px, b - (px === -8 || px === 9 ? 4.2 : 6.7), 0.9, 0.9, "#fff6c0");
      break;
    }
    case "gold": {
      // a laurel wreath
      for (let i = 0; i < 8; i++) {
        const a = Math.PI + (i / 7) * Math.PI;
        const fx = x + 0.5 + Math.cos(a) * 9;
        const fyy = top + 2.6 + Math.sin(a) * 2.4;
        c.save();
        c.translate(fx, fyy);
        c.rotate(a + Math.PI / 2);
        ell(c, 0, 0, 1.2, 2.8, "#e8c040", OUT, 0.5);
        c.restore();
      }
      break;
    }
    case "fire": {
      // hair of fire
      for (let i = 0; i < 5; i++) {
        const fx = x - 6 + i * 3.4;
        const hgt = 9 + ((i * 5 + frame * 2) % 7);
        c.beginPath();
        c.moveTo(fx - 2.6, top + 4);
        c.quadraticCurveTo(fx - 2.5, top - hgt * 0.5, fx + Math.sin(frame * 1.3 + i) * 1.5, top - hgt);
        c.quadraticCurveTo(fx + 3, top - hgt * 0.4, fx + 2.6, top + 4);
        c.closePath();
        const g = c.createLinearGradient(fx, top + 4, fx, top - hgt);
        g.addColorStop(0, "#ff5a1a");
        g.addColorStop(0.6, "#ffb21a");
        g.addColorStop(1, "#fff3a0");
        c.fillStyle = g;
        c.fill();
      }
      break;
    }
    default:
      break;
  }
}

/** after the tint: things that glow (they keep their own colour) */
function costumeGlow(c: Ctx, hero: SurvHeroId, frame: number, skin: SurvSkinId) {
  const r = rig(frame, 10);
  const s = r.sh;
  const h = r.hip;
  const x = r.head.x;
  const y = r.head.y;
  switch (skin) {
    case "fire": {
      // cracks of lava over the charcoal body + burning eyes
      c.save();
      c.globalCompositeOperation = "source-atop";
      const cracks = [
        [s.x - 6, s.y + 2, s.x - 2, s.y + 6, s.x - 4, s.y + 10, h.x - 1, h.y],
        [s.x + 5, s.y + 1, s.x + 2, s.y + 7, s.x + 5, h.y - 2],
        [r.fKnee.x, r.fKnee.y - 4, r.fKnee.x + 1, r.fKnee.y + 3, r.fFoot.x, r.fFoot.y - 3],
        [r.bKnee.x, r.bKnee.y - 4, r.bKnee.x - 1, r.bKnee.y + 3],
        [r.fElbow.x, r.fElbow.y - 3, r.fHand.x, r.fHand.y],
        [x - 4, y + 2, x - 1, y + 5],
      ];
      for (const k of cracks) {
        line(c, k, "rgba(255,120,30,0.65)", 2.2);
        line(c, k, "#ffe27a", 0.8);
      }
      c.restore();
      ell(c, x + 5, y - 1.8, 1.6, 1.1, "#ffe27a");
      ell(c, x + 5, y - 1.8, 0.7, 0.6, "#fff");
      break;
    }
    case "ghost": {
      // the legs fade away into a wisp, hollow glowing eyes, chains on the wrists
      c.save();
      c.globalCompositeOperation = "destination-out";
      const fy = feetY(r);
      const g = c.createLinearGradient(0, h.y + 2, 0, fy);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(1, "rgba(0,0,0,1)");
      c.fillStyle = g;
      c.fillRect(-30, h.y + 2, 60, fy - h.y + 4);
      c.restore();
      const w = frame < 8 ? Math.sin((frame / 8) * Math.PI * 2) * 2 : Math.sin(frame) * 1;
      c.beginPath();
      c.moveTo(h.x - 8, h.y + 2);
      c.quadraticCurveTo(h.x - 9 + w, h.y + 12, h.x - 3 + w * 1.5, h.y + 20);
      c.quadraticCurveTo(h.x - 1, h.y + 14, h.x + 3, h.y + 17 - w);
      c.quadraticCurveTo(h.x + 6, h.y + 10, h.x + 8, h.y + 2);
      c.closePath();
      const gg = c.createLinearGradient(0, h.y, 0, h.y + 20);
      gg.addColorStop(0, "rgba(200,240,255,0.7)");
      gg.addColorStop(1, "rgba(200,240,255,0)");
      c.fillStyle = gg;
      c.fill();
      ell(c, x + 4.8, y - 1.8, 2.1, 1.6, "#0a1a24");
      ell(c, x + 4.8, y - 1.8, 1.1, 0.9, "#7ff4ff");
      for (const hand of [r.fHand, r.bHand]) {
        for (let i = 0; i < 3; i++) {
          c.beginPath();
          c.ellipse(hand.x - 1 - i * 2.4, hand.y + 2 + i * 2.6, 1.3, 0.9, 0.6, 0, Math.PI * 2);
          c.strokeStyle = "rgba(150,170,180,0.9)";
          c.lineWidth = 0.8;
          c.stroke();
        }
      }
      break;
    }
    case "night":
      ell(c, x + 5.2, y - 2.3, 1, 0.7, "#ff5a5a");
      break;
    default:
      break;
  }
}


function drawHero(c: Ctx, hero: SurvHeroId, frame: number, skin: SurvSkinId = "classic") {
  const L = skinLook(hero, skin);
  const at = (r: Rig, pts: number[]) => pts.map((v, i) => v + (i % 2 ? r.head.y : r.head.x));
  switch (hero) {
    case "peyo": {
      // Бай Шмирко the shepherd: linen shirt, sheepskin vest, a tall black калпак, a crook
      const r = body(c, { skin: L.skin, shirt: "#e9dcc0", pants: "#5a3d26", boots: "#7a4f2a", sw: 10, hip: 7 }, frame, (r) => {
        line(c, [r.fHand.x + 1, r.fHand.y + 22, r.fHand.x + 1, r.fHand.y - 40], "#5a3a1e", 2.6);
        c.beginPath();
        c.arc(r.fHand.x + 4.5, r.fHand.y - 40, 3.5, Math.PI, 0.1);
        c.strokeStyle = "#5a3a1e";
        c.lineWidth = 2.6;
        c.stroke();
      });
      const s = r.sh;
      const h = r.hip;
      shaded(c, [s.x - 10.4, s.y, s.x - 3, s.y - 1, h.x - 2.5, h.y + 1, h.x - 8.5, h.y + 2], "#d6c094", s.x - 6, (s.y + h.y) / 2, 5, 14);
      shaded(c, [s.x + 3.2, s.y - 1, s.x + 10.4, s.y, h.x + 8.5, h.y + 2, h.x + 2.5, h.y + 1], "#e2cea2", s.x + 6, (s.y + h.y) / 2, 5, 14);
      for (let y = s.y + 3; y < h.y; y += 3) {
        line(c, [s.x - 8.5, y, s.x - 5, y + 1.4], "rgba(120,90,50,0.55)", 0.9);
        line(c, [s.x + 4.5, y, s.x + 8.5, y + 1.4], "rgba(120,90,50,0.55)", 0.9);
      }
      line(c, [h.x - 7, h.y, h.x + 7.5, h.y], "#b3262b", 2.4);
      head(c, r, L.skin, { old: true });
      c.beginPath();
      c.moveTo(r.head.x + 2, r.head.y + 3);
      c.quadraticCurveTo(r.head.x + 6, r.head.y + 1.5, r.head.x + 10.5, r.head.y + 3.6);
      c.quadraticCurveTo(r.head.x + 7, r.head.y + 5.4, r.head.x + 2.6, r.head.y + 4.8);
      c.fillStyle = "#e8e4dc";
      c.fill();
      hair(c, [-7.4, -5, -6.6, -19, 6.8, -20, 8.2, -5, 0, -7.5], L.hat, r);
      for (let x = -5; x <= 6; x += 2.2) line(c, at(r, [x, -18.5, x + 0.5, -7]), "rgba(255,255,255,0.07)", 1);
      tube(c, { x: s.x + 8, y: s.y + 1.5 }, r.fElbow, 2.7, 2.4, "#e9dcc0");
      tube(c, r.fElbow, r.fHand, 2.4, 2, "#e9dcc0");
      tube(c, r.fHand, { x: r.fHand.x + 0.6, y: r.fHand.y + 1.6 }, 2.2, 2, L.skin);
      break;
    }
    case "tseko": {
      // Киро Брейка: hoodie with stripes, baggy trousers, chunky sneakers, cap backwards, gold chain
      const r = body(c, { skin: L.skin, shirt: L.body, pants: "#3a3d44", boots: "#f2f2f2", sw: 10.5, hip: 7.5, limb: 1.15 }, frame);
      const s = r.sh;
      const h = r.hip;
      shaded(c, [h.x - 5, h.y - 7, h.x + 5.5, h.y - 7, h.x + 4.5, h.y - 1.5, h.x - 4, h.y - 1.5], tone(L.body, 0.82), h.x, h.y - 4, 5, 3);
      c.beginPath();
      c.moveTo(s.x - 4.5, s.y + 0.5);
      c.quadraticCurveTo(s.x + 0.5, s.y + 10, s.x + 5.5, s.y + 0.5);
      c.strokeStyle = "#f2c230";
      c.lineWidth = 1.7;
      c.stroke();
      rr(c, s.x - 0.6, s.y + 6.6, 2.8, 3.2, 0.6, "#f2c230", OUT, 0.6);
      // headphones round the neck
      c.beginPath();
      c.arc(s.x + 1, s.y - 1.5, 6.5, 0.1 * Math.PI, 0.9 * Math.PI, true);
      c.strokeStyle = "#151515";
      c.lineWidth = 1.7;
      c.stroke();
      head(c, r, L.skin);
      line(c, at(r, [5, 6.3, 7.5, 6.6]), "#2a1d14", 1.6);
      // cap, backwards
      hair(c, [-7.2, -4, -6, -10.6, 1, -11.8, 6.8, -9.6, 8.2, -4.4], L.hat, r);
      shaded(c, at(r, [-6.5, -5, -14.5, -3.6, -14, -1.4, -6.2, -2.6]), tone(L.hat, 0.7), r.head.x - 10, r.head.y - 3, 4, 2);
      line(c, at(r, [-5.5, -5, 7.5, -5.4]), "rgba(255,255,255,0.5)", 1);
      tube(c, { x: s.x + 8.5, y: s.y + 1.5 }, r.fElbow, 3.1, 2.8, L.body);
      tube(c, r.fElbow, r.fHand, 2.8, 2.4, L.body);
      line(c, [s.x + 9, s.y + 3, r.fElbow.x + 1, r.fElbow.y], "#fff", 1.2);
      line(c, [r.fElbow.x + 1, r.fElbow.y, r.fHand.x + 1, r.fHand.y], "#fff", 1.2);
      tube(c, r.fHand, { x: r.fHand.x + 0.6, y: r.fHand.y + 1.6 }, 2.4, 2.2, L.skin);
      break;
    }
    case "nikola": {
      // the physics teacher: lab coat, tie, wild grey hair, square glasses, a spark in the hand
      const r = body(c, { skin: L.skin, shirt: "#3b4a6b", pants: "#2d2f36", boots: "#1b1b1d", sw: 9.5, hip: 7, coat: { color: L.body, to: 15 } }, frame);
      const s = r.sh;
      shaded(c, [s.x - 0.6, s.y - 0.5, s.x + 2.4, s.y - 0.5, s.x + 2, s.y + 9, s.x + 0.9, s.y + 11, s.x - 0.2, s.y + 9], "#b3262b", s.x + 1, s.y + 5, 2, 6);
      head(c, r, L.skin, { old: true, brow: "#bfbfbf" });
      for (const [x0, y0, x1, y1] of [
        [-7, -5, -13, -9],
        [-5.5, -9, -9, -16],
        [-1.5, -10.5, -1.5, -17.5],
        [3, -10.5, 5.5, -16.5],
        [6.5, -8, 12, -12],
        [-7.5, 0, -13, 0],
        [-7, 4, -12, 6],
      ])
        hair(c, [x0! - 2, y0!, x0! + 2, y0! + 0.5, x1!, y1!], L.hat, r);
      hair(c, [-6.8, -5.5, -2.5, -10.8, 4, -10.4, 7.2, -6.8, 2, -8, -3, -6.4], L.hat, r);
      c.strokeStyle = "#15161a";
      c.lineWidth = 1.1;
      c.strokeRect(r.head.x + 2.6, r.head.y - 3.6, 4.8, 3.6);
      line(c, at(r, [7.4, -2, 9.4, -2.6]), "#15161a", 1);
      line(c, at(r, [2.6, -2, -1.5, -2.6]), "#15161a", 1);
      tube(c, { x: s.x + 7.5, y: s.y + 1.5 }, r.fElbow, 2.8, 2.5, L.body);
      tube(c, r.fElbow, r.fHand, 2.5, 2.1, L.body);
      tube(c, r.fHand, { x: r.fHand.x + 0.6, y: r.fHand.y + 1.6 }, 2.2, 2, L.skin);
      c.beginPath();
      c.arc(r.fHand.x + 3, r.fHand.y - 2, 2.6, 0, Math.PI * 2);
      c.fillStyle = "rgba(160,220,255,0.9)";
      c.fill();
      line(c, [r.fHand.x + 3, r.fHand.y - 2, r.fHand.x + 8, r.fHand.y - 7, r.fHand.x + 6, r.fHand.y - 4, r.fHand.x + 10, r.fHand.y - 6], "#cdeeff", 1.1);
      break;
    }
    case "gitsa": {
      // Спаска: embroidered blouse, a dark сукман, a red apron with a pattern, a long braid
      const r = body(c, { skin: L.skin, shirt: L.trim, pants: L.body, boots: "#3a2418", sw: 8.8, hip: 6.5, skirt: { color: L.body, to: 21 }, sleeve: L.trim }, frame, (r) => {
        // the braid behind the back
        tube(c, { x: r.head.x - 5, y: r.head.y + 2 }, { x: r.hip.x - 6.5, y: r.hip.y - 2 }, 2.4, 1.6, HAIR);
        line(c, [r.hip.x - 7.5, r.hip.y - 3, r.hip.x - 5, r.hip.y - 1.5], "#c62f3a", 1.8);
      });
      const s = r.sh;
      const h = r.hip;
      shaded(c, [s.x - 8.8, s.y, s.x - 2.5, s.y - 1, h.x - 3, h.y, h.x - 7.5, h.y], L.body, s.x - 5, (s.y + h.y) / 2, 4, 12);
      shaded(c, [s.x + 2.5, s.y - 1, s.x + 8.8, s.y, h.x + 7.5, h.y, h.x + 3, h.y], L.body, s.x + 5, (s.y + h.y) / 2, 4, 12);
      const to = 19 + r.bob * 0.5;
      shaded(c, [h.x - 2.5, h.y - 1, h.x + 5.5, h.y - 1, h.x + 7.5, to, h.x - 3, to], L.hat, h.x + 2, (h.y + to) / 2, 5, to - h.y);
      for (let y = h.y + 3; y <= to - 2; y += 4) {
        c.beginPath();
        for (let x = -2; x <= 6.5; x += 1.5) c.lineTo(h.x + x, y + ((Math.round(x / 1.5) % 2) ? 1.2 : -1.2));
        c.strokeStyle = "#f2c230";
        c.lineWidth = 0.9;
        c.stroke();
      }
      head(c, r, L.skin);
      hair(c, [-7.2, 0.5, -6.4, -7.5, -1.5, -10.6, 4.5, -10, 8, -6, 7.6, -4.6, 2, -7, -4.5, -4.5], HAIR, r);
      hair(c, [-7.8, -4.5, -5.5, -11, 2, -12.6, 8.6, -7, 7.5, -5.3, 1.5, -8.6, -4, -7.2], L.hat, r);
      ell(c, r.head.x - 0.6, r.head.y + 2.8, 1.2, 1.6, "#f2c230", "rgba(80,50,10,0.8)", 0.6);
      tube(c, { x: s.x + 6.8, y: s.y + 1.5 }, r.fElbow, 2.6, 2.2, L.trim);
      tube(c, r.fElbow, r.fHand, 2.2, 1.9, L.skin);
      line(c, [r.fElbow.x - 2, r.fElbow.y, r.fElbow.x + 2, r.fElbow.y], "#c62f3a", 1.5);
      break;
    }
    case "strahil": {
      // Баткан: broad shoulders, an open leather jacket, a white tee, a thick chain, bald with a beard
      const r = body(c, { skin: L.skin, shirt: L.trim, pants: "#2e4a7a", boots: "#141414", sw: 12.5, hip: 8, coat: { color: L.body, to: 7 }, limb: 1.3 }, frame, (r) => {
        // a big two-handed axe resting on the shoulder, behind the head
        const bx = r.sh.x - 13;
        const by = r.sh.y - 16;
        line(c, [r.sh.x + 9, r.sh.y + 18, bx, by], "#5a3a1e", 3);
        shaded(c, [bx - 1, by + 1, bx - 10, by - 6, bx - 8, by + 8, bx, by + 6], "#aeb6bd", bx - 5, by + 1, 5, 6);
        shaded(c, [bx + 1, by - 1, bx + 4, by - 11, bx + 12, by - 6, bx + 5, by + 2], "#c4ccd2", bx + 5, by - 4, 5, 6);
      });
      const s = r.sh;
      c.beginPath();
      c.moveTo(s.x - 3.5, s.y + 0.5);
      c.quadraticCurveTo(s.x + 0.5, s.y + 11, s.x + 4.5, s.y + 0.5);
      c.strokeStyle = L.hat;
      c.lineWidth = 2.6;
      c.stroke();
      head(c, r, L.skin, { brow: "#1a120c" });
      // bald shine, beard and a scar
      c.beginPath();
      c.ellipse(r.head.x + 2.5, r.head.y - 7.5, 3.5, 1.6, -0.2, 0, Math.PI * 2);
      c.fillStyle = "rgba(255,255,255,0.32)";
      c.fill();
      hair(c, [-5, 3.5, 0.5, 7.8, 5.4, 6.6, 8.4, 3.4, 8.6, 1.6, 3, 2.6, -1.5, 1.2], "#2a1d14", r);
      line(c, at(r, [-1.5, -3, 0.5, 1]), "rgba(170,60,50,0.7)", 1);
      tube(c, { x: s.x + 10.5, y: s.y + 1.5 }, r.fElbow, 3.6, 3.2, L.body);
      tube(c, r.fElbow, r.fHand, 3.2, 2.7, L.body);
      tube(c, r.fHand, { x: r.fHand.x + 0.6, y: r.fHand.y + 1.6 }, 2.8, 2.6, L.skin);
      break;
    }
    case "vela": {
      // the samodiva: a long white dress, golden hair to the waist, a wreath, a soft glow
      const g = c.createRadialGradient(0, -6, 3, 0, -6, 30);
      g.addColorStop(0, "rgba(200,255,220,0.35)");
      g.addColorStop(1, "rgba(200,255,220,0)");
      c.fillStyle = g;
      c.fillRect(-30, -40, 60, 70);
      const r = body(c, { skin: L.skin, shirt: L.body, pants: L.body, boots: L.skin, sw: 8.5, hip: 6.2, skirt: { color: L.body, to: 23 }, sleeve: L.skin, limb: 0.9 }, frame, (r) => {
        shaded(c, [r.head.x - 6, r.head.y - 4, r.head.x - 11, r.head.y + 14, r.hip.x - 9, r.hip.y + 2, r.hip.x - 3, r.hip.y - 2, r.head.x - 2, r.head.y + 6], L.hat, r.head.x - 6, r.head.y + 8, 6, 12);
      });
      const h = r.hip;
      line(c, [h.x - 10, 21 + r.bob * 0.5, h.x + 11, 21 + r.bob * 0.5], L.trim, 1.6);
      line(c, [h.x - 6.5, h.y, h.x + 6.5, h.y], L.trim, 1.6);
      head(c, r, L.skin);
      hair(c, [-7, 1, -6.5, -7.5, -1.5, -10.8, 4.5, -10.4, 8, -6.5, 6, -6.4, 1, -8.2, -4, -5.6], L.hat, r);
      for (let i = 0; i < 7; i++) {
        const x = r.head.x - 6 + i * 2.3;
        const y = r.head.y - 10 - Math.sin((i / 6) * Math.PI) * 1.5;
        poly(c, [x - 1.4, y, x, y - 1.8, x + 1.4, y, x, y + 1.6], i % 2 ? "#ff7aa8" : "#ffffff", "rgba(80,40,60,0.5)", 0.5);
      }
      tube(c, { x: r.sh.x + 6.5, y: r.sh.y + 1.5 }, r.fElbow, 2.1, 1.8, L.skin);
      tube(c, r.fElbow, r.fHand, 1.8, 1.6, L.skin);
      break;
    }
    case "gosho": {
      // Бай Гошууу the kuker: a shaggy costume, bells, a tall red mask with horns
      const r = body(c, { skin: L.skin, shirt: L.body, pants: "#2b2420", boots: "#5a3a1e", sw: 11.5, hip: 9, limb: 1.25 }, frame);
      const s = r.sh;
      const h = r.hip;
      for (let i = 0; i < 26; i++) {
        const x = s.x - 12 + (i % 13) * 2;
        const y = i < 13 ? s.y + 2 : h.y - 6;
        line(c, [x, y, x + (i % 2 ? 1 : -1), y + 9 + (i % 3)], i % 4 === 0 ? L.trim : "#3a312b", 1.4);
      }
      for (const x of [-8, -2.5, 3, 8.5]) {
        const g = c.createRadialGradient(h.x + x + 0.8, h.y + 1, 0.4, h.x + x, h.y + 2, 3);
        g.addColorStop(0, "#fff0a8");
        g.addColorStop(1, "#a07a1e");
        c.beginPath();
        c.arc(h.x + x, h.y + 2, 2.8, 0, Math.PI * 2);
        c.fillStyle = g;
        c.fill();
        c.strokeStyle = OUT;
        c.lineWidth = 0.8;
        c.stroke();
      }
      // the mask
      const m = (pts: number[]) => at(r, pts);
      shaded(c, m([-8.5, -16, 9, -16, 10, 6, 6, 9, -6, 9, -9.5, 6]), L.hat, r.head.x, r.head.y - 3, 9, 12);
      for (const dir of [-1, 1]) shaded(c, m([dir * 6 - 2, -15, dir * 6 + 2, -15, dir * 14, -25, dir * 17, -23, dir * 11, -19]), "#efe6d0", r.head.x + dir * 10, r.head.y - 20, 4, 5);
      poly(c, m([-4.5, -9, -0.5, -9, -1, -5.5, -4.5, -6]), "#fff6c0", OUT, 0.8);
      poly(c, m([2.5, -9, 7, -9, 6.5, -5.8, 3, -5.5]), "#fff6c0", OUT, 0.8);
      rr(c, r.head.x - 1.2, r.head.y - 8, 2, 2, 0.4, "#111");
      rr(c, r.head.x + 4, r.head.y - 8, 2, 2, 0.4, "#111");
      poly(c, m([-5, 2, 7, 2, 5.5, 6.5, -3.5, 6.5]), "#fff", OUT, 0.8);
      for (let x = -3; x <= 5; x += 2) line(c, m([x, 2, x, 6.5]), "rgba(0,0,0,0.5)", 0.6);
      line(c, m([-8, -12, 9, -12]), "#f2c230", 1.2);
      for (let i = 0; i < 5; i++) line(c, m([-6 + i * 3, -16, -7 + i * 3, -20]), ["#ff3b3b", "#3bb3ff", "#ffe23b", "#3bff7a", "#ff3bd2"][i]!, 1.6);
      tube(c, { x: s.x + 9.5, y: s.y + 1.5 }, r.fElbow, 3.4, 3, "#2b2420");
      tube(c, r.fElbow, r.fHand, 3, 2.6, "#2b2420");
      break;
    }
    case "mitko": {
      // Митьо Крика: a tracksuit with side stripes, a flat cap, a big moustache, a car jack in hand
      const r = body(c, { skin: L.skin, shirt: L.body, pants: L.body, boots: "#e8e8e8", sw: 10.5, hip: 8.5, limb: 1.1 }, frame);
      const s = r.sh;
      const h = r.hip;
      shaded(c, [h.x - 9, h.y - 8, h.x + 9.6, h.y - 8, h.x + 10.6, h.y - 2, h.x + 9, h.y + 2, h.x - 9, h.y + 2], tone(L.body, 1.08), h.x + 1, h.y - 3, 9, 5);
      line(c, [s.x + 0.5, s.y, h.x + 0.5, h.y + 2], "rgba(255,255,255,0.6)", 0.9);
      for (const [k, f] of [
        [r.bKnee, r.bFoot],
        [r.fKnee, r.fFoot],
      ] as [P, P][]) {
        line(c, [h.x + 1, h.y + 2, k.x + 1, k.y, f.x + 1, f.y - 2], "rgba(255,255,255,0.85)", 0.9);
      }
      head(c, r, L.skin);
      hair(c, [-7.6, -5, -6.5, -9.5, 2, -11, 8, -8.5, 12.5, -6.4, 12, -5, -7.4, -4], L.hat, r);
      hair(c, [1, 2.6, 10.5, 3, 11.5, 6.2, 8, 5.2, 5, 6, 2, 5.2], "#3a2418", r);
      ell(c, r.head.x + 9.4, r.head.y + 1.4, 1.6, 1.4, "#d9473a");
      tube(c, { x: s.x + 8.5, y: s.y + 1.5 }, r.fElbow, 3, 2.7, L.body);
      tube(c, r.fElbow, r.fHand, 2.7, 2.3, L.body);
      line(c, [s.x + 9.5, s.y + 2, r.fElbow.x + 1.5, r.fElbow.y, r.fHand.x + 1.5, r.fHand.y], "#fff", 0.9);
      tube(c, r.fHand, { x: r.fHand.x + 0.6, y: r.fHand.y + 1.6 }, 2.4, 2.2, L.skin);
      const jx = r.fHand.x + 3;
      const jy = r.fHand.y + 2;
      line(c, [jx - 4, jy + 6, jx, jy + 1, jx + 4, jy + 6], "#d4202a", 2);
      line(c, [jx - 4, jy - 4, jx, jy + 1, jx + 4, jy - 4], "#d4202a", 2);
      rr(c, jx - 5, jy + 5.5, 10, 2.2, 0.6, "#555", OUT, 0.8);
      rr(c, jx - 4, jy - 5.5, 8, 2, 0.6, "#555", OUT, 0.8);
      break;
    }
    case "stana": {
      // the herb woman: a long hooded green cloak, a staff with a bunch of herbs
      const r = body(c, { skin: L.skin, shirt: L.trim, pants: L.body, boots: "#3a2418", sw: 9, hip: 6.5, skirt: { color: L.trim, to: 21 }, coat: { color: L.body, to: 23 } }, frame, (r) => {
        line(c, [r.bHand.x, r.bHand.y + 22, r.bHand.x - 1, r.bHand.y - 36], "#6b4423", 2.2);
        ell(c, r.bHand.x - 2, r.bHand.y - 38, 3, 2.4, "#8ccf5a", OUT, 0.8);
        ell(c, r.bHand.x + 1.5, r.bHand.y - 39, 2.4, 2, "#c6e07a", OUT, 0.8);
      });
      head(c, r, L.skin, { old: true });
      hair(c, [-8.8, 6, -9.2, -6, -4, -13, 4, -13, 9.6, -7, 9.8, -2, 7.5, -5.5, 2, -9, -4, -7, -6, 0, -5.5, 7], L.hat, r);
      rr(c, r.hip.x - 4, r.hip.y - 1, 5, 5, 1.2, "#8a6238", OUT, 0.8);
      tube(c, { x: r.sh.x + 7, y: r.sh.y + 1.5 }, r.fElbow, 2.8, 2.5, L.body);
      tube(c, r.fElbow, r.fHand, 2.5, 2.1, L.body);
      tube(c, r.fHand, { x: r.fHand.x + 0.6, y: r.fHand.y + 1.6 }, 2.2, 2, L.skin);
      break;
    }
  }
}

/** frame 0..7 = a step of the walk, 8..9 = standing and breathing */
export function heroSprite(hero: SurvHeroId, frame: number, v: number, flip: boolean, skin: SurvSkinId = "classic") {
  return get(`h4:${hero}:${skin}:${frame}`, 60, 96, (c) => {
    c.translate(0, 8);
    costumeBack(c, hero, frame, skin);
    drawHero(c, hero, frame, skin);
    costumeFront(c, hero, frame, skin);
    const tint = SKIN_TINT[skin];
    if (tint) {
      c.save();
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalCompositeOperation = "source-atop";
      c.fillStyle = tint;
      c.fillRect(0, 0, c.canvas.width, c.canvas.height);
      const g = c.createLinearGradient(c.canvas.width, 0, 0, c.canvas.height);
      g.addColorStop(0, "rgba(255,255,255,0.35)");
      g.addColorStop(0.5, "rgba(255,255,255,0)");
      g.addColorStop(1, "rgba(0,0,0,0.25)");
      c.fillStyle = g;
      c.fillRect(0, 0, c.canvas.width, c.canvas.height);
      c.restore();
    }
    costumeGlow(c, hero, frame, skin);
  }, v, flip);
}

/* ───────────── enemies ───────────── */

const ENEMY_DRAW0: Record<Exclude<EnemyId, "altar" | "velikan" | "gorskicar" | "blatnamaika" | "ledenvelikan">, { w: number; h: number; draw: Draw }> = {
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
  skeleton: {
    w: 34,
    h: 48,
    draw: (c, f) => {
      const bone = "#e8e2cc";
      line(c, [-3, 6, -4 - f * 2, 20], bone, 2.2);
      line(c, [3, 6, 4 + f * 2, 20], bone, 2.2);
      line(c, [0, -10, 0, 6], bone, 2.4);
      for (let y = -8; y <= 2; y += 3.4) line(c, [-6, y, 6, y + 0.5], bone, 1.6);
      line(c, [-7, -9, -10, 0 + f], bone, 2);
      line(c, [7, -9, 11, -2 - f], bone, 2);
      line(c, [11, -2 - f, 16, -10], "#8a8a8a", 1.8);
      poly(c, [-6, -12, -6, -21, 0, -25, 7, -21, 7, -14, 3, -11, -2, -11], bone, OUT, 1.2);
      poly(c, [-3.5, -19, -0.8, -19, -1, -16, -3.6, -16.4], "#1a1414");
      poly(c, [2, -19, 5, -19, 4.6, -16, 2, -16.4], "#1a1414");
      for (let x = -2; x <= 4; x += 2) line(c, [x, -13, x, -11.2], "#1a1414", 0.8);
    },
  },
  raven: {
    w: 36,
    h: 26,
    draw: (c, f) => {
      const up = f ? -10 : 3;
      poly(c, [-2, -2, -16, up, -12, 3, -5, 2], "#15151c", OUT, 1);
      poly(c, [2, -2, 16, up, 12, 3, 5, 2], "#1d1d26", OUT, 1);
      poly(c, [-9, 2, 0, -4, 8, -1, 13, 1, 8, 4, -6, 5], "#1d1d26", OUT, 1);
      poly(c, [12, -1, 18, 0.5, 12, 2], "#3a3a3a");
      ell(c, 9, -1, 1.2, 1.2, "#ffd23a");
      poly(c, [-9, 2, -15, 4, -14, 6, -8, 5], "#15151c");
    },
  },
  spider: {
    w: 44,
    h: 32,
    draw: (c, f) => {
      for (let i = 0; i < 4; i++) {
        const k = (i % 2 ? f : -f) * 2;
        line(c, [-3, 0, -10 - i * 2, -8 + i * 4 + k, -16 - i, 2 + i * 3 + k], "#2a1d2a", 1.8);
        line(c, [3, 0, 10 + i * 2, -8 + i * 4 - k, 16 + i, 2 + i * 3 - k], "#2a1d2a", 1.8);
      }
      ell(c, -4, 1, 8, 7, "#3a2440", OUT, 1.2);
      poly(c, [-8, -1, -4, -3, 0, -1, -4, 3], "#c62f3a");
      ell(c, 5, 0, 5, 4.5, "#2a1d2a", OUT, 1.1);
      for (const [x, y] of [
        [7, -2],
        [9, -1],
        [7.5, 1],
        [9.4, 1.5],
      ])
        ell(c, x!, y!, 0.9, 0.9, "#ff3a3a");
    },
  },
  firespirit: {
    w: 36,
    h: 46,
    draw: (c, f) => {
      const g = c.createRadialGradient(0, 2, 1, 0, 2, 18);
      g.addColorStop(0, "#fff6b0");
      g.addColorStop(0.35, "#ffb21a");
      g.addColorStop(0.75, "rgba(255,70,20,0.85)");
      g.addColorStop(1, "rgba(255,40,10,0)");
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(-12, 12);
      c.quadraticCurveTo(-16, -4, -6, -12 - f * 3);
      c.quadraticCurveTo(-4, -4, 0, -20 + f * 2);
      c.quadraticCurveTo(4, -6, 7, -14 - f * 2);
      c.quadraticCurveTo(16, -2, 12, 12);
      c.quadraticCurveTo(0, 18, -12, 12);
      c.fill();
      ell(c, -3.5, -1, 2, 2.8, "#3a0a00");
      ell(c, 3.5, -1, 2, 2.8, "#3a0a00");
      poly(c, [-3, 5, 3, 5, 0, 8], "#3a0a00");
    },
  },
  bear: {
    w: 60,
    h: 54,
    draw: (c, f) => {
      for (const [x, k] of [
        [-16, f],
        [-7, -f],
        [8, -f],
        [16, f],
      ] as [number, number][])
        rr(c, x - 4, 6, 8, 14 + k * 2, 3, "#3e2a1c", OUT, 1.2);
      ell(c, -2, 2, 23, 15, "#5a3d28", OUT, 2);
      ell(c, -6, -2, 14, 8, "#6b4a32");
      ell(c, 18, -6, 11, 10, "#5a3d28", OUT, 1.8);
      ell(c, 26, -3, 5, 4, "#8a6248", OUT, 1.2);
      ell(c, 29, -4, 1.6, 1.4, "#1a1010");
      ell(c, 13, -15, 3.4, 3.4, "#5a3d28", OUT, 1);
      ell(c, 21, -15, 3.4, 3.4, "#5a3d28", OUT, 1);
      ell(c, 21, -8, 1.4, 1.4, "#1a1010");
    },
  },
  ispolin: {
    w: 120,
    h: 130,
    draw: (c, f) => {
      // a stone-grey giant with a club
      line(c, [36, 30, 52, -40 + f * 4], "#5a3a1e", 9);
      ell(c, 54, -44 + f * 4, 10, 12, "#6b4423", OUT, 2);
      for (const [x, k] of [
        [-14, f],
        [14, -f],
      ] as [number, number][])
        rr(c, x - 9, 22, 18, 36 + k * 3, 6, "#6f6a60", OUT, 2);
      poly(c, [-34, -30, 34, -30, 28, 30, -28, 30], "#8a847a", OUT, 2.5);
      poly(c, [-34, -30, -4, -30, -6, 30, -28, 30], "rgba(0,0,0,0.2)");
      poly(c, [-28, 8, 28, 8, 26, 26, -26, 26], "#5a3d28", OUT, 1.5);
      rr(c, -42, -28, 12, 40, 6, "#8a847a", OUT, 2);
      rr(c, 30, -28, 12, 40, 6, "#8a847a", OUT, 2);
      poly(c, [-16, -30, -18, -52, -6, -62, 10, -62, 20, -52, 18, -30], "#9a948a", OUT, 2);
      poly(c, [-12, -46, -3, -46, -4, -42, -12, -42], "#ffb21a");
      poly(c, [4, -46, 13, -46, 12, -42, 4, -42], "#ffb21a");
      line(c, [-10, -36, 10, -35], "#2a2420", 2.5);
      for (const [x, y] of [
        [-20, -10],
        [10, -18],
        [-8, 0],
        [18, -4],
      ])
        line(c, [x!, y!, x! + 6, y! + 4], "rgba(40,30,20,0.5)", 1.5);
    },
  },
  samqueen: {
    w: 86,
    h: 110,
    draw: (c, f) => {
      const g = c.createRadialGradient(0, -10, 4, 0, -10, 50);
      g.addColorStop(0, "rgba(160,255,200,0.45)");
      g.addColorStop(1, "rgba(160,255,200,0)");
      c.fillStyle = g;
      c.fillRect(-43, -55, 86, 110);
      poly(c, [-10, -40, -26, 0, -20, 30, -12, 10], "#e8d27a", OUT, 1.2);
      poly(c, [-14, -10, 14, -10, 26, 44 + f * 2, 0, 38, -26, 44 - f * 2], "#e6f6ee", OUT, 2);
      poly(c, [-14, -10, 0, -10, -2, 40, -26, 44], "rgba(60,120,90,0.2)");
      for (let x = -22; x <= 22; x += 5) poly(c, [x, 40, x + 2.5, 35, x + 5, 40], "#3aa86a");
      poly(c, [-10, -10, -10, -32, 10, -32, 10, -10], "#e6f6ee", OUT, 1.6);
      ell(c, 0, -40, 9, 10, "#f2e4dc", OUT, 1.6);
      poly(c, [2, -42, 6, -42, 6, -40, 2, -40], "#1a6a4a");
      poly(c, [-5, -42, -1, -42, -1, -40, -5, -40], "#1a6a4a");
      for (let i = 0; i < 7; i++) {
        const x = -10 + i * 3.3;
        poly(c, [x - 1.6, -50, x, -56 - (i % 2) * 4, x + 1.6, -50], "#3aa86a", OUT, 0.6);
      }
      for (const dir of [-1, 1]) poly(c, [dir * 10, -28, dir * 40, -46 + f * 6, dir * 34, -20, dir * 12, -16], "rgba(200,255,230,0.45)", "rgba(80,160,120,0.6)", 1);
    },
  },
  swampking: {
    w: 120,
    h: 104,
    draw: (c, f) => {
      c.beginPath();
      c.moveTo(-46, 40);
      c.bezierCurveTo(-56, 0, -30, -42, 0, -42);
      c.bezierCurveTo(30, -42, 56, 0, 46, 40);
      c.quadraticCurveTo(24, 32 + f * 4, 0, 40);
      c.quadraticCurveTo(-24, 32 - f * 4, -46, 40);
      c.fillStyle = "#3e5628";
      c.fill();
      c.strokeStyle = OUT;
      c.lineWidth = 2.5;
      c.stroke();
      for (const [x, y, r] of [
        [-22, -14, 9],
        [18, 10, 11],
        [24, -22, 6],
        [-8, 18, 8],
      ])
        ell(c, x!, y!, r!, r! * 0.75, "#5f8a3a");
      poly(c, [-18, -40, -12, -56, -6, -44, 0, -60, 6, -44, 12, -56, 18, -40], "#c9a53a", OUT, 1.5);
      ell(c, -12, -20, 7, 8, "#f6f3c8", OUT, 1.5);
      ell(c, 12, -20, 7, 8, "#f6f3c8", OUT, 1.5);
      ell(c, -11, -19, 3, 4, "#200");
      ell(c, 13, -19, 3, 4, "#200");
      c.beginPath();
      c.arc(0, -2, 14, 0.15 * Math.PI, 0.85 * Math.PI);
      c.strokeStyle = "#1d2a10";
      c.lineWidth = 3;
      c.stroke();
      for (const x of [-30, 30]) line(c, [x, 30, x + 2, 46], "#3e5628", 4);
    },
  },
  kukerchief: {
    w: 90,
    h: 116,
    draw: (c, f) => {
      poly(c, [-34, 44, -22, -10, 22, -10, 34, 44], "#2a211c", OUT, 2);
      for (let i = -30; i <= 30; i += 4) line(c, [i * 0.7, -6, i, 44 + (Math.round(i) % 8 ? f * 2 : -f * 2)], i % 12 < 4 ? "#e9e3d6" : "#5a463a", 2);
      for (let i = -22; i <= 22; i += 11) {
        ell(c, i, 14, 6, 6, "#d9b44a", OUT, 1.5);
        line(c, [i - 2, 16, i + 2, 16], "#7a5a1e", 1.2);
      }
      poly(c, [-20, -62, 20, -62, 22, -10, -22, -10], "#9a1a24", OUT, 2);
      for (const dir of [-1, 1]) poly(c, [dir * 14, -60, dir * 18, -62, dir * 36, -86, dir * 40, -80, dir * 26, -66], "#efe6d0", OUT, 1.5);
      poly(c, [-12, -46, -3, -46, -4, -38, -12, -40], "#fff6c0", OUT, 1);
      poly(c, [3, -46, 12, -46, 12, -40, 4, -38], "#fff6c0", OUT, 1);
      poly(c, [-12, -26, 12, -26, 9, -16, -9, -16], "#fff", OUT, 1);
      for (let x = -8; x <= 8; x += 3) line(c, [x, -26, x, -16], "rgba(0,0,0,0.5)", 0.8);
      for (let i = 0; i < 9; i++) line(c, [-16 + i * 4, -62, -18 + i * 4, -72], ["#ff3b3b", "#3bb3ff", "#ffe23b", "#3bff7a", "#ff3bd2"][i % 5]!, 2.4);
    },
  },
  ghostking: {
    w: 90,
    h: 110,
    draw: (c, f) => {
      c.globalAlpha = 0.85;
      c.beginPath();
      c.moveTo(-30, 30);
      c.quadraticCurveTo(-36, -50, 0, -50);
      c.quadraticCurveTo(36, -50, 30, 30);
      for (let i = 0; i < 6; i++) {
        const x0 = 30 - i * 10;
        c.quadraticCurveTo(x0 - 5, 30 + (i % 2 === f ? 14 : -4), x0 - 10, 30);
      }
      c.closePath();
      c.fillStyle = "#dfe8ff";
      c.fill();
      c.strokeStyle = "rgba(90,110,190,0.9)";
      c.lineWidth = 2.5;
      c.stroke();
      c.globalAlpha = 1;
      poly(c, [-18, -48, -16, -66, -8, -56, 0, -70, 8, -56, 16, -66, 18, -48], "#8a9ab8", OUT, 1.5);
      ell(c, -9, -24, 6, 9, "#141826");
      ell(c, 10, -24, 6, 9, "#141826");
      ell(c, -9, -25, 2, 2.5, "#7affff");
      ell(c, 10, -25, 2, 2.5, "#7affff");
      ell(c, 1, -2, 8, 6, "#141826");
    },
  },
  bearking: {
    w: 120,
    h: 104,
    draw: (c, f) => {
      for (const [x, k] of [
        [-30, f],
        [-12, -f],
        [14, -f],
        [32, f],
      ] as [number, number][])
        rr(c, x - 7, 10, 14, 28 + k * 3, 5, "#2a1a10", OUT, 2);
      ell(c, -4, 4, 44, 28, "#4a3020", OUT, 2.5);
      ell(c, -10, -4, 28, 14, "#5a3d28");
      ell(c, 38, -14, 20, 18, "#4a3020", OUT, 2.4);
      ell(c, 52, -8, 9, 7, "#7a5a40", OUT, 1.6);
      ell(c, 57, -9, 2.6, 2.2, "#1a1010");
      ell(c, 30, -32, 6, 6, "#4a3020", OUT, 1.5);
      ell(c, 44, -32, 6, 6, "#4a3020", OUT, 1.5);
      ell(c, 44, -18, 2.6, 2.6, "#ff3a1a");
      poly(c, [26, -36, 28, -48, 33, -40, 37, -50, 41, -40, 46, -48, 48, -36], "#f2c230", OUT, 1.4);
      poly(c, [48, -2, 58, -2, 54, 4], "#fff");
    },
  },
};

const ENEMY_DRAW: Record<EnemyId, { w: number; h: number; draw: Draw }> = {
  ...ENEMY_DRAW0,
  altar: {
    w: 56,
    h: 76,
    draw: (c) => {
      // a carved stone idol with a glowing rune (капище)
      ell(c, 0, 30, 24, 7, "#4a4440", OUT, 1.5);
      poly(c, [-14, 30, -16, -14, -10, -28, 10, -28, 16, -14, 14, 30], "#8a8378", OUT, 2);
      poly(c, [-14, 30, -16, -14, -10, -28, -2, -28, -4, 30], "rgba(0,0,0,0.18)");
      ell(c, -6, -14, 3, 2.2, "#ffcf4a");
      ell(c, 6, -14, 3, 2.2, "#ffcf4a");
      line(c, [-6, -2, 0, 6, 6, -2], "#3a3430", 2);
      line(c, [0, 10, 0, 24, -6, 18, 6, 18], "#ffb02a", 2.2);
      poly(c, [-18, -24, -10, -36, 10, -36, 18, -24], "#6a6258", OUT, 1.5);
    },
  },
  velikan: ENEMY_DRAW0.ispolin,
  gorskicar: ENEMY_DRAW0.bearking,
  blatnamaika: ENEMY_DRAW0.swampking,
  ledenvelikan: ENEMY_DRAW0.ghostking,
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
    w: 64,
    h: 64,
    draw: (c) => {
      // a long two-handed war axe with a double blade
      const g = c.createLinearGradient(-3, 0, 3, 0);
      g.addColorStop(0, "#3a2414");
      g.addColorStop(0.4, "#9a6634");
      g.addColorStop(1, "#4a2e18");
      c.save();
      c.rotate(-0.6);
      c.fillStyle = g;
      c.beginPath();
      c.roundRect(-2.4, -28, 4.8, 56, 2);
      c.fill();
      c.strokeStyle = OUT;
      c.lineWidth = 1;
      c.stroke();
      for (let y = 12; y <= 24; y += 3) line(c, [-2.4, y, 2.4, y + 1.5], "#2a1a0e", 1.2);
      for (const dir of [-1, 1]) {
        c.beginPath();
        c.moveTo(dir * 2, -24);
        c.quadraticCurveTo(dir * 10, -30, dir * 19, -33);
        c.quadraticCurveTo(dir * 24, -20, dir * 19, -7);
        c.quadraticCurveTo(dir * 10, -10, dir * 2, -14);
        c.closePath();
        const bg = c.createLinearGradient(dir * 2, -20, dir * 21, -20);
        bg.addColorStop(0, "#6c757c");
        bg.addColorStop(0.6, "#c9d1d7");
        bg.addColorStop(1, "#f4f8fb");
        c.fillStyle = bg;
        c.fill();
        c.strokeStyle = OUT;
        c.lineWidth = 1.2;
        c.stroke();
        line(c, [dir * 19, -32, dir * 23.2, -20, dir * 19, -8], "rgba(255,255,255,0.85)", 1);
      }
      rr(c, -3.4, -27, 6.8, 14, 1.5, "#4a4f55", OUT, 1);
      ell(c, 0, -20, 1.6, 1.6, "#d8b44a");
      c.restore();
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
    draw: (c, f) => {
      ell(c, -1, f ? -5 : -2.5, 3, f ? 2.4 : 1.2, "rgba(230,245,255,0.85)");
      ell(c, 2, f ? -5 : -2.5, 3, f ? 2.4 : 1.2, "rgba(230,245,255,0.85)");
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
  [PK.rock]: {
    w: 28,
    h: 28,
    draw: (c) => {
      poly(c, [-10, 2, -7, -8, 2, -11, 10, -5, 11, 4, 4, 10, -6, 9], "#8a847a", OUT, 1.3);
      poly(c, [-7, -8, 2, -11, 3, -2, -5, 0], "#a8a298");
      line(c, [-2, 3, 4, 6], "rgba(40,30,20,0.6)", 1);
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

/** a head of garlic, for the aura around the player */
export function garlicSprite() {
  return get("p:garlic", 18, 20, (c) => {
    for (const [x, k] of [
      [-3.5, 0.85],
      [3.5, 0.85],
      [0, 1],
    ] as [number, number][]) {
      c.beginPath();
      c.ellipse(x, 3, 4.2 * k, 5.6 * k, 0, 0, Math.PI * 2);
      c.fillStyle = "#f4efe4";
      c.fill();
      c.strokeStyle = "rgba(120,100,80,0.8)";
      c.lineWidth = 0.8;
      c.stroke();
    }
    line(c, [0, -2, 0.5, -8], "#8cb85a", 1.6);
    line(c, [-2, 7, 2, 7], "rgba(150,120,90,0.7)", 0.8);
  });
}

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
  [GK.relic]: {
    w: 30,
    h: 34,
    draw: (c) => {
      // 💎 a relic: a gold amulet with a glowing violet stone
      c.beginPath();
      c.arc(0, -8, 7, Math.PI * 1.1, Math.PI * 1.9);
      c.strokeStyle = "#e8c25a";
      c.lineWidth = 1.6;
      c.stroke();
      const gl = c.createRadialGradient(0, 4, 1, 0, 4, 14);
      gl.addColorStop(0, "rgba(220,170,255,0.9)");
      gl.addColorStop(1, "rgba(160,90,255,0)");
      c.fillStyle = gl;
      c.fillRect(-15, -10, 30, 28);
      poly(c, [0, -6, 9, 2, 6, 12, -6, 12, -9, 2], "#f2c230", OUT, 1.4);
      poly(c, [0, -2, 5, 3, 3, 9, -3, 9, -5, 3], "#a650ff", "#4a1a80", 1);
      poly(c, [0, -2, 5, 3, 0, 4], "rgba(255,255,255,0.55)");
    },
  },
  [GK.item + 0]: {
    w: 30,
    h: 30,
    draw: (c) => {
      // 🎒 a bundle (вързоп) tied with a ribbon in the rarity colour
      const gl = c.createRadialGradient(0, 2, 1, 0, 2, 14);
      gl.addColorStop(0, "#d8d8d8cc");
      gl.addColorStop(1, "#d8d8d800");
      c.fillStyle = gl;
      c.fillRect(-15, -12, 30, 28);
      ell(c, 0, 4, 9, 8, "#b8946a", OUT);
      poly(c, [-4, -4, 4, -4, 6, -9, 0, -6, -6, -9], "#a07c52", OUT, 1);
      line(c, [-8, 0, 8, 0], "#d8d8d8", 2.4);
      ell(c, 0, 0, 2.6, 2.6, "#d8d8d8", "#555555", 1);
    },
  },
  [GK.item + 1]: {
    w: 30,
    h: 30,
    draw: (c) => {
      // 🎒 a bundle (вързоп) tied with a ribbon in the rarity colour
      const gl = c.createRadialGradient(0, 2, 1, 0, 2, 14);
      gl.addColorStop(0, "#4aa8ffcc");
      gl.addColorStop(1, "#4aa8ff00");
      c.fillStyle = gl;
      c.fillRect(-15, -12, 30, 28);
      ell(c, 0, 4, 9, 8, "#b8946a", OUT);
      poly(c, [-4, -4, 4, -4, 6, -9, 0, -6, -6, -9], "#a07c52", OUT, 1);
      line(c, [-8, 0, 8, 0], "#4aa8ff", 2.4);
      ell(c, 0, 0, 2.6, 2.6, "#4aa8ff", "#1a3a70", 1);
    },
  },
  [GK.item + 2]: {
    w: 30,
    h: 30,
    draw: (c) => {
      // 🎒 a bundle (вързоп) tied with a ribbon in the rarity colour
      const gl = c.createRadialGradient(0, 2, 1, 0, 2, 14);
      gl.addColorStop(0, "#b67cffcc");
      gl.addColorStop(1, "#b67cff00");
      c.fillStyle = gl;
      c.fillRect(-15, -12, 30, 28);
      ell(c, 0, 4, 9, 8, "#b8946a", OUT);
      poly(c, [-4, -4, 4, -4, 6, -9, 0, -6, -6, -9], "#a07c52", OUT, 1);
      line(c, [-8, 0, 8, 0], "#b67cff", 2.4);
      ell(c, 0, 0, 2.6, 2.6, "#b67cff", "#4a1a80", 1);
    },
  },
  [GK.item + 3]: {
    w: 30,
    h: 30,
    draw: (c) => {
      // 🎒 a bundle (вързоп) tied with a ribbon in the rarity colour
      const gl = c.createRadialGradient(0, 2, 1, 0, 2, 14);
      gl.addColorStop(0, "#ffb02ecc");
      gl.addColorStop(1, "#ffb02e00");
      c.fillStyle = gl;
      c.fillRect(-15, -12, 30, 28);
      ell(c, 0, 4, 9, 8, "#b8946a", OUT);
      poly(c, [-4, -4, 4, -4, 6, -9, 0, -6, -6, -9], "#a07c52", OUT, 1);
      line(c, [-8, 0, 8, 0], "#ffb02e", 2.4);
      ell(c, 0, 0, 2.6, 2.6, "#ffb02e", "#7a4a00", 1);
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
function rgba(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** 🗺️ the ground of each map (the meadow stays exactly as it always was) */
export function groundTile(map: SurvMapId = "polyana"): HTMLCanvasElement {
  if (map !== "polyana") return otherGround(map);
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

function otherGround(map: SurvMapId): HTMLCanvasElement {
  const key = `ground:${map}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const G = MAPS[map].ground;
  const N = 512;
  const cv = document.createElement("canvas");
  cv.width = N;
  cv.height = N;
  const c = cv.getContext("2d")!;
  c.fillStyle = G.base;
  c.fillRect(0, 0, N, N);
  let seed = map.length * 131 + 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const wrap = (fn: () => void) => {
    for (const dx of [-N, 0, N]) for (const dy of [-N, 0, N]) {
      c.save();
      c.translate(dx, dy);
      fn();
      c.restore();
    }
  };
  // soft patches of the map's darker / lighter ground
  for (let i = 0; i < 30; i++) {
    const x = rnd() * N;
    const y = rnd() * N;
    const r = 30 + rnd() * 80;
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(rnd() < 0.5 ? G.dark : G.light, 0.45));
    g.addColorStop(1, rgba(G.base, 0));
    c.fillStyle = g;
    wrap(() => {
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.fill();
    });
  }
  if (map === "blato") {
    // murky water puddles with a shine
    for (let i = 0; i < 9; i++) {
      const x = rnd() * N;
      const y = rnd() * N;
      const rx = 22 + rnd() * 40;
      const ry = rx * (0.45 + rnd() * 0.25);
      wrap(() => {
        ell(c, x, y, rx + 4, ry + 3, "rgba(30,40,20,0.5)");
        ell(c, x, y, rx, ry, "rgba(40,70,70,0.85)");
        ell(c, x - rx * 0.3, y - ry * 0.3, rx * 0.35, ry * 0.2, "rgba(170,210,200,0.25)");
      });
    }
  }
  if (map === "planina") {
    // stones peeking out of the snow
    for (let i = 0; i < 26; i++) {
      const x = rnd() * N;
      const y = rnd() * N;
      const r = 3 + rnd() * 7;
      wrap(() => {
        ell(c, x, y + 1.5, r * 1.1, r * 0.6, "rgba(60,70,85,0.35)");
        ell(c, x, y, r, r * 0.65, "#7a8494", "rgba(40,48,60,0.6)", 1);
        ell(c, x - r * 0.3, y - r * 0.25, r * 0.5, r * 0.2, "rgba(255,255,255,0.7)");
      });
    }
  }
  // blades / twigs / snow grain
  const blades = map === "planina" ? 500 : 1300;
  for (let i = 0; i < blades; i++) {
    const x = rnd() * N;
    const y = rnd() * N;
    const h = (map === "planina" ? 1 : 3) + rnd() * 4;
    c.strokeStyle = rgba(rnd() < 0.5 ? G.light : G.dark, map === "planina" ? 0.5 : 0.6);
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + (rnd() - 0.5) * (map === "gora" ? 6 : 3), y - h);
    c.stroke();
  }
  if (map === "gora") {
    // fallen leaves
    for (let i = 0; i < 120; i++) {
      c.save();
      c.translate(rnd() * N, rnd() * N);
      c.rotate(rnd() * Math.PI);
      c.fillStyle = ["#6a4a2a", "#8a5a2a", "#5a3a1a", "#7a6a3a"][Math.floor(rnd() * 4)]!;
      c.globalAlpha = 0.75;
      c.beginPath();
      c.ellipse(0, 0, 3.2, 1.6, 0, 0, Math.PI * 2);
      c.fill();
      c.restore();
    }
  }
  for (let i = 0; i < 46; i++) {
    c.fillStyle = G.specks[Math.floor(rnd() * G.specks.length)]!;
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

export function heroIcon(hero: SurvHeroId, skin: SurvSkinId = "classic"): string {
  const key = `hero:${hero}:${skin}`;
  const hit = iconCache.get(key);
  if (hit) return hit;
  const sp = heroSprite(hero, 8, 0, false, skin);
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
