import { AFFIXES, AFFIX_TEXT, ENEMIES, ENEMY_IDS, type EnemyId } from "./content";
import { FX, GK, MK, PK, type Fx, type RView } from "./engine";
import { decorSprite, enemySize, enemySprite, groundTile, heroSprite, pickupSprite, projSprite, shrineSprite } from "./sprites";

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
  [PK.axe]: 14,
  [PK.bigAxe]: 14,
  [PK.note]: 8,
  [PK.bee]: 6,
};
/** drawn upright (not turned with the flight direction) */
const UPRIGHT = new Set<number>([PK.cauldron, PK.scarecrow, PK.jack, PK.note]);
/** turned left/right only */
const SIDEWAYS = new Set<number>([PK.pig, PK.boar, PK.sheep]);

export interface DrawOpts {
  me: string | null;
  night: boolean;
  numbers: boolean;
  /** where the camera looks */
  camX: number;
  camY: number;
}

/** World units visible at least (the zoom fits this into the canvas). */
const VIEW_W = 920;
const VIEW_H = 540;

export class Renderer {
  private c: CanvasRenderingContext2D;
  private w = 1;
  private h = 1;
  private dpr = 1;
  zoom = 1;
  private particles: Particle[] = [];
  private texts: FloatText[] = [];
  private bolts: Bolt[] = [];
  private booms: Boom[] = [];
  private shake = 0;
  private trails = new Map<string, { x: number; y: number; t: number }[]>();
  private pattern: CanvasPattern | null = null;
  private clock = 0;

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

