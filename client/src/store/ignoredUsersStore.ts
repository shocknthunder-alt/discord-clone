import { create } from "zustand";

const STORAGE_KEY = "ignoredUserIds";

function load(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function persist(ids: Set<string>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(ids)));
}

interface IgnoredUsersState {
  ignoredUserIds: Set<string>;
  isIgnored: (userId: string) => boolean;
  toggleIgnore: (userId: string) => void;
}

// Local-only, per-browser — there's no server-side block/mute concept, this just hides a
// user's messages from your own view everywhere they're rendered.
export const useIgnoredUsersStore = create<IgnoredUsersState>((set, get) => ({
  ignoredUserIds: load(),
  isIgnored: (userId) => get().ignoredUserIds.has(userId),
  toggleIgnore: (userId) =>
    set((s) => {
      const next = new Set(s.ignoredUserIds);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      persist(next);
      return { ignoredUserIds: next };
    }),
}));
