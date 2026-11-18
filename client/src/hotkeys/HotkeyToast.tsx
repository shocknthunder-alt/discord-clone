import { useEffect } from "react";
import { create } from "zustand";

/** "🔇 Микрофонът е заглушен" for a moment after a hotkey, so you know it worked. */
const useToast = create<{ text: string | null; n: number; show: (t: string) => void; hide: () => void }>((set, get) => ({
  text: null,
  n: 0,
  show: (text) => set({ text, n: get().n + 1 }),
  hide: () => set({ text: null }),
}));

export function showHotkeyToast(text: string) {
  useToast.getState().show(text);
}

export default function HotkeyToast() {
  const text = useToast((s) => s.text);
  const n = useToast((s) => s.n);
  useEffect(() => {
    if (!text) return;
    const t = setTimeout(() => useToast.getState().hide(), 1600);
    return () => clearTimeout(t);
  }, [text, n]);
  if (!text) return null;
  return (
    <div className="hotkey-toast" key={n} role="status">
      {text}
    </div>
  );
}
