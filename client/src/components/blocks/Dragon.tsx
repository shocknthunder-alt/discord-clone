import { useEffect, useMemo, useState } from "react";
import "./dragon.css";

/**
 * 🐉 The Шметрис pet: our own little dragon next to the well, in profile looking at it. Every game
 * starts from an egg again; it hatches and grows with the lines of that game: egg → baby → small →
 * young → dragon → legendary (gold runes), and changes colour with every level it climbs: green →
 * teal → blue → indigo → purple → magenta → orange → red → crimson → black-red. Babies have a big head,
 * big eyes and stubby wings; it gets a longer body, horns, back spikes and big wings as it grows.
 * Sleeps when you are not playing, bobs to the music, cheers when lines go (hop → flap → loop in
 * the air → breathes fire at the well), hides behind its wings when the stack is high, is sad at
 * game over, and glows when it grows up.
 */

export type DragonMood = "sleep" | "idle" | "c1" | "c2" | "c3" | "c4" | "danger" | "sad" | "grow";

export const DRAGON_STAGES = [
  { at: 0, name: "Яйце" },
  { at: 2, name: "Бебе" },
  { at: 8, name: "Малко драконче" },
  { at: 20, name: "Младо драконче" },
  { at: 40, name: "Дракон" },
  { at: 70, name: "Легендарен дракон" },
] as const;

/** Stage index for a number of cleared lines + how far it is to the next one (0..1). */
export function dragonStage(lines: number): { stage: number; progress: number; toNext: number | null } {
  let stage = 0;
  for (let i = 0; i < DRAGON_STAGES.length; i++) if (lines >= DRAGON_STAGES[i]!.at) stage = i;
  const next = DRAGON_STAGES[stage + 1];
  if (!next) return { stage, progress: 1, toNext: null };
  const from = DRAGON_STAGES[stage]!.at;
  return { stage, progress: (lines - from) / (next.at - from), toNext: next.at - lines };
}

// Always in Bulgarian (the owner's words).
const LINES: Partial<Record<DragonMood, string[]>> = {
  c1: ["Браво, машина!"],
  c2: ["Супер комбо, батка!"],
  c3: ["ГигаЧад!"],
  c4: ["Баси ръките, чуек! Туй мойте ръки ли са?!"],
  danger: ["Ох, ох… внимавай!", "Леле, стига до горе!", "Дишай, дишай…"],
  sad: ["Е, нищо… пак!", "Следващия път!", "Ррр… пак!"],
};

const INK = "#1b1a24";
const CONFETTI = ["#ff5d8f", "#4dabf7", "#ffa94d", "#ffd43b", "#b197fc", "#38d9a9", "#ff6b6b"];

