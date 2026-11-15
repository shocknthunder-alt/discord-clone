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

/** What someone is sharing — the label arrives in English from every client ("Entire Screen", "a Window"…). */
export function shareLabel(label: string | null | undefined): string {
  switch (label) {
    case "Entire Screen":
      return tr("целия екран", "Entire Screen");
    case "a Window":
      return tr("прозорец", "a Window");
    case "a Browser Tab":
      return tr("таб от браузъра", "a Browser Tab");
    case undefined:
    case null:
    case "":
      return tr("екрана си", "their screen");
    default:
      return label;
  }
}

/** Same, for code outside React (reads the language at call time). */
export function tr(bg: string, en: string): string {
  return useLangStore.getState().lang === "en" ? en : bg;
}
