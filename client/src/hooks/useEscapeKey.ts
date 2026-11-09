import { useEffect } from "react";

// Calls onEscape when Escape is pressed while the calling component is mounted — used by
// modals so they close from the keyboard like every other dialog.
export function useEscapeKey(onEscape: () => void) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onEscape();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onEscape]);
}
