import { useEffect, useMemo, useState } from "react";
import "./baiShmirko.css";

/**
 * 👴🦯 Бай Шмирко — our own cartoon fan next to the Шметрис well, drawn in profile looking at the
 * well: a tall, lanky, hunched, grumpy old farmer (red cap, round glasses, long, slightly hooked
 * nose, clean-shaven, checked shirt, denim overalls) with a walking stick, flat colours + thick ink
 * outlines. He taps the stick to the music and cheers when lines go — more lines, wilder: stick in
 * the air → dance with a stick twirl → a backflip (cap flies off) → air guitar on the stick with
 * fireworks. Sweats when the stack gets high, slumps on the stick when the game is over.
 */

export type ShmirkoMood = "idle" | "c1" | "c2" | "c3" | "c4" | "danger" | "sad";

// Always in Bulgarian (the owner's words), whatever the app language is.
const LINES: Record<ShmirkoMood, string[]> = {
  idle: [],
  c1: ["Браво, машина!"],
  c2: ["Супер комбо, батка!"],
  c3: ["ГигаЧад!"],
  c4: ["Баси ръките, чуек! Туй мойте ръки ли са?!"],
  danger: ["Ох, ох… внимавай!", "Леле, стига до горе!", "Дишай, дишай…"],
  sad: ["Е, нищо… пак!", "Следващия път!", "Ох, кръстът ми…"],
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
    setSay(list[Math.floor(Math.random() * list.length)]!);
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
            <path d="M94 108 Q74 120 82 150 Q86 168 90 184 L118 184 Q121 156 119 128 Q118 112 110 104 Q100 100 94 108 Z" />
          </clipPath>
        </defs>

        <ellipse className="bs-shadow" cx="120" cy="287" rx="44" ry="7" fill="#000" opacity="0.35" />

        <g className="bs-all" stroke={INK} strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round">
          {/* far leg (darker) */}
          <g className="bs-leg bs-leg-l">
            <path d="M96 180 Q94 226 98 268 L109 268 Q110 226 108 182 Z" fill="#2f5a92" />
            <path d="M93 266 L120 267 Q130 269 129 280 L93 281 Q89 274 93 266 Z" fill="#4e2f18" />
          </g>

          {/* far arm: hand behind the back (waves / strums when cheering) */}
          <g className="bs-arm bs-arm-l">
            <path d="M98 116 L80 146" stroke={INK} strokeWidth={11.5} />
            <path d="M98 116 L80 146" stroke="#a8372d" strokeWidth={7.5} />
            <path d="M80 146 L90 170" stroke={INK} strokeWidth={8.5} />
            <path d="M80 146 L90 170" stroke="#e2a87f" strokeWidth={5} />
            <circle cx="91" cy="172" r="5" fill="#e2a87f" />
          </g>

          {/* near leg */}
          <g className="bs-leg bs-leg-r">
            <path d="M104 180 Q111 222 113 268 L126 268 Q124 222 117 178 Z" fill="#3e6fb0" />
            <path d="M111 196 Q116 232 119 266" stroke="#f2c94c" strokeWidth={1.1} strokeDasharray="3 2.5" fill="none" />
            <path d="M106 266 L143 267 Q156 270 154 282 L106 283 Q101 275 106 266 Z" fill="#6b4226" />
            <path d="M107 278 L153 278" stroke={INK} strokeWidth={2} />
            <path d="M124 270 L131 270 M123 273.5 L132 273.5" stroke="#f1dfbf" strokeWidth={1.2} />
          </g>

          {/* hunched body: checked shirt, overalls */}
          <g className="bs-body">
            <path d="M94 108 Q74 120 82 150 Q86 168 90 184 L118 184 Q121 156 119 128 Q118 112 110 104 Q100 100 94 108 Z" fill="#d2473b" />
            <g clipPath="url(#bsShirtClip)" stroke="#9e2c23" strokeWidth={3.2} opacity={0.75}>
              <path d="M90 100 L86 190 M102 100 L102 190 M114 100 L116 190" />
              <path d="M70 128 L135 124 M70 150 L135 148" />
            </g>
            <path d="M94 108 Q74 120 82 150 Q86 168 90 184 L118 184 Q121 156 119 128 Q118 112 110 104 Q100 100 94 108 Z" fill="none" />
            <path d="M104 132 L119 129 Q121 155 118 177 L98 177 Z" fill="#3e6fb0" />
            <path d="M106 131 Q99 113 88 114 L86 121 Q96 121 101 133 Z" fill="#3e6fb0" />
            <path d="M86 172 L119 172 L118 190 L89 190 Z" fill="#3e6fb0" />
            <path d="M90 181 L117 181" stroke="#f2c94c" strokeWidth={1.1} strokeDasharray="3 2.5" fill="none" />
            <circle cx="110" cy="135" r="3.2" fill="#f2c94c" />
          </g>

          {/* near arm with the walking stick */}
          <g className="bs-arm bs-arm-r">
            <path d="M108 118 L122 148" stroke={INK} strokeWidth={11.5} />
            <path d="M108 118 L122 148" stroke="#d2473b" strokeWidth={7.5} />
            <circle cx="122" cy="148" r="5" fill="#9e2c23" />
            <path d="M122 148 L144 167" stroke={INK} strokeWidth={8.5} />
            <path d="M122 148 L144 167" stroke="#f3c39b" strokeWidth={5} />
            <g className="bs-cane">
              <path d="M146 172 L156 283" stroke={INK} strokeWidth={9} />
              <path d="M146 172 L156 283" stroke="#a8693a" strokeWidth={5} />
              <path d="M146 174 Q139 156 152 153 Q165 153 164 166" stroke={INK} strokeWidth={9} fill="none" />
              <path d="M146 174 Q139 156 152 153 Q165 153 164 166" stroke="#a8693a" strokeWidth={5} fill="none" />
              <path d="M150 200 L153 240" stroke="#d99a62" strokeWidth={1.4} />
              <path d="M152.5 278 L159 278 L159.6 286 L153.3 286 Z" fill="#2a2a2a" strokeWidth={1.6} />
            </g>
            <circle cx="146" cy="169" r="5.5" fill="#f3c39b" />
          </g>

          {/* head in profile, looking at the well (to the right) */}
          <path d="M106 108 L124 98 L136 112 L118 120 Z" fill="#e8b08a" />
          <g transform="translate(6 10)">
          <g className="bs-head">
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
            <path d="M157 67 Q171 64 181 73 Q190 81 191 92 Q183 90 175 89 Q165 88 157 85 Z" fill="#f3c39b" />
            <path d="M174 85 Q178 88 182 87" fill="none" stroke="#c97a5e" strokeWidth={1.6} />

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

            {/* mouth (no moustache) + a grumpy cheek line */}
            <path d="M156 88 Q160 94 158 99" fill="none" stroke="#c97a5e" strokeWidth={1.4} />
            {mood === "idle" && <path d="M147 98 Q153 95 159 98" fill="none" stroke="#7a2d22" strokeWidth={2.2} />}
            {happy && (
              <g>
                <path d={mood === "c1" ? "M146 94 Q152 104 160 95 Z" : "M144 93 Q151 108 162 94 Z"} fill="#7a1f1f" />
                <path d="M148 99 Q152 102 157 99 Q152 97 148 99 Z" fill="#e86a6a" stroke="none" />
              </g>
            )}
            {mood === "danger" && <path d="M145 98 Q148 95 151 98 Q154 101 157 98 Q159 96 161 98" fill="none" stroke="#7a2d22" strokeWidth={2} />}
            {mood === "sad" && <path d="M147 100 Q153 94 159 99" fill="none" stroke="#7a2d22" strokeWidth={2.2} />}

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
