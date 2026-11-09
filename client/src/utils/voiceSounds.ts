// Served from client/public/sounds — Vite serves anything under public/ as-is at the root path.
function play(url: string) {
  const audio = new Audio(url);
  audio.volume = 0.5;
  // Autoplay can still be blocked in edge cases (e.g. a fresh tab that never had any
  // interaction at all) — failing silently beats throwing an unhandled rejection over a
  // notification sound.
  audio.play().catch(() => {});
}

export function playVoiceJoinSound() {
  play("/sounds/voice-join.mp3");
}

export function playVoiceLeaveSound() {
  play("/sounds/voice-leave.mp3");
}
