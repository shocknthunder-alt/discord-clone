// 🖱️ Cursor skins: hand-drawn SVGs (32×32 units, scaled to the chosen size) for the arrow and the
// "you can click this" pointer. Colourable parts follow the colour picked in Settings → Външен вид.

export interface CursorSkin {
  id: string;
  name: [bg: string, en: string];
  defaultColor: string;
  /** Inner SVG of the arrow (32×32 units). */
  arrow: (c: string) => string;
  hotspot: [number, number];
  /** Inner SVG of the pointer; absent = the arrow model with a "click" ring at its tip. */
  pointer?: (c: string) => string;
  pointerHotspot?: [number, number];
}

/* ───────── colour helpers ───────── */

function rgb(hex: string): [number, number, number] {
  const h = /^#?([0-9a-f]{6})$/i.exec(hex)?.[1] ?? "8a8aff";
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function hex([r, g, b]: number[]): string {
  return "#" + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v!))).toString(16).padStart(2, "0")).join("");
}
/** Towards white (amount > 0) or black (amount < 0), -1..1. */
export function shade(c: string, amount: number): string {
  const [r, g, b] = rgb(c);
  const t = amount > 0 ? 255 : 0;
  const a = Math.abs(amount);
  return hex([r + (t - r) * a, g + (t - g) * a, b + (t - b) * a]);
}

const SHADOW = `<filter id="sh" x="-30%" y="-30%" width="170%" height="170%"><feDropShadow dx="0.7" dy="1.1" stdDeviation="0.75" flood-color="#000" flood-opacity="0.55"/></filter>`;
const GLOW = `<filter id="gl" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.1" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;

// The classic arrow outline (tip at 3,2).
const ARROW = "M3 2 L3 24.5 L8.6 19.4 L12.6 28.4 L16.3 26.8 L12.4 18.1 L19.8 18.1 Z";

/* ───────── the glove hand (pointer), tip of the index finger at 11.5,1.5 ───────── */

const HAND_PARTS = [
  `<rect x="9" y="1.5" width="5" height="16" rx="2.5"/>`,
  `<rect x="13.4" y="10" width="4.6" height="10" rx="2.3"/>`,
  `<rect x="17.5" y="11.2" width="4.4" height="9" rx="2.2"/>`,
  `<rect x="21.3" y="12.8" width="4" height="8" rx="2"/>`,
  `<path d="M9.6 16.2 L5.2 13.1 C3.7 12.1 1.9 13.7 2.8 15.3 L7.6 22.4 Z"/>`,
  `<path d="M8 15.2 L25.3 16.2 L25.3 22 C25.3 27 22 29.2 17.6 29.2 L13.2 29.2 C10.2 29.2 8 27 8 24 Z"/>`,
].join("");

function glove(fill: string, fillDark: string, line: string, cuff: string, outline = "#1b1c22"): string {
  return `<defs><linearGradient id="gf" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${fill}"/><stop offset="1" stop-color="${fillDark}"/></linearGradient>
<linearGradient id="gc" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(cuff, 0.35)}"/><stop offset="1" stop-color="${shade(cuff, -0.3)}"/></linearGradient></defs>
<g filter="url(#sh)"><g fill="${outline}" stroke="${outline}" stroke-width="2.4" stroke-linejoin="round">${HAND_PARTS}<rect x="9.4" y="26.6" width="15.4" height="4.4" rx="1.2"/></g>
<g fill="url(#gf)">${HAND_PARTS}</g>
<rect x="9.4" y="26.6" width="15.4" height="4.4" rx="1.2" fill="url(#gc)"/>
<path d="M10.4 28.8 H23.8" stroke="${shade(cuff, 0.55)}" stroke-width="0.5" stroke-dasharray="1 0.8"/></g>
<g stroke="${line}" stroke-width="0.6" stroke-linecap="round" fill="none">
<path d="M13.6 12.5 V18.5 M17.7 13 V19.5 M21.5 14.2 V20"/>
<path d="M10.2 6.5 H12.8 M10.2 10.5 H12.8" opacity="0.7"/>
<path d="M13.4 22.4 V25.6 M17 22.6 V25.8 M20.6 22.4 V25.6" opacity="0.6"/>
<path d="M7.8 17.4 L5.2 15.4" opacity="0.7"/></g>
<path d="M10.2 3.4 V14" stroke="#fff" stroke-width="0.8" stroke-linecap="round" opacity="0.65"/>`;
}

/* ───────── armoured gauntlet (pointer of the dark-fantasy skins), same hand shape ───────── */

function gauntlet(c: string, light: string, dark: string, trimLight = "#ffe9a0", trimDark = "#8a5a06"): string {
  const mid = `${dark}`;
  return `<defs><linearGradient id="gm" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${light}"/><stop offset="0.5" stop-color="${shade(light, -0.45)}"/><stop offset="1" stop-color="${mid}"/></linearGradient>