interface Palette {
  body: string;
  light: string;
  dark: string;
  belly: string;
  bellyLine: string;
  wing: string;
  wingDark: string;
  horn: string;
  iris: string;
  /** Outline colour (default ink; the black dragon gets a red rim so it shows on a dark page). */
  ink?: string;
}
/** Egg spots (always green: a new game, a new egg). */
const EGG_PALETTE: Palette = { body: "#7fdcaa", light: "#c9f5dc", dark: "#3d9a66", belly: "#fbf1d2", bellyLine: "#d9c48a", wing: "#9be8c2", wingDark: "#5fbf92", horn: "#f6efd9", iris: "#ffb020" };
/** One colour per level climbed in this game: green at the start … black-red at the end. */
export const DRAGON_COLORS: (Palette & { name: string })[] = [
  { name: "Зелен", body: "#52c487", light: "#9fe8bf", dark: "#2f8a58", belly: "#f8e6b0", bellyLine: "#d1b26c", wing: "#7fd9b2", wingDark: "#45a97e", horn: "#f3ead2", iris: "#ffab1a" },
  { name: "Тюркоазен", body: "#2fb8a8", light: "#86e6da", dark: "#1a7a70", belly: "#f6e8b8", bellyLine: "#cdb070", wing: "#6fd8cc", wingDark: "#2a9488", horn: "#f1ead6", iris: "#ffb020" },
  { name: "Син", body: "#3d8fe0", light: "#9cc8f6", dark: "#1f5aa0", belly: "#f4e6bc", bellyLine: "#c9ac6c", wing: "#7ab4f0", wingDark: "#2f6fbe", horn: "#efe8d8", iris: "#ffc53d" },
  { name: "Индиго", body: "#5a5ee0", light: "#a8aaf6", dark: "#33369c", belly: "#f2e2c0", bellyLine: "#c4a670", wing: "#8e90f2", wingDark: "#4144b8", horn: "#eee6d8", iris: "#ffd43b" },
  { name: "Лилав", body: "#8a4fd6", light: "#c6a0f4", dark: "#552a94", belly: "#f4dcae", bellyLine: "#c99e5c", wing: "#b07ef0", wingDark: "#6a38b4", horn: "#f0e2c8", iris: "#3ff0e0" },
  { name: "Пурпурен", body: "#c04fb8", light: "#eea0e6", dark: "#7e2478", belly: "#f6dcb0", bellyLine: "#cc9e5e", wing: "#e07ed8", wingDark: "#952f8e", horn: "#f2e4cc", iris: "#5ff0b0" },
  { name: "Огнен", body: "#e8862f", light: "#ffc890", dark: "#a4521a", belly: "#fbe6b4", bellyLine: "#d0a45a", wing: "#f8ac64", wingDark: "#bb6424", horn: "#f6ead2", iris: "#ff3d2a" },
  { name: "Червен", body: "#d93a2f", light: "#ff948a", dark: "#8e1d18", belly: "#f6d6a0", bellyLine: "#c4914c", wing: "#f06a5e", wingDark: "#a42820", horn: "#f2e2c4", iris: "#ffd43b" },
  { name: "Кървав", body: "#9c1f24", light: "#d85a5e", dark: "#5a0c10", belly: "#e8b07a", bellyLine: "#a8703c", wing: "#c43a3e", wingDark: "#6e1216", horn: "#e6d6bc", iris: "#ffb020" },
  { name: "Черно-червен", body: "#2a1416", light: "#5e2a2e", dark: "#0c0607", belly: "#b3202a", bellyLine: "#5e0a10", wing: "#a3161c", wingDark: "#3e070b", horn: "#e2d4bf", iris: "#ff2a1a", ink: "#d0202a" },
];
/** Colour index for the number of levels climbed in this game (0 = the starting level). */
export function dragonColor(levelsUp: number): number {
  return Math.max(0, Math.min(DRAGON_COLORS.length - 1, levelsUp));
}

const SPIKES: [number, number][] = [
  [113, 86],
  [105, 97],
  [97, 108],
  [89, 121],
  [83, 135],
  [80, 150],
  [64, 186],
  [48, 186],
];

