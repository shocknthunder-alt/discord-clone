import type { GameEvent } from "./engine";

// 🧱 Sound for Шметрис — all synthesized with WebAudio (no files):
//  • effects (moves, drops, line clears that shatter like glass),
//  • background music: our own little chiptune songs, a different one for every level, a bit
//    faster each level, with more layers (arpeggio, busier drums) as the game speeds up.
// Kept fairly quiet — people are usually in voice at the same time.

let ctx: AudioContext | null = null;
let sfxBus: GainNode | null = null;
let musicBus: GainNode | null = null;
let echo: GainNode | null = null; // send → short feedback delay (sparkle on bells)
let noiseBuf: AudioBuffer | null = null;

function ac(): AudioContext | null {
  try {
    if (!ctx) {
      ctx = new AudioContext();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      comp.connect(ctx.destination);
      sfxBus = ctx.createGain();
      sfxBus.gain.value = 1;
      sfxBus.connect(comp);
      musicBus = ctx.createGain();
      musicBus.gain.value = musicVolume;
      musicBus.connect(comp);
      // echo send
      echo = ctx.createGain();
      echo.gain.value = 1;
      const d = ctx.createDelay(1);
      d.delayTime.value = 0.13;
      const fb = ctx.createGain();
      fb.gain.value = 0.32;
      const damp = ctx.createBiquadFilter();
      damp.type = "lowpass";
      damp.frequency.value = 3500;
      echo.connect(d);
      d.connect(damp).connect(fb).connect(d);
      damp.connect(sfxBus);
      // white noise, 1 s
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const ch = noiseBuf.getChannelData(0);
      for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

interface ToneOpts {
  type?: OscillatorType;
  vol?: number;
  at?: number; // ms from now (effects) — or an absolute time with `t`
  t?: number; // absolute AudioContext time
  slide?: number;
  attack?: number; // s
  dest?: AudioNode | null;
  send?: number; // amount into the echo
  detune?: number;
}

function tone(freq: number, ms: number, o: ToneOpts = {}) {
  const a = ac();
  if (!a) return;
  const { type = "square", vol = 0.05, at = 0, slide = 0, attack = 0.004, send = 0, detune = 0 } = o;
  const t0 = o.t ?? a.currentTime + at / 1000;
  const dur = ms / 1000;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.detune.value = detune;
  osc.frequency.setValueAtTime(freq, t0);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(o.dest ?? sfxBus!);
  if (send > 0 && echo) {
    const s = a.createGain();
    s.gain.value = send;
    g.connect(s).connect(echo);
  }
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
}

function noise(ms: number, o: { vol?: number; t?: number; at?: number; type?: BiquadFilterType; freq?: number; freqTo?: number; q?: number; dest?: AudioNode | null } = {}) {
  const a = ac();
  if (!a || !noiseBuf) return;
  const { vol = 0.05, at = 0, type = "highpass", freq = 2000, freqTo, q = 0.8 } = o;
  const t0 = o.t ?? a.currentTime + at / 1000;
  const dur = ms / 1000;
  const src = a.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = a.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(freq, t0);
  if (freqTo) f.frequency.exponentialRampToValueAtTime(freqTo, t0 + dur);
  const g = a.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(o.dest ?? sfxBus!);
  src.start(t0, Math.random() * 0.5);
  src.stop(t0 + dur + 0.03);
}

/** A bell: sine + a slightly off overtone, with a bit of echo. */
function bell(freq: number, ms: number, vol: number, at: number) {
  tone(freq, ms, { type: "sine", vol, at, send: 0.5 });
  tone(freq * 2.01, ms * 0.6, { type: "sine", vol: vol * 0.35, at, send: 0.5 });
  tone(freq * 3.98, ms * 0.3, { type: "sine", vol: vol * 0.12, at });
}

/** Lines breaking: a glassy crunch that falls in pitch, sparkles, then a rising chime. */
function shatter(lines: number, tspin: boolean) {
  const big = lines >= 4;
  const power = Math.min(4, Math.max(1, lines));
  // the crunch: band-passed noise sweeping down + a short low thump
  noise(260 + power * 70, { type: "bandpass", freq: 4200, freqTo: 380, q: 1.4, vol: 0.09 + power * 0.025 });
  noise(90, { type: "highpass", freq: 6000, vol: 0.05 });
  tone(120, 160 + power * 30, { type: "sine", vol: 0.11 + power * 0.02, slide: -70 });
  // glass sparkles
  const sparkles = 4 + power * 3;
  for (let i = 0; i < sparkles; i++) {
    const f = 2200 + Math.random() * 3800;
    tone(f, 60 + Math.random() * 80, { type: "sine", vol: 0.018 + Math.random() * 0.015, at: 20 + Math.random() * (140 + power * 50), send: 0.4 });
  }
  // the chime: more lines → a longer, higher arpeggio
  const scale = tspin ? [587, 740, 880, 1109, 1480] : [523, 659, 784, 1046, 1318, 1568];
  const n = big ? 6 : power + 1;
  for (let i = 0; i < n; i++) bell(scale[Math.min(i, scale.length - 1)]!, big ? 420 : 260, 0.05, 90 + i * (big ? 70 : 60));
  if (big) {
    // four lines: a deep boom and a shimmering chord on top
    tone(70, 600, { type: "sine", vol: 0.18, slide: -40, at: 10 });
    noise(700, { type: "lowpass", freq: 900, freqTo: 120, vol: 0.06, at: 10 });
    for (const f of [1046, 1318, 1568, 2093]) tone(f, 900, { type: "triangle", vol: 0.018, at: 520, send: 0.6, attack: 0.06 });
  }
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
      noise(60, { type: "lowpass", freq: 1200, vol: 0.04 });
      break;
    case "clear":
      if (!e.lines) {
        // a T-spin without lines: a little swoosh
        noise(200, { type: "bandpass", freq: 900, freqTo: 3500, q: 2, vol: 0.05 });
        tone(660, 140, { vol: 0.035, type: "triangle", slide: 300 });
        break;
      }
      shatter(e.lines, e.tspin);
      break;
    case "level":
      [523, 659, 784, 1046, 1318].forEach((f, i) => bell(f, 260, 0.045, 300 + i * 75));
      break;
    case "over":
      [392, 330, 262, 196].forEach((f, i) => tone(f, 220, { vol: 0.05, type: "sawtooth", at: i * 170 }));
      noise(900, { type: "lowpass", freq: 1500, freqTo: 100, vol: 0.05, at: 500 });
      break;
  }
}

/* ───────────────────────── music ───────────────────────── */

// Note names → frequency. "A4" = 440 Hz; sharps "#", flats "b".
const SEMI: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function freqOf(name: string): number {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) return 0;
  const midi = 12 * (Number(m[3]) + 1) + SEMI[m[1]!]! + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0);
  return 440 * Math.pow(2, (midi - 69) / 12);
}