<linearGradient id="gt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${trimLight}"/><stop offset="0.5" stop-color="${shade(trimLight, -0.3)}"/><stop offset="1" stop-color="${trimDark}"/></linearGradient></defs>
<g filter="url(#sh)"><g fill="#0b0b0e" stroke="#0b0b0e" stroke-width="2.4" stroke-linejoin="round">${HAND_PARTS}<rect x="8.6" y="26.2" width="17" height="5" rx="1"/></g>
<g fill="url(#gm)">${HAND_PARTS}</g>
<rect x="8.6" y="26.2" width="17" height="5" rx="1" fill="url(#gt)" stroke="#2a1a00" stroke-width="0.5"/></g>
<g stroke="#0b0b0e" stroke-width="0.7" stroke-linecap="round" fill="none" opacity="0.85">
<path d="M9.3 6.2 H13.7 M9.3 10.6 H13.7 M9.3 14.4 H13.7"/>
<path d="M13.6 14.4 H17.8 M17.7 15.4 H21.7 M21.5 16.6 H25.1"/>
<path d="M13.6 12.5 V18.5 M17.7 13 V19.5 M21.5 14.2 V20"/>
<path d="M8.4 20.6 C12 19.6 20 19.6 25.2 20.6"/></g>
<g fill="${shade(light, 0.3)}" stroke="#0b0b0e" stroke-width="0.3"><circle cx="11.6" cy="23" r="0.65"/><circle cx="15.6" cy="23.4" r="0.65"/><circle cx="19.6" cy="23.4" r="0.65"/><circle cx="23.3" cy="23" r="0.65"/></g>
<path d="M10.3 3.2 V13.8" stroke="#fff" stroke-width="0.7" stroke-linecap="round" opacity="0.55"/>
<path d="M11.6 1.9 L12.4 0.2 L13 2.2 Z M15.4 10.3 L16 8.6 L16.8 10.6 Z M19.4 11.5 L20 9.8 L20.8 11.8 Z" fill="${shade(light, -0.2)}" stroke="#0b0b0e" stroke-width="0.35"/>
<path d="M17.1 27.2 l1.4 1.5 l-1.4 1.5 l-1.4 -1.5 z" fill="${c}" stroke="#2a1a00" stroke-width="0.4" filter="url(#gl)"/>
<path d="M10 28.7 H14.6 M19.6 28.7 H24.2" stroke="#2a1a00" stroke-width="0.45" stroke-dasharray="0.9 0.7"/>`;
}

/** A leaf/feather shape from (ax,ay) to (bx,by), `w` wide. */
function leaf(ax: number, ay: number, bx: number, by: number, w: number): string {
  const mx = (ax + bx) / 2;
  const my = (ay + by) / 2;
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  const px = (-dy / len) * w;
  const py = (dx / len) * w;
  const f = (n: number) => n.toFixed(2);
  return `M${f(ax)} ${f(ay)} Q${f(mx + px)} ${f(my + py)} ${f(bx)} ${f(by)} Q${f(mx - px)} ${f(my - py)} ${f(ax)} ${f(ay)} Z`;
}

/* ───────── pixel art ───────── */

function pixels(map: string[], colors: Record<string, string>, cell = 1.8, ox = 1, oy = 1): string {
  let out = `<g shape-rendering="crispEdges">`;
  map.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      const col = colors[ch];
      if (col) out += `<rect x="${(ox + x * cell).toFixed(2)}" y="${(oy + y * cell).toFixed(2)}" width="${cell + 0.06}" height="${cell + 0.06}" fill="${col}"/>`;
    });
  });
  return out + "</g>";
}

const PIXEL_ARROW = [
  "X.........",
  "XX........",
  "XLX.......",
  "XLOX......",
  "XLOOX.....",
  "XLOOOX....",
  "XLOOOOX...",
  "XLOOOOOX..",
  "XLOOOOODX.",
  "XLOOODXXXX",
  "XLODDDX...",
  "XLDXXDDX..",
  "XDX.XDDX..",
  "XX...XDDX.",
  ".....XDDX.",
  "......XX..",
];
const PIXEL_HAND = [
  "....XX......",
  "...XLOX.....",
  "...XLOX.....",
  "...XLOX.....",
  "...XLOXXX...",
  "...XLOXLOXX.",
  ".XXXLOXLOXOX",
  "XLOXLOOOOOOX",
  "XLOOOOOOOODX",
  ".XOOOOOOOODX",
  "..XOOOOOOODX",
  "..XDOOOOODX.",
  "...XDDDDDDX.",
  "...XXXXXXXX.",
];

/* ───────── "you can click this" for the themed models: a glowing halo + two sparks at the tip ───────── */

function clickable(model: string, c: string, x: number, y: number): string {
  return `<defs><filter id="halo" x="-30%" y="-30%" width="160%" height="160%"><feMorphology in="SourceAlpha" operator="dilate" radius="1.2" result="d"/><feFlood flood-color="${c}"/><feComposite in2="d" operator="in" result="f"/><feGaussianBlur in="f" stdDeviation="0.8"/></filter></defs>
<g filter="url(#halo)">${model}</g>${model}
<g stroke="${shade(c, 0.4)}" stroke-width="1.1" stroke-linecap="round" filter="url(#gl)"><path d="M${x + 4} ${y - 1.6} L${x + 7.2} ${y - 2.6} M${x - 1.6} ${y + 4} L${x - 2.6} ${y + 7.2}"/></g>`;
}

/* ───────── the skins ───────── */

export const CURSOR_SKINS: CursorSkin[] = [
  {
    id: "classic",
    name: ["Класика", "Classic"],
    defaultColor: "#4c8dff",
    hotspot: [3, 2],
    arrow: (c) => `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${shade(c, 0.45)}"/><stop offset="0.55" stop-color="${c}"/><stop offset="1" stop-color="${shade(c, -0.35)}"/></linearGradient></defs>
<g filter="url(#sh)"><path d="${ARROW}" fill="url(#g)" stroke="${shade(c, -0.7)}" stroke-width="1.5" stroke-linejoin="round"/></g>
<path d="M4.5 5.6 V21" stroke="#fff" stroke-width="0.9" stroke-linecap="round" opacity="0.6"/>
<path d="M5.3 6.8 L14.6 16.6" stroke="#fff" stroke-width="0.5" stroke-linecap="round" opacity="0.35"/>`,
    pointer: (c) => glove("#ffffff", "#d9dbe6", "#8d90a3", c),
    pointerHotspot: [11.5, 1.5],
  },
  {
    id: "neon",
    name: ["Неон", "Neon"],
    defaultColor: "#ff2bd6",
    hotspot: [3, 2],
    arrow: (c) => `<path d="${ARROW}" fill="#0b0a14" fill-opacity="0.72" stroke="${c}" stroke-width="1.6" stroke-linejoin="round" filter="url(#gl)"/>
