import { audioGraph, setMusicVolume } from "./sounds";

// 🎵 Background music for Шметрис — our own tunes, synthesized with WebAudio (no files).
// Every two levels is a different style with its own instruments, drums, key and tempo:
//   1–2 чил (lo-fi) · 3–4 фънки диско · 5–6 80-те (synthwave) · 7–8 рок · 9–10 драм енд бас · 11+ епично
// The second level of a style is a bit faster and busier; from 11 on the epic one climbs a semitone
// and a few bpm per level. A level-up plays a riser and switches at the next bar line; a stack
// close to the top adds a nervous heartbeat.

/* ───────────── notes ───────────── */

const SEMI: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function freqOf(name: string): number {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) return 0;
  const midi = 12 * (Number(m[3]) + 1) + SEMI[m[1]!]! + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0);
  return 440 * Math.pow(2, (midi - 69) / 12);
}
const split = (s: string) => s.trim().split(/\s+/);

/* ───────────── instruments ───────────── */

type G = NonNullable<ReturnType<typeof audioGraph>>;
type Voice = (g: G, f: number, t: number, dur: number, vel: number) => void;

/** Gain envelope: attack → (decay to sustain by the end) → release. */
function env(gain: GainNode, t: number, peak: number, attack: number, dur: number, release: number, sustain = 1) {
  const p = Math.max(0.0002, peak);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(p, t + attack);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, p * sustain), t + Math.max(attack + 0.005, dur));
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur + release);
}

function oscs(g: G, t: number, end: number, f: number, list: { type: OscillatorType; detune?: number; mult?: number }[], dest: AudioNode) {
  for (const o of list) {
    const osc = g.ctx.createOscillator();
    osc.type = o.type;
    osc.frequency.value = f * (o.mult ?? 1);
    osc.detune.value = o.detune ?? 0;
    osc.connect(dest);
    osc.start(t);
    osc.stop(end + 0.05);
  }
}

function filter(g: G, type: BiquadFilterType, freq: number, q = 0.7) {
  const f = g.ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  return f;
}

function out(g: G, node: AudioNode, send = 0) {
  node.connect(g.musicIn);
  if (send > 0) {
    const s = g.ctx.createGain();
    s.gain.value = send;
    node.connect(s).connect(g.musicEcho);
  }
}

function vibrato(g: G, osc: OscillatorNode, t: number, end: number, cents = 8, rate = 5.5) {
  const lfo = g.ctx.createOscillator();
  lfo.frequency.value = rate;
  const depth = g.ctx.createGain();
  depth.gain.setValueAtTime(0, t);
  depth.gain.linearRampToValueAtTime(cents, t + 0.18);
  lfo.connect(depth).connect(osc.detune);
  lfo.start(t);
  lfo.stop(end + 0.05);
}

let distCurve: Float32Array<ArrayBuffer> | null = null;
function distortion(g: G) {
  const ws = g.ctx.createWaveShaper();
  if (!distCurve) {
    distCurve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const x = (i / 1023) * 2 - 1;
      distCurve[i] = Math.tanh(x * 6) * 0.8;
    }
  }
  ws.curve = distCurve;
  ws.oversample = "2x";
  return ws;
}

// Electric piano (FM): warm, a little bell on the attack.
const epiano: Voice = (g, f, t, dur, vel) => {
  const amp = g.ctx.createGain();
  env(amp, t, 0.05 * vel, 0.006, dur, 0.35, 0.35);
  const car = g.ctx.createOscillator();
  car.frequency.value = f;
  const mod = g.ctx.createOscillator();
  mod.frequency.value = f;
  const mg = g.ctx.createGain();
  mg.gain.setValueAtTime(f * 2.2, t);
  mg.gain.exponentialRampToValueAtTime(f * 0.25, t + 0.5);
  mod.connect(mg).connect(car.frequency);
  const lp = filter(g, "lowpass", 3200);
  car.connect(lp).connect(amp);
  out(g, amp, 0.25);
  for (const o of [car, mod]) {
    o.start(t);
    o.stop(t + dur + 0.4);
  }
};

