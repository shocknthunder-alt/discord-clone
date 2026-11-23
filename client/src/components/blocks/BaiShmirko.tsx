import { useEffect, useMemo, useState } from "react";
import { tr } from "../../i18n";
import "./baiShmirko.css";

/**
 * 👴🦯 Бай Шмирко — our own cartoon fan next to the Шметрис well, drawn in profile looking at the
 * well: a tall, lanky, hunched, grumpy old farmer (red cap, round glasses, long sharp nose, droopy
 * white moustache, checked shirt, denim overalls) with a walking stick, flat colours + thick ink
 * outlines. He taps the stick to the music and cheers when lines go — more lines, wilder: stick in
 * the air → dance with a stick twirl → a backflip (cap flies off) → air guitar on the stick with
 * fireworks. Sweats when the stack gets high, slumps on the stick when the game is over.
 */

export type ShmirkoMood = "idle" | "c1" | "c2" | "c3" | "c4" | "danger" | "sad";

const LINES: Record<ShmirkoMood, [string, string][]> = {
  idle: [],
  c1: [["Браво, машина!", "Bravo, machine!"]],
  c2: [["Супер комбо, батка!", "Super combo, bro!"]],
  c3: [["ГигаЧад!", "GigaChad!"]],
  c4: [["Баси ръките, чуек! Туй мойте ръки ли са?!", "What hands, man! Are these MY hands?!"]],
  danger: [
    ["Ох, ох… внимавай!", "Oh no… careful!"],
    ["Леле, стига до горе!", "It's nearly at the top!"],
    ["Дишай, дишай…", "Breathe, breathe…"],
  ],
  sad: [
    ["Е, нищо… пак!", "Oh well… again!"],
    ["Следващия път!", "Next time!"],
    ["Ох, кръстът ми…", "Oh, my back…"],
  ],
};

const INK = "#1d1a17"; // cartoon outlines
const CONFETTI = ["#ff5d8f", "#4dabf7", "#ffa94d", "#ffd43b", "#b197fc", "#38d9a9", "#ff6b6b"];

