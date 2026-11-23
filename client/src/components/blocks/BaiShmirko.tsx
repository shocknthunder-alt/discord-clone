import { useEffect, useMemo, useState } from "react";
import "./baiShmirko.css";

/**
 * 👴🦯 Бай Шмирко — our own cartoon fan next to the Шметрис well, in profile looking at the well:
 * a bald, very hunched old man (big round nose, big ear, grey fringe, wrinkles and liver spots,
 * green plaid shirt, belt, baggy brown trousers with rolled cuffs), one hand on the small of his back,
 * the other on his walking stick; detailed cartoon style with thick ink outlines. He taps the stick to
 * the music and cheers when lines go — more lines, wilder: stick in the air → dance with a stick twirl
 * → a backflip → air guitar on the stick with fireworks. Sweats when the stack gets high, slumps on
 * the stick when the game is over.
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
// bald skull + jaw, facing right
const HEAD = "M128 64 Q130 36 158 34 Q184 36 186 60 Q187 70 180 78 L178 96 Q178 112 164 114 Q148 116 138 108 Q124 96 126 80 Q124 72 128 64 Z";
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
      <svg key={`s${cheerKey}`} className="bs-svg" viewBox="16 0 220 300" role="img">
        <defs>
          {/* green plaid for the shirt */}
          <pattern id="bsPlaid" width="13" height="13" patternUnits="userSpaceOnUse" patternTransform="rotate(-8)">
            <rect width="13" height="13" fill="#6e9a5c" />
            <rect width="13" height="5" fill="#4c7640" opacity="0.75" />
            <rect width="5" height="13" fill="#4c7640" opacity="0.75" />
            <rect y="8.6" width="13" height="1.3" fill="#a6c98c" opacity="0.8" />
            <rect x="8.6" width="1.3" height="13" fill="#a6c98c" opacity="0.8" />
          </pattern>
          <clipPath id="bsHeadClip">
            <path d={HEAD} />
          </clipPath>
        </defs>

        <ellipse className="bs-shadow" cx="120" cy="287" rx="48" ry="7" fill="#000" opacity="0.35" />

        <g className="bs-all" stroke={INK} strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round">
          {/* far leg: baggy brown trousers, rolled cuff, shoe */}
          <g className="bs-leg bs-leg-l">
            <path d="M92 186 L113 186 Q120 208 117 226 Q113 246 113 260 L97 260 Q96 244 99 228 Q93 210 92 186 Z" fill="#4a3022" />
            <path d="M106 214 Q111 222 109 232" fill="none" stroke="#2f1d14" strokeWidth={1.4} />
            <path d="M91 252 Q104 248 118 252 L119 265 Q104 269 90 265 Z" fill="#553727" />
            <path d="M96 265 L112 265 L112 270 L96 270 Z" fill="#f1ead0" strokeWidth={1.6} />
            <path d="M88 268 L117 268 Q133 270 135 280 L88 282 Q84 275 88 268 Z" fill="#3b221a" />
          </g>

          {/* near leg */}
          <g className="bs-leg bs-leg-r">
            <path d="M103 186 L127 186 Q134 208 130 226 Q126 246 125 260 L108 260 Q108 244 111 228 Q105 210 103 186 Z" fill="#5c3c2b" />
            <path d="M117 200 Q124 214 122 226" fill="none" stroke="#3e271b" strokeWidth={1.4} />
            <path d="M113 236 Q118 240 121 236" fill="none" stroke="#3e271b" strokeWidth={1.4} />
            <path d="M105 252 Q118 248 131 252 L132 265 Q118 269 104 265 Z" fill="#69462f" />
            <path d="M108 257 Q118 255 129 258" fill="none" stroke="#3e271b" strokeWidth={1.2} />
            <path d="M109 265 L126 265 L126 270 L109 270 Z" fill="#f1ead0" strokeWidth={1.6} />
            <path d="M102 268 L132 268 Q150 270 153 281 L102 283 Q98 276 102 268 Z" fill="#4a2b20" />
            <path d="M103 279 L152 279" stroke={INK} strokeWidth={2} />
            <path d="M134 271 Q143 271 148 275" fill="none" stroke="#7a5143" strokeWidth={1.8} />
          </g>

          {/* hunched body: plaid shirt, belt, trousers' seat */}
          <g className="bs-body">
            <path d="M88 180 L128 180 Q134 196 128 206 L92 206 Q84 194 88 180 Z" fill="#5c3c2b" />
            <path d="M112 186 L112 204" fill="none" stroke="#3e271b" strokeWidth={1.4} />
            <path d="M122 104 Q106 90 88 100 Q72 114 78 146 Q82 166 88 182 L127 182 Q131 160 127 140 Q124 120 122 104 Z" fill="url(#bsPlaid)" />
            {/* shading along the back + a fold */}
            <path d="M88 100 Q72 114 78 146 Q82 166 88 182 L95 182 Q86 160 86 140 Q84 116 96 102 Z" fill="#000" opacity={0.16} stroke="none" />
            <path d="M104 150 Q114 156 124 152" fill="none" stroke="#3a5c31" strokeWidth={1.4} />
            {/* collar */}
            <path d="M108 104 L122 100 L130 113 L118 110 Z" fill="#f4eed6" />
            <path d="M118 102 L124 116 L112 112 Z" fill="#e9e1c3" />
            {/* belt + buckle */}
            <path d="M86 174 L128 174 L128 183 L88 184 Z" fill="#3a2418" />
            <rect x="114" y="173" width="10" height="11" rx="1.5" fill="#e3933a" />
            <rect x="117" y="176" width="4" height="5" fill="#3a2418" strokeWidth={1.2} />
          </g>

          {/* far arm: the hand on the small of the back (waves / strums when cheering) */}
          <g className="bs-arm bs-arm-l">
            <path d="M98 116 L80 146" stroke={INK} strokeWidth={17} />
            <path d="M98 116 L80 146" stroke="url(#bsPlaid)" strokeWidth={12.5} />
            <path d="M80 146 L86 164" stroke={INK} strokeWidth={15} />
            <path d="M80 146 L86 164" stroke="url(#bsPlaid)" strokeWidth={10.5} />
            <path d="M80 163 L92 161 L93 168 L81 170 Z" fill="#f4eed6" strokeWidth={1.8} />
            <path d="M78 172 Q78 163 88 165 Q98 168 96 178 Q93 186 84 184 Q76 181 78 172 Z" fill="#e3bd93" />
            <path d="M82 176 L93 175 M83 180 L92 180" fill="none" strokeWidth={1.3} />
            <circle cx="87" cy="170" r="2" fill="#b88d63" stroke="none" />
          </g>

          {/* near arm: the big hand on top of the walking stick */}
          <g className="bs-arm bs-arm-r">
            <path d="M108 118 L124 144" stroke={INK} strokeWidth={17} />
            <path d="M108 118 L124 144" stroke="url(#bsPlaid)" strokeWidth={12.5} />
            <path d="M124 144 L138 158" stroke={INK} strokeWidth={15} />
            <path d="M124 144 L138 158" stroke="url(#bsPlaid)" strokeWidth={10.5} />
            <path d="M134 151 L144 160 L139 166 L129 157 Z" fill="#f4eed6" strokeWidth={1.8} />
            <g className="bs-cane">
              <path d="M150 172 L156 283" stroke={INK} strokeWidth={9} />
              <path d="M150 172 L156 283" stroke="#9c6233" strokeWidth={5} />
              <path d="M152 200 L154 250" stroke="#c98c55" strokeWidth={1.4} />
              <path d="M150 176 Q146 158 158 156 Q168 157 167 168" stroke={INK} strokeWidth={9} fill="none" />
              <path d="M150 176 Q146 158 158 156 Q168 157 167 168" stroke="#9c6233" strokeWidth={5} fill="none" />
              <path d="M152.5 276 L159.5 276 L160.4 286 L153 286 Z" fill="#26211f" strokeWidth={1.6} />
            </g>
            {/* fist round the crook: knuckles + fingers */}
            <path d="M138 162 Q140 152 151 152 Q161 153 161 163 Q161 173 151 175 Q140 175 138 168 Z" fill="#e8c29a" />
            <path d="M146 158 Q152 156 158 159 M145 163.5 L159 163.5 M146 169 L158 169" fill="none" strokeWidth={1.4} />
            <circle cx="148" cy="155" r="1.8" fill="#b88d63" stroke="none" />
          </g>

          {/* head: bald, big nose, big ear, grey fringe, wrinkles + liver spots */}
          <g className="bs-head">
            <path d="M114 108 L130 96 L142 108 L124 116 Z" fill="#d8ad84" />
            <path d="M122 106 Q127 110 132 106 M121 111 Q126 114 131 111" fill="none" stroke="#a77e59" strokeWidth={1.2} />
            {/* the head itself, a bit bigger and further forward (big head, hunched) */}
            <g transform="translate(134 108) scale(1.22) translate(-130 -104)">

            <path d={HEAD} fill="#ecc8a1" />
            <g clipPath="url(#bsHeadClip)" stroke="none">
              {/* shade on the back of the skull + the jaw */}
              <path d="M126 50 Q120 80 140 112 L126 116 L118 60 Z" fill="#c99d74" opacity={0.55} />
              <path d="M138 106 Q156 120 176 104 L180 120 L136 120 Z" fill="#c99d74" opacity={0.5} />
              {/* shine on the dome */}
              <path d="M146 42 Q156 36 168 40 Q158 40 150 46 Z" fill="#fff" opacity={0.55} />
            </g>
            {/* liver spots + a wart */}
            <ellipse cx="148" cy="52" rx="4" ry="3" fill="#b88d63" stroke="none" />
            <ellipse cx="139" cy="60" rx="2.6" ry="2" fill="#b88d63" stroke="none" />
            <ellipse cx="156" cy="46" rx="2.2" ry="1.7" fill="#b88d63" stroke="none" />
            <ellipse cx="145" cy="96" rx="2.4" ry="1.8" fill="#b88d63" stroke="none" />
            <circle cx="166" cy="41" r="2.8" fill="#e3b88e" strokeWidth={1.6} />
            {/* forehead wrinkles */}
            <path d="M158 50 Q170 47 182 54 M157 56 Q168 54 180 59" fill="none" strokeWidth={1.4} />

            {/* grey fringe round the back + the big ear */}
            <path d="M126 62 Q117 76 124 94 Q131 98 136 90 Q131 80 133 68 Q131 62 126 62 Z" fill="#c8ccd1" />
            <path d="M125 70 Q122 80 126 90 M129 68 Q127 78 130 88" fill="none" stroke="#8f959c" strokeWidth={1.2} />
            <path d="M134 70 Q146 66 147 80 Q147 94 136 94 Q132 88 135 82 Q131 76 134 70 Z" fill="#e8bf96" />
            <path d="M138 74 Q144 74 143 82 Q142 88 138 88" fill="none" stroke="#9a6f4b" strokeWidth={1.6} />
            <circle cx="141" cy="82" r="2.2" fill="#3a2418" stroke="none" />

            {/* eye under a heavy brow fold, per mood */}
            {mood === "idle" && (
              <g className="bs-blink">
                <path d="M162 70 Q167 74 173 70" fill="none" strokeWidth={2.4} />
                <circle cx="168" cy="71.5" r="1.8" fill={INK} stroke="none" />
              </g>
            )}
            {(mood === "c1" || mood === "c2" || mood === "c3") && <path d="M162 72 Q167.5 65 173 72" fill="none" strokeWidth={2.6} />}
            {mood === "c4" && (
              <path
                className="bs-star-eyes"
                d="M167.5 63 L169.5 68.1 L174.9 68.5 L170.8 71.9 L172.1 77.1 L167.5 74.3 L162.9 77.1 L164.2 71.9 L160.1 68.5 L165.5 68.1 Z"
                fill="#ffd43b"
                strokeWidth={1.2}
              />
            )}
            {mood === "danger" && (
              <g>
                <ellipse cx="167.5" cy="70" rx="5.5" ry="5" fill="#fff" strokeWidth={1.6} />
                <circle className="bs-pupil" cx="168.5" cy="70.5" r="2" fill={INK} stroke="none" />
              </g>
            )}
            {mood === "sad" && (
              <g>
                <path d="M162 69 Q167.5 74 173 69" fill="none" strokeWidth={2.4} />
                <path className="bs-tear" d="M166 76 Q163.5 81 166 83.5 Q168.5 81 166 76 Z" fill="#7cc4ff" strokeWidth={1.2} />
              </g>
            )}
            {/* brow fold + bags under the eye */}
            <path
              d={
                happy
                  ? "M156 62 Q167 54 180 61 L178 65 Q167 59 158 66 Z"
                  : worried
                    ? "M157 61 Q167 64 179 59 L179 64 Q167 68 158 66 Z"
                    : "M156 63 Q167 59 180 65 L178 69 Q167 64 158 67 Z"
              }
              fill="#dcb187"
            />
            <path d="M160 77 Q167 80 174 77" fill="none" stroke="#a77e59" strokeWidth={1.3} />
            <circle cx="162" cy="92" r="5" fill="#ff8f86" opacity={0.35} stroke="none" />

            {/* mouth + smile line */}
            <path d="M166 88 Q162 98 168 104" fill="none" stroke="#a77e59" strokeWidth={1.5} />
            {mood === "idle" && <path d="M168 105 Q174 108 181 103" fill="none" stroke="#7a2d22" strokeWidth={2.2} />}
            {happy && (
              <g>
                <path d={mood === "c1" ? "M167 103 Q174 113 183 102 Z" : "M165 102 Q174 117 185 101 Z"} fill="#7a1f1f" />
                <path d="M170 108 Q174 111 179 108 Q174 106 170 108 Z" fill="#e86a6a" stroke="none" />
              </g>
            )}
            {mood === "danger" && <path d="M166 106 Q169 103 172 106 Q175 109 178 106 Q180 104 182 106" fill="none" stroke="#7a2d22" strokeWidth={2} />}
            {mood === "sad" && <path d="M168 108 Q174 102 181 107" fill="none" stroke="#7a2d22" strokeWidth={2.2} />}

            {/* the big round nose */}
            <path d="M172 70 Q184 66 196 74 Q210 84 202 96 Q194 104 182 99 Q175 96 174 90 Q168 86 170 78 Z" fill="#ecc8a1" />
            <path d="M180 96 Q186 100 192 98" fill="none" stroke="#a77e59" strokeWidth={1.4} />
            <path d="M176 90 Q180 94 185 92" fill="none" strokeWidth={1.8} />
            <ellipse cx="190" cy="78" rx="6" ry="3.2" fill="#fff" opacity={0.5} stroke="none" transform="rotate(20 190 78)" />
            <circle cx="196" cy="88" r="4" fill="#f09a86" opacity={0.4} stroke="none" />

            {mood === "danger" && (
              <g>
                <path className="bs-sweat s1" d="M150 34 Q146 41 150 44 Q154 41 150 34 Z" fill="#8fd3ff" strokeWidth={1.2} />
                <path className="bs-sweat s2" d="M176 44 Q172 51 176 54 Q180 51 176 44 Z" fill="#8fd3ff" strokeWidth={1.2} />
              </g>
            )}
            </g>
          </g>
        </g>

        {mood === "idle" && (
          <g className="bs-notes">
            <text className="n1" x="56" y="132" fontSize="16" fill="var(--accent, #5865f2)">♪</text>
            <text className="n2" x="36" y="96" fontSize="14" fill="var(--accent, #5865f2)">♫</text>
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
