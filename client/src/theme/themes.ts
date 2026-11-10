export interface ThemeDef {
  id: string;
  name: string;
  /** Hue / saturation of the surface ramp, lightness of the main chat surface. */
  h: number;
  s: number;
  l: number;
  light?: boolean;
  accent: string;
  /** Text tint — defaults to the surface hue. */
  textH?: number;
  textS?: number;
  /** Complex themes: custom page backdrop, panel frame and heading font. */
  bodyImage?: string;
  panelBorder?: string;
  panelShadow?: string;
  headingFont?: string;
}

export const THEMES: ThemeDef[] = [
  { id: "graphite", name: "Графит", h: 0, s: 0, l: 33, accent: "#ff7a45" },
  { id: "midnight", name: "Полунощ", h: 224, s: 32, l: 24, accent: "#ff7a45" },
  { id: "ocean", name: "Океан", h: 205, s: 38, l: 27, accent: "#18b3b0" },
  { id: "forest", name: "Гора", h: 150, s: 24, l: 23, accent: "#e2a12b" },
  { id: "plum", name: "Слива", h: 280, s: 24, l: 26, accent: "#f0629f" },
  { id: "sunset", name: "Залез", h: 12, s: 26, l: 25, accent: "#ff9248" },
  { id: "burgundy", name: "Бордо", h: 345, s: 28, l: 23, accent: "#f2a35e" },
  { id: "mocha", name: "Мока", h: 28, s: 20, l: 25, accent: "#e0954a" },
  { id: "lavender", name: "Лавандула", h: 255, s: 26, l: 31, accent: "#9d7bf5" },
  { id: "mint", name: "Мента", h: 170, s: 22, l: 24, accent: "#2cb98f" },
  { id: "charcoal", name: "Въглен", h: 220, s: 6, l: 12, accent: "#ff7a45" },
  { id: "daylight", name: "Светла", h: 220, s: 12, l: 96, light: true, accent: "#f06a35" },
  { id: "sky", name: "Небе", h: 210, s: 38, l: 95, light: true, accent: "#2f7de1" },
  { id: "meadow", name: "Ливада", h: 155, s: 30, l: 94, light: true, accent: "#1f9d6b" },
  { id: "sand", name: "Пясък", h: 35, s: 38, l: 94, light: true, accent: "#d9722a" },
  {
    id: "flames",
    name: "🔥 Пламъци",
    h: 8, s: 38, l: 12, accent: "#ff5a1f", textH: 28, textS: 40,
    bodyImage:
      "radial-gradient(1100px 420px at 50% 118%, rgba(255,90,20,0.55), transparent 65%), radial-gradient(520px 360px at 12% 112%, rgba(255,170,40,0.35), transparent 70%), radial-gradient(520px 360px at 90% 115%, rgba(220,40,20,0.35), transparent 70%)",
    panelBorder: "rgba(255,110,40,0.38)",
    panelShadow: "0 0 22px rgba(255,90,20,0.22), 0 10px 30px rgba(0,0,0,0.5)",
  },
  {
    id: "jungle",
    name: "🌿 Джунгла",
    h: 142, s: 36, l: 15, accent: "#8fd12f", textH: 95, textS: 28,
    bodyImage:
      "radial-gradient(800px 520px at 0% 0%, rgba(60,160,70,0.32), transparent 62%), radial-gradient(700px 500px at 100% 100%, rgba(120,200,50,0.2), transparent 62%), repeating-linear-gradient(115deg, rgba(120,200,80,0.05) 0 2px, transparent 2px 26px)",
    panelBorder: "rgba(130,210,80,0.3)",
    panelShadow: "0 0 18px rgba(80,180,60,0.18), 0 10px 30px rgba(0,0,0,0.45)",
  },
  {
    id: "poe2",
    name: "⚔ Path of Exile 2",
    h: 32, s: 10, l: 9, accent: "#c8a45c", textH: 38, textS: 28,
    headingFont: '"Cinzel", "Times New Roman", serif',
    bodyImage:
      "radial-gradient(900px 600px at 50% 0%, rgba(150,110,50,0.2), transparent 65%), radial-gradient(1200px 700px at 50% 50%, transparent 40%, rgba(0,0,0,0.65) 100%)",
    panelBorder: "rgba(200,164,92,0.45)",
    panelShadow: "inset 0 0 0 1px rgba(0,0,0,0.7), inset 0 0 0 2px rgba(200,164,92,0.18), 0 12px 34px rgba(0,0,0,0.7)",
  },
  {
    id: "cyber",
    name: "⚡ Киберпънк",
    h: 262, s: 40, l: 11, accent: "#ff2fb3", textH: 190, textS: 40,
    headingFont: '"Orbitron", "Nunito", sans-serif',
    bodyImage:
      "radial-gradient(800px 500px at 0% 0%, rgba(255,47,179,0.28), transparent 60%), radial-gradient(800px 500px at 100% 100%, rgba(0,220,255,0.24), transparent 60%)",
    panelBorder: "rgba(0,220,255,0.4)",
    panelShadow: "0 0 20px rgba(0,220,255,0.18), 0 10px 30px rgba(0,0,0,0.5)",
  },
  {
    id: "aurora",
    name: "🌌 Северно сияние",
    h: 215, s: 45, l: 13, accent: "#3ee0b0", textH: 180, textS: 30,
    bodyImage:
      "radial-gradient(900px 420px at 20% 0%, rgba(62,224,176,0.32), transparent 65%), radial-gradient(800px 420px at 80% 8%, rgba(150,90,255,0.3), transparent 65%), radial-gradient(900px 400px at 50% 100%, rgba(40,120,255,0.18), transparent 65%)",
    panelBorder: "rgba(120,230,210,0.28)",
    panelShadow: "0 0 20px rgba(100,200,255,0.14), 0 10px 30px rgba(0,0,0,0.5)",
  },
];

