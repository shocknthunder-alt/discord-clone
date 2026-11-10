export interface ThemeDef {
  id: string;
  name: string;
  /** Hue / saturation of the surface ramp, lightness of the main chat surface. */
  h: number;
  s: number;
  l: number;
  light?: boolean;
  accent: string;
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
];

export const DEFAULT_THEME_ID = "graphite";
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
        "--t-1": hsl(h, Math.min(s, 30), 13),
        "--t-2": hsl(h, Math.min(s, 22), 24),
        "--t-3": hsl(h, Math.min(s, 16), 36),
        "--t-4": hsl(h, Math.min(s, 14), 44),
        "--t-5": hsl(h, Math.min(s, 12), 52),
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
        "--t-1": hsl(h, Math.min(s, 20), 95),
        "--t-2": hsl(h, Math.min(s, 16), 84),
        "--t-3": hsl(h, Math.min(s, 12), 72),
        "--t-4": hsl(h, Math.min(s, 10), 64),
        "--t-5": hsl(h, Math.min(s, 8), 57),
        "--link": hsl(ah, as, Math.max(al, 68)),
        "--line-rgb": "255, 255, 255",
      };
  v["--accent"] = t.accent;
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
