import { useEffect, useMemo, useState } from "react";
import { tr } from "../../i18n";
import "./baiShmirko.css";

/**
 * 👴🦯 Бай Шмирко — our own cartoon fan next to the Шметрис well: a tall, lanky, grumpy old
 * farmer (straw hat, round glasses, big white moustache, checked shirt, denim overalls) with a
 * walking stick. He taps the stick to the music and cheers when lines go — more lines, wilder:
 * stick in the air → dance with a stick twirl → a flip (hat flies off) → air guitar on the stick
 * with fireworks. Sweats when the stack gets high, slumps on the stick when the game is over.
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
          <radialGradient id="bsSkin" cx="45%" cy="35%" r="75%">
            <stop offset="0%" stopColor="#ffe0c6" />
            <stop offset="60%" stopColor="#f1b88f" />
            <stop offset="100%" stopColor="#cf8a62" />
          </radialGradient>
          <radialGradient id="bsNose" cx="38%" cy="30%" r="75%">
            <stop offset="0%" stopColor="#ffb7a3" />
            <stop offset="55%" stopColor="#e6806a" />
            <stop offset="100%" stopColor="#b9523f" />
          </radialGradient>
          <radialGradient id="bsCheek" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ff6f6f" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#ff6f6f" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="bsDenim" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#5f8fd0" />
            <stop offset="100%" stopColor="#2f568f" />
          </linearGradient>
          <linearGradient id="bsDenimDark" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3d679f" />
            <stop offset="100%" stopColor="#264673" />
          </linearGradient>
          <linearGradient id="bsCapGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8d9299" />
            <stop offset="100%" stopColor="#5a5f67" />
          </linearGradient>
          <pattern id="bsTweed" width="5" height="5" patternUnits="userSpaceOnUse">
            <rect width="5" height="5" fill="none" />
            <circle cx="1" cy="1" r="0.6" fill="#fff" opacity="0.13" />
            <circle cx="3.5" cy="3.2" r="0.5" fill="#000" opacity="0.15" />
          </pattern>
          <linearGradient id="bsWood" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#8a5a33" />
            <stop offset="45%" stopColor="#c58a54" />
            <stop offset="100%" stopColor="#6b4223" />
          </linearGradient>
          <linearGradient id="bsBoot" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7a4e2c" />
            <stop offset="100%" stopColor="#4a2d17" />
          </linearGradient>
          {/* red–black checked flannel */}
          <pattern id="bsPlaid" width="12" height="12" patternUnits="userSpaceOnUse">
            <rect width="12" height="12" fill="#c23b30" />
            <rect width="12" height="4" y="4" fill="#7e1f1a" opacity="0.85" />
            <rect width="4" height="12" x="4" fill="#7e1f1a" opacity="0.7" />
            <rect width="12" height="1" y="10" fill="#f2c94c" opacity="0.5" />
            <rect width="1" height="12" x="10" fill="#f2c94c" opacity="0.4" />
          </pattern>
          <pattern id="bsDenimTex" width="4" height="4" patternUnits="userSpaceOnUse">
            <rect width="4" height="4" fill="none" />
            <path d="M0 4 L4 0" stroke="#fff" strokeWidth="0.4" opacity="0.12" />
          </pattern>
        </defs>

        <ellipse className="bs-shadow" cx="108" cy="288" rx="60" ry="7" fill="#000" opacity="0.35" />

        <g className="bs-all">
          {/* legs: wide denim trousers, knees a bit bent, work boots */}
          <g className="bs-leg bs-leg-l">
            <path d="M80 176 Q74 226 70 272 L96 272 Q97 228 103 180 Z" fill="url(#bsDenim)" />
            <path d="M80 176 Q74 226 70 272 L96 272 Q97 228 103 180 Z" fill="url(#bsDenimTex)" />
            <path d="M88 186 Q84 230 83 270" stroke="#f2c94c" strokeWidth="0.9" strokeDasharray="2.5 2" fill="none" opacity="0.7" />
            <path d="M70 268 L97 268 L98 274 L69 274 Z" fill="#264673" />
            <path d="M64 272 Q58 286 72 288 L102 288 Q107 287 103 279 L98 272 Z" fill="url(#bsBoot)" />
            <path d="M70 284 L103 284" stroke="#2b1a0d" strokeWidth="3" />
            <path d="M80 276 L88 276 M79 279.5 L89 279.5" stroke="#e8d2a6" strokeWidth="1" />
          </g>
          <g className="bs-leg bs-leg-r">
            <path d="M106 180 Q114 228 116 272 L142 272 Q136 226 128 176 Z" fill="url(#bsDenim)" />
            <path d="M106 180 Q114 228 116 272 L142 272 Q136 226 128 176 Z" fill="url(#bsDenimTex)" />
            <path d="M120 186 Q126 230 129 270" stroke="#f2c94c" strokeWidth="0.9" strokeDasharray="2.5 2" fill="none" opacity="0.7" />
            <path d="M115 268 L143 268 L144 274 L114 274 Z" fill="#264673" />
            <path d="M113 272 L145 272 Q156 282 150 288 L118 288 Q110 287 113 272 Z" fill="url(#bsBoot)" />
            <path d="M113 284 L152 284" stroke="#2b1a0d" strokeWidth="3" />
            <path d="M124 276 L133 276 M123 279.5 L134 279.5" stroke="#e8d2a6" strokeWidth="1" />
          </g>

          {/* left arm: hand on the hip (waves / strums when cheering) */}
          <g className="bs-arm bs-arm-l">
            <path d="M78 116 L58 150" stroke="url(#bsPlaid)" strokeWidth="14" strokeLinecap="round" />
            <circle cx="58" cy="150" r="7.5" fill="#9e2b23" />
            <path d="M58 150 L80 174" stroke="#e9ac82" strokeWidth="8.5" strokeLinecap="round" />
            <ellipse cx="82" cy="176" rx="7" ry="6" fill="url(#bsSkin)" stroke="#b8774f" strokeWidth="1" />
          </g>

          {/* body: shirt + overall bib + straps */}
          <g className="bs-body">
            <path d="M74 112 Q104 100 134 112 L136 182 L72 182 Z" fill="url(#bsPlaid)" />
            <path d="M96 104 L104 120 L112 104 Z" fill="#f4e7d0" />
            <path d="M84 128 L124 128 L129 186 L79 186 Z" fill="url(#bsDenim)" />
            <path d="M84 128 L124 128 L129 186 L79 186 Z" fill="url(#bsDenimTex)" />
            <path d="M94 138 L114 138 L113 154 L95 154 Z" fill="url(#bsDenimDark)" />
            <path d="M94 138 L114 138" stroke="#f2c94c" strokeWidth="0.9" strokeDasharray="2 1.6" />
            <path d="M100 138 L100 128" stroke="#7a4e2c" strokeWidth="2.5" />
            <path d="M84 128 L79 110 L88 108 L91 128 Z" fill="url(#bsDenimDark)" />
            <path d="M124 128 L129 110 L120 108 L117 128 Z" fill="url(#bsDenimDark)" />
            <circle cx="88" cy="131" r="3.4" fill="#f2c94c" stroke="#a37a16" strokeWidth="1" />
            <circle cx="120" cy="131" r="3.4" fill="#f2c94c" stroke="#a37a16" strokeWidth="1" />
            <path d="M78 182 L130 182 L131 190 L77 190 Z" fill="#264673" />
          </g>

          {/* right arm with the walking stick */}
          <g className="bs-arm bs-arm-r">
            <path d="M130 116 L146 148" stroke="url(#bsPlaid)" strokeWidth="14" strokeLinecap="round" />
            <circle cx="146" cy="148" r="7.5" fill="#9e2b23" />
            <path d="M146 148 L152 176" stroke="#e9ac82" strokeWidth="8.5" strokeLinecap="round" />
            <g className="bs-cane">
              <path d="M152 176 L158 284" stroke="url(#bsWood)" strokeWidth="6" strokeLinecap="round" />
              <path d="M152 178 Q148 160 160 158 Q172 158 171 170" stroke="url(#bsWood)" strokeWidth="6" fill="none" strokeLinecap="round" />
              <path d="M155 200 L156.5 230 M157 245 L158 270" stroke="#e7b47c" strokeWidth="1.2" opacity="0.6" strokeLinecap="round" />
              <path d="M156 280 L160 280 L160 286 L156 286 Z" fill="#333" />
            </g>
            <ellipse cx="152" cy="177" rx="7" ry="6.5" fill="url(#bsSkin)" stroke="#b8774f" strokeWidth="1" />
          </g>

          {/* head: long face leaning forward, round glasses, moustache, straw hat */}
          <g className="bs-head">
            <path d="M96 92 L112 92 L113 112 L95 112 Z" fill="#e2a37b" />
            <path d="M101 100 Q104 104 107 100" stroke="#c7835d" strokeWidth="1" fill="none" />
            <ellipse cx="78" cy="72" rx="6" ry="9" fill="url(#bsSkin)" stroke="#c7835d" strokeWidth="1" />
            <ellipse cx="130" cy="72" rx="6" ry="9" fill="url(#bsSkin)" stroke="#c7835d" strokeWidth="1" />
            <path d="M104 40 Q130 40 131 70 Q132 98 104 104 Q77 98 77 70 Q78 40 104 40 Z" fill="url(#bsSkin)" />
            {/* grey tufts over the ears */}
            <path d="M78 60 Q72 64 74 74 Q78 68 81 62 Z M130 60 Q136 64 134 74 Q130 68 127 62 Z" fill="#e0dad0" />
            <ellipse cx="86" cy="84" rx="7" ry="5" fill="url(#bsCheek)" />
            <ellipse cx="122" cy="84" rx="7" ry="5" fill="url(#bsCheek)" />

            {/* eyes per mood (behind the glasses) */}
            {mood === "idle" && (
              <g className="bs-blink">
                <ellipse cx="94" cy="68" rx="2.8" ry="3.4" fill="#2a1d16" />
                <ellipse cx="114" cy="68" rx="2.8" ry="3.4" fill="#2a1d16" />
                <circle cx="95" cy="66.8" r="1" fill="#fff" />
                <circle cx="115" cy="66.8" r="1" fill="#fff" />
              </g>
            )}
            {(mood === "c1" || mood === "c2" || mood === "c3") && (
              <g>
                <path d="M89 70 Q94 63 99 70" stroke="#2a1d16" strokeWidth="2.6" fill="none" strokeLinecap="round" />
                <path d="M109 70 Q114 63 119 70" stroke="#2a1d16" strokeWidth="2.6" fill="none" strokeLinecap="round" />
              </g>
            )}
            {mood === "c4" && (
              <g className="bs-star-eyes">
                {[94, 114].map((x) => (
                  <path
                    key={x}
                    d={`M${x} 61 L${x + 2} 66 L${x + 7} 66.4 L${x + 3.2} 69.6 L${x + 4.4} 74.6 L${x} 71.8 L${x - 4.4} 74.6 L${x - 3.2} 69.6 L${x - 7} 66.4 L${x - 2} 66 Z`}
                    fill="#ffd43b"
                    stroke="#c78d00"
                    strokeWidth="0.8"
                  />
                ))}
              </g>
            )}
            {mood === "danger" && (
              <g>
                <circle cx="94" cy="68" r="5" fill="#fff" />
                <circle cx="114" cy="68" r="5" fill="#fff" />
                <circle className="bs-pupil" cx="94" cy="68.5" r="2.2" fill="#2a1d16" />
                <circle className="bs-pupil" cx="114" cy="68.5" r="2.2" fill="#2a1d16" />
              </g>
            )}
            {mood === "sad" && (
              <g>
                <path d="M89 67 Q94 72 99 67" stroke="#2a1d16" strokeWidth="2.4" fill="none" strokeLinecap="round" />
                <path d="M109 67 Q114 72 119 67" stroke="#2a1d16" strokeWidth="2.4" fill="none" strokeLinecap="round" />
                <path className="bs-tear" d="M92 74 Q89.5 79 92 81.5 Q94.5 79 92 74 Z" fill="#7cc4ff" />
              </g>
            )}

            {/* round glasses */}
            <g className="bs-glasses">
              <circle cx="94" cy="68" r="8.5" fill="rgba(200,230,255,0.18)" stroke="#2d2a26" strokeWidth="2" />
              <circle cx="114" cy="68" r="8.5" fill="rgba(200,230,255,0.18)" stroke="#2d2a26" strokeWidth="2" />
              <path d="M102.5 67 Q104 65 105.5 67" stroke="#2d2a26" strokeWidth="2" fill="none" />
              <path d="M85.5 67 L79 65 M122.5 67 L129 65" stroke="#2d2a26" strokeWidth="1.6" />
              <path d="M89 63 Q91 61 94 61" stroke="#fff" strokeWidth="1.3" opacity="0.7" fill="none" strokeLinecap="round" />
              <path d="M109 63 Q111 61 114 61" stroke="#fff" strokeWidth="1.3" opacity="0.7" fill="none" strokeLinecap="round" />
            </g>

            {/* grumpy bushy eyebrows (up when happy, slanted when worried) */}
            <path
              d={happy ? "M84 57 Q93 50 101 56 Q93 55 85 60 Z" : worried ? "M85 58 Q93 56 101 51 Q97 57 86 61 Z" : "M84 54 Q93 57 102 60 Q93 61 85 58 Z"}
              fill="#e6e0d6"
              stroke="#9a9389"
              strokeWidth="0.7"
            />
            <path
              d={happy ? "M124 57 Q115 50 107 56 Q115 55 123 60 Z" : worried ? "M123 58 Q115 56 107 51 Q111 57 122 61 Z" : "M124 54 Q115 57 106 60 Q115 61 123 58 Z"}
              fill="#e6e0d6"
              stroke="#9a9389"
              strokeWidth="0.7"
            />

            {/* mouth (under the moustache) */}
            {mood === "idle" && <path d="M97 96 Q104 94 111 97" stroke="#7a2d22" strokeWidth="2" fill="none" strokeLinecap="round" />}
            {happy && (
              <g>
                <path d={mood === "c1" ? "M95 92 Q104 104 113 92 Z" : "M93 91 Q104 108 115 91 Z"} fill="#7a1f1f" />
                <path d={mood === "c1" ? "M99 98 Q104 101 109 98 Q104 96 99 98 Z" : "M98 100 Q104 104 110 100 Q104 97 98 100 Z"} fill="#e86a6a" />
                <path d="M97 92 L111 92 L110 94.5 L98 94.5 Z" fill="#fff" />
              </g>
            )}
            {mood === "danger" && <path d="M96 97 Q99 94 102 97 Q105 100 108 97 Q110 95 112 97" stroke="#7a2d22" strokeWidth="1.8" fill="none" strokeLinecap="round" />}
            {mood === "sad" && <path d="M97 99 Q104 93 111 99" stroke="#7a2d22" strokeWidth="2" fill="none" strokeLinecap="round" />}

            {/* big nose + droopy white moustache */}
            <ellipse cx="104" cy="80" rx="9" ry="11" fill="url(#bsNose)" />
            <ellipse cx="101" cy="75.5" rx="2.6" ry="2.2" fill="#fff" opacity="0.5" />
            <path
              d="M104 88 Q94 84 86 88 Q78 92 76 100 Q84 94 90 96 Q99 97 104 92 Q109 97 118 96 Q124 94 132 100 Q130 92 122 88 Q114 84 104 88 Z"
              fill="#f1ece4"
              stroke="#a8a197"
              strokeWidth="0.9"
            />
            <path d="M86 92 Q92 94 98 92 M110 92 Q116 94 122 92" stroke="#cfc8bd" strokeWidth="0.9" fill="none" />

            {mood === "danger" && (
              <g>
                <path className="bs-sweat s1" d="M128 48 Q124 55 128 58 Q132 55 128 48 Z" fill="#8fd3ff" />
                <path className="bs-sweat s2" d="M80 50 Q76 57 80 60 Q84 57 80 50 Z" fill="#8fd3ff" />
              </g>
            )}

            {/* the flat cap (каскет), grey tweed */}
            <g className="bs-cap">
              <path d="M75 56 Q70 28 104 24 Q138 26 134 54 Q118 47 104 47 Q89 47 75 56 Z" fill="url(#bsCapGrad)" />
              <path d="M75 56 Q70 28 104 24 Q138 26 134 54 Q118 47 104 47 Q89 47 75 56 Z" fill="url(#bsTweed)" />
              <path d="M80 44 Q104 32 128 42" stroke="#4a4f56" strokeWidth="1" strokeDasharray="2.5 2" fill="none" />
              <path d="M70 55 Q104 38 140 52 Q143 60 134 61 Q104 51 77 63 Q67 61 70 55 Z" fill="#4b5058" />
              <path d="M74 57 Q104 44 137 55" stroke="#6e737b" strokeWidth="1.2" fill="none" />
              <circle cx="104" cy="26" r="3" fill="#4b5058" />
            </g>
          </g>
        </g>

        {mood === "idle" && (
          <g className="bs-notes">
            <text className="n1" x="178" y="96" fontSize="16" fill="var(--accent, #5865f2)">♪</text>
            <text className="n2" x="30" y="112" fontSize="14" fill="var(--accent, #5865f2)">♫</text>
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