export default function Dragon({
  mood,
  cheerKey,
  beat,
  stage,
  progress,
  color = 0,
}: {
  mood: DragonMood;
  cheerKey: number;
  beat: number;
  stage: number;
  progress: number;
  /** DRAGON_COLORS index (by levels climbed in this game). */
  color?: number;
}) {
  const [say, setSay] = useState<string | null>(null);
  useEffect(() => {
    const list = mood === "grow" ? [`Порасна! ${DRAGON_STAGES[stage]?.name ?? ""} 🎉`] : LINES[mood];
    if (!list?.length) {
      setSay(null);
      return;
    }
    setSay(list[Math.floor(Math.random() * list.length)]!);
    const t = setTimeout(() => setSay(null), mood === "c4" || mood === "grow" ? 3000 : mood === "danger" || mood === "sad" ? 2600 : 1800);
    return () => clearTimeout(t);
  }, [mood, cheerKey, stage]);

  const big = mood === "c3" || mood === "c4" || mood === "grow";
  const confetti = useMemo(
    () =>
      big
        ? Array.from({ length: mood === "c3" ? 26 : 46 }, (_, i) => ({
            id: i,
            left: Math.random() * 100,
            delay: Math.random() * 0.5,
            dur: 1.3 + Math.random() * 1.2,
            color: CONFETTI[i % CONFETTI.length]!,
            rot: Math.random() * 360,
            drift: (Math.random() - 0.5) * 60,
            round: Math.random() < 0.3,
          }))
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cheerKey, big],
  );
  const bursts = useMemo(
    () =>
      mood === "c4" || mood === "grow"
        ? Array.from({ length: 4 }, (_, i) => ({ id: i, x: 15 + Math.random() * 70, y: 5 + Math.random() * 35, delay: i * 0.35, color: CONFETTI[(i * 2) % CONFETTI.length]! }))
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cheerKey, mood],
  );

  const s = Math.max(0, Math.min(5, stage));
  return (
    <div className={`dr-wrap dr-${mood} dr-stage-${s}`} style={{ ["--beat" as string]: `${beat}s` }} aria-hidden>
      {(mood === "c4" || mood === "grow") && <div className={`dr-aura ${s === 5 ? "gold" : ""}`} key={`a${cheerKey}`} />}
      {say && (
        <div className={`dr-bubble ${mood === "c4" ? "huge" : ""}`} key={`b${cheerKey}${mood}`}>
          {say}
        </div>
      )}
      <svg key={`s${cheerKey}${mood === "grow" ? "g" : ""}`} className="dr-svg" viewBox="0 0 220 220" role="img">
        {s === 0 ? <Egg mood={mood} progress={progress} /> : <Beast mood={mood} s={s} c={dragonColor(color)} />}
        {mood === "sleep" && (
          <g className="dr-zzz" fill="#cfe3ff" stroke="none" fontWeight={900} fontFamily="system-ui, sans-serif">
            <text className="z1" x={s === 0 ? 150 : 176} y={s === 0 ? 96 : 60} fontSize="13">z</text>
            <text className="z2" x={s === 0 ? 160 : 186} y={s === 0 ? 82 : 46} fontSize="17">Z</text>
            <text className="z3" x={s === 0 ? 172 : 198} y={s === 0 ? 66 : 30} fontSize="21">Z</text>
          </g>
        )}
        {mood === "idle" && s > 0 && (
          <g className="dr-notes">
            <text className="n1" x="40" y="120" fontSize="16" fill="var(--accent, #5865f2)">♪</text>
            <text className="n2" x="26" y="84" fontSize="14" fill="var(--accent, #5865f2)">♫</text>
          </g>
        )}
        {mood === "grow" && (
          <g className="dr-sparkles" fill="#fff6b0" stroke="none">
            {[
              [40, 60],
              [180, 50],
              [60, 150],
              [170, 150],
              [110, 30],
              [30, 110],
              [195, 100],
            ].map(([x, y], i) => (
              <path key={i} style={{ animationDelay: `${i * 0.12}s` }} d={`M${x} ${y! - 8} L${x! + 2.2} ${y! - 2.2} L${x! + 8} ${y} L${x! + 2.2} ${y! + 2.2} L${x} ${y! + 8} L${x! - 2.2} ${y! + 2.2} L${x! - 8} ${y} L${x! - 2.2} ${y! - 2.2} Z`} />
            ))}
          </g>
        )}
      </svg>

      {confetti.length > 0 && (
        <div className="dr-confetti" key={`c${cheerKey}`}>
          {confetti.map((c) => (
            <i
              key={c.id}
              style={{
                left: `${c.left}%`,
                background: c.color,
                animationDelay: `${c.delay}s`,
                animationDuration: `${c.dur}s`,
                borderRadius: c.round ? "50%" : "1px",
                ["--rot" as string]: `${c.rot}deg`,
                ["--drift" as string]: `${c.drift}px`,
              }}
            />
          ))}
        </div>
      )}
      {bursts.map((b) => (
        <div key={`f${cheerKey}-${b.id}`} className="dr-firework" style={{ left: `${b.x}%`, top: `${b.y}%`, animationDelay: `${b.delay}s`, ["--fw" as string]: b.color }}>
          {Array.from({ length: 12 }, (_, i) => (
            <span key={i} style={{ ["--a" as string]: `${i * 30}deg`, animationDelay: `${b.delay}s` }} />
          ))}
        </div>
      ))}
    </div>
  );
}

/* ───────────── the egg ───────────── */

const EGG = "M112 70 Q150 72 156 136 Q160 194 112 196 Q64 194 68 136 Q74 72 112 70 Z";

