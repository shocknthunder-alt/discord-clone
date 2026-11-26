import type { SurvHeroId, SurvMapId } from "@discord-clone/shared";
import { AFFIXES, AFFIX_TEXT, ENEMIES, ENEMY_IDS, RARITY, type EnemyId } from "./content";
import { FX, GK, HEROES_ORDER, MK, PK, type Fx, type RView } from "./engine";
import { decorSprite, enemySize, enemySprite, garlicSprite, groundTile, heroSprite, pickupSprite, projSprite, shrineSprite } from "./sprites";

// 🧟 Шмиркленд — draws a view (the host's world, or a guest's snapshot) onto the canvas: meadow, scenery,
// marks, gems, everything sorted by height, effects (particles, bolts, blasts, numbers), arrows to
// things off screen, the night of the "Тъмна нощ" curse.

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  col: string;
  size: number;
}
interface FloatText {
  x: number;
  y: number;
  text: string;
  col: string;
  life: number;
  big: boolean;
}
interface Bolt {
  pts: number[];
  life: number;
}
interface Ring {
  x: number;
  y: number;
  r0: number;
  r1: number;
  life: number;
  max: number;
  col: string;
  w: number;
}
interface Crack {
  x: number;
  y: number;
  pts: number[];
  life: number;
}
interface Boom {
  x: number;
  y: number;
  r: number;
  kind: number;
  life: number;
  max: number;
}

const DIE_COL: Partial<Record<EnemyId, string>> = {
  rat: "#9a938e",
  bat: "#6b3a7c",
  zombie: "#7d8f66",
  ghost: "#eef3ff",
  vampire: "#c4122a",
  werewolf: "#7a5636",
  witch: "#7fc35a",
  blatnik: "#5f8a3a",
  kuker: "#e9e3d6",
  wolf: "#86827c",
  yuda: "#b9d8ff",
  pot: "#b5652e",
};
const BOOM_COL = ["#ffd36b", "#ffe9a8", "#ffffff", "#ff8a2a", "#cfe9ff", "#b89a6a", "#8cff4a", "#c4122a"];
const BOOM_FILL = ["255,210,80", "255,230,150", "255,255,255", "255,140,60", "220,240,255", "190,160,110", "140,255,80", "200,20,40"];
/** the size each projectile picture was drawn for (bigger r = a bigger "area" stat) */
const PROJ_BASE: Record<number, number> = {
  [PK.tsarvul]: 13,
  [PK.bigTsarvul]: 13,
  [PK.pig]: 18,
  [PK.boar]: 29,
  [PK.kob]: 16,
  [PK.mart]: 9,
  [PK.bullet]: 6,
  [PK.sheep]: 22,
  [PK.axe]: 20,
  [PK.bigAxe]: 20,
  [PK.note]: 8,
  [PK.bee]: 6,
  [PK.rock]: 12,
};
/** drawn upright (not turned with the flight direction) */
const UPRIGHT = new Set<number>([PK.cauldron, PK.scarecrow, PK.jack, PK.note]);
/** spinning things leave a blurred trail */
const SPIN_TRAIL = new Set<number>([PK.axe, PK.bigAxe, PK.tsarvul, PK.bigTsarvul, PK.banitsa]);
/** turned left/right only */
const SIDEWAYS = new Set<number>([PK.pig, PK.boar, PK.sheep]);
/** the enemies' attacks: drawn last, on top, with a dark halo + a red edge */
const FOE = new Set<number>([PK.eball, PK.ebolt, PK.batshot, PK.rock, PK.tornado, PK.poison]);

export interface DrawOpts {
  me: string | null;
  /** how visible our own attacks are, 0..1 (so the enemies' attacks stand out) */
  fxAlpha?: number;
  night: boolean;
  numbers: boolean;
  /** where the camera looks */
  camX: number;
  camY: number;
  /** the 3D layer underneath draws the ground, scenery, heroes, enemies and pickups */
  three?: boolean;
  /** 🗺️ which map (its ground) */
  map?: SurvMapId;
}

/** World units visible at least (the zoom fits this into the canvas). */
/** in 3D the camera stands further back */
const THREE_ZOOM = 0.78;
const VIEW_W = 920;
const VIEW_H = 540;

