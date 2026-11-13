import { create } from "zustand";
import { eventEndMs, type ServerEventDTO } from "@discord-clone/shared";
import { fetchEvents } from "../api/events.api";

/**
 * The 📅 board: events of every server you're in (upcoming, running, and ended < 24 h ago),
 * plus the board modal's open state and the small toasts (new event / reminder / started).
 */
export interface EventToast {
  id: string;
  kind: "new" | "reminder" | "started";
  eventId: string;
  title: string;
  text: string;
  imageUrl: string | null;
  voiceChannelId: string | null;
  serverId: string;
}

const SEEN_KEY = "eventsSeenAt";

function loadSeen(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) ?? "{}") as Record<string, number>;
  } catch {
    return {};
  }
}

interface EventsState {
  events: ServerEventDTO[];
  loaded: boolean;
  /** Per server: newest event creation time you have looked at (for the "НОВО" marker). */
  seenAt: Record<string, number>;
  board: { open: boolean; eventId: string | null; creating: boolean };
  toasts: EventToast[];
  reload: () => Promise<void>;
  upsert: (e: ServerEventDTO) => void;
  remove: (id: string) => void;
  markSeen: (serverId: string) => void;
  openBoard: (opts?: { eventId?: string | null; creating?: boolean }) => void;
  closeBoard: () => void;
  pushToast: (t: Omit<EventToast, "id">) => void;
  dismissToast: (id: string) => void;
}

let reloadTimer: ReturnType<typeof setTimeout> | null = null;

export const useEventsStore = create<EventsState>((set, get) => ({
  events: [],
  loaded: false,
  seenAt: loadSeen(),
  board: { open: false, eventId: null, creating: false },
  toasts: [],
  reload: async () => {
    const events = await fetchEvents();
    // First load on this device: everything that exists already counts as seen.
    if (!get().loaded && localStorage.getItem(SEEN_KEY) === null) {
      const seen: Record<string, number> = {};
      for (const e of events) seen[e.serverId] = Math.max(seen[e.serverId] ?? 0, Date.parse(e.createdAt));
      localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
      set({ seenAt: seen });
    }
    set({ events, loaded: true });
  },
  upsert: (e) =>
    set((s) => ({
      events: [...s.events.filter((x) => x.id !== e.id), e].sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    })),
  remove: (id) => set((s) => ({ events: s.events.filter((e) => e.id !== id) })),
  markSeen: (serverId) => {
    const newest = Math.max(0, ...get().events.filter((e) => e.serverId === serverId).map((e) => Date.parse(e.createdAt)));
    if (newest <= (get().seenAt[serverId] ?? 0)) return;
    const seenAt = { ...get().seenAt, [serverId]: newest };
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify(seenAt));
    } catch {
      // not fatal
    }
    set({ seenAt });
  },
  openBoard: (opts = {}) => set({ board: { open: true, eventId: opts.eventId ?? null, creating: !!opts.creating } }),
  closeBoard: () => set({ board: { open: false, eventId: null, creating: false } }),
  pushToast: (t) => {
    const id = `${t.kind}:${t.eventId}:${Date.now()}`;
    set((s) => ({ toasts: [...s.toasts.filter((x) => !(x.eventId === t.eventId && x.kind === t.kind)), { ...t, id }].slice(-4) }));
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** Coalesces a burst of "events changed" pushes into one refetch. */
export function scheduleEventsReload() {
  if (reloadTimer) clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => {
    reloadTimer = null;
    void useEventsStore.getState().reload().catch(console.error);
  }, 300);
}

// ---------------------------------------------------------------- helpers shared by the UI

export function isRunning(e: ServerEventDTO, now = Date.now()) {
  return Date.parse(e.startsAt) <= now && now < eventEndMs(e);
}

export function isEnded(e: ServerEventDTO, now = Date.now()) {
  return eventEndMs(e) <= now;
}

export function isToday(e: ServerEventDTO, now = Date.now()) {
  return new Date(e.startsAt).toDateString() === new Date(now).toDateString();
}

/** The event that deserves the "today" banner: one running now, else the next one today. */
export function todaysEvent(events: ServerEventDTO[], now = Date.now()): ServerEventDTO | null {
  return (
    events.find((e) => isRunning(e, now)) ??
    events.find((e) => isToday(e, now) && Date.parse(e.startsAt) > now) ??
    null
  );
}

export function upcomingOf(events: ServerEventDTO[], serverId: string | null, now = Date.now()) {
  return events.filter((e) => e.serverId === serverId && !isEnded(e, now));
}

export function countdown(e: ServerEventDTO, now = Date.now()): string {
  const start = Date.parse(e.startsAt);
  if (isEnded(e, now)) return "приключи";
  if (start <= now) return "тече сега";
  const mins = Math.ceil((start - now) / 60_000);
  if (mins < 60) return `след ${mins} мин`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `след ${hours}ч ${mins % 60}м`;
  const days = Math.round(hours / 24);
  return days === 1 ? "след 1 ден" : `след ${days} дни`;
}
