import type { GameEvent } from "./engine";

// 🧱 Sound effects for Шметрис — all synthesized with WebAudio (no files): moves, drops, line
// clears that shatter like glass. The background music lives in music.ts and shares this graph.
// Kept fairly quiet — people are usually in voice at the same time.

let ctx: AudioContext | null = null;
let sfxBus: GainNode | null = null;
let musicBus: GainNode | null = null; // music volume
let musicIn: GainNode | null = null; // where music voices go (→ tone filter → volume)
let musicTone: BiquadFilterNode | null = null; // per-style low-pass (lo-fi is darker)
let musicEcho: GainNode | null = null; // send → music delay
let echo: GainNode | null = null; // send → short feedback delay (sparkle on bells)
let noiseBuf: AudioBuffer | null = null;
let musicVolume = 0.5;

/** The shared audio graph (created on first use, resumed if the browser suspended it). */
export function audioGraph() {
  const a = ac();
  if (!a || !musicIn || !musicTone || !musicEcho || !noiseBuf || !musicBus) return null;
  return { ctx: a, musicIn, musicTone, musicEcho, musicBus, noise: noiseBuf };
}

export function setMusicVolume(v: number) {
  musicVolume = Math.max(0, Math.min(1, v));
  if (musicBus && ctx) musicBus.gain.setTargetAtTime(musicVolume, ctx.currentTime, 0.05);
}

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
      musicTone = ctx.createBiquadFilter();
      musicTone.type = "lowpass";
      musicTone.frequency.value = 18000;
      musicTone.Q.value = 0.5;
      musicTone.connect(musicBus);
      musicIn = ctx.createGain();
      musicIn.gain.value = 1;
      musicIn.connect(musicTone);
      // music echo: dotted-eighth-ish delay, darker repeats
      musicEcho = ctx.createGain();
      const md = ctx.createDelay(1.5);
      md.delayTime.value = 0.33;
      const mfb = ctx.createGain();
      mfb.gain.value = 0.3;
      const mdamp = ctx.createBiquadFilter();
      mdamp.type = "lowpass";
      mdamp.frequency.value = 2600;
      musicEcho.connect(md);
      md.connect(mdamp).connect(mfb).connect(md);
      mdamp.connect(musicTone);
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

export function tone(freq: number, ms: number, o: ToneOpts = {}) {
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

export function noise(ms: number, o: { vol?: number; t?: number; at?: number; type?: BiquadFilterType; freq?: number; freqTo?: number; q?: number; dest?: AudioNode | null } = {}) {
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
export function bell(freq: number, ms: number, vol: number, at: number) {
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

