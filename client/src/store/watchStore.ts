import { create } from "zustand";

/** Key for your own screen share (peers are keyed by socket id). */
export const SELF_STREAM_KEY = "self";

/**
 * Which screen shares the viewer chose to watch. Nothing is shown or heard by default — a
 * stream is only downloaded after a click on Watch (see watchStream in useVoiceChannel). Ids
 * whose share ended are forgotten, so a new share needs a new click.
 */
interface WatchState {
  watching: Set<string>; // peer socket ids (+ SELF_STREAM_KEY for your own preview)
  watch: (key: string) => void;
  unwatch: (key: string) => void;
  /** Drops ids that no longer have a live share. */
  prune: (liveKeys: Set<string>) => void;
  clear: () => void;
  /** Cameras the viewer enlarged into the middle (same keys: socket id or SELF_STREAM_KEY). */
  bigCams: Set<string>;
  toggleCam: (key: string) => void;
  /** Drops enlarged cameras whose camera was turned off. */
  pruneCams: (liveKeys: Set<string>) => void;
}

export const useWatchStore = create<WatchState>((set) => ({
  watching: new Set(),
  watch: (key) =>
    set((s) => {
      if (s.watching.has(key)) return s;
      const watching = new Set(s.watching);
      watching.add(key);
      return { watching };
    }),
  unwatch: (key) =>
    set((s) => {
      if (!s.watching.has(key)) return s;
      const watching = new Set(s.watching);
      watching.delete(key);
      return { watching };
    }),
  prune: (live) =>
    set((s) => {
      const kept = [...s.watching].filter((k) => live.has(k));
      return kept.length === s.watching.size ? s : { watching: new Set(kept) };
    }),
  clear: () => set({ watching: new Set(), bigCams: new Set() }),
  bigCams: new Set(),
  toggleCam: (key) =>
    set((s) => {
      const bigCams = new Set(s.bigCams);
      if (bigCams.has(key)) bigCams.delete(key);
      else bigCams.add(key);
      return { bigCams };
    }),
  pruneCams: (live) =>
    set((s) => {
      const kept = [...s.bigCams].filter((k) => live.has(k));
      return kept.length === s.bigCams.size ? s : { bigCams: new Set(kept) };
    }),
}));