<path d="${ARROW}" fill="none" stroke="#fff" stroke-width="0.5" stroke-linejoin="round" opacity="0.85"/>
<path d="M5.6 9 L11 14.4" stroke="${shade(c, 0.5)}" stroke-width="0.6" stroke-linecap="round" opacity="0.7"/>`,
    pointer: (c) => `<g filter="url(#gl)"><g fill="#0b0a14" fill-opacity="0.75" stroke="${c}" stroke-width="1.4" stroke-linejoin="round">${HAND_PARTS}<rect x="9.4" y="26.6" width="15.4" height="4.4" rx="1.2"/></g></g>
<g fill="none" stroke="#fff" stroke-width="0.45" opacity="0.8">${HAND_PARTS}</g>
<path d="M13.6 12.5 V18.5 M17.7 13 V19.5 M21.5 14.2 V20" stroke="${c}" stroke-width="0.7" stroke-linecap="round"/>`,
    pointerHotspot: [11.5, 1.5],
  },
  {
    id: "pixel",
    name: ["8-бит", "8-bit"],
    defaultColor: "#ffd23f",
    hotspot: [1, 1],
    arrow: (c) => pixels(PIXEL_ARROW, { X: "#111", O: c, L: shade(c, 0.55), D: shade(c, -0.35) }),
    pointer: (c) => pixels(PIXEL_HAND, { X: "#111", O: c, L: shade(c, 0.55), D: shade(c, -0.35) }),
    pointerHotspot: [8.2, 1],
  },
  {
    id: "crystal",
    name: ["Кристал", "Crystal"],
    defaultColor: "#38d9c9",
    hotspot: [3, 2],
    arrow: (c) => `<g filter="url(#sh)"><path d="${ARROW}" fill="${c}" stroke="${shade(c, -0.65)}" stroke-width="1.3" stroke-linejoin="round"/></g>
<polygon points="3,2 3,24.5 8,14.6" fill="${shade(c, 0.6)}"/>
<polygon points="3,2 8,14.6 19.8,18.1" fill="${shade(c, 0.25)}"/>
<polygon points="3,24.5 8.6,19.4 8,14.6" fill="${shade(c, -0.25)}"/>
<polygon points="8,14.6 12.4,18.1 19.8,18.1" fill="${shade(c, -0.05)}"/>
<polygon points="8,14.6 8.6,19.4 12.4,18.1" fill="${shade(c, -0.45)}"/>
<polygon points="8.6,19.4 12.6,28.4 16.3,26.8 12.4,18.1" fill="${shade(c, -0.15)}"/>
<path d="M8.6 19.4 L12.4 18.1 M3 2 L8 14.6 L19.8 18.1 M8 14.6 L3 24.5 M8 14.6 L8.6 19.4 M8 14.6 L12.4 18.1" stroke="#fff" stroke-width="0.35" opacity="0.6" fill="none"/>
<path d="${ARROW}" fill="none" stroke="${shade(c, -0.65)}" stroke-width="1" stroke-linejoin="round"/>
<path d="M6.2 6.8 l0.6 1.6 l1.6 0.6 l-1.6 0.6 l-0.6 1.6 l-0.6 -1.6 l-1.6 -0.6 l1.6 -0.6 z" fill="#fff"/>`,
    pointer: (c) => glove(shade(c, 0.75), shade(c, 0.35), shade(c, -0.4), c, shade(c, -0.7)),
    pointerHotspot: [11.5, 1.5],
  },
  {
    id: "royal",
    name: ["Кралска", "Royal"],
    defaultColor: "#d1213d",
    hotspot: [3, 2],
    arrow: (c) => `<defs><linearGradient id="au" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff3b0"/><stop offset="0.35" stop-color="#f4c542"/><stop offset="0.7" stop-color="#c8901a"/><stop offset="1" stop-color="#8a5a06"/></linearGradient>
<radialGradient id="gem" cx="0.35" cy="0.35" r="0.7"><stop offset="0" stop-color="#fff"/><stop offset="0.3" stop-color="${shade(c, 0.3)}"/><stop offset="1" stop-color="${shade(c, -0.45)}"/></radialGradient></defs>
<g filter="url(#sh)"><path d="${ARROW}" fill="url(#au)" stroke="#4a2e00" stroke-width="1.4" stroke-linejoin="round"/></g>
<path d="M5 7 L5 19.6 L8.9 16.2 L15 16.2 Z" fill="none" stroke="#fff6c8" stroke-width="0.6" stroke-linejoin="round" opacity="0.8"/>
<path d="M10.2 20.2 L13.2 26.6" stroke="#7a4e05" stroke-width="0.6" stroke-linecap="round"/>
<circle cx="8.2" cy="14.2" r="2.3" fill="url(#gem)" stroke="#5a3a00" stroke-width="0.6"/>
<circle cx="7.5" cy="13.4" r="0.6" fill="#fff" opacity="0.9"/>`,
    pointer: (c) => glove("#ffe68a", "#c8901a", "#7a4e05", c, "#4a2e00"),
    pointerHotspot: [11.5, 1.5],
  },
  {
    id: "sword",
    name: ["Меч", "Sword"],
    defaultColor: "#3fa9ff",
    hotspot: [3, 3],
    arrow: (c) => `<defs><linearGradient id="au" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffe9a0"/><stop offset="0.5" stop-color="#e0a82e"/><stop offset="1" stop-color="#8a5a06"/></linearGradient>
