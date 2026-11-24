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
  /** A firefly flying off: a quick rising flutter. */
  firefly() {
    for (let i = 0; i < 6; i++) tone(1200 + i * 220, 45, { type: "sine", vol: 0.02, at: i * 35, send: 0.3 });
    noise(260, { vol: 0.025, type: "bandpass", freq: 2500, freqTo: 6000, q: 2 });
  },
  /** The fever goes up: a whoosh and a crackle, higher for a bigger multiplier. */
  fever(mult: number) {
    noise(420, { vol: 0.06, type: "bandpass", freq: 500, freqTo: 4200, q: 1.2 });
    tone(220 * mult, 380, { type: "sawtooth", vol: 0.03, slide: 260 * mult });
    [1, 1.5, 2].forEach((m, i) => bell(440 * mult * m, 260, 0.035, 200 + i * 70));
  },
  /** Double strike / mega move. */
  bonus(big = false) {
    const notes = big ? [523.25, 783.99, 1046.5, 1567.98, 2093] : [659.25, 987.77, 1318.51];
    notes.forEach((f, i) => bell(f, 320, 0.04, 150 + i * 65));
    if (big) tone(80, 600, { type: "sine", vol: 0.12, slide: -40, at: 100 });
  },
  /** ⚔️ Your attack flies off to the opponent. */
  attack() {
    noise(300, { vol: 0.06, type: "bandpass", freq: 900, freqTo: 5000, q: 1.5 });
    tone(330, 260, { type: "sawtooth", vol: 0.03, slide: 660 });
    bell(1318.51, 260, 0.03, 180);
  },
  /** ⚠️ An attack is coming: an alarm. */
  warn() {
    for (let i = 0; i < 3; i++) tone(i % 2 ? 740 : 988, 110, { type: "square", vol: 0.03, at: i * 130 });
  },
  /** The attack lands on your board. */
  hit(kind: string) {
    if (kind === "ice") {
      noise(500, { vol: 0.05, type: "highpass", freq: 5000, freqTo: 9000 });
      [2637, 2093, 3136].forEach((f, i) => bell(f, 300, 0.025, i * 60));
    } else if (kind === "stone") {
      tone(70, 400, { type: "sine", vol: 0.15, slide: -30 });
      noise(350, { vol: 0.08, type: "lowpass", freq: 900, freqTo: 100 });
    } else if (kind === "fog") {
      noise(900, { vol: 0.05, type: "lowpass", freq: 700, freqTo: 300, q: 0.5 });
    } else this.shuffle();
  },
  /** 🛡 You blocked the incoming attack. */
  block() {
    tone(196, 120, { type: "square", vol: 0.05 });
    [783.99, 1174.66, 1567.98].forEach((f, i) => bell(f, 380, 0.045, 60 + i * 70));
  },
  /** ⚔️ Duel won / lost. */
  win() {
    [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5, 1318.51].forEach((f, i) => tone(f, i === 6 ? 600 : 140, { type: "square", vol: 0.03, at: i * 120, send: 0.3 }));
  },
  lose() {
    [392, 369.99, 349.23, 293.66].forEach((f, i) => tone(f, i === 3 ? 700 : 260, { type: "triangle", vol: 0.05, at: i * 240, slide: i === 3 ? -40 : 0 }));
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