const softBass: Voice = (g, f, t, dur, vel) => {
  const amp = g.ctx.createGain();
  env(amp, t, 0.13 * vel, 0.01, dur, 0.12, 0.7);
  oscs(g, t, t + dur + 0.12, f, [{ type: "sine" }, { type: "triangle", mult: 2, detune: 3 }], amp);
  out(g, amp);
};

// Funk bass: a resonant filter that snaps shut — "plucked".
const funkBass: Voice = (g, f, t, dur, vel) => {
  const amp = g.ctx.createGain();
  env(amp, t, 0.1 * vel, 0.004, dur, 0.06, 0.6);
  const lp = filter(g, "lowpass", 2600, 7);
  lp.frequency.setValueAtTime(2600, t);
  lp.frequency.exponentialRampToValueAtTime(320, t + 0.13);
  oscs(g, t, t + dur + 0.06, f, [{ type: "sawtooth" }, { type: "square", mult: 0.5 }], lp);
  lp.connect(amp);
  out(g, amp);
};

// Disco strings / brass stab.
const stab: Voice = (g, f, t, dur, vel) => {
  const amp = g.ctx.createGain();
  env(amp, t, 0.022 * vel, 0.01, dur, 0.12, 0.5);
  const lp = filter(g, "lowpass", 3200);
  oscs(g, t, t + dur + 0.12, f, [{ type: "sawtooth", detune: -9 }, { type: "sawtooth", detune: 9 }], lp);
  lp.connect(amp);
  out(g, amp, 0.15);
};

// Big 80s pad: three detuned saws, slow attack.
const pad: Voice = (g, f, t, dur, vel) => {
  const amp = g.ctx.createGain();
  env(amp, t, 0.016 * vel, 0.35, dur, 0.5, 0.8);
  const lp = filter(g, "lowpass", 1700);
  oscs(g, t, t + dur + 0.5, f, [{ type: "sawtooth", detune: -14 }, { type: "sawtooth" }, { type: "sawtooth", detune: 14 }], lp);
  lp.connect(amp);
  out(g, amp, 0.3);
};

const pluck: Voice = (g, f, t, dur, vel) => {
  const amp = g.ctx.createGain();
  env(amp, t, 0.018 * vel, 0.003, Math.min(dur, 0.12), 0.08, 0.3);
  const lp = filter(g, "lowpass", 4200, 3);
  lp.frequency.setValueAtTime(4200, t);
  lp.frequency.exponentialRampToValueAtTime(700, t + 0.15);
  oscs(g, t, t + 0.25, f, [{ type: "square" }], lp);
  lp.connect(amp);
  out(g, amp, 0.45);
};

function makeLead(type: OscillatorType, vol: number, cutoff: number, send: number, second?: OscillatorType): Voice {
  return (g, f, t, dur, vel) => {
    const amp = g.ctx.createGain();
    env(amp, t, vol * vel, 0.01, dur, 0.12, 0.75);
    const lp = filter(g, "lowpass", cutoff, 1.2);
    for (const [ty, det] of [[type, 0], ...(second ? [[second, 7]] : [])] as [OscillatorType, number][]) {
      const o = g.ctx.createOscillator();
      o.type = ty;
      o.frequency.value = f;
      o.detune.value = det;
      vibrato(g, o, t, t + dur + 0.12);
      o.connect(lp);
      o.start(t);
      o.stop(t + dur + 0.17);
    }
    lp.connect(amp);
    out(g, amp, send);
  };
}
const funkLead = makeLead("square", 0.03, 2400, 0.15);
const synthLead = makeLead("sawtooth", 0.026, 3600, 0.4, "sawtooth");

// Power chord guitar: root + fifth + octave through distortion. Short notes = palm-muted chugs.
const guitar: Voice = (g, f, t, dur, vel) => {
  const pre = g.ctx.createGain();
  pre.gain.value = 0.6;
  oscs(g, t, t + dur + 0.08, f, [{ type: "sawtooth" }, { type: "sawtooth", mult: 1.4983, detune: 4 }, { type: "sawtooth", mult: 2, detune: -4 }], pre);
  const ws = distortion(g);
  const lp = filter(g, "lowpass", dur < 0.15 ? 1300 : 2900, 0.9);
  const amp = g.ctx.createGain();
  env(amp, t, 0.028 * vel, 0.004, dur, 0.08, 0.7);
  pre.connect(ws).connect(lp).connect(amp);
  out(g, amp);
};