<radialGradient id="gem" cx="0.35" cy="0.35" r="0.7"><stop offset="0" stop-color="#fff"/><stop offset="0.35" stop-color="${shade(c, 0.25)}"/><stop offset="1" stop-color="${shade(c, -0.5)}"/></radialGradient></defs>
<g transform="translate(3 3) rotate(-45)" filter="url(#sh)">
<path d="M0 0 L2.3 4.2 L2.3 22 L-2.3 22 L-2.3 4.2 Z" fill="#2a2f38" stroke="#22262e" stroke-width="1.2" stroke-linejoin="round"/>
<path d="M0 0 L-2.3 4.2 L-2.3 22 L0 22 Z" fill="#eef3f9"/>
<path d="M0 0 L2.3 4.2 L2.3 22 L0 22 Z" fill="#9fabbd"/>
<path d="M0 5.5 V20.5" stroke="#6b788b" stroke-width="0.7"/>
<path d="M-1.2 3.6 V20" stroke="#fff" stroke-width="0.4" opacity="0.8"/>
<rect x="-6.4" y="21.8" width="12.8" height="2.6" rx="1.2" fill="url(#au)" stroke="#4a2e00" stroke-width="0.7"/>
<circle cx="-6.4" cy="23.1" r="1.4" fill="url(#gem)" stroke="#4a2e00" stroke-width="0.5"/>
<circle cx="6.4" cy="23.1" r="1.4" fill="url(#gem)" stroke="#4a2e00" stroke-width="0.5"/>
<rect x="-1.5" y="24.4" width="3" height="7" fill="#5a3a22" stroke="#2e1c10" stroke-width="0.6"/>
<path d="M-1.5 25.6 L1.5 26.6 M-1.5 27.4 L1.5 28.4 M-1.5 29.2 L1.5 30.2" stroke="#2e1c10" stroke-width="0.5"/>
<circle cx="0" cy="33" r="2.3" fill="url(#gem)" stroke="#8a5a06" stroke-width="0.9"/>
</g>`,
  },
  {
    id: "wand",
    name: ["Магическа пръчка", "Magic wand"],
    defaultColor: "#b06bff",
    hotspot: [6.5, 6.5],
    arrow: (c) => `<defs><radialGradient id="st" cx="0.45" cy="0.45" r="0.6"><stop offset="0" stop-color="#fff"/><stop offset="0.45" stop-color="${shade(c, 0.35)}"/><stop offset="1" stop-color="${shade(c, -0.3)}"/></radialGradient></defs>
<g filter="url(#sh)">
<path d="M10 10 L27.5 27.5" stroke="#1d1424" stroke-width="4" stroke-linecap="round"/>
<path d="M10 10 L27.5 27.5" stroke="#4a3256" stroke-width="2.6" stroke-linecap="round"/>
<path d="M10.6 9.8 L26.6 25.8" stroke="#8a6a9a" stroke-width="0.6" stroke-linecap="round"/>
<path d="M13.2 14.6 L14.6 13.2 M22.6 24 L24 22.6" stroke="#f4c542" stroke-width="1.6"/>
<path d="M6.5 0.8 L8.2 4.6 L12.3 5 L9.2 7.7 L10.1 11.8 L6.5 9.7 L2.9 11.8 L3.8 7.7 L0.7 5 L4.8 4.6 Z" fill="url(#st)" stroke="${shade(c, -0.6)}" stroke-width="0.8" stroke-linejoin="round"/></g>
<g fill="${shade(c, 0.5)}" filter="url(#gl)">
<path d="M15.5 2.5 l0.5 1.4 l1.4 0.5 l-1.4 0.5 l-0.5 1.4 l-0.5 -1.4 l-1.4 -0.5 l1.4 -0.5 z"/>
<path d="M2.5 15 l0.4 1.1 l1.1 0.4 l-1.1 0.4 l-0.4 1.1 l-0.4 -1.1 l-1.1 -0.4 l1.1 -0.4 z"/>
<circle cx="13" cy="8.6" r="0.6"/><circle cx="9.2" cy="13.4" r="0.5"/><circle cx="17.6" cy="7" r="0.4"/></g>`,
  },
  {
    id: "rocket",
    name: ["Ракета", "Rocket"],
    defaultColor: "#ff4d5e",
    hotspot: [3.5, 3.5],
    arrow: (c) => `<defs><linearGradient id="bd" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffffff"/><stop offset="0.6" stop-color="#dfe3ea"/><stop offset="1" stop-color="#9aa3b2"/></linearGradient>
<linearGradient id="fl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3a6"/><stop offset="0.4" stop-color="#ffb21a"/><stop offset="1" stop-color="#ff3d00" stop-opacity="0"/></linearGradient></defs>
<g transform="translate(3.5 3.5) rotate(-45)" filter="url(#sh)">
<path d="M-3 20.5 Q0 33 3 20.5 Z" fill="url(#fl)"/>
<path d="M-1.4 20.5 Q0 27 1.4 20.5 Z" fill="#fff8d0"/>
<path d="M-4 13.5 L-8.2 21.6 L-4 20 Z M4 13.5 L8.2 21.6 L4 20 Z" fill="${c}" stroke="${shade(c, -0.6)}" stroke-width="0.7" stroke-linejoin="round"/>
<path d="M0 0 C3 3 4.1 7.5 4.1 13.5 L4.1 20.5 L-4.1 20.5 L-4.1 13.5 C-4.1 7.5 -3 3 0 0 Z" fill="url(#bd)" stroke="#2b2f38" stroke-width="0.9" stroke-linejoin="round"/>
<path d="M0 0 C1.9 1.9 2.9 4 3.4 6.2 L-3.4 6.2 C-2.9 4 -1.9 1.9 0 0 Z" fill="${c}" stroke="${shade(c, -0.6)}" stroke-width="0.6"/>
<circle cx="0" cy="11" r="2.1" fill="#7fd4ff" stroke="#34404f" stroke-width="0.8"/>
<circle cx="-0.7" cy="10.3" r="0.6" fill="#fff"/>
<path d="M-4.1 18 H4.1" stroke="${c}" stroke-width="1.2"/>
<path d="M-2.6 7.5 V17" stroke="#fff" stroke-width="0.6" opacity="0.9"/>
</g>`,
  },
  {
    id: "flame",
    name: ["Пламък", "Flame"],
    defaultColor: "#ff7a1a",
    hotspot: [3, 2],
    arrow: (c) => `<defs><linearGradient id="fi" x1="0" y1="0" x2="0.7" y2="1"><stop offset="0" stop-color="#fffbe0"/><stop offset="0.3" stop-color="${shade(c, 0.45)}"/><stop offset="0.7" stop-color="${c}"/><stop offset="1" stop-color="${shade(c, -0.45)}"/></linearGradient></defs>
