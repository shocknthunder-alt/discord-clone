import { create } from "zustand";

/**
 * Interface language (Settings → Език). Texts are written in place as a Bulgarian/English pair:
 *
 *   const t = useT();          // in a component — re-renders when the language changes
 *   t("Влез", "Log in")
 *
 *   tr("Влез", "Log in")       // outside components (stores, sockets) — current language, no re-render
 *
 * Bulgarian is the default; the choice is remembered per browser/app.
 */
export type Lang = "bg" | "en";

const STORAGE_KEY = "shmirka-lang";

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "bg" || saved === "en") return saved;
  } catch {
    /* storage blocked */
  }
  return "bg";
}

export const useLangStore = create<{ lang: Lang }>(() => ({ lang: initialLang() }));

if (typeof document !== "undefined") document.documentElement.lang = useLangStore.getState().lang;

export function setLang(lang: Lang) {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* not fatal */
  }
  document.documentElement.lang = lang;
  useLangStore.setState({ lang });
}

export function useLang(): Lang {
  return useLangStore((s) => s.lang);
}

export type T = (bg: string, en: string) => string;

/** Translation function for components; re-renders the component when the language changes. */
export function useT(): T {
  const lang = useLang();
  return lang === "en" ? (_bg, en) => en : (bg) => bg;
}

/** Same, for code outside React (reads the language at call time). */
export function tr(bg: string, en: string): string {
  return useLangStore.getState().lang === "en" ? en : bg;
}
