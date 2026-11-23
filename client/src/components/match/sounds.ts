import { bell, noise, tone } from "../blocks/sounds";

// 🍬 Шмиксер sound effects — synthesized (no files), through the same graph as Шметрис.

// C major pentatonic, climbing with every cascade: do re mi sol la do…
const SCALE = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98, 1760, 2093];

export const matchSound = {
  select() {
    tone(880, 50, { type: "sine", vol: 0.03 });
  },
  swap() {
    tone(420, 90, { type: "triangle", vol: 0.05, slide: 260 });
    noise(70, { vol: 0.015, type: "bandpass", freq: 1800, freqTo: 3200, q: 1.2 });
  },
  invalid() {
    tone(170, 110, { type: "square", vol: 0.03, slide: -40 });
    tone(160, 110, { type: "square", vol: 0.03, at: 120, slide: -40 });
  },
  /** Gems popping; higher and brighter with each cascade. */
  pop(count: number, combo: number) {
    const f = SCALE[Math.min(SCALE.length - 1, combo - 1)]!;
    bell(f, 380, 0.05, 0);
    if (combo >= 3) bell(f * 1.5, 300, 0.03, 60);
    // the "crunch" of the gems breaking
    noise(120 + count * 6, { vol: 0.03, type: "bandpass", freq: 5200, freqTo: 1800, q: 1.4 });
    for (let i = 0; i < Math.min(5, Math.ceil(count / 3)); i++) tone(2400 + Math.random() * 1800, 40, { type: "sine", vol: 0.012, at: 20 + i * 28 });
  },
  land() {
    tone(160, 70, { type: "sine", vol: 0.04, slide: -60 });
  },
  made() {
    for (let i = 0; i < 4; i++) tone(1320 * Math.pow(1.26, i), 90, { type: "sine", vol: 0.025, at: i * 45, send: 0.4 });
  },
  rocket() {
    noise(380, { vol: 0.06, type: "bandpass", freq: 600, freqTo: 6000, q: 2 });
    tone(300, 360, { type: "sawtooth", vol: 0.018, slide: 1400 });
  },
  bomb(big = false) {
    tone(big ? 90 : 120, big ? 700 : 450, { type: "sine", vol: 0.14, slide: -70 });
    noise(big ? 900 : 550, { vol: big ? 0.1 : 0.07, type: "lowpass", freq: 1800, freqTo: 120, q: 0.7 });
    noise(90, { vol: 0.05, type: "highpass", freq: 3000 });
  },
  prism(board = false) {
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.51, 1567.98, 2093];
    notes.forEach((f, i) => bell(f, 600, 0.035, i * 55));
    noise(board ? 1200 : 700, { vol: 0.03, type: "highpass", freq: 6000, at: 80 });
    if (board) this.bomb(true);
  },
  /** Big combos: a little fanfare. */
  fanfare(level: number) {
    const base = level >= 7 ? 659.25 : 523.25;
    [1, 1.25, 1.5, 2].forEach((m, i) => {
      tone(base * m, i === 3 ? 420 : 120, { type: "square", vol: 0.025, at: i * 110, send: 0.3 });
      tone(base * m * 0.5, i === 3 ? 420 : 120, { type: "triangle", vol: 0.03, at: i * 110 });
    });
  },
  shuffle() {
    for (let i = 0; i < 8; i++) tone(500 + Math.random() * 900, 50, { type: "triangle", vol: 0.02, at: i * 40 });
  },
  tick(urgent: boolean) {
    tone(urgent ? 1500 : 1100, 40, { type: "square", vol: 0.02 });
  },
  over() {
    [783.99, 659.25, 523.25, 392].forEach((f, i) => tone(f, 260, { type: "triangle", vol: 0.05, at: i * 180 }));
  },
  record() {
    [523.25, 659.25, 783.99, 1046.5, 1318.51].forEach((f, i) => bell(f, 500, 0.045, i * 90));
  },
};