<g filter="url(#gl)" opacity="0.9">
<path d="M8.6 19.4 C7 23 9 26 7.5 30 C11 27.5 10.5 25 12 23 Z" fill="${shade(c, -0.1)}"/>
<path d="M12.4 18.1 C15 20 18 19 21.5 21.5 C20 17.5 17 17.5 15.5 16 Z" fill="${shade(c, -0.1)}"/>
<path d="M3 24.5 C1.5 26.5 2.5 28.5 1 30.5 C4 29 4.5 27 5.6 22 Z" fill="${shade(c, 0.2)}"/></g>
<g filter="url(#sh)"><path d="${ARROW}" fill="url(#fi)" stroke="${shade(c, -0.7)}" stroke-width="1.3" stroke-linejoin="round"/></g>
<path d="M5 8 C6.5 11 5 13 7 16 C8 13.5 7.5 11.5 5 8 Z" fill="#fffbe0" opacity="0.85"/>
<path d="M9.5 13 C11 14.5 10.5 15.5 12 17 C12.5 15.5 11.5 14 9.5 13 Z" fill="#fffbe0" opacity="0.7"/>`,
  },
  {
    id: "demon",
    name: ["Демонска", "Demonic"],
    defaultColor: "#ff2a2a",
    hotspot: [3, 2],
    arrow: (c) => `<defs><linearGradient id="ob" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4a3a44"/><stop offset="0.5" stop-color="#1c1418"/><stop offset="1" stop-color="#070506"/></linearGradient></defs>
<g filter="url(#sh)">
<path d="M3 24.5 L0.8 27.4 L4.6 23 Z M8.6 19.4 L7.4 23.6 L10.2 22.9 Z M19.8 18.1 L23.4 19.6 L18.2 16.6 Z M3 9 L0.6 8.4 L3 11.4 Z M3 16 L0.4 16.4 L3 18.6 Z" fill="#1c1418" stroke="${shade(c, -0.4)}" stroke-width="0.5"/>
<path d="${ARROW}" fill="url(#ob)" stroke="${c}" stroke-width="1.2" stroke-linejoin="round"/></g>
<g stroke="${c}" stroke-width="0.7" stroke-linecap="round" fill="none" filter="url(#gl)">
<path d="M4.6 6 L6.8 10.5 L5.8 13.4 L8.4 16.6"/><path d="M6.8 10.5 L10 12.4"/><path d="M5.8 13.4 L4.4 17.6"/><path d="M10.4 20.4 L12.6 25.6"/></g>
<circle cx="6" cy="9.4" r="0.6" fill="${shade(c, 0.6)}"/>`,
  },
  {
    id: "pickle",
    name: ["Краставичка", "Pickle"],
    defaultColor: "#6cbf3a",
    hotspot: [3.5, 3.5],
    arrow: (c) => `<defs><linearGradient id="pk" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${shade(c, 0.35)}"/><stop offset="0.55" stop-color="${c}"/><stop offset="1" stop-color="${shade(c, -0.45)}"/></linearGradient></defs>
<g transform="translate(3.5 3.5) rotate(-45)" filter="url(#sh)">
<path d="M0 0 C4.4 0 5.6 6 5.6 14.5 C5.6 23 4.4 29 0 29 C-4.4 29 -5.6 23 -5.6 14.5 C-5.6 6 -4.4 0 0 0 Z" fill="url(#pk)" stroke="${shade(c, -0.65)}" stroke-width="1" stroke-linejoin="round"/>
<g fill="${shade(c, 0.45)}" stroke="${shade(c, -0.4)}" stroke-width="0.3">
<circle cx="-3.4" cy="5.5" r="0.7"/><circle cx="3.6" cy="18" r="0.7"/><circle cx="-3.8" cy="21" r="0.75"/><circle cx="2.8" cy="25" r="0.6"/><circle cx="-2" cy="26.4" r="0.55"/><circle cx="3.4" cy="5.8" r="0.6"/></g>
<path d="M-3.6 7 C-4.4 12 -4.3 18 -3.3 23" stroke="#fff" stroke-width="0.8" stroke-linecap="round" opacity="0.5" fill="none"/>
<circle cx="-1.9" cy="10.6" r="1.25" fill="#fff" stroke="#1b2a12" stroke-width="0.4"/><circle cx="1.9" cy="10.6" r="1.25" fill="#fff" stroke="#1b2a12" stroke-width="0.4"/>
<circle cx="-1.6" cy="11" r="0.6" fill="#111"/><circle cx="2.2" cy="11" r="0.6" fill="#111"/>
<path d="M-1.8 13.8 Q0 15.6 1.8 13.8" stroke="#1b2a12" stroke-width="0.6" stroke-linecap="round" fill="none"/>
</g>`,
  },
  /* ── dark fantasy / arena-style packs (own drawings, in the spirit of action-RPG and MOBA cursors) ── */
  {
    id: "gothic",
    name: ["Готическо желязо", "Gothic iron"],
    defaultColor: "#e0262f",
    hotspot: [3, 2],
    arrow: (c) => `<defs><linearGradient id="ir" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c3c9d3"/><stop offset="0.45" stop-color="#666b76"/><stop offset="1" stop-color="#23252b"/></linearGradient>
