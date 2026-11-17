import { useEffect, useState } from "react";
import { create } from "zustand";

/**
 * 📱 Phone layout: two screens instead of side-by-side columns —
 *   "nav"     = server icons + channel list (or DM list)
 *   "content" = the chat / voice view, full width, with a ☰ button back.
 * Going to "content" adds a history entry, so the phone's Back button returns to the list
 * instead of leaving the app.
 */

const QUERY = "(max-width: 760px)";

export function isMobileLayout(): boolean {
  return typeof window !== "undefined" && window.matchMedia(QUERY).matches;
}

export function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(isMobileLayout);
  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const on = () => setMobile(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return mobile;
}

interface MobileState {
  pane: "nav" | "content";
  showContent: () => void;
  showNav: () => void;
}

let pushedEntry = false;

export const useMobileStore = create<MobileState>((set, get) => ({
  pane: "nav",
  showContent: () => {
    if (get().pane === "content") return;
    if (isMobileLayout() && !pushedEntry) {
      window.history.pushState({ ...(window.history.state ?? {}), shmirkaPane: "content" }, "");
      pushedEntry = true;
    }
    set({ pane: "content" });
  },
  showNav: () => {
    if (get().pane === "nav") return;
    if (pushedEntry) {
      pushedEntry = false;
      window.history.back(); // popstate below finishes the job
      return;
    }
    set({ pane: "nav" });
  },
}));

if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    if (pushedEntry && window.history.state?.shmirkaPane === "content") return;
    pushedEntry = false;
    if (useMobileStore.getState().pane === "content") useMobileStore.setState({ pane: "nav" });
  });
}
