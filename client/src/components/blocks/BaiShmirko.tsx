import { useEffect, useMemo, useState } from "react";
import { tr } from "../../i18n";
import "./baiShmirko.css";

/**
 * 👴🥃 Бай Шмирко — our own cartoon fan next to the Шметрис well. He taps along to the music,
 * cheers when lines go (more lines → wilder: wave → dance → flip with confetti → goes crazy with
 * fireworks), sweats when the stack gets close to the top and is sad when the game is over.
 */

export type ShmirkoMood = "idle" | "c1" | "c2" | "c3" | "c4" | "danger" | "sad";

const LINES: Record<ShmirkoMood, [string, string][]> = {
  idle: [],
  c1: [
    ["Браво бе!", "Nice one!"],
    ["Ай наздраве!", "Cheers!"],
    ["Така, така!", "That's it!"],
    ["Опааа!", "Oh yeah!"],
  ],
  c2: [
    ["Ееее, майсторе!", "Whoa, master!"],
    ["Два наведнъж!", "Two at once!"],
    ["Ох, че хубаво!", "Oh, that's nice!"],
  ],
  c3: [
    ["Три?! Ти си звяр!", "Three?! You beast!"],
    ["Наздраве за това!", "A toast to that!"],
    ["Ехааа!", "Yeehaw!"],
  ],
  c4: [
    ["ШМЕТРИС!!!", "SHMETRIS!!!"],
    ["Четири! Хоро!", "Four! Let's dance!"],
    ["Ракия за всички!", "Drinks on me!"],
  ],
  danger: [
    ["Ох, ох… внимавай!", "Oh no… careful!"],
    ["Леле, стига до горе!", "It's nearly at the top!"],
    ["Дишай, дишай…", "Breathe, breathe…"],
  ],
  sad: [
    ["Е, нищо… пак!", "Oh well… again!"],
    ["Следващия път!", "Next time!"],
    ["Ох, заболя ме…", "Ouch, that hurt…"],
  ],
};

const CONFETTI = ["#ff5d8f", "#4dabf7", "#ffa94d", "#ffd43b", "#b197fc", "#38d9a9", "#ff6b6b"];