interface Song {
  name: string;
  bpm: number; // at its first appearance; +6 per level after that
  /** 4 bars × 16 steps: note, "." rest, "-" hold the previous note. */
  lead: string[];
  /** One chord per bar (bass root first). */
  chords: string[][];
  /** Bass rhythm over one bar: "R" root, "O" octave up, "F" fifth, "." rest. */
  bass: string;
  /** Drums over one bar: k kick, s snare, h hat, x kick+hat, "." */
  drums: string;
  wave: OscillatorType;
}

// Our own tunes (written for this game).
const SONGS: Song[] = [
  {
    name: "Неон",
    bpm: 118,
    wave: "square",
    lead: [
      "A4 . C5 E5 . A5 - . G5 . E5 . C5 D5 E5 .",
      "F5 - . E5 . C5 . A4 C5 - . F5 . E5 C5 .",
      "E5 . G5 . C6 - - . B5 . G5 . E5 . G5 .",
      "D5 - B4 . G4 . B4 D5 G5 - - . F5 E5 D5 B4",
    ],
    chords: [["A2", "A3", "C4", "E4"], ["F2", "F3", "A3", "C4"], ["C3", "C4", "E4", "G4"], ["G2", "G3", "B3", "D4"]],
    bass: "R . R O . R . O R . R O . R F O",
    drums: "x . h . s . h . x . x h s . h h",
  },
  {
    name: "Скок",
    bpm: 124,
    wave: "square",
    lead: [
      "D5 . D5 F5 . A5 . F5 D5 . . C5 D5 . F5 .",
      "D6 - . Bb5 . F5 . D5 Bb4 . D5 . F5 - . .",
      "C5 . F5 . A5 . C6 . A5 G5 F5 . A5 - . .",
      "G5 . E5 . C5 . E5 G5 C6 - Bb5 . G5 . E5 .",
    ],
    chords: [["D3", "D4", "F4", "A4"], ["Bb2", "Bb3", "D4", "F4"], ["F2", "F3", "A3", "C4"], ["C3", "C4", "E4", "G4"]],
    bass: "R . O . R . O . R . O . R O F O",
    drums: "x . h k s . h . x . h k s . h s",
  },
  {
    name: "Буря",
    bpm: 132,
    wave: "sawtooth",
    lead: [
      "E5 B4 E5 G5 . F#5 . E5 B4 . E5 . G5 A5 B5 .",
      "C6 - . B5 . G5 . E5 C5 . E5 G5 . B5 A5 G5",
      "B5 - . D6 . B5 . G5 D5 . G5 . B5 . D6 .",
      "A5 . F#5 . D5 . F#5 A5 D6 . C#6 . A5 . F#5 .",
    ],
    chords: [["E2", "E3", "G3", "B3"], ["C3", "C4", "E4", "G4"], ["G2", "G3", "B3", "D4"], ["D3", "D4", "F#4", "A4"]],
    bass: "R R O R R R O R R R O R R O F O",
    drums: "x h h h s h h h x h x h s h s h",
  },
  {
    name: "Космос",
    bpm: 112,
    wave: "triangle",
    lead: [
      "C5 - - Eb5 . G5 . C6 - - . Bb5 G5 . Eb5 .",
      "Ab5 - - . G5 . Eb5 . C5 - . Eb5 . Ab5 . .",
      "G5 - Bb5 . Eb6 - - . D6 . Bb5 . G5 . Bb5 .",
      "F5 - . D5 . Bb4 . D5 F5 - Bb5 . D6 - C6 Bb5",
    ],
    chords: [["C3", "C4", "Eb4", "G4"], ["Ab2", "Ab3", "C4", "Eb4"], ["Eb3", "Eb4", "G4", "Bb4"], ["Bb2", "Bb3", "D4", "F4"]],
    bass: "R . . R . . O . R . . R . F O .",
    drums: "k . h . s . h . k k h . s . h h",
  },
];

