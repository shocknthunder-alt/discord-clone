import { create } from "zustand";
import type { TextChannelDTO } from "@discord-clone/shared";

/**
 * Unread markers for text channels. Both sides of the comparison are SERVER timestamps (the
 * newest message time vs. the newest message time you had seen), so a wrong clock on this PC
 * can't hide or invent unread messages. "Seen" is remembered per device in localStorage.
 */
const KEY = "channelLastRead";

function loadSeen(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, number>;
  } catch {
    return {};
  }
}

function saveSeen(seen: Record<string, number>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(seen));
  } catch {
    // storage full/blocked — markers just won't survive a reload
  }
}

interface UnreadState {
  /** Newest message time per channel (ms, server clock). */
  latest: Record<string, number>;
  /** Newest message time you had seen per channel (ms, server clock). */
  seen: Record<string, number>;
  /** From the channel list: channels never seen before start as read (no flood on first run). */
  setFromChannels: (channels: TextChannelDTO[]) => void;
  /** Someone posted somewhere. */
  activity: (textChannelId: string, createdAt: string, mine: boolean) => void;
  markRead: (textChannelId: string) => void;
}

export const useUnreadStore = create<UnreadState>((set, get) => ({
  latest: {},
  seen: loadSeen(),
  setFromChannels: (channels) => {
    const latest = { ...get().latest };
    const seen = { ...get().seen };
    let seenChanged = false;
    for (const c of channels) {
      const t = c.lastMessageAt ? Date.parse(c.lastMessageAt) : 0;
      latest[c.id] = Math.max(latest[c.id] ?? 0, t);
      if (seen[c.id] === undefined) {
        seen[c.id] = latest[c.id];
        seenChanged = true;
      }
    }
    if (seenChanged) saveSeen(seen);
    set({ latest, seen });
  },
  activity: (textChannelId, createdAt, mine) => {
    const t = Date.parse(createdAt);
    const latest = { ...get().latest, [textChannelId]: Math.max(get().latest[textChannelId] ?? 0, t) };
    if (mine) {
      const seen = { ...get().seen, [textChannelId]: latest[textChannelId] };
      saveSeen(seen);
      set({ latest, seen });
    } else {
      set({ latest });
    }
  },
  markRead: (textChannelId) => {
    const { latest, seen } = get();
    const t = latest[textChannelId] ?? 0;
    if ((seen[textChannelId] ?? -1) >= t) return;
    const next = { ...seen, [textChannelId]: t };
    saveSeen(next);
    set({ seen: next });
  },
}));

export function isChannelUnread(state: Pick<UnreadState, "latest" | "seen">, textChannelId: string): boolean {
  return (state.latest[textChannelId] ?? 0) > (state.seen[textChannelId] ?? 0);
}