  draw(v: RView, o: DrawOpts, dt: number) {
    const c = this.c;
    this.clock += dt;
    const z = this.zoom;
    let camX = o.camX;
    let camY = o.camY;
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt);
      camX += (Math.random() - 0.5) * 18 * this.shake;
      camY += (Math.random() - 0.5) * 18 * this.shake;
    }
    const halfW = this.w / 2 / z;
    const halfH = this.h / 2 / z;
    const x0 = camX - halfW;
    const y0 = camY - halfH;
    const x1 = camX + halfW;
    const y1 = camY + halfH;
    const onScreen = (x: number, y: number, m: number) => x > x0 - m && x < x1 + m && y > y0 - m && y < y1 + m;

    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // ground
    if (!this.pattern) this.pattern = c.createPattern(groundTile(), "repeat");
    c.save();
    c.scale(z, z);
    c.translate(-x0, -y0);
    if (this.pattern) {
      c.fillStyle = this.pattern;
      c.fillRect(x0, y0, x1 - x0, y1 - y0);
    }

    // scenery from a hash of the 220-px cell
    const DC = 220;
    for (let gx = Math.floor((x0 - 60) / DC); gx <= Math.floor((x1 + 60) / DC); gx++) {
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

    // marks under everything
    for (const m of v.marks) {
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
        const sp = shrineSprite();
        c.drawImage(sp, m.x - sp.width / 4, m.y - sp.height / 2 + 6, sp.width / 2, sp.height / 2);
      } else if (m.kind === MK.hail) {
        c.beginPath();
        c.arc(m.x, m.y, m.r * (0.4 + 0.6 * m.p), 0, Math.PI * 2);
        c.fillStyle = `rgba(30,40,70,${0.18 + 0.3 * m.p})`;
        c.fill();
        c.beginPath();
        c.arc(m.x, m.y, m.r, 0, Math.PI * 2);
        c.strokeStyle = "rgba(200,230,255,0.6)";
        c.lineWidth = 1.5;
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
    }

    // gems & pickups
    for (const g of v.gems) {
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

    // auras + fire on the ground
    for (const p of v.players) {
      if (p.dead || !p.auraR) continue;
      const g = c.createRadialGradient(p.x, p.y, p.auraR * 0.3, p.x, p.y, p.auraR);
      g.addColorStop(0, "rgba(255,255,235,0)");
      g.addColorStop(1, p.auraEvo ? "rgba(190,255,170,0.28)" : "rgba(250,245,220,0.22)");
      c.fillStyle = g;
      c.beginPath();
      c.arc(p.x, p.y, p.auraR, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = p.auraEvo ? "rgba(180,255,150,0.35)" : "rgba(255,250,230,0.25)";
      c.lineWidth = 1.5;
      c.stroke();
    }
    for (const q of v.projs) {
      if (!onScreen(q.x, q.y, q.r + 20)) continue;
      if (q.kind === PK.poison) {
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
      } else if (q.kind === PK.scarecrow) {
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

    // sorted actors: enemies + players
    type Actor = { y: number; draw: () => void };
    const actors: Actor[] = [];
    const frame = Math.floor(this.clock * 6) % 2;
    for (const e of v.enemies) {
      if (!onScreen(e.x, e.y, 80)) continue;
      const d = enemySize(e.type);
      const boss = !!ENEMIES[e.type].boss;
      const scale = e.elite ? 1.6 : 1;
      actors.push({
        y: e.y,
        draw: () => {
          c.fillStyle = "rgba(0,0,0,0.25)";
          c.beginPath();
          c.ellipse(e.x, e.y + (d.h / 2 - 4) * scale * (boss ? 0.8 : 0.85), (d.w / 3) * scale, 4 * scale * (boss ? 2 : 1), 0, 0, Math.PI * 2);
          c.fill();
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
          const sp = enemySprite(e.type, e.frozenT > 0 ? 0 : frame, e.flash > 0 ? 1 : e.frozenT > 0 ? 2 : 0, e.face < 0);
          const w = (sp.width / 2) * scale;
          const h = (sp.height / 2) * scale;
          c.drawImage(sp, e.x - w / 2, e.y - h / 2, w, h);
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
          for (const s of trail) {
            c.globalAlpha = Math.max(0, s.t) * 1.6;
            const sp = heroSprite(p.hero, 0, 2, p.face < 0);
            c.drawImage(sp, s.x - sp.width / 4, s.y - sp.height / 4 - 14, sp.width / 2, sp.height / 2);
          }
          c.globalAlpha = 1;
          c.fillStyle = "rgba(0,0,0,0.28)";
          c.beginPath();
          c.ellipse(p.x, p.y + 18, 11, 4, 0, 0, Math.PI * 2);
          c.fill();
          if (p.uid === o.me) {
            c.beginPath();
            c.ellipse(p.x, p.y + 18, 15, 5.5, 0, 0, Math.PI * 2);
            c.strokeStyle = "rgba(255,230,120,0.55)";
            c.lineWidth = 1.5;
            c.stroke();
          }
          if (p.dead) {
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
            const f = p.moving ? 1 + (Math.floor(this.clock * 8) % 2) : 0;
            const blink = p.invulnT > 0 && p.dashT <= 0 && Math.floor(this.clock * 20) % 2 === 0;
            const sp = heroSprite(p.hero, f, p.hurtT > 0 ? 1 : 0, p.face < 0);
            if (!blink || p.hurtT > 0) c.drawImage(sp, p.x - sp.width / 4, p.y - sp.height / 4 - 14, sp.width / 2, sp.height / 2);
            if ((p as { shield?: boolean }).shield || p.skillT > 0) {
              c.beginPath();
              c.arc(p.x, p.y - 2, p.skillT > 0 && p.hero === "tseko" ? 115 : 30, 0, Math.PI * 2);
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
            c.fillText(p.name, p.x + 1, p.y - 43);
            c.fillStyle = p.uid === o.me ? "#ffe27a" : "#ffffff";
            c.fillText(p.name, p.x, p.y - 44);
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

    // projectiles
    for (const q of v.projs) {
      if (q.kind === PK.fire || q.kind === PK.bigFire || q.kind === PK.poison) continue;
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
        for (let i = 0; i < 3; i++) {
          c.beginPath();
          c.arc(q.x, q.y, Math.max(1, q.r - i * 9), 0, Math.PI * 2);
          c.strokeStyle = q.kind === PK.bigRing ? `rgba(190,140,255,${0.7 - i * 0.2})` : `rgba(255,236,160,${0.65 - i * 0.2})`;
          c.lineWidth = 3 - i;
          c.stroke();
        }
        continue;
      }
      const sp = projSprite(q.kind, SIDEWAYS.has(q.kind) ? frame : 0);
      if (!sp) continue;
      const base = PROJ_BASE[q.kind];
      const scale = base ? Math.max(0.6, q.r / base) : 1;
      const w = (sp.width / 2) * scale;
      const h = (sp.height / 2) * scale;
      c.save();
      c.translate(q.x, q.y);
      if (SIDEWAYS.has(q.kind)) {
        if (Math.cos(q.a) < 0) c.scale(-1, 1);
      } else if (!UPRIGHT.has(q.kind)) c.rotate(q.a);
      if (q.kind === PK.eball || q.kind === PK.ebolt) c.globalCompositeOperation = "lighter";
      c.drawImage(sp, -w / 2, -h / 2, w, h);
      c.restore();
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
    for (const m of v.marks) if (m.kind === MK.shrine) arrow(m.x, m.y, "#ffe27a", "🕯️");
    for (const e of v.enemies) if (ENEMIES[e.type].boss) arrow(e.x, e.y, "#ff4a3a", "💀");
    for (const p of v.players) if (p.uid !== o.me && !(p as { gone?: boolean }).gone) arrow(p.x, p.y, p.dead ? "#9cff9c" : "#8ac8ff", p.dead ? "🪦" : "🙂");
  }
}