export default function BaiShmirko({ mood, cheerKey, beat }: { mood: ShmirkoMood; cheerKey: number; beat: number }) {
  const [say, setSay] = useState<string | null>(null);
  useEffect(() => {
    const list = LINES[mood];
    if (!list.length) {
      setSay(null);
      return;
    }
    const [bg, en] = list[Math.floor(Math.random() * list.length)]!;
    setSay(tr(bg, en));
    const t = setTimeout(() => setSay(null), mood === "c4" ? 3000 : mood === "danger" || mood === "sad" ? 2600 : 1800);
    return () => clearTimeout(t);
  }, [mood, cheerKey]);

  const big = mood === "c3" || mood === "c4";
  const confetti = useMemo(
    () =>
      big
        ? Array.from({ length: mood === "c4" ? 46 : 26 }, (_, i) => ({
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
      mood === "c4"
        ? Array.from({ length: 4 }, (_, i) => ({ id: i, x: 15 + Math.random() * 70, y: 5 + Math.random() * 35, delay: i * 0.35, color: CONFETTI[(i * 2) % CONFETTI.length]! }))
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cheerKey, mood],
  );

  const happy = mood.startsWith("c");
  const worried = mood === "danger" || mood === "sad";
  return (
    <div className={`bs-wrap bs-${mood}`} style={{ ["--beat" as string]: `${beat}s` }} aria-hidden>
      {mood === "c4" && <div className="bs-aura" key={`a${cheerKey}`} />}
      {say && (
        <div className={`bs-bubble ${mood === "c4" ? "huge" : ""}`} key={`b${cheerKey}${mood}`}>
          {say}
        </div>
      )}
      <svg key={`s${cheerKey}`} className="bs-svg" viewBox="0 0 220 300" role="img">
        <defs>
          <clipPath id="bsShirtClip">
            <path d="M86 112 Q70 142 86 182 L127 182 Q133 150 129 116 Q118 102 100 104 Q90 106 86 112 Z" />
          </clipPath>
        </defs>

        <ellipse className="bs-shadow" cx="122" cy="287" rx="56" ry="7" fill="#000" opacity="0.35" />

        <g className="bs-all" stroke={INK} strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round">
          {/* far leg (darker) */}
          <g className="bs-leg bs-leg-l">
            <path d="M94 178 Q90 226 95 268 L112 268 Q113 226 113 182 Z" fill="#2f5a92" />
            <path d="M90 266 L126 267 Q138 269 137 280 L90 281 Q86 274 90 266 Z" fill="#4e2f18" />
          </g>

          {/* far arm: hand behind the back (waves / strums when cheering) */}
          <g className="bs-arm bs-arm-l">
            <path d="M98 116 L80 146" stroke={INK} strokeWidth={15} />
            <path d="M98 116 L80 146" stroke="#a8372d" strokeWidth={10.5} />
            <path d="M80 146 L90 170" stroke={INK} strokeWidth={10.5} />
            <path d="M80 146 L90 170" stroke="#e2a87f" strokeWidth={6.5} />
            <circle cx="91" cy="172" r="6" fill="#e2a87f" />
          </g>

          {/* near leg */}
          <g className="bs-leg bs-leg-r">
            <path d="M104 180 Q113 222 116 268 L135 268 Q131 222 125 178 Z" fill="#3e6fb0" />
            <path d="M117 196 Q123 232 126 266" stroke="#f2c94c" strokeWidth={1.1} strokeDasharray="3 2.5" fill="none" />
            <path d="M109 266 L152 267 Q166 270 164 282 L109 283 Q104 275 109 266 Z" fill="#6b4226" />
            <path d="M110 278 L163 278" stroke={INK} strokeWidth={2} />
            <path d="M130 270 L138 270 M129 273.5 L139 273.5" stroke="#f1dfbf" strokeWidth={1.2} />
          </g>

          {/* hunched body: checked shirt, overalls */}
          <g className="bs-body">
            <path d="M86 112 Q70 142 86 182 L127 182 Q133 150 129 116 Q118 102 100 104 Q90 106 86 112 Z" fill="#d2473b" />
            <g clipPath="url(#bsShirtClip)" stroke="#9e2c23" strokeWidth={3.2} opacity={0.75}>
              <path d="M92 100 L88 190 M106 100 L106 190 M120 100 L122 190" />
              <path d="M70 128 L135 124 M70 150 L135 148" />
            </g>
            <path d="M86 112 Q70 142 86 182 L127 182 Q133 150 129 116 Q118 102 100 104 Q90 106 86 112 Z" fill="none" />
            <path d="M110 128 L129 125 Q132 150 128 176 L103 176 Z" fill="#3e6fb0" />
            <path d="M112 127 Q103 110 90 113 L88 121 Q100 119 106 130 Z" fill="#3e6fb0" />
            <path d="M84 172 L129 172 L128 190 L86 190 Z" fill="#3e6fb0" />
            <path d="M88 181 L127 181" stroke="#f2c94c" strokeWidth={1.1} strokeDasharray="3 2.5" fill="none" />
            <circle cx="114" cy="131" r="3.6" fill="#f2c94c" />
          </g>

          {/* near arm with the walking stick */}
          <g className="bs-arm bs-arm-r">
            <path d="M108 118 L122 148" stroke={INK} strokeWidth={15} />
            <path d="M108 118 L122 148" stroke="#d2473b" strokeWidth={10.5} />
            <circle cx="122" cy="148" r="7" fill="#9e2c23" />
            <path d="M122 148 L144 167" stroke={INK} strokeWidth={10.5} />
            <path d="M122 148 L144 167" stroke="#f3c39b" strokeWidth={6.5} />
            <g className="bs-cane">
              <path d="M146 172 L156 283" stroke={INK} strokeWidth={9} />
              <path d="M146 172 L156 283" stroke="#a8693a" strokeWidth={5} />
              <path d="M146 174 Q139 156 152 153 Q165 153 164 166" stroke={INK} strokeWidth={9} fill="none" />
              <path d="M146 174 Q139 156 152 153 Q165 153 164 166" stroke="#a8693a" strokeWidth={5} fill="none" />
              <path d="M150 200 L153 240" stroke="#d99a62" strokeWidth={1.4} />
              <path d="M152.5 278 L159 278 L159.6 286 L153.3 286 Z" fill="#2a2a2a" strokeWidth={1.6} />
            </g>
            <circle cx="146" cy="169" r="7" fill="#f3c39b" />
          </g>

          {/* head in profile, looking at the well (to the right) */}
          <g className="bs-head">
            <path d="M115 100 L128 90 L136 104 L123 112 Z" fill="#e8b08a" />
            <path
              d="M118 52 Q115 92 128 102 Q142 109 160 103 Q165 97 162 89 L158 79 Q162 66 160 56 Q150 40 132 42 Q120 44 118 52 Z"
              fill="#f3c39b"
            />
            <path d="M117 58 Q109 67 116 78 Q118 67 123 61 Z" fill="#ece7de" />
            <ellipse cx="129" cy="73" rx="6" ry="9" fill="#f3c39b" />
            <path d="M128 68 Q132 73 128 78" fill="none" strokeWidth={1.6} />
            <circle cx="142" cy="84" r="5.5" fill="#ff8f86" opacity={0.55} stroke="none" />
            <path d="M143 74 L139 76 M144 78 L140 80" fill="none" strokeWidth={1.3} />

            {/* the long, sharp nose */}
            <path d="M157 69 Q172 74 197 86 Q177 88 157 85 Z" fill="#f3c39b" />
            <path d="M184 83 Q190 84 194 86" fill="none" stroke="#e9806d" strokeWidth={2} />

            {/* eye (inside the glasses) per mood */}
            {mood === "idle" && (
              <g className="bs-blink">
                <circle cx="152" cy="67" r="2.6" fill={INK} stroke="none" />
                <path d="M146 63.5 L158 62" fill="none" strokeWidth={2.4} />
              </g>
            )}
            {(mood === "c1" || mood === "c2" || mood === "c3") && <path d="M146.5 68 Q152 61 157.5 68" fill="none" strokeWidth={2.6} />}
            {mood === "c4" && (
              <path
                className="bs-star-eyes"
                d="M152 59.5 L154 64.6 L159.4 65 L155.3 68.4 L156.6 73.6 L152 70.8 L147.4 73.6 L148.7 68.4 L144.6 65 L150 64.6 Z"
                fill="#ffd43b"
                strokeWidth={1.2}
              />
            )}
            {mood === "danger" && (
              <g>
                <circle cx="152" cy="66" r="5.2" fill="#fff" strokeWidth={1.6} />
                <circle className="bs-pupil" cx="153" cy="66.5" r="2" fill={INK} stroke="none" />
              </g>
            )}
            {mood === "sad" && (
              <g>
                <path d="M146.5 65 Q152 70 157.5 65" fill="none" strokeWidth={2.4} />
                <path className="bs-tear" d="M150 72 Q147.5 77 150 79.5 Q152.5 77 150 72 Z" fill="#7cc4ff" strokeWidth={1.2} />
              </g>
            )}

            {/* round glasses */}
            <circle cx="152" cy="66" r="8.5" fill="#dff1ff" fillOpacity={0.3} strokeWidth={2.2} />
            <path d="M143.5 66 L130 69" fill="none" strokeWidth={1.8} />
            <path d="M147 61 Q149 59 152 59" fill="none" stroke="#fff" strokeWidth={1.4} />

            {/* grumpy bushy eyebrow */}
            <path
              d={
                happy
                  ? "M140 54 Q150 47 161 53 L159 57 Q150 52 141 58 Z"
                  : worried
                    ? "M141 53 Q150 57 160 55 L159 59 Q150 61 141 57 Z"
                    : "M139 53 Q151 53 162 60 L159 63 Q150 58 140 58 Z"
              }
              fill="#ece7de"
            />

            {/* mouth under the moustache */}
            {mood === "idle" && <path d="M155 100 Q161 97 168 101" fill="none" stroke="#7a2d22" strokeWidth={2.2} />}
            {happy && (
              <g>
                <path d={mood === "c1" ? "M153 96 Q159 107 169 97 Z" : "M151 95 Q158 112 172 96 Z"} fill="#7a1f1f" />
                <path d="M156 101 Q160 104 165 101 Q160 99 156 101 Z" fill="#e86a6a" stroke="none" />
              </g>
            )}
            {mood === "danger" && <path d="M154 100 Q157 97 160 100 Q163 103 166 100 Q168 98 170 100" fill="none" stroke="#7a2d22" strokeWidth={2} />}
            {mood === "sad" && <path d="M155 102 Q161 96 168 101" fill="none" stroke="#7a2d22" strokeWidth={2.2} />}

            {/* droopy white moustache */}
            <path d="M157 84 Q149 86 147 93 Q155 97 165 94 Q174 97 180 91 Q171 86 163 84 Z" fill="#f4f1ea" />
            <path d="M154 90 Q160 92 166 90" fill="none" stroke="#c9c2b8" strokeWidth={1.2} />

            {mood === "danger" && (
              <g>
                <path className="bs-sweat s1" d="M126 44 Q122 51 126 54 Q130 51 126 44 Z" fill="#8fd3ff" strokeWidth={1.2} />
                <path className="bs-sweat s2" d="M114 56 Q110 63 114 66 Q118 63 114 56 Z" fill="#8fd3ff" strokeWidth={1.2} />
              </g>
            )}

            {/* the cap (кепе), visor forward */}
            <g className="bs-cap">
              <path d="M113 61 Q110 33 138 31 Q164 33 165 56 Q141 51 113 61 Z" fill="#d64541" />
              <path d="M147 33 Q163 38 165 56 L151 54 Q151 42 147 33 Z" fill="#f5f1e8" />
              <text x="152.5" y="50" fontSize="10" fontWeight="900" fill="#d64541" stroke="none" fontFamily="system-ui, sans-serif">
                Ш
              </text>
              <path d="M160 54 Q181 51 200 60 Q190 67 160 62 Z" fill="#b8352f" />
              <path d="M162 58 Q180 57 194 61" fill="none" stroke="#e06a5f" strokeWidth={1.2} />
              <path d="M126 40 Q130 48 128 57" fill="none" strokeWidth={1.4} />
              <circle cx="138" cy="31.5" r="2.6" fill="#b8352f" />
            </g>
          </g>
        </g>

        {mood === "idle" && (
          <g className="bs-notes">
            <text className="n1" x="186" y="120" fontSize="16" fill="var(--accent, #5865f2)">♪</text>
            <text className="n2" x="40" y="96" fontSize="14" fill="var(--accent, #5865f2)">♫</text>
          </g>
        )}
      </svg>

      {confetti.length > 0 && (
        <div className="bs-confetti" key={`c${cheerKey}`}>
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
        <div key={`f${cheerKey}-${b.id}`} className="bs-firework" style={{ left: `${b.x}%`, top: `${b.y}%`, animationDelay: `${b.delay}s`, ["--fw" as string]: b.color }}>
          {Array.from({ length: 12 }, (_, i) => (
            <span key={i} style={{ ["--a" as string]: `${i * 30}deg`, animationDelay: `${b.delay}s` }} />
          ))}
        </div>
      ))}
    </div>
  );
}