function Egg({ mood, progress }: { mood: DragonMood; progress: number }) {
  const p = EGG_PALETTE;
  const cracks = Math.floor(progress * 4); // more cracks as it gets close to hatching
  return (
    <g stroke={INK} strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round">
      <defs>
        <radialGradient id="drEggG" cx="0.38" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#fffdf3" />
          <stop offset="0.55" stopColor="#f3e8c8" />
          <stop offset="1" stopColor="#cdb98a" />
        </radialGradient>
        <clipPath id="drEggClip">
          <path d={EGG} />
        </clipPath>
      </defs>
      {/* nest */}
      <ellipse cx="112" cy="200" rx="62" ry="12" fill="#000" opacity={0.35} stroke="none" />
      <path d="M50 190 Q112 214 174 190 Q178 204 160 210 Q112 222 64 210 Q46 204 50 190 Z" fill="#9a6a3a" />
      <g className="dr-egg">
        <path d={EGG} fill="url(#drEggG)" />
        <g clipPath="url(#drEggClip)" stroke="none">
          {/* dragon-scale patches */}
          <path d="M82 104 Q92 96 100 106 Q92 112 82 104 Z M120 92 Q132 86 138 98 Q128 102 120 92 Z M92 150 Q106 140 116 154 Q104 162 92 150 Z M128 128 Q142 120 150 134 Q138 140 128 128 Z M70 132 Q78 126 84 136 Q76 140 70 132 Z M120 176 Q132 168 142 180 Q130 186 120 176 Z" fill={p.body} opacity={0.85} />
          <path d="M86 104 Q92 100 97 106 M124 93 Q131 90 135 98 M96 150 Q106 144 112 154 M132 128 Q140 124 146 134" fill="none" stroke={p.dark} strokeWidth={1.4} />
          <path d="M84 84 Q96 74 110 76 Q94 82 88 96 Z" fill="#fff" opacity={0.7} />
          <path d={EGG} fill="none" stroke="#000" strokeWidth={10} opacity={0.08} />
        </g>
        <path d={EGG} fill="none" />
        {/* cracks, more and more */}
        {cracks >= 1 && <path d="M98 92 L106 100 L100 106 L110 114" fill="none" strokeWidth={1.8} />}
        {cracks >= 2 && <path d="M140 120 L132 126 L138 132 L128 138" fill="none" strokeWidth={1.8} />}
        {cracks >= 3 && <path d="M78 150 L90 146 L86 156 L98 158" fill="none" strokeWidth={1.8} />}
        {/* almost there: a hole with two eyes peeking out */}
        {progress >= 0.5 && (
          <g>
            <path d="M104 120 L110 114 L116 120 L124 116 L126 126 Q114 134 102 128 Z" fill="#1d1b2a" strokeWidth={1.8} />
            {mood === "sleep" ? (
              <path d="M107 123 L111 123 M116 122 L120 122" fill="none" stroke="#ffd43b" strokeWidth={1.4} />
            ) : (
              <g className="dr-peek" stroke="none" fill="#ffd43b">
                <circle cx="109" cy="123" r="2.2" />
                <circle cx="118" cy="122" r="2.2" />
              </g>
            )}
          </g>
        )}
      </g>
      {/* straw in front */}
      <path d="M56 196 L76 188 M70 202 L92 194 M150 190 L168 198 M136 198 L156 192 M100 204 L118 198 M120 206 L140 200" fill="none" stroke="#c99a5c" strokeWidth={2.2} />
    </g>
  );
}

/* ───────────── the dragon ───────────── */

