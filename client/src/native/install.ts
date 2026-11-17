import { create } from "zustand";

/** "Инсталирай" for the site (PWA): Chrome/Edge hand us a prompt event we can fire from a button. */

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface InstallState {
  prompt: InstallPromptEvent | null;
  installed: boolean;
}

export const useInstallStore = create<InstallState>(() => ({ prompt: null, installed: false }));

/** Call once at start-up (the event fires early). */
export function captureInstallPrompt() {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    useInstallStore.setState({ prompt: e as InstallPromptEvent });
  });
  window.addEventListener("appinstalled", () => useInstallStore.setState({ prompt: null, installed: true }));
}

export async function promptInstall(): Promise<boolean> {
  const p = useInstallStore.getState().prompt;
  if (!p) return false;
  await p.prompt();
  const { outcome } = await p.userChoice;
  useInstallStore.setState({ prompt: null, installed: outcome === "accepted" });
  return outcome === "accepted";
}