const leadGuitar: Voice = (g, f, t, dur, vel) => {
  const o = g.ctx.createOscillator();
  o.type = "sawtooth";
  o.frequency.value = f;
  vibrato(g, o, t, t + dur + 0.15, 14, 6);
  const pre = g.ctx.createGain();
  pre.gain.value = 0.7;
  const ws = distortion(g);
  const lp = filter(g, "lowpass", 3400, 1.5);
  const amp = g.ctx.createGain();
  env(amp, t, 0.022 * vel, 0.006, dur, 0.15, 0.8);
  o.connect(pre).connect(ws).connect(lp).connect(amp);
  out(g, amp, 0.3);
  o.start(t);
  o.stop(t + dur + 0.2);
};

// Reese: two detuned saws + a sub, growling low-pass.
const reese: Voice = (g, f, t, dur, vel) => {
  const lp = filter(g, "lowpass", 520, 2);
  oscs(g, t, t + dur + 0.08, f, [{ type: "sawtooth", detune: -22 }, { type: "sawtooth", detune: 22 }], lp);
  const amp = g.ctx.createGain();
  env(amp, t, 0.06 * vel, 0.01, dur, 0.08, 0.9);
  lp.connect(amp);
  const sub = g.ctx.createGain();
  env(sub, t, 0.09 * vel, 0.01, dur, 0.08, 0.9);
  oscs(g, t, t + dur + 0.08, f / 2, [{ type: "sine" }], sub);
  out(g, amp);
  out(g, sub);
};

const bellLead: Voice = (g, f, t, dur, vel) => {
  const amp = g.ctx.createGain();
  env(amp, t, 0.035 * vel, 0.003, Math.max(dur, 0.25), 0.4, 0.15);
  oscs(g, t, t + dur + 0.6, f, [{ type: "sine" }], amp);
  const ov = g.ctx.createGain();
  env(ov, t, 0.012 * vel, 0.002, 0.15, 0.1, 0.1);
  oscs(g, t, t + 0.3, f, [{ type: "sine", mult: 3.01 }], ov);
  out(g, amp, 0.55);
  out(g, ov, 0.4);
};

// Brass: the filter opens as the note swells.
const brass: Voice = (g, f, t, dur, vel) => {
  const lp = filter(g, "lowpass", 500, 1.5);
  lp.frequency.setValueAtTime(500, t);
  lp.frequency.exponentialRampToValueAtTime(3200, t + 0.12);
  lp.frequency.exponentialRampToValueAtTime(1800, t + Math.max(0.2, dur));
  oscs(g, t, t + dur + 0.15, f, [{ type: "sawtooth", detune: -6 }, { type: "sawtooth", detune: 6 }, { type: "sawtooth", mult: 0.5 }], lp);
  const amp = g.ctx.createGain();
  env(amp, t, 0.03 * vel, 0.04, dur, 0.15, 0.85);
  lp.connect(amp);
  out(g, amp, 0.25);
};

// Choir "aah": saws through two vowel formants.
const choir: Voice = (g, f, t, dur, vel) => {
  const src = g.ctx.createGain();
  oscs(g, t, t + dur + 0.6, f, [{ type: "sawtooth", detune: -8 }, { type: "sawtooth", detune: 8 }], src);
  const amp = g.ctx.createGain();
  env(amp, t, 0.05 * vel, 0.4, dur, 0.6, 0.9);
  for (const [fr, q, gain] of [[750, 6, 1], [1150, 7, 0.6], [2600, 9, 0.25]] as const) {
    const bp = filter(g, "bandpass", fr, q);
    const fg = g.ctx.createGain();
    fg.gain.value = gain;
    src.connect(bp).connect(fg).connect(amp);
  }
  out(g, amp, 0.35);
};

// Tremolo strings: short, quiet, retriggered every 16th.
const tremolo: Voice = (g, f, t, dur, vel) => {
  const lp = filter(g, "lowpass", 2600);
  oscs(g, t, t + dur + 0.05, f, [{ type: "sawtooth", detune: -5 }, { type: "sawtooth", detune: 5 }], lp);
  const amp = g.ctx.createGain();
  env(amp, t, 0.011 * vel, 0.008, dur * 0.8, 0.04, 0.6);
  lp.connect(amp);
  out(g, amp, 0.2);
};

