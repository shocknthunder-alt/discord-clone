/// <reference types="vite/client" />

declare const __BUILD_ID__: string;

interface Window {
  /** Present only inside the Electron desktop app (see desktop/preload.js). */
  shmirkaDesktop?: {
    isDesktop: true;
    /** System-wide key events (works while a game has focus). Returns an unsubscribe function. */
    getScreenSources(): Promise<DesktopScreenSource[]>;
    /** "native" = the shell streams per-app audio (see onAppAudio); "loopback" = system audio rides on the video; older shells return undefined. */
    selectScreenSource(id: string, audio: boolean): Promise<"native" | "loopback" | "none" | undefined>;
    onAppAudio(cb: (pcm: Uint8Array) => void): () => void;
    stopAppAudio(): void;
    onGlobalKey(cb: (code: string, down: boolean) => void): () => void;
    /** Desktop 1.5.0+: close and reopen the app. */
    relaunch?(): void;
    /** Desktop 1.5.2+: window.open pop-outs (streams) open as app windows. */
    popOutWindows?: boolean;
  };
}

interface DesktopScreenSource {
  id: string;
  name: string;
  isScreen: boolean;
  thumbnail: string;
  icon: string | null;
}
