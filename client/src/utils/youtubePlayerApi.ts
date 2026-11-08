// Loads the YouTube IFrame Player API script exactly once, however many components ask
// for it — the script itself is a global singleton (it calls a single global callback and
// exposes window.YT), so wrapping the loading in a shared promise avoids racing duplicate
// <script> tags or missed-callback bugs if two players mount around the same time.
let apiPromise: Promise<typeof YT> | null = null;

export function loadYouTubeIframeApi(): Promise<typeof YT> {
  if (apiPromise) return apiPromise;

  apiPromise = new Promise((resolve) => {
    if (window.YT && window.YT.Player) {
      resolve(window.YT);
      return;
    }

    const previousCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousCallback?.();
      resolve(window.YT);
    };

    const existing = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
    if (!existing) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(script);
    }
  });

  return apiPromise;
}

declare global {
  interface Window {
    YT: typeof YT;
    onYouTubeIframeAPIReady?: () => void;
  }
}

// Minimal surface of the YouTube IFrame Player API actually used — the full type surface
// isn't published as an npm package worth adding as a dependency for this.
export namespace YT {
  export interface Player {
    playVideo(): void;
    pauseVideo(): void;
    seekTo(seconds: number, allowSeekAhead: boolean): void;
    loadVideoById(videoId: string, startSeconds?: number): void;
    cueVideoById(videoId: string, startSeconds?: number): void;
    getCurrentTime(): number;
    getPlayerState(): number;
    setVolume(volume: number): void;
    mute(): void;
    unMute(): void;
    destroy(): void;
  }

  export interface PlayerEvent {
    target: Player;
  }

  export interface OnStateChangeEvent extends PlayerEvent {
    data: number;
  }

  export const PlayerState = {
    ENDED: 0,
    PLAYING: 1,
    PAUSED: 2,
    BUFFERING: 3,
    CUED: 5,
  } as const;

  export declare class Player {
    constructor(
      elementId: string | HTMLElement,
      options: {
        videoId?: string;
        playerVars?: Record<string, unknown>;
        events?: {
          onReady?: (e: PlayerEvent) => void;
          onStateChange?: (e: OnStateChangeEvent) => void;
        };
      },
    );
  }
}