<linearGradient id="au" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff0b0"/><stop offset="0.5" stop-color="#d9a42c"/><stop offset="1" stop-color="#7a4e05"/></linearGradient></defs>
<g filter="url(#sh)">
<path d="M3 10.5 L0.9 11.6 L3 13.4 Z M3 17.5 L0.9 18.6 L3 20.4 Z M15.2 14.8 L17.6 12.9 L17.2 16.3 Z M8.6 19.4 L6.9 22.6 L9.7 21.9 Z" fill="#2a2d33" stroke="#0a0a0c" stroke-width="0.5"/>
<path d="${ARROW}" fill="url(#ir)" stroke="#0a0a0c" stroke-width="1.5" stroke-linejoin="round"/></g>
<path d="M4.6 6.4 L4.6 20.6 L8.9 16.7 L15.6 16.7 Z" fill="none" stroke="url(#au)" stroke-width="0.8" stroke-linejoin="round"/>
<path d="M5.6 9.6 q1.8 -0.4 2 1.4 M5.6 18.4 q1.6 -1.4 2.8 -0.6 M11.2 15.8 q0.6 -1.6 2.2 -1" stroke="#e7b84a" stroke-width="0.45" fill="none" stroke-linecap="round"/>
<path d="M10.3 21 L13.4 27.6" stroke="#d9a42c" stroke-width="0.6" stroke-linecap="round"/>
<path d="M7.9 11.4 l1.7 2.3 l-1.7 2.3 l-1.7 -2.3 z" fill="${c}" stroke="#2a1a00" stroke-width="0.5" filter="url(#gl)"/>
<path d="M7.5 12.4 l0.4 -0.5 l0.3 0.5" stroke="#fff" stroke-width="0.4" fill="none" opacity="0.9"/>`,
    pointer: (c) => gauntlet(c, "#b4bac4", "#15161a"),
    pointerHotspot: [11.5, 1.5],
  },
  {
    id: "bone",
    name: ["Кост и череп", "Bone & skull"],
    defaultColor: "#4fe0ff",
    hotspot: [3, 2],
    arrow: (c) => `<defs><linearGradient id="bn" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fbf5e4"/><stop offset="0.55" stop-color="#d8c9a4"/><stop offset="1" stop-color="#8f7c59"/></linearGradient></defs>
<g filter="url(#sh)"><path d="${ARROW}" fill="url(#bn)" stroke="#2e261b" stroke-width="1.4" stroke-linejoin="round"/></g>
<g stroke="#6e5c40" stroke-width="0.45" fill="none" stroke-linecap="round"><path d="M4.4 19 L6 17.2 L5.6 15.4"/><path d="M14.4 17.2 L13.2 16.2 L12 16.6"/><path d="M11.4 22.6 L12.6 23.4"/></g>
<path d="M4.5 5.6 V12" stroke="#fff" stroke-width="0.8" stroke-linecap="round" opacity="0.7"/>
<g transform="translate(8.6 12.2)">
<path d="M-2.7 0.2 a2.7 2.7 0 1 1 5.4 0 v1.6 l-0.9 0.6 v1.2 h-3.6 v-1.2 l-0.9 -0.6 z" fill="#f4ecd4" stroke="#2e261b" stroke-width="0.55" stroke-linejoin="round"/>
<g fill="${c}" filter="url(#gl)"><circle cx="-1.05" cy="0.6" r="0.8"/><circle cx="1.05" cy="0.6" r="0.8"/></g>
<path d="M0 1.7 l-0.45 0.8 h0.9 z" fill="#2e261b"/>
<path d="M-0.9 2.9 V3.6 M0 2.9 V3.6 M0.9 2.9 V3.6" stroke="#2e261b" stroke-width="0.35"/></g>`,
    pointer: (c) => gauntlet(c, "#f4ecd4", "#7a6847", "#f4ecd4", "#6e5c40"),
    pointerHotspot: [11.5, 1.5],
  },
  {
    id: "rune",
    name: ["Рунически камък", "Rune stone"],
    defaultColor: "#38c6ff",
    hotspot: [3, 2],
    arrow: (c) => `<defs><linearGradient id="sn" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#cdc9c0"/><stop offset="0.5" stop-color="#8e8a82"/><stop offset="1" stop-color="#55524c"/></linearGradient></defs>
<g filter="url(#sh)"><path d="${ARROW}" fill="url(#sn)" stroke="#191816" stroke-width="1.4" stroke-linejoin="round"/></g>
<g fill="#2c2a27" opacity="0.6"><circle cx="5" cy="21" r="0.45"/><circle cx="13" cy="17.2" r="0.4"/><circle cx="12.6" cy="24.6" r="0.5"/><circle cx="6.8" cy="5.8" r="0.35"/></g>
<g fill="#d9d5cc" opacity="0.5"><circle cx="4.4" cy="14" r="0.35"/><circle cx="10.4" cy="13" r="0.3"/><circle cx="14.4" cy="26" r="0.3"/></g>
<path d="M16.3 26.8 L15.2 24.8 L14.2 25.6 Z M19.8 18.1 L17.4 17 L17.6 18.1 Z" fill="#191816"/>
<g stroke="${shade(c, -0.55)}" stroke-width="1.5" stroke-linecap="round" fill="none"><path d="M5.3 7.2 V12.4 M5.3 8.8 L7 7.6 M5.3 10.4 L7 9.2"/><path d="M8.4 12.8 L9.6 15.4 L10.8 12.8"/><path d="M5.2 15.2 V20.2 M5.2 17.6 L7 16.2"/><path d="M11 20.6 L12.4 23.6 M11.4 22.2 L13 21.4"/></g>
<g stroke="${c}" stroke-width="0.75" stroke-linecap="round" fill="none" filter="url(#gl)"><path d="M5.3 7.2 V12.4 M5.3 8.8 L7 7.6 M5.3 10.4 L7 9.2"/><path d="M8.4 12.8 L9.6 15.4 L10.8 12.8"/><path d="M5.2 15.2 V20.2 M5.2 17.6 L7 16.2"/><path d="M11 20.6 L12.4 23.6 M11.4 22.2 L13 21.4"/></g>`,
    pointer: (c) => gauntlet(c, "#a7a49d", "#2c2a27", "#a7a49d", "#34322f"),
    pointerHotspot: [11.5, 1.5],
  },
  {
    id: "ice",
    name: ["Леден отломък", "Ice shard"],
    defaultColor: "#7fd8ff",
    hotspot: [3, 2],
    arrow: (c) => `<defs><linearGradient id="ic" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="0.45" stop-color="${shade(c, 0.45)}"/><stop offset="1" stop-color="${shade(c, -0.35)}"/></linearGradient></defs>
