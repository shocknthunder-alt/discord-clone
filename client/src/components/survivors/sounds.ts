import { bell, noise, tone } from "../blocks/sounds";
import type { WeaponId } from "./content";

// 🧟 Шмиркленд sound effects — synthesized (no files), through the same graph as the other games.
// Lots of things happen at once, so every sound has a minimum gap and the XP pickups climb a scale.

let vol = 1;
const last = new Map<string, number>();
function gap(key: string, ms: number) {
  const now = performance.now();
  if ((last.get(key) ?? 0) + ms > now) return false;
  last.set(key, now);
  return true;
}

// pentatonic pickups that climb while you keep collecting
const SCALE = [659.25, 739.99, 830.61, 987.77, 1108.73, 1318.51, 1479.98, 1661.22, 1975.53];
let pickStep = 0;
let pickAt = 0;

export const survSound = {
  setVolume(v: number) {
    vol = Math.max(0, Math.min(1, v));
  },
  get volume() {
    return vol;
  },
  gem() {
    if (!vol || !gap("gem", 45)) return;
    const now = performance.now();
    pickStep = now - pickAt < 600 ? Math.min(SCALE.length - 1, pickStep + 1) : 0;
    pickAt = now;
    tone(SCALE[pickStep]!, 70, { type: "sine", vol: 0.025 * vol });
  },
  coin() {
    if (!vol || !gap("coin", 60)) return;
    tone(1568, 60, { type: "square", vol: 0.018 * vol });
    tone(2093, 120, { type: "square", vol: 0.018 * vol, at: 60 });
  },
  food() {
    if (!vol) return;
    [523.25, 659.25, 783.99].forEach((f, i) => tone(f, 120, { type: "triangle", vol: 0.04 * vol, at: i * 70 }));
  },
  kill() {
    if (!vol || !gap("kill", 55)) return;
    tone(180 + Math.random() * 120, 80, { type: "triangle", vol: 0.03 * vol, slide: -90 });
    noise(50, { vol: 0.02 * vol, type: "bandpass", freq: 1400, q: 1 });
  },
  hurt() {
    if (!vol || !gap("hurt", 200)) return;
    tone(220, 160, { type: "sawtooth", vol: 0.045 * vol, slide: -120 });
    noise(120, { vol: 0.04 * vol, type: "lowpass", freq: 900 });
  },
  fire(id: WeaponId) {
    if (!vol || !gap(`w:${id}`, 120)) return;
    const v = vol;
    switch (id) {
      case "tsarvul":
        noise(160, { vol: 0.025 * v, type: "bandpass", freq: 700, freqTo: 1600, q: 2 });
        break;
      case "prase":
        // oink!
        tone(330, 90, { type: "sawtooth", vol: 0.03 * v, slide: 120 });
        tone(400, 120, { type: "sawtooth", vol: 0.03 * v, at: 90, slide: -150 });
        break;
      case "tesla":
        noise(140, { vol: 0.04 * v, type: "highpass", freq: 3500 });
        tone(90, 140, { type: "square", vol: 0.02 * v, slide: 400 });
        break;
      case "kobilitsa":
        noise(300, { vol: 0.02 * v, type: "bandpass", freq: 500, freqTo: 900, q: 1.5 });
        break;
      case "gaida":
        // a short drone with the chanter on top
        tone(146.83, 380, { type: "sawtooth", vol: 0.018 * v });
        tone(587.33, 300, { type: "sawtooth", vol: 0.014 * v, at: 40, slide: 40 });
        break;
      case "banitsa":
      case "rakia":
        noise(120, { vol: 0.02 * v, type: "bandpass", freq: 1200, freqTo: 600, q: 1.2 });
        break;
      case "martenitsa":
        bell(1318.51, 140, 0.012 * v, 0);
        break;
      case "pishtov":
        noise(110, { vol: 0.05 * v, type: "lowpass", freq: 2400, freqTo: 300 });
        tone(140, 80, { type: "square", vol: 0.025 * v, slide: -80 });
        break;
      case "chesan":
        break;
    }
  },
  boom(big = false) {
    if (!vol || !gap("boom", 90)) return;
    tone(big ? 70 : 110, big ? 700 : 260, { type: "sine", vol: (big ? 0.16 : 0.06) * vol, slide: -60 });
    noise(big ? 900 : 260, { vol: (big ? 0.1 : 0.04) * vol, type: "lowpass", freq: 1600, freqTo: 120 });
  },
  zap() {
    if (!vol || !gap("zap", 70)) return;
    noise(90, { vol: 0.035 * vol, type: "highpass", freq: 4500 });
  },
  level() {
    if (!vol) return;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, i === 3 ? 360 : 110, { type: "square", vol: 0.03 * vol, at: i * 85, send: 0.3 }));
  },
  chest() {
    if (!vol) return;
    [392, 523.25, 659.25, 783.99, 1046.5, 1318.51].forEach((f, i) => bell(f, 500, 0.03 * vol, i * 90));
  },
  evolve() {
    if (!vol) return;
    [261.63, 329.63, 392, 523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      tone(f, 260, { type: "sawtooth", vol: 0.02 * vol, at: i * 70, send: 0.4 });
      bell(f * 2, 400, 0.02 * vol, i * 70);
    });
  },
  boss() {
    if (!vol) return;
    // a low horn, twice
    for (const at of [0, 600]) {
      tone(98, 520, { type: "sawtooth", vol: 0.05 * vol, at, attack: 0.08 });
      tone(146.83, 520, { type: "sawtooth", vol: 0.03 * vol, at, attack: 0.08 });
    }
  },
  event() {
    if (!vol) return;
    bell(880, 400, 0.04 * vol, 0);
    bell(1174.66, 500, 0.04 * vol, 160);
  },
  dash() {
    if (!vol) return;
    noise(180, { vol: 0.035 * vol, type: "bandpass", freq: 1200, freqTo: 4000, q: 1.5 });
  },
  skill() {
    if (!vol) return;
    [392, 587.33, 783.99, 1174.66].forEach((f, i) => tone(f, 200, { type: "triangle", vol: 0.04 * vol, at: i * 50, send: 0.4 }));
    noise(400, { vol: 0.03 * vol, type: "highpass", freq: 3000, at: 100 });
  },
  down() {
    if (!vol) return;
    [392, 349.23, 311.13, 261.63].forEach((f, i) => tone(f, 260, { type: "triangle", vol: 0.05 * vol, at: i * 180 }));
  },
  revive() {
    if (!vol) return;
    [261.63, 392, 523.25, 783.99].forEach((f, i) => bell(f, 400, 0.03 * vol, i * 80));
  },
};
