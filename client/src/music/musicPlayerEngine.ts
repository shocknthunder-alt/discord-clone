import { useMusicStore } from "../store/musicStore";
import { loadYouTubeIframeApi, YT } from "../utils/youtubePlayerApi";

// A module-level singleton, not a React component's state: the UI that displays/controls
// this (MusicMiniPlayer) is mounted inside ChannelList and DmListPanel, which unmount each
// other when switching between the servers view and the DMs view. If the YT.Player instance
// lived inside that component instead, switching views would tear it down and restart
// playback from scratch. Owning it here means the audio keeps playing across navigation —
// only the (stateless) controls UI remounts.

const RESYNC_THRESHOLD_SECONDS = 2.5;
const RESYNC_INTERVAL_MS = 4000;

function extrapolatedPosition(state: { positionSeconds: number; isPlaying: boolean; updatedAt: number }): number {
  if (!state.isPlaying) return state.positionSeconds;
  return state.positionSeconds + (Date.now() - state.updatedAt) / 1000;
}

let player: YT.Player | null = null;
let loadedVideoId: string | null = null;
let unmuted = false;
let initPromise: Promise<void> | null = null;

function applyState() {
  const state = useMusicStore.getState().state;
  if (!player || !state) return;
  const currentItem = state.currentIndex < state.queue.length ? state.queue[state.currentIndex] : null;

  if (!currentItem) {
    loadedVideoId = null;
    player.pauseVideo();
    return;
  }

  const expected = extrapolatedPosition(state);

  if (loadedVideoId !== currentItem.videoId) {
    loadedVideoId = currentItem.videoId;
    player.loadVideoById(currentItem.videoId, Math.max(0, expected));
    if (!state.isPlaying) {
      // loadVideoById always starts playing — pause right back if the server says paused
      // (e.g. a video someone queued while playback was paused).
      setTimeout(() => player?.pauseVideo(), 300);
    }
    return;
  }

  if (state.isPlaying) player.playVideo();
  else player.pauseVideo();
}

export function initMusicPlayerEngine(): Promise<void> {
  if (initPromise) return initPromise;

  initPromise = loadYouTubeIframeApi().then((YTApi) => {
    // Audio only, by design — off-screen rather than display:none, since some browsers
    // throttle/pause players that are fully removed from layout.
    const container = document.createElement("div");
    container.style.position = "fixed";
    container.style.left = "-9999px";
    container.style.top = "-9999px";
    container.style.width = "1px";
    container.style.height = "1px";
    document.body.appendChild(container);

    player = new YTApi.Player(container, {
      playerVars: { playsinline: 1, mute: 1 },
      events: {
        onReady: () => {
          if (unmuted) player?.unMute();
          applyState();
        },
      },
    });
  });

  useMusicStore.subscribe((state, prevState) => {
    if (state.state !== prevState.state) applyState();
  });

  // Network latency and position-extrapolation both drift over a long playback that a
  // one-time seek on state change wouldn't catch.
  setInterval(() => {
    const state = useMusicStore.getState().state;
    if (!player || !state?.isPlaying) return;
    const expected = extrapolatedPosition(state);
    const actual = player.getCurrentTime();
    if (Math.abs(actual - expected) > RESYNC_THRESHOLD_SECONDS) {
      player.seekTo(expected, true);
    }
  }, RESYNC_INTERVAL_MS);

  return initPromise;
}

// Browsers block unmuted autoplay unless it's tied to a direct user gesture, and playback
// here is driven by server state arriving over a socket — never a gesture by the time it
// reaches the player. Call this from inside a real click/submit handler to unlock audio for
// the rest of the session.
export function unlockMusicAudio() {
  if (unmuted) return;
  unmuted = true;
  player?.unMute();
}

export function setMusicVolume(volume: number) {
  player?.setVolume(volume);
}

export function getMusicCurrentTime(): number {
  return player?.getCurrentTime() ?? 0;
}