function Beast({ mood, s, c }: { mood: DragonMood; s: number; c: number }) {
  const p = DRAGON_COLORS[c]!;
  const id = `${s}-${c}`; // gradient ids follow the colour
  const k = (s - 1) / 4; // 0 = baby … 1 = legendary
  const bodyScale = 0.68 + 0.34 * k;
  const headScale = 1.34 - 0.32 * k; // babies: big head
  const wingScale = 0.48 + 0.6 * k;
  const eyeScale = 1.25 - 0.25 * k;
  const hornLen = s === 1 ? 0 : 0.45 + 0.17 * s; // 0 = only nubs
  const spikes = s === 1 ? 0 : Math.min(SPIKES.length, 2 + s);
  const happy = mood === "c1" || mood === "c2" || mood === "c3" || mood === "c4" || mood === "grow";
  const mouthOpen = mood === "c2" || mood === "c3" || mood === "c4" || mood === "grow";
  const fire = mood === "c4";

  const wing = (far: boolean) => (
    <g className={far ? "dr-wing dr-wing-far" : "dr-wing dr-wing-near"}>
      <g transform={`translate(${far ? 92 : 100} ${far ? 112 : 118}) scale(${wingScale}) translate(-100 -118)`}>
        <path
          d="M100 118 L80 66 Q56 44 26 48 Q42 64 36 84 Q52 86 56 104 Q74 102 84 120 Z"
          fill={far ? p.wingDark : `url(#drWingG${id})`}
        />
        <path d="M80 66 L28 50 M80 66 L38 83 M80 66 L57 102" fill="none" stroke={far ? p.dark : p.wingDark} strokeWidth={2} />
        <path d="M100 118 L80 66" fill="none" stroke={p.dark} strokeWidth={5.5} />
        <path d="M80 66 L74 54 L84 62 Z" fill={p.horn} strokeWidth={1.6} />
      </g>
    </g>
  );

  return (
    <g stroke={p.ink ?? INK} strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round">
      <defs>
        <radialGradient id={`drBodyG${id}`} cx="0.65" cy="0.25" r="0.85">
          <stop offset="0" stopColor={p.light} />
          <stop offset="0.55" stopColor={p.body} />
          <stop offset="1" stopColor={p.dark} />
        </radialGradient>
        <linearGradient id={`drWingG${id}`} x1="1" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor={p.wing} />
          <stop offset="1" stopColor={p.wingDark} />
        </linearGradient>
        <radialGradient id="drFireG" cx="0" cy="0.5" r="1">
          <stop offset="0" stopColor="#fffbe0" />
          <stop offset="0.3" stopColor="#ffd43b" />
          <stop offset="0.7" stopColor="#ff7a1a" />
          <stop offset="1" stopColor="#e8301a" stopOpacity="0.2" />
        </radialGradient>
        <pattern id={`drScales${id}`} width="9" height="7" patternUnits="userSpaceOnUse">
          <path d="M0 7 Q4.5 1 9 7" fill="none" stroke={p.dark} strokeWidth="1" opacity="0.4" />
        </pattern>
      </defs>

      <ellipse className="dr-shadow" cx="112" cy="206" rx={34 + 22 * k} ry="6" fill="#000" opacity={0.35} stroke="none" />

      <g className="dr-all">
        <g transform={`translate(112 204) scale(${bodyScale}) translate(-112 -204)`}>
          {/* tail with a spade tip */}
          <g className="dr-tail">
            <path d="M92 176 Q60 202 36 188 Q20 178 24 160 Q32 174 46 178 Q66 182 86 160 Z" fill={`url(#drBodyG${id})`} />
            <path d="M92 176 Q60 202 36 188 Q20 178 24 160 Q32 174 46 178 Q66 182 86 160 Z" fill={`url(#drScales${id})`} stroke="none" />
            <path d="M26 164 Q8 160 10 144 Q20 150 28 151 Q28 140 40 136 Q42 152 26 164 Z" fill={p.dark} />
            {SPIKES.slice(6, 6 + Math.max(0, spikes - 4)).map(([x, y], i) => (
              <path key={i} d={`M${x - 5} ${y - 2} L${x} ${y - 11} L${x + 5} ${y - 1} Z`} fill={p.horn} strokeWidth={1.6} />
            ))}
          </g>

          {wing(true)}

          {/* far foot */}
          <path d="M100 196 Q112 192 120 200 L120 204 L98 204 Z" fill={p.dark} />

          {/* body, belly plates */}
          <path d="M84 122 Q72 152 80 182 Q90 204 122 202 Q150 200 154 174 Q158 146 140 122 Q124 104 102 108 Q88 112 84 122 Z" fill={`url(#drBodyG${id})`} />
          <path d="M84 122 Q72 152 80 182 Q90 204 122 202 Q150 200 154 174 Q158 146 140 122 Q124 104 102 108 Q88 112 84 122 Z" fill={`url(#drScales${id})`} stroke="none" />
          <path d="M124 116 Q146 132 148 166 Q146 192 124 199 Q109 180 111 152 Q111 130 124 116 Z" fill={p.belly} />
          <path d="M117 130 Q131 126 141 133 M113 145 Q131 141 146 147 M112 160 Q130 156 147 162 M113 175 Q130 172 145 176 M117 189 Q129 187 139 189" fill="none" stroke={p.bellyLine} strokeWidth={1.5} />

          {/* neck */}
          <path d="M104 116 Q106 92 120 80 L146 90 Q132 100 130 122 Z" fill={`url(#drBodyG${id})`} />
          <path d="M131 94 Q140 96 144 98 Q134 106 131 122 Q127 106 131 94 Z" fill={p.belly} strokeWidth={1.8} />

          {/* back spikes */}
          {SPIKES.slice(0, Math.min(6, spikes)).map(([x, y], i) => (
            <path key={i} d={`M${x - 6} ${y + 3} L${x - 7} ${y - 9 - k * 4} L${x + 4} ${y - 2} Z`} fill={p.horn} strokeWidth={1.8} />
          ))}
          {s === 5 && <path d="M92 132 Q100 126 106 134 M88 152 Q96 146 104 154 M96 172 Q104 166 110 174" fill="none" stroke="#ffd43b" strokeWidth={2} className="dr-runes" />}

          {/* hind leg + claws */}
          <g className="dr-leg">
            <path d="M88 156 Q76 186 96 200 L130 202 Q134 192 120 186 Q118 164 104 154 Q94 150 88 156 Z" fill={`url(#drBodyG${id})`} />
            <path d="M96 168 Q104 176 104 188" fill="none" stroke={p.dark} strokeWidth={1.6} />
            <path d="M94 160 Q104 158 112 166 Q102 164 96 170 Z" fill="#fff" opacity={0.3} stroke="none" />
            <path d="M124 201 L131 206 L126 206 Z M130 198 L138 203 L133 204 Z M134 193 L142 197 L137 199 Z" fill="#fff" strokeWidth={1.4} />
          </g>

          {/* front arm + claws */}
          <g className="dr-arm">
            <path d="M128 120 Q148 124 156 142 Q159 151 153 154 Q147 149 140 143 Q128 136 124 128 Z" fill={`url(#drBodyG${id})`} />
            <path d="M134 128 Q144 134 150 144" fill="none" stroke={p.dark} strokeWidth={1.4} />
            <path d="M152 153 L157 159 L151 157 Z M156 149 L162 153 L156 153 Z" fill="#fff" strokeWidth={1.3} />
          </g>

          {wing(false)}

          {/* head */}
          <g className="dr-head">
            <g transform={`translate(132 90) scale(${headScale}) translate(-132 -90)`}>
              {/* horns (nubs on a baby) */}
              {hornLen > 0 ? (
                <g fill={p.horn}>
                  <path d={`M134 52 Q${134 - 22 * hornLen} ${50 - 26 * hornLen} ${134 - 40 * hornLen} ${50 - 24 * hornLen} Q${134 - 22 * hornLen} ${52 - 12 * hornLen} 126 60 Z`} />
                  <path d={`M146 48 Q${146 - 12 * hornLen} ${44 - 26 * hornLen} ${146 - 26 * hornLen} ${42 - 28 * hornLen} Q${146 - 10 * hornLen} ${46 - 12 * hornLen} 140 54 Z`} fill={p.horn} />
                  <path d={`M${134 - 30 * hornLen} ${50 - 21 * hornLen} L${134 - 26 * hornLen} ${50 - 14 * hornLen}`} fill="none" strokeWidth={1.2} />
                </g>
              ) : (
                <g fill={p.horn}>
                  <path d="M128 54 Q124 44 132 42 Q136 48 134 54 Z" />
                  <path d="M142 48 Q140 38 148 38 Q150 44 148 50 Z" />
                </g>
              )}
              {/* ear frill */}
              <path d="M124 64 L100 56 L108 66 L98 72 L106 76 L122 76 Z" fill={`url(#drWingG${id})`} />
              <path d="M122 68 L104 62 M122 72 L102 72" fill="none" stroke={p.wingDark} strokeWidth={1.3} />

              {/* skull + snout */}
              <path d="M118 76 Q115 50 138 44 Q158 40 166 54 Q186 56 195 68 Q200 80 190 86 Q178 92 160 90 Q146 99 130 95 Q117 89 118 76 Z" fill={`url(#drBodyG${id})`} />
              <path d="M118 76 Q115 50 138 44 Q158 40 166 54 Q186 56 195 68 Q200 80 190 86 Q178 92 160 90 Q146 99 130 95 Q117 89 118 76 Z" fill={`url(#drScales${id})`} stroke="none" opacity={0.7} />
              <path d="M136 50 Q146 44 158 48 Q148 48 140 56 Z" fill="#fff" opacity={0.45} stroke="none" />
              {/* lower jaw */}
              <path d="M138 90 Q160 98 186 88 Q182 98 166 100 Q148 102 138 94 Z" fill={p.belly} strokeWidth={1.8} />

              {/* mouth */}
              {mouthOpen ? (
                <g>
                  <path d="M150 86 Q170 108 192 82 Q176 88 150 86 Z" fill="#7a1f2b" />
                  <path d="M160 94 Q170 100 180 92 Q170 92 160 94 Z" fill="#ff7a8a" stroke="none" />
                  <path d="M176 86 L179 92 L182 85 Z M164 87 L166 92 L169 87 Z" fill="#fff" strokeWidth={1.1} />
                </g>
              ) : mood === "sad" ? (
                <path d="M152 92 Q166 84 186 88" fill="none" strokeWidth={2} />
              ) : mood === "danger" ? (
                <path d="M152 88 Q156 85 160 88 Q164 91 168 88 Q172 85 176 88 Q180 91 186 86" fill="none" strokeWidth={2} />
              ) : (
                <g>
                  <path d="M150 88 Q170 92 190 84" fill="none" strokeWidth={2} />
                  <path d="M176 86 L178 91 L181 86 Z" fill="#fff" strokeWidth={1.1} />
                </g>
              )}
              {/* nostril + cheek */}
              <ellipse cx="189" cy="70" rx="2.8" ry="1.9" fill={INK} stroke="none" transform="rotate(-15 189 70)" />
              <circle cx="160" cy="79" r="5" fill="#ff6f96" opacity={0.6} stroke="none" />

              {/* eye */}
              <g transform={`translate(148 63) scale(${eyeScale}) translate(-148 -63)`}>
                {mood === "sleep" ? (
                  <path d="M139 64 Q148 70 157 64" fill="none" strokeWidth={2.4} />
                ) : happy ? (
                  <path d="M139 66 Q148 55 157 66" fill="none" strokeWidth={2.8} />
                ) : (
                  <g className="dr-blink">
                    <ellipse cx="148" cy="63" rx="9" ry="10" fill="#fff" />
                    <circle cx={mood === "danger" ? 148 : 151} cy="64" r={mood === "danger" ? 3.4 : 6.6} fill={p.iris} stroke="none" />
                    <ellipse className="dr-pupil" cx={mood === "danger" ? 148 : 152} cy="64" rx={mood === "danger" ? 1.4 : 2.2} ry={mood === "danger" ? 2 : 5} fill={INK} stroke="none" />
                    <circle cx="154" cy="59" r="2.4" fill="#fff" stroke="none" />
                    <circle cx="149" cy="68" r="1.1" fill="#fff" stroke="none" />
                  </g>
                )}
                {mood === "sad" && <path className="dr-tear" d="M146 74 Q143 80 146 83 Q149 80 146 74 Z" fill="#7cc4ff" strokeWidth={1.2} />}
              </g>
              {/* brow ridge */}
              <path
                d={
                  mood === "danger"
                    ? "M136 50 Q148 42 160 50 L158 53 Q148 47 138 53 Z"
                    : mood === "sad"
                      ? "M138 52 Q150 50 160 46 L160 50 Q150 54 139 56 Z"
                      : "M137 51 Q149 46 161 51 L159 54 Q149 50 138 55 Z"
                }
                fill={p.dark}
                strokeWidth={1.6}
              />
              {mood === "danger" && <path className="dr-sweat" d="M168 44 Q164 51 168 54 Q172 51 168 44 Z" fill="#8fd3ff" strokeWidth={1.2} />}

              {/* smoke puffs (c2) and fire (c4) at the well */}
              {mood === "c2" && (
                <g className="dr-smoke" fill="#d9dde6" stroke="none" opacity={0.9}>
                  <circle cx="196" cy="64" r="4" />
                  <circle cx="202" cy="56" r="5" />
                  <circle cx="206" cy="46" r="6" />
                </g>
              )}
              {fire && (
                <g className="dr-fire" stroke="none">
                  <path d="M190 84 Q230 60 286 72 Q262 86 290 98 Q232 104 190 90 Z" fill="url(#drFireG)" />
                  <path d="M192 86 Q222 74 258 80 Q240 88 262 94 Q224 98 192 89 Z" fill="#ffe27a" opacity={0.9} />
                  <path d="M192 87 Q212 82 232 85 Q220 89 232 92 Q210 93 192 88 Z" fill="#fffbe0" />
                </g>
              )}
            </g>
          </g>
        </g>
      </g>
    </g>
  );
}