/* ───────────── drums ───────────── */

function noiseHit(g: G, t: number, dur: number, vol: number, type: BiquadFilterType, freq: number, q = 0.8, send = 0) {
  const src = g.ctx.createBufferSource();
  src.buffer = g.noise;
  src.loop = true;
  const f = filter(g, type, freq, q);
  const amp = g.ctx.createGain();
  amp.gain.setValueAtTime(vol, t);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(amp);
  out(g, amp, send);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.02);
  return amp;
}

function kick(g: G, t: number, vel: number, hard = false) {
  const o = g.ctx.createOscillator();
  o.frequency.setValueAtTime(hard ? 190 : 150, t);
  o.frequency.exponentialRampToValueAtTime(42, t + (hard ? 0.09 : 0.13));
  const amp = g.ctx.createGain();
  amp.gain.setValueAtTime(0.2 * vel, t);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + (hard ? 0.22 : 0.3));
  o.connect(amp);
  out(g, amp);
  o.start(t);
  o.stop(t + 0.35);
  noiseHit(g, t, 0.012, 0.05 * vel, "highpass", 3000); // click
}

function snare(g: G, t: number, vel: number, kind: "normal" | "gated" | "rim" | "clap" = "normal") {
  if (kind === "rim") {
    noiseHit(g, t, 0.03, 0.05 * vel, "bandpass", 2400, 4);
    return;
  }
  if (kind === "clap") {
    for (let i = 0; i < 3; i++) noiseHit(g, t + i * 0.011, 0.02, 0.05 * vel, "bandpass", 1500, 1.5);
    noiseHit(g, t + 0.033, 0.14, 0.05 * vel, "bandpass", 1500, 1.2, 0.2);
    return;
  }
  if (kind === "gated") {
    // the big 80s snare: a long noise tail cut off sharply
    const a = noiseHit(g, t, 0.3, 0.075 * vel, "bandpass", 1700, 0.6, 0.35);
    a.gain.setValueAtTime(0.03 * vel, t + 0.2);
    a.gain.linearRampToValueAtTime(0.0001, t + 0.24);
  } else {
    noiseHit(g, t, 0.13, 0.065 * vel, "highpass", 1500);
  }
  const o = g.ctx.createOscillator();
  o.type = "triangle";
  o.frequency.setValueAtTime(200, t);
  o.frequency.exponentialRampToValueAtTime(140, t + 0.08);
  const amp = g.ctx.createGain();
  amp.gain.setValueAtTime(0.06 * vel, t);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
  o.connect(amp);
  out(g, amp);
  o.start(t);
  o.stop(t + 0.1);
}

const hat = (g: G, t: number, vel: number, open = false) => noiseHit(g, t, open ? 0.2 : 0.035, (open ? 0.025 : 0.028) * vel, "highpass", open ? 6500 : 8000);
const crash = (g: G, t: number, vel = 1) => noiseHit(g, t, 1.4, 0.04 * vel, "highpass", 4500, 0.5, 0.3);

function tom(g: G, t: number, f: number, vel: number) {
  const o = g.ctx.createOscillator();
  o.frequency.setValueAtTime(f, t);
  o.frequency.exponentialRampToValueAtTime(f * 0.6, t + 0.2);
  const amp = g.ctx.createGain();
  amp.gain.setValueAtTime(0.12 * vel, t);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
  o.connect(amp);
  out(g, amp, 0.2);
  o.start(t);
  o.stop(t + 0.3);
}

function timpani(g: G, t: number, f: number, vel: number) {
  const o = g.ctx.createOscillator();
  o.frequency.setValueAtTime(f * 1.05, t);
  o.frequency.exponentialRampToValueAtTime(f, t + 0.1);
  const amp = g.ctx.createGain();
  amp.gain.setValueAtTime(0.16 * vel, t);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
  o.connect(amp);
  out(g, amp, 0.3);
  o.start(t);
  o.stop(t + 0.75);
  noiseHit(g, t, 0.18, 0.04 * vel, "lowpass", 600);
}