const split = (s: string) => s.trim().split(/\s+/);

let musicVolume = 0.5;
let player: MusicPlayer | null = null;

class MusicPlayer {
  private songIdx = 0;
  private level = 1;
  private bpm = 118;
  private step = 0; // 0..63
  private nextTime = 0;
  private timer: number | null = null;
  private pendingLevel: number | null = null;
  private layers = 1;

  constructor(level: number) {
    this.applyLevel(level);
  }

  private applyLevel(level: number) {
    this.level = level;
    this.songIdx = (level - 1) % SONGS.length;
    const song = SONGS[this.songIdx]!;
    this.bpm = Math.min(200, song.bpm + (level - 1) * 6);
    // 1 = lead+bass+drums, 2 = + arpeggio, 3 = + busier hats
    this.layers = level >= 6 ? 3 : level >= 3 ? 2 : 1;
  }

  setLevel(level: number) {
    if (level !== this.level) this.pendingLevel = level;
  }

  get playing() {
    return this.timer !== null;
  }

  play() {
    const a = ac();
    if (!a || this.timer !== null) return;
    this.nextTime = a.currentTime + 0.08;
    this.timer = window.setInterval(() => this.pump(), 25);
  }

  pause() {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  }

  private pump() {
    const a = ctx;
    if (!a) return;
    // fell far behind (tab was asleep): jump ahead instead of playing everything at once
    if (this.nextTime < a.currentTime - 0.25) this.nextTime = a.currentTime + 0.05;
    while (this.nextTime < a.currentTime + 0.14) {
      if (this.step % 16 === 0 && this.pendingLevel !== null) {
        // a new level: switch song at the bar line, starting from its first bar
        this.applyLevel(this.pendingLevel);
        this.pendingLevel = null;
        this.step = 0;
      }
      this.playStep(this.step, this.nextTime);
      this.nextTime += 60 / this.bpm / 4;
      this.step = (this.step + 1) % 64;
    }
  }

