import { create } from "zustand";
import { cursorCss, skinById } from "./cursorSkins";

// The chosen cursor lives on this device (localStorage), like the theme. "system" = the normal one.
// How it reaches every element: <html> gets the arrow (it's inherited), and a small PostCSS step in
// vite.config.ts turns every `cursor: pointer|default` in our CSS into var(--cur-pointer|--cur-default, …).

const KEY = "cursorSkinV1";

export interface CursorPrefs {
  skinId: string;
  /** null = the skin's own colour. */
  color: string | null;
  size: number;
}

const DEFAULTS: CursorPrefs = { skinId: "system", color: null, size: 32 };

function load(): CursorPrefs {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (v && typeof v === "object") {
      return {
        skinId: typeof v.skinId === "string" ? v.skinId : DEFAULTS.skinId,
        color: typeof v.color === "string" && /^#[0-9a-f]{6}$/i.test(v.color) ? v.color : null,
        size: typeof v.size === "number" ? Math.max(16, Math.min(96, Math.round(v.size))) : DEFAULTS.size,
      };
    }
  } catch {
    /* ignore */
  }
  return DEFAULTS;
}

export function applyCursor(p: CursorPrefs) {
  const root = document.documentElement;
  const skin = skinById(p.skinId);
  // Phones / touch screens have no mouse cursor.
  const touchOnly = typeof matchMedia === "function" && matchMedia("(hover: none)").matches;
  if (!skin || touchOnly) {
    root.classList.remove("custom-cursor");
    root.style.removeProperty("--cur-default");
    root.style.removeProperty("--cur-pointer");
    return;
  }
  const color = p.color ?? skin.defaultColor;
  root.style.setProperty("--cur-default", cursorCss(skin, "arrow", color, p.size));
  root.style.setProperty("--cur-pointer", cursorCss(skin, "pointer", color, p.size));
  root.classList.add("custom-cursor");
}

export const useCursorStore = create<CursorPrefs & { set: (patch: Partial<CursorPrefs>) => void }>((set, get) => ({
  ...load(),
  set: (patch) => {
    const { set: _s, ...cur } = get();
    const next = { ...cur, ...patch };
    set(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    applyCursor(next);
  },
}));

/** Called once at start-up. */
export function startCursor() {
  const { set: _s, ...p } = useCursorStore.getState();
  applyCursor(p);
}