// The big orchestra "hit" on the downbeat of the epic style.
function orchestraHit(g: G, t: number, chord: number[]) {
  for (const f of chord) brass(g, f, t, 0.28, 1.2);
  noiseHit(g, t, 0.4, 0.05, "bandpass", 900, 0.7, 0.4);
  timpani(g, t, chord[0]! / 2, 1);
}

/* ───────────── styles ───────────── */

interface Style {
  name: string;
  bpm: number;
  bpmStep: number; // added for the style's second level
  swing: number; // 0..0.3 — delays every second 16th
  tone: number; // music low-pass (Hz)
  /** 4 bars: [bass root, ...chord voicing]. */
  chords: string[][];
  lead: string[]; // 4 bars × 16 steps: note, "." rest, "-" hold
  leadVoice: Voice;
  bass: string; // R root, O octave, F fifth, "-" hold, "."
  bassVoice: Voice;
  comp: string; // when the chord plays: x hit, "-" hold
  compVoice: Voice;
  /** Drum lanes; each lane is a list of one-bar patterns (cycled per bar). */
  drums: { k?: string[]; s?: string[]; h?: string[]; o?: string[]; c?: string[]; r?: string[] };
  snare: "normal" | "gated" | "rim" | "clap";
  hardKick?: boolean;
  arp?: boolean; // 16th arpeggio of the chord
  crackle?: boolean; // vinyl
  fill?: boolean; // tom fill at the end of bar 4
  orchestra?: boolean; // hit + timpani on bar starts
}

