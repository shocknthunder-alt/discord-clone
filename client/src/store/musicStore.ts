import type { MusicState } from "@discord-clone/shared";
import { create } from "zustand";

interface MusicStoreState {
  state: MusicState | null;
  setState: (state: MusicState | null) => void;
  addError: string | null;
  setAddError: (addError: string | null) => void;
}

export const useMusicStore = create<MusicStoreState>((set) => ({
  state: null,
  setState: (state) => set({ state }),
  addError: null,
  setAddError: (addError) => set({ addError }),
}));