export class Renderer {
  private c: CanvasRenderingContext2D;
  private w = 1;
  private h = 1;
  private dpr = 1;
  zoom = 1;
  /** the zoom the last frame used (the 3D layer follows it) */
  zNow = 1;
  private particles: Particle[] = [];
  private texts: FloatText[] = [];
  private bolts: Bolt[] = [];
  private booms: Boom[] = [];
  private shake = 0;
  private trails = new Map<string, { x: number; y: number; t: number }[]>();
  private lastPos = new Map<number, { x: number; y: number; a: number }>();
  private rings: Ring[] = [];
  private cracks: Crack[] = [];
  /** a whole-screen flash of colour (skills) */
  private flash: { col: string; t: number; max: number } | null = null;
  private pattern: CanvasPattern | null = null;
  private patternMap: SurvMapId = "polyana";
  private clock = 0;
  /** the screen shake of the last frame (the 3D layer follows it) */
  shakeX = 0;
  shakeY = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.c = canvas.getContext("2d")!;
  }

  resize(cssW: number, cssH: number) {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = Math.max(1, cssW);
    this.h = Math.max(1, cssH);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    // by area, so narrow / tall windows (phones) are not tiny
    this.zoom = Math.max(0.6, Math.min(2.2, Math.sqrt((this.w * this.h) / (VIEW_W * VIEW_H))));
    this.pattern = null;
  }

  /** Effects → particles / text / bolts / blasts. Players are looked up for "hurt" shakes. */
  pushFx(list: Fx[], view: RView, me: string | null, numbers: boolean) {
    for (const f of list) {
      switch (f[0]) {
        case FX.die: {
          const type = ENEMY_IDS[f[3] as number] ?? "rat";
          const col = DIE_COL[type] ?? "#ddd";
          const n = this.particles.length > 500 ? 2 : 6;
          for (let i = 0; i < n; i++) {
            const a = Math.random() * Math.PI * 2;
            const s = 40 + Math.random() * 120;
            this.particles.push({ x: f[1] as number, y: f[2] as number, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, life: 0.5, max: 0.5, col, size: 2 + Math.random() * 2.5 });
          }
          break;
        }
        case FX.dmg:
          if (numbers && this.texts.length < 90) this.texts.push({ x: (f[1] as number) + (Math.random() - 0.5) * 10, y: f[2] as number, text: String(f[3]), col: f[4] ? "#ffdd33" : "#ffffff", life: f[4] ? 0.9 : 0.6, big: !!f[4] });
          break;
        case FX.bolt:
          this.bolts.push({ pts: (f.slice(1) as number[]).map(Number), life: 0.2 });
          break;
        case FX.boom:
          this.booms.push({ x: f[1] as number, y: f[2] as number, r: f[3] as number, kind: f[4] as number, life: f[4] === 2 ? 0.6 : 0.35, max: f[4] === 2 ? 0.6 : 0.35 });
          if (f[4] === 2) this.shake = 0.5;
          for (let i = 0; i < (f[4] === 2 ? 40 : 10); i++) {
            const a = Math.random() * Math.PI * 2;
            const s = 60 + Math.random() * 200;
            this.particles.push({ x: f[1] as number, y: f[2] as number, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5, max: 0.5, col: BOOM_COL[f[4] as number] ?? "#fff", size: 2 + Math.random() * 3 });
          }
          break;
        case FX.text:
          this.texts.push({ x: f[1] as number, y: f[2] as number, text: String(f[3]), col: String(f[4]), life: 1.4, big: true });
          break;
        case FX.bossDie:
          this.shake = 0.7;
          for (let i = 0; i < 80; i++) {
            const a = Math.random() * Math.PI * 2;
            const s = 80 + Math.random() * 320;
            this.particles.push({ x: f[1] as number, y: f[2] as number, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, max: 1, col: ["#ffd36b", "#ff5a3a", "#fff"][i % 3]!, size: 3 + Math.random() * 4 });
          }
          break;
        case FX.hurt: {
          const p = view.players[f[1] as number];
          if (p && p.uid === me) this.shake = Math.max(this.shake, 0.18);
          break;
        }
        case FX.skill: {
          const x = f[2] as number;
          const y = f[3] as number;
          const hero = HEROES_ORDER[f[4] as number];
          if (x === undefined || !hero) break;
          this.skillFx(hero, x, y);
          break;
        }
        case FX.revive:
        case FX.evolve:
        case FX.level: {
          const p = f[0] === FX.level ? view.players.find((q) => q.uid === me) : view.players[f[1] as number];
          if (!p) break;
          for (let i = 0; i < 30; i++) {
            const a = (i / 30) * Math.PI * 2;
            this.particles.push({ x: p.x, y: p.y, vx: Math.cos(a) * 160, vy: Math.sin(a) * 160, life: 0.7, max: 0.7, col: f[0] === FX.revive ? "#9cff9c" : "#ffe27a", size: 3 });
          }
          break;
        }
      }
    }
  }

  private burst(x: number, y: number, n: number, cols: string[], speed: number, life = 0.8, size = 3, up = 0) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.8);
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - up, life, max: life, col: cols[i % cols.length]!, size: size * (0.6 + Math.random() * 0.8) });
    }
  }
  private ring(x: number, y: number, r0: number, r1: number, life: number, col: string, w = 5) {
    this.rings.push({ x, y, r0, r1, life, max: life, col, w });
  }

  /** every hero's skill gets its own big, readable effect */
  private skillFx(hero: SurvHeroId, x: number, y: number) {
    switch (hero) {
      case "peyo":
        this.flash = { col: "255,240,200", t: 0.25, max: 0.25 };
        this.burst(x, y + 10, 40, ["#c9a56a", "#e8d6a8", "#ffffff"], 260, 0.9, 4);
        this.ring(x, y, 20, 260, 0.6, "255,240,210");
        break;
      case "tseko":
        this.ring(x, y, 10, 130, 0.5, "255,160,60", 7);
        this.ring(x, y, 10, 160, 0.8, "255,220,120", 3);
        this.burst(x, y, 30, ["#ffb21a", "#ff6a2a", "#fff27a"], 300, 0.6, 3);
        break;
      case "nikola":
        this.flash = { col: "120,180,255", t: 0.6, max: 0.6 };
        this.shake = 0.35;
        this.burst(x, y - 10, 36, ["#cdeeff", "#7ab8ff", "#ffffff"], 320, 0.6, 2.5);
        break;
      case "gitsa":
        this.flash = { col: "255,220,120", t: 0.35, max: 0.35 };
        this.ring(x, y, 20, 420, 0.9, "255,215,90", 8);
        this.ring(x, y, 20, 300, 0.7, "140,255,140", 4);
        for (let i = 0; i < 26; i++) this.texts.push({ x: x + (Math.random() - 0.5) * 220, y: y + (Math.random() - 0.5) * 160, text: "+", col: "#7cff8a", life: 0.9 + Math.random() * 0.5, big: true });
        break;
      case "strahil": {
        this.shake = 0.7;
        this.flash = { col: "255,200,150", t: 0.25, max: 0.25 };
        this.ring(x, y + 10, 20, 260, 0.55, "200,160,110", 10);
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * Math.PI * 2 + Math.random() * 0.4;
          const pts: number[] = [];
          let px = 0;
          let py = 0;
          for (let k = 0; k < 6; k++) {
            px += Math.cos(a + (Math.random() - 0.5) * 0.8) * 34;
            py += Math.sin(a + (Math.random() - 0.5) * 0.8) * 24;
            pts.push(px, py);
          }
          this.cracks.push({ x, y: y + 16, pts, life: 1.6 });
        }
        this.burst(x, y + 10, 50, ["#8a6a4a", "#b89a6a", "#5a4030"], 340, 0.9, 4, 120);
        break;
      }
      case "vela":
        this.flash = { col: "170,230,255", t: 0.6, max: 0.6 };
        this.ring(x, y, 20, 800, 1.1, "190,240,255", 10);
        this.ring(x, y, 20, 500, 0.8, "255,255,255", 4);
        this.burst(x, y, 60, ["#ffffff", "#cdeeff", "#9ad8ff"], 420, 1.4, 3);
        break;
      case "gosho":
        this.shake = 0.4;
        for (let i = 0; i < 3; i++) this.ring(x, y, 10 + i * 30, 450 - i * 60, 0.7 + i * 0.15, "255,210,80", 6 - i);
        this.burst(x, y, 30, ["#f2c230", "#ffe27a", "#ff3b3b", "#3bb3ff"], 300, 0.8, 3);
        break;
      case "mitko":
        this.flash = { col: "255,170,80", t: 0.4, max: 0.4 };
        this.ring(x, y, 20, 360, 0.8, "255,180,80", 6);
        this.burst(x, y - 10, 40, ["#ffd27a", "#fff6c0", "#ff9a3a"], 220, 1.2, 3, 160);
        break;
      case "stana":
        this.flash = { col: "150,255,150", t: 0.4, max: 0.4 };
        this.ring(x, y, 20, 320, 0.9, "150,255,140", 6);
        this.burst(x, y, 50, ["#5ec04a", "#a8e07a", "#3a8a2a", "#ffe27a"], 260, 1.4, 3.5, 60);
        break;
    }
  }

  private layer: HTMLCanvasElement | null = null;

  draw(v: RView, o: DrawOpts, dt: number) {
    const main = this.c;
    let c = main;
    this.clock += dt;
    // 3D: a bit further out (the models are bigger than the old pictures); both layers use the same zoom
    const z = this.zoom * (o.three ? THREE_ZOOM : 1);
    this.zNow = z;
    let camX = o.camX;
    let camY = o.camY;
    this.shakeX = 0;
    this.shakeY = 0;
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt);
      this.shakeX = (Math.random() - 0.5) * 18 * this.shake;
      this.shakeY = (Math.random() - 0.5) * 18 * this.shake;
      camX += this.shakeX;
      camY += this.shakeY;
    }
    const halfW = this.w / 2 / z;
    const halfH = this.h / 2 / z;
    const x0 = camX - halfW;
    const y0 = camY - halfH;
    const x1 = camX + halfW;
    const y1 = camY + halfH;
    const onScreen = (x: number, y: number, m: number) => x > x0 - m && x < x1 + m && y > y0 - m && y < y1 + m;

    const T = !!o.three;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // ground
    const map = o.map ?? "polyana";
    if (!this.pattern || this.patternMap !== map) {
      this.pattern = c.createPattern(groundTile(map), "repeat");
      this.patternMap = map;
    }
    c.save();
    c.scale(z, z);
    c.translate(-x0, -y0);
    if (this.pattern && !T) {
      c.fillStyle = this.pattern;
      c.fillRect(x0, y0, x1 - x0, y1 - y0);
    }

    // scenery from a hash of the 220-px cell
    const DC = 220;
    if (!T) for (let gx = Math.floor((x0 - 60) / DC); gx <= Math.floor((x1 + 60) / DC); gx++) {
      for (let gy = Math.floor((y0 - 80) / DC); gy <= Math.floor((y1 + 80) / DC); gy++) {
        let h = (gx * 73856093) ^ (gy * 19349663);
        h = (h ^ (h >>> 13)) * 1274126177;
        h = (h ^ (h >>> 16)) >>> 0;
        if (h % 100 > 26) continue;
        const kind = (h >>> 8) % 9;
        const k = kind >= 6 ? 5 : kind; // flowers more often
        const sp = decorSprite(k);
        const dx = gx * DC + ((h >>> 4) % 160) + 30;
        const dy = gy * DC + ((h >>> 12) % 160) + 30;
        c.drawImage(sp, dx - sp.width / 4, dy - sp.height / 4, sp.width / 2, sp.height / 2);
      }
    }

    // marks: the shrine under everything, warnings later (above our own attacks)
    const drawMark = (m: RView["marks"][number]) => {
      if (m.kind === MK.shrine) {
        c.beginPath();
        c.arc(m.x, m.y, m.r, 0, Math.PI * 2);
        c.fillStyle = "rgba(255,220,120,0.12)";
        c.fill();
        c.setLineDash([8, 6]);
        c.strokeStyle = "rgba(255,220,120,0.8)";
        c.lineWidth = 2;
        c.stroke();
        c.setLineDash([]);
        if (m.p > 0) {
          c.beginPath();
          c.arc(m.x, m.y, m.r + 6, -Math.PI / 2, -Math.PI / 2 + m.p * Math.PI * 2);
          c.strokeStyle = "#ffe27a";
          c.lineWidth = 5;
          c.stroke();
        }
        if (!T) {
          const sp = shrineSprite();
          c.drawImage(sp, m.x - sp.width / 4, m.y - sp.height / 2 + 6, sp.width / 2, sp.height / 2);
        }
      } else if (m.kind === MK.portal) {
        // 🌀 the portal of the giant: swirling rings, fills while you stand in it
        for (let i = 0; i < 4; i++) {
          const a0 = this.clock * (2 + i * 0.6) * (i % 2 ? -1 : 1);
          c.beginPath();
          c.ellipse(m.x, m.y, m.r * (1 - i * 0.18), m.r * (1 - i * 0.18) * 0.8, 0, a0, a0 + 4.2);
          c.strokeStyle = `rgba(${i % 2 ? "190,120,255" : "120,200,255"},${0.85 - i * 0.15})`;
          c.lineWidth = 4 - i * 0.6;
          c.stroke();
        }
        c.beginPath();
        c.ellipse(m.x, m.y, m.r, m.r * 0.8, 0, 0, Math.PI * 2);
        c.fillStyle = `rgba(120,60,200,${0.16 + Math.sin(this.clock * 3) * 0.05})`;
        c.fill();
        if (m.p > 0) {
          c.beginPath();
          c.arc(m.x, m.y, m.r + 8, -Math.PI / 2, -Math.PI / 2 + m.p * Math.PI * 2);
          c.strokeStyle = "#e0b0ff";
          c.lineWidth = 6;
          c.stroke();
        }
      } else if (m.kind === MK.hail) {
        c.beginPath();
        c.arc(m.x, m.y, m.r * (0.4 + 0.6 * m.p), 0, Math.PI * 2);
        c.fillStyle = `rgba(60,10,20,${0.25 + 0.35 * m.p})`;
        c.fill();
        c.beginPath();
        c.arc(m.x, m.y, m.r, 0, Math.PI * 2);
        c.strokeStyle = `rgba(255,${(120 - 80 * m.p) | 0},70,${0.7 + 0.3 * m.p})`;
        c.lineWidth = 2.5;
        c.setLineDash([7, 5]);
        c.stroke();
        c.setLineDash([]);
      } else if (m.kind === MK.acid) {
        c.beginPath();
        c.arc(m.x, m.y, m.r * (0.3 + 0.7 * m.p), 0, Math.PI * 2);
        c.fillStyle = `rgba(110,200,40,${0.18 + 0.3 * m.p})`;
        c.fill();
        c.beginPath();
        c.arc(m.x, m.y, m.r, 0, Math.PI * 2);
        c.strokeStyle = `rgba(190,255,70,${0.7 + 0.3 * m.p})`;
        c.lineWidth = 2.5;
        c.setLineDash([7, 5]);
        c.stroke();
        c.setLineDash([]);
      } else if (m.kind === MK.leap || m.kind === MK.nova) {
        // a red warning that fills up: get out!
        c.beginPath();
        c.arc(m.x, m.y, m.r, 0, Math.PI * 2);
        c.fillStyle = `rgba(255,40,30,${0.1 + 0.25 * m.p})`;
        c.fill();
        c.setLineDash([10, 7]);
        c.strokeStyle = `rgba(255,80,60,${0.6 + 0.4 * m.p})`;
        c.lineWidth = 3;
        c.stroke();
        c.setLineDash([]);
        c.beginPath();
        c.arc(m.x, m.y, m.r * m.p, 0, Math.PI * 2);
        c.strokeStyle = "rgba(255,200,120,0.8)";
        c.lineWidth = 2;
        c.stroke();
      } else if (m.kind === MK.charge) {
        const a = (m as { a?: number }).a ?? 0;
        c.save();
        c.translate(m.x, m.y);
        c.rotate(a);
        c.fillStyle = `rgba(255,30,30,${0.12 + 0.22 * m.p})`;
        c.fillRect(0, -m.r, 480, m.r * 2);
        c.setLineDash([12, 8]);
        c.strokeStyle = `rgba(255,70,50,${0.5 + 0.4 * m.p})`;
        c.lineWidth = 2;
        c.strokeRect(0, -m.r, 480, m.r * 2);
        c.setLineDash([]);
        c.restore();
      }
    };
    for (const m of v.marks) if (m.kind === MK.shrine || m.kind === MK.portal) drawMark(m);

    // ground cracks (Баткан's punch)
    for (let i = this.cracks.length - 1; i >= 0; i--) {
      const k = this.cracks[i]!;
      k.life -= dt;
      if (k.life <= 0) {
        this.cracks.splice(i, 1);
        continue;
      }
      c.globalAlpha = Math.min(1, k.life);
      c.beginPath();
      c.moveTo(k.x, k.y);
      for (let j = 0; j < k.pts.length; j += 2) c.lineTo(k.x + k.pts[j]!, k.y + k.pts[j + 1]!);
      c.strokeStyle = "#1e140c";
      c.lineWidth = 3;
      c.stroke();
      c.strokeStyle = "rgba(255,150,60,0.6)";
      c.lineWidth = 1;
      c.stroke();
      c.globalAlpha = 1;
    }

    // 💎 relics: a pillar of light (also over the 3D layer)
    for (const g of v.gems) {
      const item = g.k >= GK.item && g.k <= GK.item + 3;
      if ((g.k !== GK.relic && !(item && g.k >= GK.item + 1)) || !onScreen(g.x, g.y, 40)) continue;
      if (item) {
        // 🎒 a magic+ item: a short pillar in its rarity colour
        const col = ["", "136,136,255", "255,255,119", "224,120,44"][g.k - GK.item]!;
        const h = 90 + Math.sin(this.clock * 3 + g.x) * 8;
        const gr = c.createLinearGradient(0, g.y - h, 0, g.y);
        gr.addColorStop(0, `rgba(${col},0)`);
        gr.addColorStop(1, `rgba(${col},0.5)`);
        c.fillStyle = gr;
        c.fillRect(g.x - 6, g.y - h, 12, h);
        continue;
      }
      const h = 150 + Math.sin(this.clock * 3) * 12;
      const gr = c.createLinearGradient(0, g.y - h, 0, g.y);
      gr.addColorStop(0, "rgba(190,120,255,0)");
      gr.addColorStop(1, "rgba(200,140,255,0.55)");
      c.fillStyle = gr;
      c.fillRect(g.x - 9, g.y - h, 18, h);
      c.beginPath();
      c.ellipse(g.x, g.y, 26 + Math.sin(this.clock * 5) * 3, 11, 0, 0, Math.PI * 2);
      c.fillStyle = "rgba(190,120,255,0.25)";
      c.fill();
    }

    // gems & pickups
    if (!T) for (const g of v.gems) {
      if (!onScreen(g.x, g.y, 20)) continue;
      const sp = pickupSprite(g.k);
      if (!sp) continue;
      const bob = g.k >= GK.food ? Math.sin(this.clock * 4 + g.x) * 2 : 0;
      if (g.k === GK.chest) {
        c.beginPath();
        c.arc(g.x, g.y, 22 + Math.sin(this.clock * 5) * 3, 0, Math.PI * 2);
        c.fillStyle = "rgba(255,210,80,0.18)";
        c.fill();
      }
      c.drawImage(sp, g.x - sp.width / 4, g.y - sp.height / 4 + bob, sp.width / 2, sp.height / 2);
    }

    // ── our own attacks: on a layer of their own when the player made them see-through ──
    const fa = Math.max(0, Math.min(1, o.fxAlpha ?? 1));
    if (fa < 0.999) {
      if (!this.layer) this.layer = document.createElement("canvas");
      const L = this.layer;
      if (L.width !== this.canvas.width || L.height !== this.canvas.height) {
        L.width = this.canvas.width;
        L.height = this.canvas.height;
      }
      const lc = L.getContext("2d")!;
      lc.setTransform(1, 0, 0, 1, 0, 0);
      lc.clearRect(0, 0, L.width, L.height);
      const k = this.dpr * z;
      lc.setTransform(k, 0, 0, k, -x0 * k, -y0 * k);
      c = lc;
    }

    // Стана's herb cloud + Баткан's whirlwind on the ground
    for (const p of v.players) {
      if (p.dead) continue;
      if (p.herbs) {
        const R = 230;
        const g = c.createRadialGradient(p.x, p.y, 20, p.x, p.y, R);
        g.addColorStop(0, "rgba(120,200,60,0.05)");
        g.addColorStop(0.75, "rgba(110,190,50,0.16)");
        g.addColorStop(1, "rgba(90,160,40,0)");
        c.fillStyle = g;
        c.beginPath();
        c.ellipse(p.x, p.y, R, R * 0.85, 0, 0, Math.PI * 2);
        c.fill();
        for (let i = 0; i < 9; i++) {
          const a = this.clock * 0.7 + i * 0.7;
          const rr = R * (0.35 + ((i * 37) % 10) / 16);
          c.globalAlpha = 0.5;
          c.fillStyle = i % 2 ? "#7ac04a" : "#b8e07a";
          c.save();
          c.translate(p.x + Math.cos(a) * rr, p.y + Math.sin(a) * rr * 0.8);
          c.rotate(a * 2);
          c.beginPath();
          c.ellipse(0, 0, 7, 3, 0, 0, Math.PI * 2);
          c.fill();
          c.restore();
        }
        c.globalAlpha = 1;
      }
      if (p.skillT > 0 && p.hero === "strahil") {
        // a dusty whirl + two big axes spinning round him
        const R = 175;
        for (let i = 0; i < 4; i++) {
          const a0 = -this.clock * 14 + i * 1.6;
          c.beginPath();
          c.ellipse(p.x, p.y, R - i * 22, (R - i * 22) * 0.8, 0, a0, a0 + 2.2);
          c.strokeStyle = `rgba(230,210,170,${0.5 - i * 0.1})`;
          c.lineWidth = 6 - i;
          c.stroke();
        }
        const ax = projSprite(PK.bigAxe, 0);
        if (ax) {
          for (let k = 0; k < 2; k++) {
            const a = -this.clock * 14 + k * Math.PI;
            for (let t = 3; t >= 0; t--) {
              const aa = a + t * 0.18;
              c.save();
              c.globalAlpha = t === 0 ? 1 : 0.18;
              c.translate(p.x + Math.cos(aa) * 120, p.y - 8 + Math.sin(aa) * 96);
              c.rotate(aa * 2);
              c.drawImage(ax, -ax.width * 0.4, -ax.height * 0.4, ax.width * 0.8, ax.height * 0.8);
              c.restore();
            }
          }
        }
        if (Math.random() < 0.6) this.particles.push({ x: p.x + (Math.random() - 0.5) * 300, y: p.y + (Math.random() - 0.5) * 240, vx: (Math.random() - 0.5) * 60, vy: -30, life: 0.5, max: 0.5, col: "#c8b48a", size: 3 });
      }
    }

    // auras + fire on the ground
    for (const p of v.players) {
      if (p.dead || !p.auraR) continue;
      const R = p.auraR;
      const g = c.createRadialGradient(p.x, p.y, R * 0.2, p.x, p.y, R);
      g.addColorStop(0, "rgba(255,255,235,0)");
      g.addColorStop(0.7, p.auraEvo ? "rgba(190,255,170,0.12)" : "rgba(250,245,220,0.1)");
      g.addColorStop(1, p.auraEvo ? "rgba(190,255,170,0.3)" : "rgba(250,245,220,0.24)");
      c.fillStyle = g;
      // a wavy misty edge, not a plain circle
      c.beginPath();
      for (let i = 0; i <= 48; i++) {
        const a = (i / 48) * Math.PI * 2;
        const rr = R * (1 + Math.sin(a * 6 + this.clock * 3) * 0.04 + Math.sin(a * 11 - this.clock * 2) * 0.025);
        if (i === 0) c.moveTo(p.x + Math.cos(a) * rr, p.y + Math.sin(a) * rr * 0.92);
        else c.lineTo(p.x + Math.cos(a) * rr, p.y + Math.sin(a) * rr * 0.92);
      }
      c.closePath();
      c.fill();
      // garlic heads circling slowly + wisps rising
      const gs = garlicSprite();
      const n = p.auraEvo ? 8 : 5;
      for (let i = 0; i < n; i++) {
        const a = this.clock * 0.9 + (i / n) * Math.PI * 2;
        const gx = p.x + Math.cos(a) * R * 0.86;
        const gy = p.y + Math.sin(a) * R * 0.8;
        const bob = Math.sin(this.clock * 4 + i) * 2;
        c.drawImage(gs, gx - gs.width / 4, gy - gs.height / 4 + bob, gs.width / 2, gs.height / 2);
      }
      for (let i = 0; i < 6; i++) {
        const k = (this.clock * 0.5 + i / 6) % 1;
        const a = i * 1.9 + Math.floor(this.clock * 0.5 + i / 6) * 2.3;
        c.globalAlpha = (1 - k) * 0.35;
        c.fillStyle = p.auraEvo ? "#d8ffc8" : "#fffbe8";
        c.beginPath();
        c.arc(p.x + Math.cos(a) * R * 0.6, p.y + Math.sin(a) * R * 0.5 - k * 30, 4 + k * 6, 0, Math.PI * 2);
        c.fill();
      }
      c.globalAlpha = 1;
    }
    for (const q of v.projs) {
      if (!onScreen(q.x, q.y, q.r + 20)) continue;
      if (q.kind === PK.scarecrow) {
        c.beginPath();
        c.arc(q.x, q.y + 10, q.r, 0, Math.PI * 2);
        c.fillStyle = "rgba(255,150,60,0.1)";
        c.fill();
        c.setLineDash([6, 6]);
        c.strokeStyle = "rgba(255,170,80,0.45)";
        c.lineWidth = 1.5;
        c.stroke();
        c.setLineDash([]);
      } else if (q.kind === PK.jack) {
        c.beginPath();
        c.arc(q.x, q.y, q.r, 0, Math.PI * 2);
        c.strokeStyle = "rgba(255,90,60,0.6)";
        c.setLineDash([5, 5]);
        c.lineWidth = 2;
        c.stroke();
        c.setLineDash([]);
      }
    }
    for (const q of v.projs) {
      if (q.kind !== PK.fire && q.kind !== PK.bigFire) continue;
      if (!onScreen(q.x, q.y, q.r)) continue;
      const g = c.createRadialGradient(q.x, q.y, 2, q.x, q.y, q.r);
      g.addColorStop(0, "rgba(255,230,120,0.55)");
      g.addColorStop(0.6, "rgba(255,110,30,0.35)");
      g.addColorStop(1, "rgba(255,60,10,0)");
      c.fillStyle = g;
      c.beginPath();
      c.ellipse(q.x, q.y, q.r, q.r * 0.75, 0, 0, Math.PI * 2);
      c.fill();
      for (let i = 0; i < 6; i++) {
        const a = i * 1.7 + q.id;
        const fx = q.x + Math.cos(a) * q.r * 0.55;
        const fy = q.y + Math.sin(a) * q.r * 0.4;
        const fh = 8 + Math.sin(this.clock * 12 + i + q.id) * 4;
        c.fillStyle = i % 2 ? "rgba(255,200,60,0.8)" : "rgba(255,120,30,0.8)";
        c.beginPath();
        c.moveTo(fx - 4, fy);
        c.quadraticCurveTo(fx, fy - fh * 1.6, fx + 4, fy);
        c.fill();
      }
    }

    // our projectiles (under the enemies, so they stay visible)
    const frame = Math.floor(this.clock * 6) % 2;
    const seen = new Map<number, { x: number; y: number; a: number }>();
    // a swoosh along the circle each orbiting yoke travels
    for (const q of v.projs) {
      if (q.kind !== PK.kob) continue;
      const owner = v.players.reduce<RView["players"][number] | null>((best, p) => (!best || Math.hypot(p.x - q.x, p.y - q.y) < Math.hypot(best.x - q.x, best.y - q.y) ? p : best), null);
      if (!owner) continue;
      const R = Math.hypot(q.x - owner.x, q.y - owner.y);
      const a = Math.atan2(q.y - owner.y, q.x - owner.x);
      const g = c.createConicGradient ? c.createConicGradient(a - 1.1, owner.x, owner.y) : null;
      c.beginPath();
      c.arc(owner.x, owner.y, R, a - 1.1, a);
      if (g) {
        g.addColorStop(0, "rgba(255,240,200,0)");
        g.addColorStop(1.1 / (Math.PI * 2), "rgba(255,240,200,0.45)");
        g.addColorStop(1, "rgba(255,240,200,0)");
        c.strokeStyle = g;
      } else c.strokeStyle = "rgba(255,240,200,0.25)";
      c.lineWidth = 10;
      c.stroke();
    }
    for (const q of v.projs) {
      if (q.kind === PK.fire || q.kind === PK.bigFire || FOE.has(q.kind)) continue;
      if (!onScreen(q.x, q.y, q.r + 30)) continue;
      if (q.kind === PK.slash || q.kind === PK.bigSlash) {
        // a curved blade of light
        const full = q.kind === PK.bigSlash;
        const a0 = full ? q.a - 2.2 : q.a - 1.2;
        const a1 = full ? q.a : q.a + 1.2;
        for (let i = 0; i < 3; i++) {
          c.beginPath();
          c.arc(q.x, q.y, q.r - i * 10, a0, a1);
          c.strokeStyle = full ? `rgba(255,120,80,${0.75 - i * 0.22})` : `rgba(235,245,255,${0.85 - i * 0.25})`;
          c.lineWidth = 7 - i * 2;
          c.stroke();
        }
        continue;
      }
      if (q.kind === PK.tornado) {
        for (let i = 0; i < 5; i++) {
          const rr = q.r * (1 - i * 0.16);
          c.beginPath();
          c.ellipse(q.x + Math.sin(this.clock * 6 + i) * 4, q.y - i * 9, rr, rr * 0.35, 0, q.a + i, q.a + i + 4.5);
          c.strokeStyle = `rgba(200,215,235,${0.7 - i * 0.1})`;
          c.lineWidth = 3;
          c.stroke();
        }
        continue;
      }
      if (q.kind === PK.ring || q.kind === PK.bigRing) {
        const big = q.kind === PK.bigRing;
        for (let i = 0; i < 3; i++) {
          const R = Math.max(1, q.r - i * 10);
          c.beginPath();
          for (let k = 0; k <= 64; k++) {
            const a = (k / 64) * Math.PI * 2;
            const rr = R + Math.sin(a * 14 + this.clock * 18 + i * 2) * (3 - i);
            if (k === 0) c.moveTo(q.x + Math.cos(a) * rr, q.y + Math.sin(a) * rr * 0.9);
            else c.lineTo(q.x + Math.cos(a) * rr, q.y + Math.sin(a) * rr * 0.9);
          }
          c.closePath();
          c.strokeStyle = big ? `rgba(200,150,255,${0.75 - i * 0.22})` : `rgba(255,236,160,${0.7 - i * 0.22})`;
          c.lineWidth = 3.5 - i;
          c.stroke();
        }
        const note = projSprite(PK.note, 0);
        if (note) {
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2 + q.id;
            c.globalAlpha = 0.85;
            c.drawImage(note, q.x + Math.cos(a) * q.r - 5, q.y + Math.sin(a) * q.r * 0.9 - 6, 10, 11);
          }
          c.globalAlpha = 1;
        }
        continue;
      }
      if (q.kind === PK.kob) {
        // drops of water flying off the buckets
        if (Math.random() < 0.25) this.particles.push({ x: q.x + (Math.random() - 0.5) * 20, y: q.y + 6, vx: (Math.random() - 0.5) * 80, vy: -40 - Math.random() * 60, life: 0.45, max: 0.45, col: "#7cc8ff", size: 2.2 });
      }
      const sp = projSprite(q.kind, SIDEWAYS.has(q.kind) ? frame : q.kind === PK.bee ? Math.floor(this.clock * 30 + q.id) % 2 : 0);
      if (!sp) continue;
      const base = PROJ_BASE[q.kind];
      const scale = base ? Math.max(0.6, q.r / base) : 1;
      const w = (sp.width / 2) * scale;
      const h = (sp.height / 2) * scale;
      // motion trail for spinning things: earlier positions + angles, fading
      if (SPIN_TRAIL.has(q.kind)) {
        const last = this.lastPos.get(q.id);
        if (last) {
          for (let k = 3; k >= 1; k--) {
            const t = k / 4;
            c.save();
            c.globalAlpha = 0.22 * (1 - t);
            c.translate(q.x + (last.x - q.x) * t * 2.2, q.y + (last.y - q.y) * t * 2.2);
            c.rotate(q.a - (q.a - last.a) * t * 2.2);
            c.drawImage(sp, -w / 2, -h / 2, w, h);
            c.restore();
          }
        }
        seen.set(q.id, { x: q.x, y: q.y, a: q.a });
      }
      c.save();
      c.translate(q.x, q.y);
      if (SIDEWAYS.has(q.kind)) {
        if (Math.cos(q.a) < 0) c.scale(-1, 1);
      } else if (!UPRIGHT.has(q.kind)) c.rotate(q.a);
      if (q.kind === PK.eball || q.kind === PK.ebolt) c.globalCompositeOperation = "lighter";
      c.drawImage(sp, -w / 2, -h / 2, w, h);
      c.restore();
    }
    this.lastPos = seen;

    if (c !== main) {
      c = main;
      if (fa > 0.01) {
        c.save();
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.globalAlpha = fa;
        c.drawImage(this.layer!, 0, 0);
        c.restore();
      }
    }

    // ── the enemies' things: always fully visible ──
    for (const m of v.marks) if (m.kind !== MK.shrine && m.kind !== MK.portal) drawMark(m);
    for (const q of v.projs) {
      if (q.kind !== PK.poison || !onScreen(q.x, q.y, q.r + 20)) continue;
        const g = c.createRadialGradient(q.x, q.y, 4, q.x, q.y, q.r);
        g.addColorStop(0, "rgba(150,230,70,0.45)");
        g.addColorStop(1, "rgba(90,160,40,0)");
        c.fillStyle = g;
        c.beginPath();
        c.ellipse(q.x, q.y, q.r, q.r * 0.75, 0, 0, Math.PI * 2);
        c.fill();
        for (let i = 0; i < 5; i++) {
          const a = this.clock * 0.8 + i * 1.3 + q.id;
          c.fillStyle = "rgba(170,240,90,0.35)";
          c.beginPath();
          c.arc(q.x + Math.cos(a) * q.r * 0.5, q.y + Math.sin(a) * q.r * 0.35, 8 + (i % 3) * 3, 0, Math.PI * 2);
          c.fill();
        }
      c.beginPath();
      c.ellipse(q.x, q.y, q.r * 0.92, q.r * 0.7, 0, 0, Math.PI * 2);
      c.setLineDash([6, 5]);
      c.strokeStyle = `rgba(200,255,80,${0.55 + Math.sin(this.clock * 6 + q.id) * 0.2})`;
      c.lineWidth = 2;
      c.stroke();
      c.setLineDash([]);
    }

    // sorted actors: enemies + players
    type Actor = { y: number; draw: () => void };
    const actors: Actor[] = [];
    for (const e of v.enemies) {
      if (!onScreen(e.x, e.y, 80)) continue;
      const d = enemySize(e.type);
      const boss = !!ENEMIES[e.type].boss;
      const scale = e.elite ? 1.6 : 1;
      actors.push({
        y: e.y,
        draw: () => {
          if (!T) {
            c.fillStyle = "rgba(0,0,0,0.25)";
            c.beginPath();
            c.ellipse(e.x, e.y + (d.h / 2 - 4) * scale * (boss ? 0.8 : 0.85), (d.w / 3) * scale, 4 * scale * (boss ? 2 : 1), 0, 0, Math.PI * 2);
            c.fill();
          }
          if (e.elite) {
            const af = e.affix >= 0 ? AFFIX_TEXT[AFFIXES[e.affix]!] : null;
            c.beginPath();
            c.arc(e.x, e.y, (d.w / 2) * scale * 0.8, 0, Math.PI * 2);
            c.fillStyle = af ? `${af.color}33` : "rgba(255,200,60,0.18)";
            c.fill();
            c.strokeStyle = af ? af.color : "rgba(255,200,60,0.7)";
            c.lineWidth = 2;
            c.stroke();
          }
          const still = e.frozenT > 0 || e.type === "pot";
          const sp = enemySprite(e.type, still ? 0 : frame, e.flash > 0 ? 1 : e.frozenT > 0 ? 2 : 0, e.face < 0);
          // a little bounce and squash with every step
          const ph = this.clock * (boss ? 5 : 9) + e.id * 1.7;
          const sq = still ? 0 : Math.sin(ph) * 0.045;
          const hop = still ? 0 : Math.abs(Math.sin(ph)) * (boss ? 2 : 2.5);
          const w = (sp.width / 2) * scale * (1 + sq);
          const h = (sp.height / 2) * scale * (1 - sq);
          if (!T) c.drawImage(sp, e.x - w / 2, e.y - h / 2 - hop + ((sp.height / 2) * scale - h) / 2, w, h);
          if (e.rage && !T) {
            c.save();
            c.globalCompositeOperation = "lighter";
            c.globalAlpha = 0.25 + Math.sin(this.clock * 10) * 0.1;
            c.drawImage(sp, e.x - w / 2, e.y - h / 2 - hop + ((sp.height / 2) * scale - h) / 2, w, h);
            c.restore();
          }
          if (e.shield) {
            c.beginPath();
            c.arc(e.x, e.y, Math.max(w, h) * 0.55, 0, Math.PI * 2);
            c.fillStyle = "rgba(120,200,255,0.18)";
            c.fill();
            c.strokeStyle = `rgba(160,220,255,${0.6 + Math.sin(this.clock * 8) * 0.25})`;
            c.lineWidth = 3;
            c.stroke();
          }
          if (e.elite && e.affix >= 0) {
            const af = AFFIX_TEXT[AFFIXES[e.affix]!];
            c.font = "bold 11px system-ui, sans-serif";
            c.textAlign = "center";
            c.fillStyle = "rgba(0,0,0,0.65)";
            c.fillText(`★ ${af.name}`, e.x + 1, e.y - h / 2 - 3);
            c.fillStyle = af.color;
            c.fillText(`★ ${af.name}`, e.x, e.y - h / 2 - 4);
          }
        },
      });
    }
    for (const p of v.players) {
      if ((p as { gone?: boolean }).gone) continue;
      // dash after-images
      let tr = this.trails.get(p.uid);
      if (!tr) this.trails.set(p.uid, (tr = []));
      if (p.dashT > 0) tr.push({ x: p.x, y: p.y, t: 0.25 });
      for (const s of tr) s.t -= dt;
      while (tr.length && tr[0]!.t <= 0) tr.shift();
      const trail = tr;
      actors.push({
        y: p.y,
        draw: () => {
          if (!T) for (const s of trail) {
            c.globalAlpha = Math.max(0, s.t) * 1.6;
            const sp = heroSprite(p.hero, 3, 2, p.face < 0, p.skin, p.look);
            c.drawImage(sp, s.x - sp.width / 4, s.y - sp.height / 4 - 14, sp.width / 2, sp.height / 2);
          }
          c.globalAlpha = 1;
          if (!T) {
            c.fillStyle = "rgba(0,0,0,0.28)";
            c.beginPath();
            c.ellipse(p.x, p.y + 18, 11, 4, 0, 0, Math.PI * 2);
            c.fill();
          }
          if (p.uid === o.me) {
            c.beginPath();
            c.ellipse(p.x, p.y + 18, 15, 5.5, 0, 0, Math.PI * 2);
            c.strokeStyle = "rgba(255,230,120,0.55)";
            c.lineWidth = 1.5;
            c.stroke();
          }
          if (p.dead && T) {
            if (p.reviveP > 0) {
              c.beginPath();
              c.arc(p.x, p.y, 26, -Math.PI / 2, -Math.PI / 2 + p.reviveP * Math.PI * 2);
              c.strokeStyle = "#9cff9c";
              c.lineWidth = 4;
              c.stroke();
            }
          } else if (p.dead) {
            // a little grave mound with a candle while waiting for a teammate
            c.fillStyle = "#5a4636";
            c.beginPath();
            c.ellipse(p.x, p.y + 10, 16, 8, 0, Math.PI, 0);
            c.fill();
            c.fillStyle = "#8a8378";
            c.fillRect(p.x - 3, p.y - 12, 6, 20);
            c.fillRect(p.x - 8, p.y - 7, 16, 5);
            c.fillStyle = "#ffcf4a";
            c.beginPath();
            c.arc(p.x + 12, p.y + 2 + Math.sin(this.clock * 8) * 0.5, 2.2, 0, Math.PI * 2);
            c.fill();
            if (p.reviveP > 0) {
              c.beginPath();
              c.arc(p.x, p.y, 26, -Math.PI / 2, -Math.PI / 2 + p.reviveP * Math.PI * 2);
              c.strokeStyle = "#9cff9c";
              c.lineWidth = 4;
              c.stroke();
            }
          } else {
            const f = p.moving ? Math.floor(this.clock * 13) % 8 : 8 + (Math.floor(this.clock * 1.4) % 2);
            const blink = p.invulnT > 0 && p.dashT <= 0 && Math.floor(this.clock * 20) % 2 === 0;
            const sp = heroSprite(p.hero, f, p.hurtT > 0 ? 1 : 0, p.face < 0, p.skin, p.look);
            if (p.skin === "fire" && Math.random() < 0.5) this.particles.push({ x: p.x + (Math.random() - 0.5) * 22, y: p.y + 10 - Math.random() * 30, vx: (Math.random() - 0.5) * 20, vy: -60 - Math.random() * 60, life: 0.5, max: 0.5, col: Math.random() < 0.5 ? "#ffb21a" : "#ff5a2a", size: 2.5 });
            if (p.skin === "ghost" && !T) c.globalAlpha = 0.72;
            if (p.skin === "gold" && Math.random() < 0.15) this.particles.push({ x: p.x + (Math.random() - 0.5) * 26, y: p.y - Math.random() * 36, vx: 0, vy: -20, life: 0.6, max: 0.6, col: "#fff6b0", size: 2 });
            const spin = p.skillT > 0 && p.hero === "tseko";
            if (spin) {
              // Брейк на главата: upside down, spinning, with swirl lines
              if (!T) {
                c.save();
                c.translate(p.x, p.y - 6);
                c.rotate(Math.PI);
                c.scale(Math.cos(this.clock * 22), 1);
                c.drawImage(sp, -sp.width / 4, -sp.height / 4 + 4, sp.width / 2, sp.height / 2);
                c.restore();
              }
              for (let i = 0; i < 3; i++) {
                c.beginPath();
                c.ellipse(p.x, p.y + 14 - i * 12, 26 - i * 4, 7 - i, 0, this.clock * 14 + i, this.clock * 14 + i + 3.6);
                c.strokeStyle = `rgba(255,200,120,${0.7 - i * 0.18})`;
                c.lineWidth = 2;
                c.stroke();
              }
            } else if (!T && (!blink || p.hurtT > 0)) c.drawImage(sp, p.x - sp.width / 4, p.y - sp.height / 4 - 14, sp.width / 2, sp.height / 2);
            c.globalAlpha = 1;
            if (p.veil) {
              // 🧶 Мокош's veil: a golden thread around you
              c.beginPath();
              for (let i = 0; i <= 40; i++) {
                const a = (i / 40) * Math.PI * 2;
                const rr = 27 + Math.sin(a * 5 + this.clock * 4) * 2;
                if (i === 0) c.moveTo(p.x + Math.cos(a) * rr, p.y - 6 + Math.sin(a) * rr * 0.85);
                else c.lineTo(p.x + Math.cos(a) * rr, p.y - 6 + Math.sin(a) * rr * 0.85);
              }
              c.strokeStyle = `rgba(242,200,106,${0.6 + Math.sin(this.clock * 5) * 0.2})`;
              c.lineWidth = 2;
              c.stroke();
            }
            if ((p as { shield?: boolean }).shield || p.skillT > 0) {
              c.beginPath();
              c.arc(p.x, p.y - 2, p.skillT > 0 && p.hero === "tseko" ? 130 : p.skillT > 0 && p.hero === "strahil" ? 175 : 30, 0, Math.PI * 2);
              c.strokeStyle = p.skillT > 0 ? "rgba(255,120,60,0.5)" : "rgba(170,230,255,0.7)";
              c.lineWidth = 2.5;
              c.stroke();
            }
          }
          // name + health bar
          c.font = "bold 11px system-ui, sans-serif";
          c.textAlign = "center";
          if (v.players.length > 1) {
            c.fillStyle = "rgba(0,0,0,0.6)";
            const ny = T ? p.y - 52 : p.y - 44;
            c.fillText(p.name, p.x + 1, ny + 1);
            c.fillStyle = p.uid === o.me ? "#ffe27a" : "#ffffff";
            c.fillText(p.name, p.x, ny);
          }
          if (!p.dead) {
            c.fillStyle = "rgba(0,0,0,0.6)";
            c.fillRect(p.x - 16, p.y + 24, 32, 5);
            c.fillStyle = p.hp / p.maxHp > 0.35 ? "#e8323c" : "#ff8a1a";
            c.fillRect(p.x - 15, p.y + 25, 30 * Math.max(0, p.hp / p.maxHp), 3);
          }
        },
      });
    }
    actors.sort((a, b) => a.y - b.y);
    for (const a of actors) a.draw();

    // the enemies' shots: on top of everything, a dark halo + a pulsing red edge
    for (const q of v.projs) {
      if (!FOE.has(q.kind) || q.kind === PK.poison) continue;
      if (!onScreen(q.x, q.y, q.r + 30)) continue;
      const pulse = 0.5 + 0.5 * Math.sin(this.clock * 12 + q.id);
      if (q.kind === PK.tornado) {
        c.beginPath();
        c.ellipse(q.x, q.y + 4, q.r * 1.2, q.r * 0.5, 0, 0, Math.PI * 2);
        c.fillStyle = "rgba(20,0,10,0.35)";
        c.fill();
        c.strokeStyle = `rgba(255,70,90,${0.6 + 0.3 * pulse})`;
        c.lineWidth = 2;
        c.stroke();
        for (let i = 0; i < 5; i++) {
          const rr = q.r * (1 - i * 0.16);
          c.beginPath();
          c.ellipse(q.x + Math.sin(this.clock * 6 + i) * 4, q.y - i * 9, rr, rr * 0.35, 0, q.a + i, q.a + i + 4.5);
          c.strokeStyle = `rgba(220,225,245,${0.85 - i * 0.1})`;
          c.lineWidth = 3;
          c.stroke();
        }
        continue;
      }
      const R = q.r * 1.45 + 5;
      c.beginPath();
      c.arc(q.x, q.y, R, 0, Math.PI * 2);
      c.fillStyle = "rgba(25,0,12,0.6)";
      c.fill();
      c.lineWidth = 2.5;
      c.strokeStyle = `rgba(255,${(40 + pulse * 70) | 0},90,${0.75 + 0.25 * pulse})`;
      c.stroke();
      const sp = projSprite(q.kind, 0);
      if (sp) {
        const base = PROJ_BASE[q.kind];
        const scale = (base ? Math.max(0.6, q.r / base) : 1) * 1.15;
        const w = (sp.width / 2) * scale;
        const h = (sp.height / 2) * scale;
        c.save();
        c.translate(q.x, q.y);
        if (!UPRIGHT.has(q.kind)) c.rotate(q.a);
        c.drawImage(sp, -w / 2, -h / 2, w, h);
        c.restore();
      }
      c.beginPath();
      c.arc(q.x, q.y, Math.max(2, q.r * 0.3), 0, Math.PI * 2);
      c.fillStyle = "rgba(255,240,240,0.9)";
      c.fill();
    }


    // particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]!;
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - dt * 3;
      p.vy = p.vy * (1 - dt * 3) + 200 * dt;
      c.globalAlpha = p.life / p.max;
      c.fillStyle = p.col;
      c.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    c.globalAlpha = 1;

    // blasts
    for (let i = this.booms.length - 1; i >= 0; i--) {
      const b = this.booms[i]!;
      b.life -= dt;
      if (b.life <= 0) {
        this.booms.splice(i, 1);
        continue;
      }
      const k = 1 - b.life / b.max;
      c.beginPath();
      c.arc(b.x, b.y, b.r * (0.3 + 0.7 * k), 0, Math.PI * 2);
      c.fillStyle = `rgba(${BOOM_FILL[b.kind] ?? "255,210,80"},${0.45 * (1 - k)})`;
      c.fill();
      c.strokeStyle = `rgba(255,255,255,${0.7 * (1 - k)})`;
      c.lineWidth = 2;
      c.stroke();
    }

    // skill rings
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i]!;
      r.life -= dt;
      if (r.life <= 0) {
        this.rings.splice(i, 1);
        continue;
      }
      const k = 1 - r.life / r.max;
      const e = 1 - (1 - k) * (1 - k);
      c.beginPath();
      c.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * e, 0, Math.PI * 2);
      c.strokeStyle = `rgba(${r.col},${0.85 * (1 - k)})`;
      c.lineWidth = r.w * (1 - k * 0.5);
      c.stroke();
      c.fillStyle = `rgba(${r.col},${0.12 * (1 - k)})`;
      c.fill();
    }

    // lightning
    c.globalCompositeOperation = "lighter";
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i]!;
      b.life -= dt;
      if (b.life <= 0) {
        this.bolts.splice(i, 1);
        continue;
      }
      for (const [col, lw] of [
        ["rgba(120,190,255,0.5)", 7],
        ["rgba(230,245,255,0.95)", 2.2],
      ] as [string, number][]) {
        c.beginPath();
        c.moveTo(b.pts[0]!, b.pts[1]!);
        for (let j = 2; j + 1 < b.pts.length; j += 2) {
          const px = b.pts[j - 2]!;
          const py = b.pts[j - 1]!;
          const nx = b.pts[j]!;
          const ny = b.pts[j + 1]!;
          for (let s = 1; s <= 4; s++) {
            const t = s / 4;
            const jit = s < 4 ? 9 : 0;
            c.lineTo(px + (nx - px) * t + (Math.random() - 0.5) * jit, py + (ny - py) * t + (Math.random() - 0.5) * jit);
          }
        }
        c.strokeStyle = col;
        c.lineWidth = lw;
        c.stroke();
      }
    }
    c.globalCompositeOperation = "source-over";

    // floating numbers / texts
    c.textAlign = "center";
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i]!;
      t.life -= dt;
      if (t.life <= 0) {
        this.texts.splice(i, 1);
        continue;
      }
      t.y -= dt * (t.big ? 30 : 40);
      c.globalAlpha = Math.min(1, t.life * 3);
      c.font = t.big ? "bold 15px system-ui, sans-serif" : "bold 11px system-ui, sans-serif";
      c.fillStyle = "rgba(0,0,0,0.7)";
      c.fillText(t.text, t.x + 1, t.y + 1);
      c.fillStyle = t.col;
      c.fillText(t.text, t.x, t.y);
    }
    c.globalAlpha = 1;
    c.restore();

    // a skill's flash over the whole screen
    if (this.flash) {
      this.flash.t -= dt;
      if (this.flash.t <= 0) this.flash = null;
      else {
        c.fillStyle = `rgba(${this.flash.col},${0.38 * (this.flash.t / this.flash.max)})`;
        c.fillRect(0, 0, this.w, this.h);
      }
    }

    // the night: only a circle around you
    if (o.night) {
      const me = v.players.find((p) => p.uid === o.me);
      const sx = me ? (me.x - x0) * z : this.w / 2;
      const sy = me ? (me.y - y0) * z : this.h / 2;
      const g = c.createRadialGradient(sx, sy, 120 * z, sx, sy, 330 * z);
      g.addColorStop(0, "rgba(5,8,20,0)");
      g.addColorStop(1, "rgba(5,8,20,0.93)");
      c.fillStyle = g;
      c.fillRect(0, 0, this.w, this.h);
    }

    // arrows to things off screen: chests, the shrine, the boss, teammates
    const arrow = (x: number, y: number, col: string, label: string) => {
      if (onScreen(x, y, -30)) return;
      const sx = (x - x0) * z;
      const sy = (y - y0) * z;
      const cx = this.w / 2;
      const cy = this.h / 2;
      const a = Math.atan2(sy - cy, sx - cx);
      const m = 28;
      const t = Math.min(Math.abs((cx - m) / (Math.cos(a) || 1e-6)), Math.abs((cy - m) / (Math.sin(a) || 1e-6)));
      const ax = cx + Math.cos(a) * t;
      const ay = cy + Math.sin(a) * t;
      c.save();
      c.translate(ax, ay);
      c.rotate(a);
      c.beginPath();
      c.moveTo(12, 0);
      c.lineTo(-6, -8);
      c.lineTo(-6, 8);
      c.closePath();
      c.fillStyle = col;
      c.fill();
      c.strokeStyle = "rgba(0,0,0,0.6)";
      c.lineWidth = 1.5;
      c.stroke();
      c.restore();
      c.font = "14px system-ui, sans-serif";
      c.textAlign = "center";
      c.fillText(label, ax - Math.cos(a) * 18, ay - Math.sin(a) * 18 + 5);
    };
    for (const g of v.gems) if (g.k === GK.chest) arrow(g.x, g.y, "#ffd34d", "📦");
    for (const g of v.gems) if (g.k === GK.relic) arrow(g.x, g.y, "#c890ff", "💎");
    for (const g of v.gems) if (g.k >= GK.item && g.k <= GK.item + 3) arrow(g.x, g.y, RARITY[g.k - GK.item]!.color, "🎒");
    // 🏷️ loot labels over items on the ground (a dark box, the rarity's colour)
    c.save();
    c.font = "bold 11px Georgia, 'Times New Roman', serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    for (const g of v.gems) {
      if (g.k < GK.item || g.k > GK.item + 3) continue;
      const r = g.k - GK.item;
      const sx = (g.x - x0) * z;
      const sy = (g.y - 20 - y0) * z;
      if (sx < -80 || sy < -20 || sx > this.w + 80 || sy > this.h + 20) continue;
      const txt = `${RARITY[r]!.name} предмет`;
      const w = c.measureText(txt).width + 12;
      c.fillStyle = r === 3 ? "rgba(30,14,4,0.88)" : "rgba(0,0,0,0.78)";
      c.fillRect(sx - w / 2, sy - 8, w, 16);
      c.strokeStyle = RARITY[r]!.color;
      c.lineWidth = r === 3 ? 2 : 1;
      c.strokeRect(sx - w / 2 + 0.5, sy - 7.5, w - 1, 15);
      c.fillStyle = RARITY[r]!.color;
      c.fillText(txt, sx, sy + 0.5);
    }
    c.restore();
    for (const m of v.marks) if (m.kind === MK.shrine) arrow(m.x, m.y, "#ffe27a", "🕯️");
    for (const m of v.marks) if (m.kind === MK.portal) arrow(m.x, m.y, "#c890ff", "🌀");
    for (const e of v.enemies) if (e.type === "altar") arrow(e.x, e.y, "#ffb02a", "🗿");
    for (const e of v.enemies) if (ENEMIES[e.type].boss) arrow(e.x, e.y, "#ff4a3a", "💀");
    for (const p of v.players) if (p.uid !== o.me && !(p as { gone?: boolean }).gone) arrow(p.x, p.y, p.dead ? "#9cff9c" : "#8ac8ff", p.dead ? "🪦" : "🙂");
  }
}