const STYLES: Style[] = [
  {
    name: "Чил",
    bpm: 86,
    bpmStep: 6,
    swing: 0.22,
    tone: 2600,
    chords: [
      ["F2", "A3", "C4", "E4", "G4"],
      ["E2", "G3", "B3", "D4"],
      ["D2", "F3", "A3", "C4", "E4"],
      ["Bb1", "D3", "F3", "A3", "C4"],
    ],
    lead: [
      "C5 - - A4 . . G4 A4 C5 - - . . . . .",
      "B4 - - G4 . . E4 G4 B4 - D5 - . . . .",
      "A4 - - F4 . . E4 F4 A4 - C5 - E5 - - .",
      "D5 - - C5 . . A4 F4 . . G4 - - - . .",
    ],
    leadVoice: epiano,
    bass: "R - - . . . . R . . R - . . . .",
    bassVoice: softBass,
    comp: "x - - - - - . . . . x - - - . .",
    compVoice: epiano,
    drums: {
      k: ["x . . . . . . . x . x . . . . ."],
      s: [". . . . x . . . . . . . x . . ."],
      h: ["x . x . x . x . x . x . x . x ."],
    },
    snare: "rim",
    crackle: true,
  },
  {
    name: "Диско",
    bpm: 112,
    bpmStep: 5,
    swing: 0,
    tone: 9000,
    chords: [
      ["A1", "G3", "C4", "E4"],
      ["D2", "F#3", "C4", "E4"],
      ["F1", "A3", "C4", "E4"],
      ["E2", "G#3", "B3", "D4"],
    ],
    lead: [
      "A4 . C5 . D5 . E5 G5 . E5 . D5 C5 . A4 .",
      "F#5 - . E5 . D5 . . A4 . C5 D5 . . . .",
      "C5 . . A4 . C5 . E5 . F5 E5 . C5 . A4 .",
      "G#4 - . B4 . D5 . E5 - - . D5 B4 . G#4 .",
    ],
    leadVoice: funkLead,
    bass: "R . O R . R O . R . O . R O F O",
    bassVoice: funkBass,
    comp: ". . x . . . x . . . x . . x . .",
    compVoice: stab,
    drums: {
      k: ["x . . . x . . . x . . . x . . ."],
      c: [". . . . x . . . . . . . x . . ."],
      h: ["x x . x x x . x x x . x x x . x"],
      o: [". . x . . . x . . . x . . . x ."],
    },
    snare: "clap",
  },
  {
    name: "80-те",
    bpm: 118,
    bpmStep: 6,
    swing: 0,
    tone: 12000,
    chords: [
      ["D2", "A3", "D4", "F4"],
      ["Bb1", "Bb3", "D4", "F4"],
      ["C2", "G3", "C4", "E4"],
      ["A1", "A3", "C#4", "E4"],
    ],
    lead: [
      "D5 - - - A4 - - - F5 - E5 - D5 - C5 -",
      "D5 - - - - - - . Bb4 - C5 - D5 - F5 -",
      "E5 - - - G5 - - - C6 - - - G5 - E5 -",
      "C#5 - - - - - - - E5 - - - A5 - - -",
    ],
    leadVoice: synthLead,
    bass: "R . R . R . R . R . R . O . R .",
    bassVoice: funkBass,
    comp: "x - - - - - - - - - - - - - - -",
    compVoice: pad,
    drums: {
      k: ["x . . . . . . . x . . . . . . ."],
      s: [". . . . x . . . . . . . x . . ."],
      h: [". . x . . . x . . . x . . . x ."],
    },
    snare: "gated",
    arp: true,
    fill: true,
  },
  {
    name: "Рок",
    bpm: 138,
    bpmStep: 6,
    swing: 0,
    tone: 14000,
    chords: [
      ["E2", "E3"],
      ["G2", "G3"],
      ["A2", "A3"],
      ["B2", "B3"],
    ],
    lead: [
      "E5 . G5 . A5 . B5 - - . A5 G5 . E5 . .",
      "D5 . G5 . B5 . D6 - - . B5 . A5 . G5 .",
      "A5 - - . C6 - B5 . A5 . E5 . G5 - A5 .",
      "B5 - - - - . F#5 . A5 - - . B5 - D6 -",
    ],
    leadVoice: leadGuitar,
    bass: "R . R . R . R . R . R . R . R .",
    bassVoice: funkBass,
    comp: "x . x x . x x . x . x x . x - .",
    compVoice: guitar,
    drums: {
      k: ["x . x . . . x . x . x . . . x .", "x . x . . . x . x . x . x x x x"],
      s: [". . . . x . . . . . . . x . . ."],
      h: ["x . x . x . x . x . x . x . x ."],
    },
    snare: "normal",
    hardKick: true,
    fill: true,
  },
  {
    name: "Драм енд бас",
    bpm: 170,
    bpmStep: 4,
    swing: 0,
    tone: 15000,
    chords: [
      ["F1", "Ab3", "C4", "F4"],
      ["Db2", "Ab3", "Db4", "F4"],
      ["Bb1", "Bb3", "Db4", "F4"],
      ["C2", "G3", "C4", "E4"],
    ],
    lead: [
      "C6 . . Ab5 . . F5 . . . G5 . Ab5 . . .",
      "F5 . . Db6 . . C6 . . . Ab5 . F5 . . .",
      "Db6 . . Bb5 . . F5 . . . Bb5 . Db6 . F6 .",
      "E6 . . C6 . . G5 . . . Bb5 . C6 - - -",
    ],
    leadVoice: bellLead,
    bass: "R - - . . . R - . . R - - - . .",
    bassVoice: reese,
    comp: "x - - - - - - - - - - - - - - -",
    compVoice: pad,
    drums: {
      k: ["x . . . . . . . . . x . . . . .", "x . x . . . . . . . x . . . . ."],
      s: [". . . . x . . . . . . . x . . .", ". . . . x . . x . . . . x . . x"],
      h: ["x . x . x . x . x . x . x . x ."],
      r: [". . . . . . . . . x . . . . . x"],
    },
    snare: "normal",
    hardKick: true,
  },
  {
    name: "Епично",
    bpm: 168,
    bpmStep: 4,
    swing: 0,
    tone: 16000,
    chords: [
      ["D2", "D4", "F4", "A4"],
      ["Bb1", "D4", "F4", "Bb4"],
      ["G1", "G3", "Bb3", "D4"],
      ["A1", "A3", "C#4", "E4"],
    ],
    lead: [
      "D5 - - - A5 - - - F5 - E5 - D5 - C#5 -",
      "D5 - - - - - Bb4 - D5 - F5 - Bb5 - - -",
      "G5 - - - Bb5 - A5 - G5 - F5 - E5 - D5 -",
      "E5 - - - - - - - C#5 - E5 - A5 - - -",
    ],
    leadVoice: brass,
    bass: "R . R . R . R . R . R . R . R .",
    bassVoice: softBass,
    comp: "x x x x x x x x x x x x x x x x",
    compVoice: tremolo,
    drums: {
      k: ["x . x . x . x . x . x . x . x ."],
      s: [". . . . x . . . . . . . x . . x"],
      h: ["x . x . x . x . x . x . x . x ."],
    },
    snare: "normal",
    hardKick: true,
    orchestra: true,
    fill: true,
  },
];