<g filter="url(#sh)">
<path d="M3 12.6 L0.4 10.8 L3 15.4 Z M11.2 12.8 L13.4 9.6 L13.2 14.4 Z M15.6 14.4 L19 11.8 L17.8 16.2 Z M14.4 22.4 L18.6 22.2 L15.3 24.6 Z M6 21.6 L4.6 26.2 L7.6 20.4 Z" fill="${shade(c, 0.55)}" stroke="${shade(c, -0.55)}" stroke-width="0.45" stroke-linejoin="round"/>
<path d="${ARROW}" fill="url(#ic)" fill-opacity="0.95" stroke="${shade(c, -0.6)}" stroke-width="1.3" stroke-linejoin="round"/></g>
<path d="M3 2 L8.4 15.2 L19.8 18.1 M8.4 15.2 L3 24.5 M8.4 15.2 L10.4 19.6 L12.6 28.4" stroke="#fff" stroke-width="0.45" fill="none" opacity="0.75"/>
<path d="M4.4 5.4 V20" stroke="#fff" stroke-width="0.9" stroke-linecap="round" opacity="0.8"/>
<g stroke="#fff" stroke-width="0.5" stroke-linecap="round" filter="url(#gl)"><path d="M10.6 10.2 V13.4 M9 11.8 H12.2 M9.5 10.7 L11.7 12.9 M11.7 10.7 L9.5 12.9"/></g>
<g fill="#fff"><circle cx="1.6" cy="5.6" r="0.4"/><circle cx="20.6" cy="20.6" r="0.35"/><circle cx="16.8" cy="9.6" r="0.3"/></g>`,
  },
  {
    id: "axe",
    name: ["Бойна брадва", "Battle axe"],
    defaultColor: "#e0262f",
    hotspot: [3, 3],
    arrow: (c) => `<defs><linearGradient id="st" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#f1f5fa"/><stop offset="0.6" stop-color="#a3adbb"/><stop offset="1" stop-color="#5d6674"/></linearGradient>
<linearGradient id="wd" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#9a6a3e"/><stop offset="1" stop-color="#4a2e16"/></linearGradient></defs>
<g transform="translate(3 3) rotate(-45)" filter="url(#sh)">
<rect x="-1.25" y="10" width="2.5" height="20.5" rx="0.8" fill="url(#wd)" stroke="#22140a" stroke-width="0.7"/>
<path d="M-1.25 19.4 L1.25 20.4 M-1.25 20.8 L1.25 21.8 M-1.25 22.2 L1.25 23.2 M-1.25 23.6 L1.25 24.6" stroke="${c}" stroke-width="0.8"/>
<path d="M0 30.4 L1.4 31.6 L0 33 L-1.4 31.6 Z" fill="#8c95a3" stroke="#22262e" stroke-width="0.5"/>
<path d="M1.8 5 C6.2 3.4 9.8 5.6 10.8 8.8 C9.8 12 6.2 14 1.8 12.4 Z" fill="url(#st)" stroke="#1f232a" stroke-width="0.8" stroke-linejoin="round"/>
<path d="M-1.8 5 C-6.2 3.4 -9.8 5.6 -10.8 8.8 C-9.8 12 -6.2 14 -1.8 12.4 Z" fill="url(#st)" stroke="#1f232a" stroke-width="0.8" stroke-linejoin="round"/>
<path d="M3.4 4.4 C7.2 3.8 9.8 6 10.4 8.6 M-3.4 4.4 C-7.2 3.8 -9.8 6 -10.4 8.6" stroke="#fff" stroke-width="0.5" fill="none" opacity="0.85"/>
<path d="M0 0 L1.5 4.8 L-1.5 4.8 Z" fill="#d7dde6" stroke="#1f232a" stroke-width="0.6" stroke-linejoin="round"/>
<rect x="-2" y="4.6" width="4" height="8.2" rx="0.6" fill="#2c3038" stroke="#15171b" stroke-width="0.6"/>
<circle cx="0" cy="8.7" r="1.15" fill="${c}" stroke="#15171b" stroke-width="0.4" filter="url(#gl)"/>
</g>`,
  },
  {
    id: "dagger",
    name: ["Извита кама", "Wavy dagger"],
    defaultColor: "#2fd67a",
    hotspot: [3, 3],
    arrow: (c) => `<defs><linearGradient id="bl" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#f4f8fc"/><stop offset="0.5" stop-color="#c3ccd8"/><stop offset="1" stop-color="#6f7a8a"/></linearGradient>
<linearGradient id="au" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff0b0"/><stop offset="0.5" stop-color="#d9a42c"/><stop offset="1" stop-color="#7a4e05"/></linearGradient></defs>
<g transform="translate(3 3) rotate(-45)" filter="url(#sh)">
<path d="M0 0 C1.8 2.6 2.8 4.8 1.8 7.4 C1 9.8 2.9 12 2.4 15 L2.4 17.4 L-2.4 17.4 L-2.4 15 C-2.9 12 -1 9.8 -1.8 7.4 C-2.8 4.8 -1.8 2.6 0 0 Z" fill="url(#bl)" stroke="#262a31" stroke-width="0.9" stroke-linejoin="round"/>
<path d="M0 2.4 C0.8 5 -0.6 8 0.4 11 C0.9 13 0.2 15 0 16.6" stroke="#6f7a8a" stroke-width="0.6" fill="none"/>
<path d="M-1 3 C-1.4 5 -0.6 7 -1.2 9" stroke="#fff" stroke-width="0.4" fill="none" opacity="0.9"/>
<path d="M-6.4 16.4 Q0 19.4 6.4 16.4 L5.2 19.6 Q0 21.2 -5.2 19.6 Z" fill="url(#au)" stroke="#4a2e00" stroke-width="0.6" stroke-linejoin="round"/>
<rect x="-1.4" y="20.2" width="2.8" height="6.4" fill="#2a1d14" stroke="#120b06" stroke-width="0.5"/>
<path d="M-1.4 21.4 L1.4 22.4 M-1.4 23 L1.4 24 M-1.4 24.6 L1.4 25.6" stroke="${shade(c, -0.2)}" stroke-width="0.55"/>
<path d="M0 26.4 L2.2 28.6 L0 30.8 L-2.2 28.6 Z" fill="${c}" stroke="#4a2e00" stroke-width="0.6" filter="url(#gl)"/>
<path d="M-0.6 27.8 L0 27.2 L0.4 27.8" stroke="#fff" stroke-width="0.4" fill="none"/>
</g>`,
  },
  {
    id: "claw",
    name: ["Нокът на звяр", "Beast claw"],
    defaultColor: "#8a3cff",
    hotspot: [3, 2],
    arrow: (c) => `<defs><linearGradient id="tl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#151012"/><stop offset="0.45" stop-color="#6b5d52"/><stop offset="1" stop-color="#efe4cc"/></linearGradient>
