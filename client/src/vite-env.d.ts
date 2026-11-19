/// <reference types="vite/client" />

declare const __BUILD_ID__: string;

interface Window {
  /** Present only inside the Electron desktop app (see desktop/preload.js). */
  shmirkaDesktop?: {
    /** 1.10.0+: global key events include the extra mouse buttons. */
    mouseButtons?: boolean;
    isDesktop: true;
    /** System-wide key events (works while a game has focus). Returns an unsubscribe function. */
    getScreenSources(): Promise<DesktopScreenSource[]>;
    /** "native" = the shell streams per-app audio (see onAppAudio); "loopback" = system audio rides on the video; older shells return undefined. */
    selectScreenSource(id: string, audio: boolean): Promise<"native" | "loopback" | "none" | undefined>;
    onAppAudio(cb: (pcm: Uint8Array) => void): () => void;
    stopAppAudio(): void;
    onGlobalKey(cb: (code: string, down: boolean) => void): () => void;
    /** Desktop 1.7.0+: someone watching our stream may control this PC (after we allowed it). */
    remoteControl?: {
      start(name: string): Promise<{ ok: boolean }>;
      input(ev: import("@discord-clone/shared").ControlInputEvent): void;
      stop(): void;
      onStopped(cb: (reason: string) => void): () => void;
    };
    /** Desktop 1.5.0+: close and reopen the app. */
    relaunch?(): void;
    /** Desktop 1.5.2+: window.open pop-outs (streams) open as app windows. */
    popOutWindows?: boolean;
    /** Desktop 1.6.0+: self-update. */
    getVersion?(): Promise<string>;
    onUpdateReady?(cb: (version: string) => void): () => void;
    installUpdate?(): void;
    /** Desktop 1.8.0+: seconds since the last keyboard/mouse input anywhere in Windows. */
    getSystemIdleSeconds?(): Promise<number>;
    /** Desktop 1.8.0+: in-game overlay (who's talking + messages), see DesktopOverlayFeed. */
    overlay?: { update(state: unknown): void };
    /** Desktop 1.9.0+: cb({ name }) when the detected game changes (null = none). Returns an unsubscribe. */
    onActivity?(cb: (activity: { name: string; icon?: string | null } | null) => void): () => void;
  };
}

interface DesktopScreenSource {
  id: string;
  name: string;
  isScreen: boolean;
  thumbnail: string;
  icon: string | null;
}