const tierOf = (level: number) => Math.min(STYLES.length - 1, Math.floor((Math.max(1, level) - 1) / 2));

function bpmFor(level: number): number {
  const tier = tierOf(level);
  const st = STYLES[tier]!;
  if (tier === STYLES.length - 1) return Math.min(210, st.bpm + (level - 11) * st.bpmStep);
  return st.bpm + ((level - 1) % 2) * st.bpmStep;
}

/* ───────────── the player ───────────── */

class MusicPlayer {
  private level = 1;
  private style = STYLES[0]!;
  private bpm = 86;
  private busy = false; // second level of a style: extra layers
  private transpose = 1; // frequency factor
  private step = 0; // 0..63
  private nextTime = 0;
  private timer: number | null = null;
  private pendingLevel: number | null = null;
  danger = false;

  constructor(level: number) {
    this.apply(level);
  }

  private apply(level: number) {
    this.level = level;
    const tier = tierOf(level);
    this.style = STYLES[tier]!;
    this.bpm = bpmFor(level);
    this.busy = tier === STYLES.length - 1 ? level >= 12 : (level - 1) % 2 === 1;
    // The epic style climbs a semitone per level (wrapping after 5 so it never gets shrill).
    this.transpose = tier === STYLES.length - 1 ? Math.pow(2, ((level - 11) % 6) / 12) : 1;
    const g = audioGraph();
    if (g) g.musicTone.frequency.setTargetAtTime(this.style.tone, g.ctx.currentTime, 0.2);
  }

  setLevel(level: number) {
    if (level === this.level || level === this.pendingLevel) return;
    this.pendingLevel = level;
    if (this.timer !== null) this.riser();
  }

  get playing() {
    return this.timer !== null;
  }

  play() {
    const g = audioGraph();
    if (!g || this.timer !== null) return;
    g.musicTone.frequency.setTargetAtTime(this.style.tone, g.ctx.currentTime, 0.05);
    this.nextTime = g.ctx.currentTime + 0.08;
    this.timer = window.setInterval(() => this.pump(), 25);
  }

  pause() {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  }

