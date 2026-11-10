/// <reference types="vite/client" />

declare const __BUILD_ID__: string;

interface Window {
  /** Present only inside the Electron desktop app (see desktop/preload.js). */
  shmirkaDesktop?: {
    isDesktop: true;
    /** System-wide key events (works while a game has focus). Returns an unsubscribe function. */
    getScreenSources(): Promise<DesktopScreenSource[]>;
    selectScreenSource(id: string, audio: boolean): Promise<void>;
    onGlobalKey(cb: (code: string, down: boolean) => void): () => void;
  };
}

interface DesktopScreenSource {
  id: string;
  name: string;
  isScreen: boolean;
  thumbnail: string;
  icon: string | null;
}
