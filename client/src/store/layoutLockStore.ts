import { create } from "zustand";

const STORAGE_KEY = "layoutLocked";

function loadLocked(): boolean {
  const stored = localStorage.getItem(STORAGE_KEY);
  // Locked by default for anyone who hasn't explicitly unlocked before — accidentally
  // dragging an icon shouldn't be the default experience on a fresh session.
  if (stored === null) return true;
  return stored === "true";
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