  private playStep(step: number, t: number) {
    const song = SONGS[this.songIdx]!;
    const bar = Math.floor(step / 16);
    const s = step % 16;
    const stepLen = 60 / this.bpm / 4;
    const bus = musicBus;

    // lead
    const lead = split(song.lead[bar]!);
    const tok = lead[s];
    if (tok && tok !== "." && tok !== "-") {
      let len = 1;
      while (lead[s + len] === "-") len++;
      const f = freqOf(tok);
      if (f) {
        const ms = stepLen * len * 1000 * 0.92;
        tone(f, ms, { t, type: song.wave, vol: song.wave === "triangle" ? 0.07 : 0.032, dest: bus, attack: 0.006 });
        // a soft second voice an octave down, detuned, for body
        tone(f / 2, ms, { t, type: "triangle", vol: 0.022, dest: bus, detune: 6 });
      }
    }

    // bass
    const chord = song.chords[bar]!;
    const root = freqOf(chord[0]!);
    const b = split(song.bass)[s];
    if (b && b !== ".") {
      const f = b === "O" ? root * 2 : b === "F" ? root * 1.5 : root;
      tone(f, stepLen * 1000 * 0.9, { t, type: "triangle", vol: 0.09, dest: bus, attack: 0.003 });
    }

    // arpeggio (from level 3)
    if (this.layers >= 2) {
      const tones = chord.slice(1);
      const f = freqOf(tones[s % tones.length]!) * 2;
      tone(f, stepLen * 1000 * 0.6, { t, type: "square", vol: 0.009, dest: bus });
    }

    // drums
    const d = split(song.drums)[s];
    const hat = () => noise(28, { t, type: "highpass", freq: 7500, vol: 0.022, dest: bus });
    const kick = () => {
      tone(150, 130, { t, type: "sine", vol: 0.16, slide: -105, dest: bus, attack: 0.002 });
    };
    if (d === "k" || d === "x") kick();
    if (d === "h" || d === "x") hat();
    if (d === "s") {
      noise(110, { t, type: "highpass", freq: 1400, vol: 0.06, dest: bus });
      tone(190, 70, { t, type: "triangle", vol: 0.05, slide: -60, dest: bus });
    }
    if (this.layers >= 3 && d === ".") hat();
  }
}

/** Background music: start / follow the level / pause. Safe to call often. */
export const blocksMusic = {
  play(level: number) {
    if (!player) player = new MusicPlayer(level);
    else player.setLevel(level);
    player.play();
  },
  setLevel(level: number) {
    player?.setLevel(level);
  },
  pause() {
    player?.pause();
  },
  stop() {
    player?.pause();
    player = null;
  },
  setVolume(v: number) {
    musicVolume = Math.max(0, Math.min(1, v));
    if (musicBus && ctx) musicBus.gain.setTargetAtTime(musicVolume, ctx.currentTime, 0.05);
  },
  songName(level: number) {
    return SONGS[(level - 1) % SONGS.length]!.name;
  },
};
