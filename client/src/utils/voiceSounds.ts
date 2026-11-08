// Served from client/public/sounds — Vite serves anything under public/ as-is at the root path.
const JOIN_LEAVE_SOUND_URL = "/sounds/voice-join-leave.mp3";

export function playVoiceJoinLeaveSound() {
  const audio = new Audio(JOIN_LEAVE_SOUND_URL);
  audio.volume = 0.5;
  // Autoplay can still be blocked in edge cases (e.g. a fresh tab that never had any
  // interaction at all) — failing silently beats throwing an unhandled rejection over a
  // notification sound.
  audio.play().catch(() => {});
}