<linearGradient id="sk" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${shade(c, 0.1)}"/><stop offset="1" stop-color="${shade(c, -0.6)}"/></linearGradient></defs>
<g filter="url(#sh)">
<path d="M12.4 19.6 C15 23.2 18.2 26.4 23 29" stroke="#0e0a0c" stroke-width="8.6" stroke-linecap="round" fill="none"/>
<path d="M12.4 19.6 C15 23.2 18.2 26.4 23 29" stroke="url(#sk)" stroke-width="6.8" stroke-linecap="round" fill="none"/>
<path d="M3 2 C8.6 4.6 13.8 10.2 15.6 18.8 L10 21 C9.4 13.4 7.4 7.4 3 2 Z" fill="url(#tl)" stroke="#0e0a0c" stroke-width="1" stroke-linejoin="round"/></g>
<path d="M5 3.8 C8.6 6.6 11.2 11 12.4 16.6" stroke="#fff" stroke-width="0.5" fill="none" opacity="0.55" stroke-linecap="round"/>
<g stroke="${shade(c, 0.45)}" stroke-width="0.5" fill="none" stroke-linecap="round"><path d="M13.4 23.4 q1.6 -1.6 3.2 -1.2"/><path d="M15.4 25.6 q1.6 -1.6 3.2 -1.2"/><path d="M17.8 27.4 q1.6 -1.4 3 -1"/><path d="M12.8 25.6 q1.4 0 2.4 1.4"/></g>
<g fill="${shade(c, 0.6)}" filter="url(#gl)"><circle cx="19.4" cy="24" r="0.5"/><circle cx="16.4" cy="21.8" r="0.4"/></g>`,
  },
  {
    id: "winged",
    name: ["Крилата стрела", "Winged arrow"],
    defaultColor: "#ffd23f",
    hotspot: [3, 2],
    arrow: (c) => `<defs><linearGradient id="hw" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="0.6" stop-color="#fff4d6"/><stop offset="1" stop-color="#d9b66a"/></linearGradient>
<linearGradient id="wg" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="${shade(c, -0.2)}"/><stop offset="1" stop-color="${shade(c, 0.75)}"/></linearGradient></defs>
<g filter="url(#sh)" stroke="${shade(c, -0.6)}" stroke-width="0.5" fill="url(#wg)">
<path d="${leaf(11.6, 13.6, 24.6, 4.4, 2.8)}"/><path d="${leaf(12, 14.2, 27, 8.6, 2.7)}"/><path d="${leaf(12.4, 15, 28.2, 13.4, 2.5)}"/><path d="${leaf(12.6, 15.8, 26.4, 18, 2.2)}"/></g>
<g filter="url(#sh)"><path d="${ARROW}" fill="url(#hw)" stroke="#5a4210" stroke-width="1.3" stroke-linejoin="round"/></g>
<path d="M4.6 6.4 L4.6 20.4 L8.9 16.6 L15.4 16.6 Z" fill="none" stroke="#d9a42c" stroke-width="0.6" stroke-linejoin="round"/>
<circle cx="7.6" cy="13.6" r="1.4" fill="${c}" stroke="#5a4210" stroke-width="0.4" filter="url(#gl)"/>
<path d="M4.4 5.4 V11" stroke="#fff" stroke-width="0.8" stroke-linecap="round"/>`,
  },
];

export const CURSOR_COLORS = ["#4c8dff", "#38d9c9", "#6cbf3a", "#ffd23f", "#ff7a1a", "#ff2a2a", "#ff2bd6", "#b06bff", "#ffffff", "#9aa3b2", "#222222"];
export const CURSOR_SIZES = [24, 32, 40, 48, 64];

export function skinById(id: string): CursorSkin | undefined {
  return CURSOR_SKINS.find((s) => s.id === id);
}

function svg(inner: string, size: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32"><defs>${SHADOW}${GLOW}</defs>${inner}</svg>`;
}

/** SVG of the arrow / pointer at `size` px. */
export function cursorSvg(skin: CursorSkin, kind: "arrow" | "pointer", color: string, size: number): { svg: string; hotspot: [number, number] } {
  if (kind === "pointer") {
    if (skin.pointer) return { svg: svg(skin.pointer(color), size), hotspot: skin.pointerHotspot ?? skin.hotspot };
    const [x, y] = skin.hotspot;
    return { svg: svg(clickable(skin.arrow(color), color, x, y), size), hotspot: skin.hotspot };
  }
  return { svg: svg(skin.arrow(color), size), hotspot: skin.hotspot };
}

export function svgDataUrl(s: string): string {
  return `data:image/svg+xml,${encodeURIComponent(s)}`;
}

/** A CSS `cursor` value: url(...) x y, fallback. */
export function cursorCss(skin: CursorSkin, kind: "arrow" | "pointer", color: string, size: number): string {
  const { svg: s, hotspot } = cursorSvg(skin, kind, color, size);
  const k = size / 32;
  const hx = Math.round(hotspot[0] * k);
  const hy = Math.round(hotspot[1] * k);
  return `url("${svgDataUrl(s)}") ${hx} ${hy}, ${kind === "pointer" ? "pointer" : "default"}`;
}
