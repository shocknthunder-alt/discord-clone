import { create } from "zustand";

/**
 * Unseen @mentions per text channel (red number on the channel and on the server icon).
 * Kept per device in localStorage; cleared when you open the channel.
 */
const KEY = "mentionCounts";

interface Saved {
  counts: Record<string, number>;
  serverOf: Record<string, string>;
}

function load(): Saved {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Saved>;
    return { counts: s.counts ?? {}, serverOf: s.serverOf ?? {} };
  } catch {
    return { counts: {}, serverOf: {} };
  }
}

function save(s: Saved) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage blocked */
  }
}

interface MentionState extends Saved {
  add: (serverId: string, textChannelId: string) => void;
  clear: (textChannelId: string) => void;
}

export const useMentionStore = create<MentionState>((set, get) => ({
  ...load(),
  add: (serverId, textChannelId) => {
    const next = {
      counts: { ...get().counts, [textChannelId]: Math.min(99, (get().counts[textChannelId] ?? 0) + 1) },
      serverOf: { ...get().serverOf, [textChannelId]: serverId },
    };
    save(next);
    set(next);
  },
  clear: (textChannelId) => {
    if (!get().counts[textChannelId]) return;
    const counts = { ...get().counts };
    delete counts[textChannelId];
    const next = { counts, serverOf: get().serverOf };
    save(next);
    set({ counts });
  },
}));

export function serverMentionCount(s: Saved, serverId: string): number {
  let n = 0;
  for (const [ch, c] of Object.entries(s.counts)) if (s.serverOf[ch] === serverId) n += c;
  return n;
}
