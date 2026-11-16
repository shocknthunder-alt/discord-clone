import { getAppPrefs } from "./appPrefs";

// Served from client/public/sounds — Vite serves anything under public/ as-is at the root path.
function play(url: string) {
  const audio = new Audio(url);
  audio.volume = 0.25;
  // Autoplay can still be blocked in edge cases (e.g. a fresh tab that never had any
  // interaction at all) — failing silently beats throwing an unhandled rejection over a
  // notification sound.
  audio.play().catch(() => {});
}

export function playVoiceJoinSound() {
  if (!getAppPrefs().joinSound) return;
  play("/sounds/voice-join.mp3");
}

let ctx: AudioContext | null = null;
/** A short two-note "ding" for @mentions (synthesised — no sound file needed). */
export function playMentionSound() {
  if (!getAppPrefs().mentionAlerts) return;
  try {
    ctx ??= new AudioContext();
    const c = ctx;
    void c.resume().catch(() => {});
    const t0 = c.currentTime + 0.01;
    for (const [i, freq] of [880, 1318.5].entries()) {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = t0 + i * 0.11;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.12, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.28);
      osc.connect(gain).connect(c.destination);
      osc.start(start);
      osc.stop(start + 0.3);
    }
  } catch {
    /* no audio */
  }
}
