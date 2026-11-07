import { create } from "zustand";

const STORAGE_KEY = "layoutLocked";

function loadLocked(): boolean {
  return localStorage.getItem(STORAGE_KEY) === "true";
}

interface LayoutLockState {
  locked: boolean;
  toggleLocked: () => void;
}

export const useLayoutLockStore = create<LayoutLockState>((set) => ({
  locked: loadLocked(),
  toggleLocked: () =>
    set((s) => {
      const next = !s.locked;
      localStorage.setItem(STORAGE_KEY, String(next));
      return { locked: next };
    }),
}));