export default function BaiShmirko({ mood, cheerKey, beat }: { mood: ShmirkoMood; cheerKey: number; beat: number }) {
  // A speech bubble for every cheer, and when worry / game over starts.
  const [say, setSay] = useState<string | null>(null);
  useEffect(() => {
    const list = LINES[mood];
    if (!list.length) {
      setSay(null);
      return;
    }
    const [bg, en] = list[Math.floor(Math.random() * list.length)]!;
    setSay(tr(bg, en));
    const t = setTimeout(() => setSay(null), mood === "danger" || mood === "sad" ? 2600 : 1800);
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
  return (
    <div className={`bs-wrap bs-${mood}`} style={{ ["--beat" as string]: `${beat}s` }} aria-hidden>
      {mood === "c4" && <div className="bs-aura" key={`a${cheerKey}`} />}
      {say && (
        <div className={`bs-bubble ${mood === "c4" ? "huge" : ""}`} key={`b${cheerKey}${mood}`}>
          {say}
        </div>
      )}
      <svg key={`s${cheerKey}`} className="bs-svg" viewBox="0 0 200 270" role="img">
        <defs>
          <radialGradient id="bsSkin" cx="45%" cy="38%" r="70%">
            <stop offset="0%" stopColor="#ffdcc0" />
            <stop offset="60%" stopColor="#f3b98f" />
            <stop offset="100%" stopColor="#d68d66" />
          </radialGradient>
          <radialGradient id="bsCheek" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ff6f6f" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#ff6f6f" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="bsNose" cx="38%" cy="32%" r="70%">
            <stop offset="0%" stopColor="#ffb4a0" />
            <stop offset="55%" stopColor="#e8836b" />
            <stop offset="100%" stopColor="#c45d4a" />
          </radialGradient>
          <linearGradient id="bsJacket" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7a6450" />
            <stop offset="100%" stopColor="#4b3c2f" />
          </linearGradient>
          <linearGradient id="bsTrousers" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4a4f58" />
            <stop offset="100%" stopColor="#2f333a" />
          </linearGradient>
          <linearGradient id="bsCap" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8d9299" />
            <stop offset="100%" stopColor="#5a5f67" />
          </linearGradient>
          <linearGradient id="bsRakia" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffd77a" />
            <stop offset="100%" stopColor="#e29a28" />
          </linearGradient>
          <pattern id="bsTweed" width="5" height="5" patternUnits="userSpaceOnUse">
            <rect width="5" height="5" fill="none" />
            <circle cx="1" cy="1" r="0.6" fill="#fff" opacity="0.13" />
            <circle cx="3.5" cy="3.2" r="0.5" fill="#000" opacity="0.15" />
          </pattern>
          <pattern id="bsStripes" width="6" height="6" patternUnits="userSpaceOnUse">
            <rect width="6" height="6" fill="#f1ede4" />
            <rect width="6" height="3" fill="#2c3e66" />
          </pattern>
        </defs>

        {/* shadow on the ground (stays put when he jumps) */}
        <ellipse className="bs-shadow" cx="100" cy="252" rx="50" ry="7" fill="#000" opacity="0.35" />

        <g className="bs-all">
          {/* legs */}
          <g className="bs-leg bs-leg-l">
            <path d="M82 182 L80 236 Q80 240 84 240 L96 240 Q99 240 98 236 L99 182 Z" fill="url(#bsTrousers)" />
            <path d="M74 238 Q71 250 84 250 L100 250 Q104 250 102 243 L99 236 Z" fill="#2a1d16" />
            <path d="M78 243 Q82 240 90 241" stroke="#6b5040" strokeWidth="1.6" fill="none" strokeLinecap="round" />
          </g>
          <g className="bs-leg bs-leg-r">
            <path d="M118 182 L120 236 Q120 240 116 240 L104 240 Q101 240 102 236 L101 182 Z" fill="url(#bsTrousers)" />
            <path d="M126 238 Q129 250 116 250 L100 250 Q96 250 98 243 L101 236 Z" fill="#2a1d16" />
            <path d="M122 243 Q118 240 110 241" stroke="#6b5040" strokeWidth="1.6" fill="none" strokeLinecap="round" />
          </g>

          {/* left arm (waving) */}
          <g className="bs-arm bs-arm-l">
            <path d="M74 120 Q56 126 52 150 L47 172 Q46 180 54 181 L61 181 Q66 180 66 174 L70 152 Q72 140 82 134 Z" fill="url(#bsJacket)" />
            <path d="M74 120 Q56 126 52 150 L47 172 Q46 180 54 181 L61 181 Q66 180 66 174 L70 152 Q72 140 82 134 Z" fill="url(#bsTweed)" />
            <path d="M47 174 Q55 178 66 175" stroke="#3a2e24" strokeWidth="3" fill="none" />
            <circle cx="56" cy="187" r="9" fill="url(#bsSkin)" stroke="#b97a58" strokeWidth="1" />
            <path d="M50 184 Q49 189 52 192 M55 185 Q54 191 57 194" stroke="#b97a58" strokeWidth="1.1" fill="none" strokeLinecap="round" />
          </g>

          {/* body */}
          <g className="bs-body">
            <path d="M84 114 L100 152 L116 114 Z" fill="url(#bsStripes)" />
            <path
              d="M66 124 Q72 112 86 112 L100 152 L114 112 Q128 112 134 124 Q148 152 139 188 Q120 197 100 197 Q80 197 61 188 Q52 152 66 124 Z"
              fill="url(#bsJacket)"
            />
            <path
              d="M66 124 Q72 112 86 112 L100 152 L114 112 Q128 112 134 124 Q148 152 139 188 Q120 197 100 197 Q80 197 61 188 Q52 152 66 124 Z"
              fill="url(#bsTweed)"
            />
            <path d="M86 112 L100 152 L91 130 L79 124 Z" fill="#3e3127" />
            <path d="M114 112 L100 152 L109 130 L121 124 Z" fill="#3e3127" />
            <circle cx="100" cy="164" r="2.8" fill="#2b2119" />
            <circle cx="100" cy="180" r="2.8" fill="#2b2119" />
            {/* breast pocket with a red handkerchief */}
            <path d="M113 140 L127 140 L126 147 L114 147 Z" fill="#3e3127" />
            <path d="M115 140 L118 134 L121 139 L124 133 L126 140 Z" fill="#d63a3a" />
            <path d="M62 186 Q100 200 139 186" stroke="#3a2e24" strokeWidth="1.5" fill="none" opacity="0.6" />
          </g>

          {/* right arm with the glass */}
          <g className="bs-arm bs-arm-r">
            <path d="M126 120 Q144 126 148 150 L153 172 Q154 180 146 181 L139 181 Q134 180 134 174 L130 152 Q128 140 118 134 Z" fill="url(#bsJacket)" />
            <path d="M126 120 Q144 126 148 150 L153 172 Q154 180 146 181 L139 181 Q134 180 134 174 L130 152 Q128 140 118 134 Z" fill="url(#bsTweed)" />
            <path d="M153 174 Q145 178 134 175" stroke="#3a2e24" strokeWidth="3" fill="none" />
            <g className="bs-glass">
              <path d="M136 160 L152 160 L150 182 L138 182 Z" fill="rgba(220,240,255,0.35)" stroke="rgba(255,255,255,0.85)" strokeWidth="1.3" />
              <path className="bs-rakia" d="M137.3 166 L150.7 166 L149.4 181 L138.6 181 Z" fill="url(#bsRakia)" />
              <path d="M139 162 L140 179" stroke="#fff" strokeWidth="1.2" opacity="0.7" strokeLinecap="round" />
            </g>
            <circle cx="144" cy="187" r="9" fill="url(#bsSkin)" stroke="#b97a58" strokeWidth="1" />
            <path d="M150 184 Q151 189 148 192 M145 185 Q146 191 143 194" stroke="#b97a58" strokeWidth="1.1" fill="none" strokeLinecap="round" />
          </g>

          {/* head */}
          <g className="bs-head">
            <rect x="90" y="106" width="20" height="14" rx="5" fill="#e3a47c" />
            <ellipse cx="62" cy="88" rx="7" ry="10" fill="url(#bsSkin)" stroke="#c7835d" strokeWidth="1" />
            <ellipse cx="138" cy="88" rx="7" ry="10" fill="url(#bsSkin)" stroke="#c7835d" strokeWidth="1" />
            <path d="M60 84 Q63 88 61 93 M140 84 Q137 88 139 93" stroke="#c7835d" strokeWidth="1.2" fill="none" />
            <ellipse cx="100" cy="86" rx="38" ry="36" fill="url(#bsSkin)" />
            {/* grey sideburns under the cap */}
            <path d="M63 74 Q62 86 66 94 Q68 84 70 76 Z" fill="#cfc9c0" />
            <path d="M137 74 Q138 86 134 94 Q132 84 130 76 Z" fill="#cfc9c0" />
            <ellipse cx="75" cy="99" rx="10" ry="7" fill="url(#bsCheek)" />
            <ellipse cx="125" cy="99" rx="10" ry="7" fill="url(#bsCheek)" />

            {/* eyes per mood */}
            {mood === "idle" && (
              <g className="bs-blink">
                <ellipse cx="86" cy="84" rx="4" ry="5" fill="#2a1d16" />
                <ellipse cx="114" cy="84" rx="4" ry="5" fill="#2a1d16" />
                <circle cx="87.5" cy="82" r="1.4" fill="#fff" />
                <circle cx="115.5" cy="82" r="1.4" fill="#fff" />
              </g>
            )}
            {(mood === "c1" || mood === "c2" || mood === "c3") && (
              <g>
                <path d="M79 86 Q86 77 93 86" stroke="#2a1d16" strokeWidth="3.2" fill="none" strokeLinecap="round" />
                <path d="M107 86 Q114 77 121 86" stroke="#2a1d16" strokeWidth="3.2" fill="none" strokeLinecap="round" />
                <path d="M78 90 Q80 92 83 91 M122 90 Q120 92 117 91" stroke="#c7835d" strokeWidth="1" fill="none" />
              </g>
            )}
            {mood === "c4" && (
              <g className="bs-star-eyes">
                {[86, 114].map((x) => (
                  <path
                    key={x}
                    d={`M${x} 75 L${x + 2.6} 81.4 L${x + 9} 82 L${x + 4} 86 L${x + 5.6} 92.4 L${x} 89 L${x - 5.6} 92.4 L${x - 4} 86 L${x - 9} 82 L${x - 2.6} 81.4 Z`}
                    fill="#ffd43b"
                    stroke="#c78d00"
                    strokeWidth="1"
                  />
                ))}
              </g>
            )}
            {mood === "danger" && (
              <g>
                <circle cx="86" cy="84" r="6.5" fill="#fff" stroke="#2a1d16" strokeWidth="1.2" />
                <circle cx="114" cy="84" r="6.5" fill="#fff" stroke="#2a1d16" strokeWidth="1.2" />
                <circle className="bs-pupil" cx="86" cy="85" r="2.8" fill="#2a1d16" />
                <circle className="bs-pupil" cx="114" cy="85" r="2.8" fill="#2a1d16" />
              </g>
            )}
            {mood === "sad" && (
              <g>
                <path d="M79 82 Q86 89 93 82" stroke="#2a1d16" strokeWidth="3" fill="none" strokeLinecap="round" />
                <path d="M107 82 Q114 89 121 82" stroke="#2a1d16" strokeWidth="3" fill="none" strokeLinecap="round" />
                <path className="bs-tear" d="M84 90 Q81 96 84 99 Q87 96 84 90 Z" fill="#7cc4ff" />
              </g>
            )}

            {/* bushy eyebrows */}
            <path
              className="bs-brow bs-brow-l"
              d={mood === "danger" || mood === "sad" ? "M77 74 Q84 72 93 68 Q90 73 78 77 Z" : "M76 73 Q85 66 94 71 Q86 70 77 76 Z"}
              fill="#d8d2c9"
              stroke="#9a9389"
              strokeWidth="0.8"
            />
            <path
              className="bs-brow bs-brow-r"
              d={mood === "danger" || mood === "sad" ? "M123 74 Q116 72 107 68 Q110 73 122 77 Z" : "M124 73 Q115 66 106 71 Q114 70 123 76 Z"}
              fill="#d8d2c9"
              stroke="#9a9389"
              strokeWidth="0.8"
            />

            {/* mouth (under the moustache) */}
            {mood === "idle" && <path d="M92 116 Q100 121 108 116" stroke="#7a2d22" strokeWidth="2.4" fill="none" strokeLinecap="round" />}
            {happy && (
              <g>
                <path d={mood === "c1" ? "M89 112 Q100 126 111 112 Z" : "M86 111 Q100 132 114 111 Z"} fill="#7a1f1f" />
                <path d={mood === "c1" ? "M94 119 Q100 124 106 119 Q100 116 94 119 Z" : "M93 122 Q100 129 107 122 Q100 118 93 122 Z"} fill="#e86a6a" />
              </g>
            )}
            {mood === "danger" && <path d="M91 118 Q94 114 97 118 Q100 122 103 118 Q106 114 109 118" stroke="#7a2d22" strokeWidth="2.2" fill="none" strokeLinecap="round" />}
            {mood === "sad" && <path d="M91 120 Q100 113 109 120" stroke="#7a2d22" strokeWidth="2.4" fill="none" strokeLinecap="round" />}

            {/* nose + the big moustache */}
            <ellipse cx="100" cy="96" rx="10.5" ry="9.5" fill="url(#bsNose)" />
            <ellipse cx="96.5" cy="92.5" rx="3" ry="2.2" fill="#fff" opacity="0.55" />
            <path
              className="bs-moustache"
              d="M100 104 Q88 99 77 103 Q65 107 60 99 Q61 113 77 114 Q91 115 100 109 Q109 115 123 114 Q139 113 140 99 Q135 107 123 103 Q112 99 100 104 Z"
              fill="#ece7e0"
              stroke="#a8a197"
              strokeWidth="1"
            />
            <path d="M74 107 Q80 109 86 107 M114 107 Q120 109 126 107" stroke="#c9c2b8" strokeWidth="1" fill="none" />

            {/* sweat when worried */}
            {mood === "danger" && (
              <g>
                <path className="bs-sweat s1" d="M134 64 Q130 71 134 74 Q138 71 134 64 Z" fill="#8fd3ff" />
                <path className="bs-sweat s2" d="M66 66 Q62 73 66 76 Q70 73 66 66 Z" fill="#8fd3ff" />
              </g>
            )}

            {/* the flat cap */}
            <g className="bs-cap">
              <path d="M60 74 Q56 42 100 38 Q146 40 141 70 Q122 62 100 62 Q78 62 60 74 Z" fill="url(#bsCap)" />
              <path d="M60 74 Q56 42 100 38 Q146 40 141 70 Q122 62 100 62 Q78 62 60 74 Z" fill="url(#bsTweed)" />
              <path d="M66 62 Q100 46 136 60" stroke="#4a4f56" strokeWidth="1" strokeDasharray="2.5 2" fill="none" />
              <path d="M56 72 Q100 54 145 69 Q148 77 139 78 Q100 67 63 80 Q53 78 56 72 Z" fill="#4b5058" />
              <path d="M60 74 Q100 60 142 72" stroke="#6e737b" strokeWidth="1.2" fill="none" />
              <circle cx="100" cy="40" r="3.2" fill="#4b5058" />
            </g>
          </g>
        </g>

        {/* music notes floating up while he grooves */}
        {mood === "idle" && (
          <g className="bs-notes">
            <text className="n1" x="160" y="80" fontSize="16" fill="var(--accent, #5865f2)">♪</text>
            <text className="n2" x="28" y="100" fontSize="14" fill="var(--accent, #5865f2)">♫</text>
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
