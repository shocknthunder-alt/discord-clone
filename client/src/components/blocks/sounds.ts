import type { GameEvent } from "./engine";

// 🧱 Short synthesized blips for Шметрис (WebAudio, no files). Quiet on purpose — people are
// usually in voice at the same time.

let ctx: AudioContext | null = null;
function ac(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, ms: number, { type = "square", vol = 0.05, at = 0, slide = 0 }: { type?: OscillatorType; vol?: number; at?: number; slide?: number } = {}) {
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime + at / 1000;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + ms / 1000);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + ms / 1000);
  o.connect(g).connect(a.destination);
  o.start(t0);
  o.stop(t0 + ms / 1000 + 0.02);
}

export function blockSound(e: GameEvent) {
  switch (e.kind) {
    case "move":
      tone(520, 25, { vol: 0.015, type: "triangle" });
      break;
    case "rotate":
      tone(760, 40, { vol: 0.025, type: "triangle", slide: 120 });
      break;
    case "hold":
      tone(420, 70, { vol: 0.03, type: "sine", slide: 200 });
      break;
    case "lock":
      tone(140, 70, { vol: 0.05, type: "triangle", slide: -60 });
      break;
    case "harddrop":
      tone(220, 90, { vol: 0.05, type: "sawtooth", slide: -150 });
      break;
    case "clear": {
      if (!e.lines) {
        tone(660, 120, { vol: 0.04, type: "triangle" });
        break;
      }
      const base = [0, 523, 587, 659, 784][e.lines] ?? 523;
      const notes = e.lines === 4 ? [base, base * 1.25, base * 1.5, base * 2] : [base, base * 1.5];
      notes.forEach((f, i) => tone(f, 120, { vol: 0.045, type: "square", at: i * 70 }));
      break;
    }
    case "level":
      [523, 659, 784, 1046].forEach((f, i) => tone(f, 110, { vol: 0.04, type: "triangle", at: 260 + i * 80 }));
      break;
    case "over":
      [392, 330, 262, 196].forEach((f, i) => tone(f, 200, { vol: 0.05, type: "sawtooth", at: i * 160 }));
      break;
  }
}
