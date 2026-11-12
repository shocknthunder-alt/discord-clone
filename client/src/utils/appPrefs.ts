import { create } from "zustand";

/**
 * General, per-device preferences (Settings → Общи). Kept in localStorage — nothing here needs
 * the server, so older/newer clients never disagree about them.
 */
export interface AppPrefs {
  /** Message text size in px. */
  chatFontSize: number;
  /** 24-hour clock (14:05) instead of the locale default. */
  clock24h: boolean;
  /** Show seconds in message timestamps. */
  showSeconds: boolean;
  /** Desktop notifications for new messages / DMs while the window isn't focused. */
  desktopNotifications: boolean;
  /** Sound when someone joins your voice channel. */
  joinSound: boolean;
  /** Turn off animations and the live fire effect. */
  reduceMotion: boolean;
  /** Mark text channels that have messages you haven't seen. */
  unreadMarkers: boolean;
  /** Hear soundboard clips others play. */
  soundboardEnabled: boolean;
  /** Your own volume for soundboard clips, 0-100 (on top of each clip's own volume). */
  soundboardVolume: number;
}

const KEY = "appPrefs";

const DEFAULTS: AppPrefs = {
  chatFontSize: 16,
  clock24h: true,
  showSeconds: false,
  desktopNotifications: false,
  joinSound: true,
  reduceMotion: false,
  unreadMarkers: true,
  soundboardEnabled: true,
  soundboardVolume: 60,
};

function load(): AppPrefs {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<AppPrefs>) };
  } catch {
    return DEFAULTS;
  }
}

/** Puts the prefs that are pure CSS onto <html>. */
function applyToDocument(p: AppPrefs) {
  const root = document.documentElement;
  root.style.setProperty("--chat-font-size", `${p.chatFontSize}px`);
  root.classList.toggle("reduce-motion", p.reduceMotion);
}

interface PrefsState extends AppPrefs {
  set: (patch: Partial<AppPrefs>) => void;
}

export const useAppPrefs = create<PrefsState>((setState, get) => ({
  ...load(),
  set: (patch) => {
    setState(patch);
    const { set: _omit, ...prefs } = get();
    localStorage.setItem(KEY, JSON.stringify(prefs));
    applyToDocument(prefs);
  },
}));

export function initAppPrefs() {
  applyToDocument(useAppPrefs.getState());
}

export function getAppPrefs(): AppPrefs {
  return useAppPrefs.getState();
}

/** Message timestamp in the user's chosen clock style. */
export function formatTime(iso: string): string {
  const { clock24h, showSeconds } = getAppPrefs();
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    ...(showSeconds ? { second: "2-digit" } : {}),
    hour12: !clock24h,
  });
}

export function formatDateTime(iso: string): string {
  const { clock24h } = getAppPrefs();
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "short",
    timeStyle: "short",
    hour12: !clock24h,
  });
}

/**
 * Desktop notification for something that arrived while the user wasn't looking. Silent no-op
 * when the setting is off, permission wasn't granted, or the window is in focus.
 */
export function notifyDesktop(title: string, body: string, icon?: string | null) {
  if (!getAppPrefs().desktopNotifications) return;
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  if (document.hasFocus()) return;
  try {
    const n = new Notification(title, { body: body.slice(0, 200), ...(icon ? { icon } : {}) });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    // some browsers only allow notifications from a service worker — best effort
  }
}
