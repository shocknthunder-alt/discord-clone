import { getAppPrefs } from "./appPrefs";
import { useVoiceStore } from "../store/voiceStore";

// Served from client/public/sounds — Vite serves anything under public/ as-is at the root path.
function play(url: string, volume = 0.25) {
  const audio = new Audio(url);
  audio.volume = volume;
  // Autoplay can still be blocked in edge cases (e.g. a fresh tab that never had any
  // interaction at all) — failing silently beats throwing an unhandled rejection over a
  // notification sound.
  audio.play().catch(() => {});
}

const TRR = "/sounds/trr.mp3";

/** Someone else joined my voice channel. */
export function playVoiceJoinSound() {
  if (!getAppPrefs().joinSound) return;
  play("/sounds/voice-join.mp3");
}

/** I joined a voice channel ("Trr"). */
export function playSelfJoinSound() {
  if (!getAppPrefs().selfJoinSound) return;
  play(TRR);
}

let lastNotify = 0;
/**
 * "Trr" for a new message / notification. At most one every 1.5 s (a burst of messages
 * is one sound), and silent while deafened.
 */
export function playNotifySound() {
  if (!getAppPrefs().notifySound) return;
  if (useVoiceStore.getState().isDeafened) return;
  const now = Date.now();
  if (now - lastNotify < 1500) return;
  lastNotify = now;
  play(TRR);
}

/** @mentions: the same "Trr" (only when mention alerts are on). */
export function playMentionSound() {
  if (!getAppPrefs().mentionAlerts) return;
  playNotifySound();
}
