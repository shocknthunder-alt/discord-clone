import { create } from "zustand";

/**
 * Which screen shares the viewer has closed. Every stream in the call is shown automatically;
 * "Stop Watching" hides one until the viewer clicks Watch again (or that share ends and a new one
 * starts — the voice panel forgets ids whose stream is gone).
 */
interface WatchState {
  hidden: Set<string>; // peer socket ids
  hide: (socketId: string) => void;
  show: (socketId: string) => void;
  /** Drops ids that no longer have a live stream, so a fresh share auto-shows again. */
  prune: (liveSocketIds: Set<string>) => void;
}

export const useWatchStore = create<WatchState>((set) => ({
  hidden: new Set(),
  hide: (socketId) =>
    set((s) => {
      const hidden = new Set(s.hidden);
      hidden.add(socketId);
      return { hidden };
    }),
  show: (socketId) =>
    set((s) => {
      if (!s.hidden.has(socketId)) return s;
      const hidden = new Set(s.hidden);
      hidden.delete(socketId);
      return { hidden };
    }),
  prune: (live) =>
    set((s) => {
      const kept = [...s.hidden].filter((id) => live.has(id));
      return kept.length === s.hidden.size ? s : { hidden: new Set(kept) };
    }),
}));