  /** Level up: a rising sweep into the next bar. */
  private riser() {
    const g = audioGraph();
    if (!g) return;
    const t = g.ctx.currentTime;
    const src = g.ctx.createBufferSource();
    src.buffer = g.noise;
    src.loop = true;
    const bp = filter(g, "bandpass", 400, 2);
    bp.frequency.setValueAtTime(400, t);
    bp.frequency.exponentialRampToValueAtTime(7000, t + 0.9);
    const amp = g.ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(0.05, t + 0.85);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + 1);
    src.connect(bp).connect(amp);
    out(g, amp, 0.3);
    src.start(t);
    src.stop(t + 1.05);
    const o = g.ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(220, t);
    o.frequency.exponentialRampToValueAtTime(880, t + 0.9);
    const og = g.ctx.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.012, t + 0.8);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.95);
    o.connect(filter(g, "lowpass", 2500)).connect(og);
    out(g, og);
    o.start(t);
    o.stop(t + 1);
  }

  private pump() {
    const g = audioGraph();
    if (!g) return;
    const now = g.ctx.currentTime;
    // fell far behind (tab was asleep): jump ahead instead of playing everything at once
    if (this.nextTime < now - 0.25) this.nextTime = now + 0.05;
    while (this.nextTime < now + 0.14) {
      if (this.step % 16 === 0 && this.pendingLevel !== null) {
        this.apply(this.pendingLevel);
        this.pendingLevel = null;
        this.step = 0;
        crash(g, this.nextTime, 1.2);
      }
      const stepLen = 60 / this.bpm / 4;
      const swing = this.step % 2 === 1 ? this.style.swing * stepLen : 0;
      this.playStep(g, this.step, this.nextTime + swing, stepLen);
      this.nextTime += stepLen;
      this.step = (this.step + 1) % 64;
    }
  }

  private playStep(g: G, step: number, t: number, stepLen: number) {
    const st = this.style;
    const bar = Math.floor(step / 16);
    const s = step % 16;
    const tr = this.transpose;
    const chord = st.chords[bar]!;
    const root = freqOf(chord[0]!) * tr;
    const voicing = chord.slice(1).map((n) => freqOf(n) * tr);
    const holdLen = (tokens: string[], i: number) => {
      let n = 1;
      while (tokens[i + n] === "-") n++;
      return n;
    };

    // lead (doubled an octave up, quietly, on the busier level)
    const lead = split(st.lead[bar]!);
    const tok = lead[s]!;
    if (tok !== "." && tok !== "-") {
      const f = freqOf(tok) * tr;
      const dur = stepLen * holdLen(lead, s) * 0.95;
      st.leadVoice(g, f, t, dur, 1);
      if (this.busy) st.leadVoice(g, f * 2, t, dur, 0.35);
    }

    // chords
    const comp = split(st.comp);
    if (comp[s] === "x") {
      const dur = stepLen * holdLen(comp, s);
      if (st.compVoice === guitar) st.compVoice(g, root * 2, t, dur * 0.9, 1);
      else for (const f of voicing) st.compVoice(g, f, t, dur, 1);
    }

    // bass
    const bass = split(st.bass);
    const b = bass[s]!;
    if (b !== "." && b !== "-") {
      const f = b === "O" ? root * 2 : b === "F" ? root * 1.5 : root;
      st.bassVoice(g, f, t, stepLen * holdLen(bass, s) * 0.9, 1);
    }

    // arpeggio (80s), quiet 16ths over two octaves
    if (st.arp) {
      const notes = [...voicing, ...voicing.map((f) => f * 2)];
      pluck(g, notes[s % notes.length]! * 2, t, stepLen, 1);
    }

    // orchestra hits on the downbeats (epic)
    if (st.orchestra && s === 0) orchestraHit(g, t, voicing);

    // drums
    const lane = (name: keyof Style["drums"]) => {
      const pats = st.drums[name];
      if (!pats) return false;
      return split(pats[bar % pats.length]!)[s] === "x";
    };
    const fillNow = st.fill && bar === 3 && s >= 12;
    if (lane("k")) kick(g, t, 1, st.hardKick);
    if (!fillNow && lane("s")) snare(g, t, 1, st.snare);
    if (lane("c")) snare(g, t, 1, "clap");
    if (lane("r")) snare(g, t, 0.5, "normal"); // ghost notes
    if (lane("h")) hat(g, t, s % 4 === 0 ? 1 : 0.7);
    else if (this.busy && !lane("o")) hat(g, t, 0.45);
    if (lane("o")) hat(g, t, 1, true);
    if (fillNow) tom(g, t, [220, 180, 150, 110][s - 12]!, 1);
    if (st.crackle && Math.random() < 0.3) noiseHit(g, t + Math.random() * stepLen, 0.006, 0.02 + Math.random() * 0.03, "highpass", 2500);

    // a nervous heartbeat when the stack is near the top
    if (this.danger && (s === 0 || s === 3 || s === 8 || s === 11)) {
      const o = g.ctx.createOscillator();
      o.type = "square";
      o.frequency.value = s % 8 === 0 ? 1320 : 990;
      const amp = g.ctx.createGain();
      env(amp, t, 0.012, 0.002, 0.05, 0.03, 0.5);
      o.connect(amp);
      out(g, amp);
      o.start(t);
      o.stop(t + 0.1);
    }
  }
}

let player: MusicPlayer | null = null;

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
  setDanger(on: boolean) {
    if (player) player.danger = on;
  },
  pause() {
    player?.pause();
  },
  stop() {
    player?.pause();
    player = null;
  },
  setVolume(v: number) {
    setMusicVolume(v);
  },
  /** Name of the style a level plays (shown on level up). */
  songName(level: number) {
    return STYLES[tierOf(level)]!.name;
  },
  bpmFor,
};
