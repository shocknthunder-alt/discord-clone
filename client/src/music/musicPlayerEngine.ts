import { SocketEvents } from "@discord-clone/shared";
import { getSocket } from "../socket/socket";
import { useMusicStore } from "../store/musicStore";
import { useVoiceStore } from "../store/voiceStore";
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
// Tracked by queue item id, not video id — the same song queued twice in a row is two
// items with one videoId, and keying on videoId would never reload the second one.
let loadedItemId: string | null = null;
let unmuted = false;
let volume = 70;
let initPromise: Promise<void> | null = null;

function applyState() {
  const state = useMusicStore.getState().state;
  if (!player || !state) return;
  const currentItem = state.currentIndex < state.queue.length ? state.queue[state.currentIndex] : null;

  if (!currentItem) {
    loadedItemId = null;
    player.pauseVideo();
    return;
  }

  const expected = extrapolatedPosition(state);

  if (loadedItemId !== currentItem.id) {
    loadedItemId = currentItem.id;
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

  // The first click/keypress ANYWHERE unlocks audio — previously only clicks inside the
  // music controls did, so a listener who never touched them heard nothing (the player
  // stayed muted) until they pressed play/pause themselves.
  const unlockOnFirstGesture = () => {
    unlockMusicAudio();
    document.removeEventListener("pointerdown", unlockOnFirstGesture, true);
    document.removeEventListener("keydown", unlockOnFirstGesture, true);
  };
  document.addEventListener("pointerdown", unlockOnFirstGesture, true);
  document.addEventListener("keydown", unlockOnFirstGesture, true);

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
          player?.setVolume(volume);
          applyState();
        },
        onStateChange: (e) => {
          if (e.data === YTApi.PlayerState.PLAYING) {
            // Re-assert on every start: an unMute sent before the video was really playing
            // can be dropped, and a track that starts while locked needs to tell the UI.
            if (unmuted) player?.unMute();
            player?.setVolume(volume);
            useMusicStore.getState().setAudioLocked(!unmuted);
          }
          if (e.data !== YTApi.PlayerState.ENDED) return;
          // Without this nothing ever advanced the queue: the song ended, then the next
          // server-state update (or the drift correction below seeking past the end) just
          // restarted it — the "loops the same song and eventually freezes" behavior.
          const state = useMusicStore.getState().state;
          const voiceChannelId = useVoiceStore.getState().activeVoiceChannelId;
          const current = state?.queue[state.currentIndex];
          if (!voiceChannelId || !current) return;
          getSocket()?.emit(SocketEvents.MusicEnded, { voiceChannelId, itemId: current.id });
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
    // Only correct drift while actually playing — seeking an ended/paused/cued player
    // (e.g. waiting on the server to advance the queue) would restart it.
    const playerState = player.getPlayerState();
    if (playerState !== YT.PlayerState.PLAYING && playerState !== YT.PlayerState.BUFFERING) return;
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
  player?.setVolume(volume);
  useMusicStore.getState().setAudioLocked(false);
}

export function setMusicVolume(next: number) {
  volume = next;
  player?.setVolume(next);
}

export function getMusicCurrentTime(): number {
  return player?.getCurrentTime() ?? 0;
}
