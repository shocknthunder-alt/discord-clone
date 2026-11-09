import type { MusicState } from "@discord-clone/shared";
import { create } from "zustand";

interface MusicStoreState {
  state: MusicState | null;
  setState: (state: MusicState | null) => void;
  // True while a song is playing but the player is still muted because no click/keypress has
  // happened yet to satisfy the browser's autoplay policy.
  audioLocked: boolean;
  setAudioLocked: (locked: boolean) => void;
  addError: string | null;
  setAddError: (addError: string | null) => void;
}

export const useMusicStore = create<MusicStoreState>((set) => ({
  state: null,
  setState: (state) => set({ state }),
  audioLocked: false,
  setAudioLocked: (audioLocked) => set({ audioLocked }),
  addError: null,
  setAddError: (addError) => set({ addError }),
}));