export const DEFAULT_THEME_ID = "poe2";
const STORAGE_KEY = "shmirka-theme";

const clamp = (n: number) => Math.max(0, Math.min(100, n));
const hsl = (h: number, s: number, l: number) => `hsl(${h} ${s}% ${clamp(l)}%)`;

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function hexToHsl(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l * 100];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = Math.round(h * 60);
  if (h < 0) h += 360;
  return [h, s * 100, l * 100];
}

export function getStoredThemeId(): string {
  try {
    const id = localStorage.getItem(STORAGE_KEY);
    if (id && THEMES.some((t) => t.id === id)) return id;
  } catch {
    // storage blocked — fall through to default
  }
  return DEFAULT_THEME_ID;
}

/** Builds the whole surface/text ramp from a few numbers and writes it as CSS variables on
 * <html>; every rule in index.css reads these instead of hard-coded hex values. */
export function applyTheme(id: string, persist = false) {
  const t = THEMES.find((x) => x.id === id) ?? THEMES[0]!;
  const { h, s, l, light } = t;
  const th = t.textH ?? h;
  const ts = t.textS ?? s;
  const [ah, as, al] = hexToHsl(t.accent);
  const v: Record<string, string> = light
    ? {
        "--c-main": hsl(h, s, l),
        "--c-panel": hsl(h, s, l - 3.5),
        "--c-backdrop": hsl(h, s, l - 8),
        "--c-input": hsl(h, s, l - 5),
        "--c-h1": hsl(h, s, l - 6),
        "--c-h2": hsl(h, s, l - 9),
        "--c-h3": hsl(h, s, l - 12),
        "--c-h4": hsl(h, s, l - 15),
        "--c-line": hsl(h, s, l - 19),
        "--c-deepest": hsl(h, s, l - 30),
        "--t-1": hsl(th, Math.min(ts, 30), 13),
        "--t-2": hsl(th, Math.min(ts, 22), 24),
        "--t-3": hsl(th, Math.min(ts, 16), 36),
        "--t-4": hsl(th, Math.min(ts, 14), 44),
        "--t-5": hsl(th, Math.min(ts, 12), 52),
        "--link": hsl(ah, as, Math.min(al, 42)),
        "--line-rgb": "30, 40, 70",
      }
    : {
        "--c-main": hsl(h, s, l),
        "--c-panel": hsl(h, s, l - 4.3),
        "--c-backdrop": hsl(h, s, l - 8.3),
        "--c-input": hsl(h, s, l - 5.3),
        "--c-h1": hsl(h, s, l + 5),
        "--c-h2": hsl(h, s, l + 7),
        "--c-h3": hsl(h, s, l + 9),
        "--c-h4": hsl(h, s, l + 11),
        "--c-line": hsl(h, s, l + 14),
        "--c-deepest": hsl(h, s, Math.max(l - 15, 3)),
        "--t-1": hsl(th, Math.min(ts, 20), 95),
        "--t-2": hsl(th, Math.min(ts, 16), 84),
        "--t-3": hsl(th, Math.min(ts, 12), 72),
        "--t-4": hsl(th, Math.min(ts, 10), 64),
        "--t-5": hsl(th, Math.min(ts, 8), 57),
        "--link": hsl(ah, as, Math.max(al, 68)),
        "--line-rgb": "255, 255, 255",
      };
  v["--accent"] = t.accent;
  v["--body-image"] =
    t.bodyImage ??
    "radial-gradient(900px 500px at 8% -10%, rgba(var(--accent-rgb), 0.10), transparent 60%), radial-gradient(700px 500px at 100% 110%, rgba(var(--accent-rgb), 0.07), transparent 60%)";
  v["--panel-border"] = t.panelBorder ?? `rgba(${v["--line-rgb"]}, 0.06)`;
  v["--panel-shadow"] = t.panelShadow ?? `0 10px 30px rgba(${light ? "30, 40, 70, 0.14" : "0, 0, 0, 0.3"})`;
  v["--heading-font"] = t.headingFont ?? '"Bricolage Grotesque", "Nunito", sans-serif';
  v["--accent-hover"] = hsl(ah, as, al - 8);
  v["--accent-rgb"] = hexToRgb(t.accent).join(", ");
  const root = document.documentElement;
  for (const [k, val] of Object.entries(v)) root.style.setProperty(k, val);
  root.style.colorScheme = light ? "light" : "dark";
  root.dataset.mode = light ? "light" : "dark";
  if (persist) {
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // not fatal — the theme just won't survive a reload
    }
  }
}
