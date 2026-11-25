import type { DragonMood } from "./Dragon";

/**
 * The grown-up Шметрис dragon (stages 3–5: young → dragon → legendary). The baby and the small one stay
 * round and cute (Dragon.tsx `Beast`); from "Младо драконче" on it turns into a lean fantasy dragon:
 * wedge-shaped head with a brow ridge and a slit pupil, swept-back horns, bat wings with finger bones and
 * a scalloped membrane, a long S-neck, ridge spikes, hooked claws and a blade on the tail.
 * Same class names as the cute one (dr-all / dr-head / dr-wing-* / dr-tail / dr-arm / dr-blink / dr-fire …)
 * so every mood animation in dragon.css works; `.dr-fierce` moves a few transform origins.
 */

export interface FiercePalette {
  body: string;
  light: string;
  dark: string;
  belly: string;
  bellyLine: string;
  wing: string;
  wingDark: string;
  horn: string;
  iris: string;
  ink?: string;
}

const INK = "#15131c";

/** Ridge spikes from the back of the head down the neck and back (tip direction = up-left). */
const RIDGE: [number, number, number][] = [
  // x, y, size
  [126, 66, 1],
  [119, 76, 1.05],
  [112, 88, 1.1],
  [107, 100, 1.1],
  [101, 113, 1.05],
  [94, 126, 1],
  [88, 140, 0.95],
  [83, 154, 0.85],
];

export function DragonFierce({ mood, s, p, id }: { mood: DragonMood; s: number; p: FiercePalette; id: string }) {
  const t = Math.max(0, Math.min(1, (s - 3) / 2)); // 0 = young … 1 = legendary
  const bodyScale = 0.86 + 0.16 * t;
  const wingScale = 0.8 + 0.14 * t;
  const headScale = 1.28 - 0.06 * t;
  const hl = 0.72 + 0.32 * t; // horn length
  const ridge = Math.round(5 + 3 * t);
  const legendary = s >= 5;
  const ink = p.ink ?? INK;
  const happy = mood === "c1" || mood === "c2" || mood === "c3" || mood === "c4" || mood === "grow";
  const mouthOpen = mood === "c2" || mood === "c3" || mood === "c4" || mood === "grow";
  const fire = mood === "c4";
  const hornFill = legendary ? `url(#dfHornG${id})` : p.horn;

  const wing = (far: boolean) => {
    const rx = far ? 96 : 104;
    const ry = far ? 106 : 114;
    return (
      <g className={far ? "dr-wing dr-wing-far" : "dr-wing dr-wing-near"}>
        <g transform={`translate(${rx} ${ry}) scale(${far ? wingScale * 0.92 : wingScale}) translate(-104 -114)`}>
          {/* membrane with scalloped edge */}
          <path
            d="M104 114 L88 42 L34 24 Q46 46 22 64 Q46 74 34 98 Q58 98 62 118 Q82 112 96 132 Z"
            fill={far ? p.wingDark : `url(#dfWingG${id})`}
            opacity={far ? 0.95 : 1}
          />
          {/* finger bones */}
          <path d="M88 42 L34 24 M88 42 L22 64 M88 42 L34 98 M88 42 L62 118" fill="none" stroke={far ? p.dark : p.wingDark} strokeWidth={2.2} />
          <path d="M88 42 L34 24 M88 42 L22 64 M88 42 L34 98" fill="none" stroke={far ? p.dark : ink} strokeWidth={0.8} opacity={0.6} />
          {/* arm bone + wrist claw */}
          <path d="M104 114 L88 42" fill="none" stroke={p.dark} strokeWidth={6} />
          <path d="M104 114 L88 42" fill="none" stroke={p.body} strokeWidth={2.4} opacity={0.7} />
          <path d="M88 42 L84 28 L94 38 Z" fill={hornFill} strokeWidth={1.4} />
          {/* little claws at the finger tips */}
          <path d="M34 24 L28 18 L36 21 Z M22 64 L14 62 L22 60 Z M34 98 L28 104 L32 96 Z" fill={hornFill} strokeWidth={1} />
        </g>
      </g>
    );
  };

  const hornTipX = 136 - 46 * hl;
  const hornTipY = 46 - 24 * hl;
  const horn2TipX = 130 - 38 * hl;
  const horn2TipY = 56 - 10 * hl;

  return (
    <g className="dr-fierce" stroke={ink} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round">
      <defs>
        <linearGradient id={`dfBodyG${id}`} x1="0.9" y1="0" x2="0.2" y2="1">
          <stop offset="0" stopColor={p.light} />
          <stop offset="0.45" stopColor={p.body} />
          <stop offset="1" stopColor={p.dark} />
        </linearGradient>
        <linearGradient id={`dfWingG${id}`} x1="1" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor={p.wing} />
          <stop offset="0.6" stopColor={p.wingDark} />
          <stop offset="1" stopColor={p.dark} />
        </linearGradient>
        <linearGradient id={`dfHornG${id}`} x1="1" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor={p.horn} />
          <stop offset="1" stopColor="#ffd43b" />
        </linearGradient>
        <radialGradient id="dfFireG" cx="0" cy="0.5" r="1">
          <stop offset="0" stopColor="#fffbe0" />
          <stop offset="0.3" stopColor="#ffd43b" />
          <stop offset="0.7" stopColor="#ff7a1a" />
          <stop offset="1" stopColor="#e8301a" stopOpacity="0.2" />
        </radialGradient>
        <pattern id={`dfScales${id}`} width="7" height="6" patternUnits="userSpaceOnUse">
          <path d="M0 6 L3.5 1.5 L7 6" fill="none" stroke={p.dark} strokeWidth="0.9" opacity="0.45" />
        </pattern>
      </defs>

      <ellipse className="dr-shadow" cx="108" cy="206" rx={46 + 14 * t} ry="6" fill="#000" opacity={0.35} stroke="none" />

      <g className="dr-all">
        <g transform={`translate(112 204) scale(${bodyScale}) translate(-112 -204)`}>
          {/* tail: long, tapering, with a blade */}
          <g className="dr-tail">
            <path d="M90 168 Q66 200 36 194 Q12 188 12 160 Q22 180 38 182 Q62 184 82 156 Z" fill={`url(#dfBodyG${id})`} />
            <path d="M90 168 Q66 200 36 194 Q12 188 12 160 Q22 180 38 182 Q62 184 82 156 Z" fill={`url(#dfScales${id})`} stroke="none" />
            <path d="M9 168 L3 150 L13 134 L22 149 L19 166 Q14 160 9 168 Z" fill={p.dark} />
            <path d="M13 138 L13 160" fill="none" stroke={p.body} strokeWidth={1.2} opacity={0.7} />
            {[
              [34, 182],
              [50, 183],
              [66, 177],
            ].map(([x, y], i) => (
              <path key={i} d={`M${x! - 5} ${y! + 1} L${x! - 4} ${y! - 9 - 2 * t} L${x! + 4} ${y} Z`} fill={hornFill} strokeWidth={1.3} />
            ))}
          </g>

          {wing(true)}

          {/* far legs */}
          <path d="M104 196 L122 196 L126 204 L100 204 Z" fill={p.dark} />
          <path d="M140 150 L146 166 L140 168 L134 156 Z" fill={p.dark} />

          {/* torso */}
          <path d="M104 108 Q86 126 80 150 Q72 174 84 192 L102 202 L130 200 Q146 188 148 162 Q150 136 140 116 L132 100 Z" fill={`url(#dfBodyG${id})`} />
          <path d="M104 108 Q86 126 80 150 Q72 174 84 192 L102 202 L130 200 Q146 188 148 162 Q150 136 140 116 L132 100 Z" fill={`url(#dfScales${id})`} stroke="none" />
          {/* chest plates */}
          <path d="M138 112 Q150 138 146 166 Q140 188 128 198 Q118 178 121 152 Q124 128 138 112 Z" fill={p.belly} strokeWidth={1.6} />
          <path d="M126 130 L141 124 M122 144 L146 138 M121 158 L147 153 M122 172 L145 168 M124 186 L139 184" fill="none" stroke={p.bellyLine} strokeWidth={1.4} />

          {/* S-neck */}
          <path d="M104 116 Q102 90 116 76 L130 62 L148 66 Q140 78 138 92 Q136 104 140 120 Z" fill={`url(#dfBodyG${id})`} />
          <path d="M104 116 Q102 90 116 76 L130 62 L148 66 Q140 78 138 92 Q136 104 140 120 Z" fill={`url(#dfScales${id})`} stroke="none" />
          <path d="M146 70 Q138 82 137 96 Q136 108 140 120 L132 118 Q128 104 131 90 Q134 78 140 68 Z" fill={p.belly} strokeWidth={1.4} />
          <path d="M131 84 L142 80 M130 96 L139 94 M131 108 L139 108" fill="none" stroke={p.bellyLine} strokeWidth={1.2} />

          {/* ridge spikes */}
          {RIDGE.slice(0, ridge).map(([x, y, k], i) => {
            const z = k * (0.9 + 0.3 * t);
            return <path key={i} d={`M${x + 5 * z} ${y + 2 * z} L${x - 9 * z} ${y - 8 * z} L${x - 2 * z} ${y + 6 * z} Z`} fill={hornFill} strokeWidth={1.4} />;
          })}
          {legendary && (
            <path d="M96 132 L96 144 M92 136 L100 140 M92 152 L98 158 L92 164 M100 152 L100 164 M98 174 L104 180 L98 186 L104 186" fill="none" stroke="#ffd43b" strokeWidth={1.8} className="dr-runes" />
          )}

          {/* hind leg: big haunch, hooked claws */}
          <g className="dr-leg">
            <path d="M80 156 Q68 184 88 196 L96 204 L130 204 Q130 196 118 194 Q120 172 106 158 Q92 148 80 156 Z" fill={`url(#dfBodyG${id})`} />
            <path d="M86 166 Q96 158 108 166 M90 184 Q100 180 108 190" fill="none" stroke={p.dark} strokeWidth={1.4} />
            <path d="M124 204 L134 207 L127 199 Z M130 200 L139 202 L132 195 Z M116 204 L124 207 L118 200 Z" fill={hornFill} strokeWidth={1.2} />
          </g>

          {/* front arm + claws */}
          <g className="dr-arm">
            <path d="M130 122 Q146 128 150 148 L156 162 L148 165 L142 152 Q134 142 126 136 Z" fill={`url(#dfBodyG${id})`} />
            <path d="M136 130 Q144 138 146 150" fill="none" stroke={p.dark} strokeWidth={1.3} />
            <path d="M154 162 L161 168 L153 166 Z M149 164 L154 171 L147 168 Z" fill={hornFill} strokeWidth={1.1} />
          </g>

          {wing(false)}

          {/* head */}
          <g className="dr-head">
          <g transform={`translate(134 70) scale(${headScale}) translate(-134 -70)`}>
            {/* horns, swept back */}
            <path d={`M128 60 Q${130 - 20 * hl} ${54 - 6 * hl} ${horn2TipX} ${horn2TipY} Q${128 - 16 * hl} ${60 - 2 * hl} 130 66 Z`} fill={hornFill} strokeWidth={1.5} />
            <path d={`M136 52 Q${134 - 24 * hl} ${46 - 20 * hl} ${hornTipX} ${hornTipY} Q${132 - 20 * hl} ${50 - 10 * hl} 130 60 Z`} fill={hornFill} strokeWidth={1.6} />
            <path d={`M${136 - 18 * hl} ${46 - 12 * hl} L${134 - 16 * hl} ${50 - 8 * hl} M${136 - 30 * hl} ${42 - 16 * hl} L${134 - 28 * hl} ${46 - 13 * hl}`} fill="none" strokeWidth={1} />
            {/* jaw frill spikes */}
            <path d="M132 72 L112 70 L128 78 Z M134 78 L118 86 L134 84 Z" fill={`url(#dfWingG${id})`} strokeWidth={1.3} />

            {/* lower jaw (drops when the mouth opens) */}
            {mouthOpen ? (
              <g>
                <path d="M154 72 L196 70 L188 80 L158 78 Z" fill="#5e1420" />
                <path d="M140 76 L158 76 L190 80 L182 90 L160 90 L144 84 Z" fill={p.belly} strokeWidth={1.6} />
                <path d="M166 79 L168 74 L171 79 Z M176 80 L178 75 L181 80 Z M184 80 L186 76 L188 80 Z" fill="#fff" strokeWidth={0.8} />
              </g>
            ) : (
              <path d="M140 76 L158 74 L188 74 L182 79 L160 82 L146 82 Z" fill={p.belly} strokeWidth={1.6} />
            )}

            {/* skull + snout: wedge with a brow ridge */}
            <path d="M126 64 L136 52 L156 47 L172 53 L192 59 L200 65 L196 70 L178 71 L158 73 L142 77 L130 74 Z" fill={`url(#dfBodyG${id})`} />
            <path d="M126 64 L136 52 L156 47 L172 53 L192 59 L200 65 L196 70 L178 71 L158 73 L142 77 L130 74 Z" fill={`url(#dfScales${id})`} stroke="none" opacity={0.8} />
            <path d="M140 54 L156 50 L170 55 L156 53 Z" fill="#fff" opacity={0.35} stroke="none" />
            {/* upper fangs (closed mouth) */}
            {!mouthOpen && <path d="M180 71 L182 77 L185 71 Z M168 72 L170 77 L173 72 Z" fill="#fff" strokeWidth={0.9} />}
            {/* snout ridge + nose horn */}
            <path d="M166 52 L184 57" fill="none" stroke={p.dark} strokeWidth={1.2} />
            {t > 0.4 && <path d="M186 58 L190 48 L194 61 Z" fill={hornFill} strokeWidth={1.2} />}
            <path d="M192 62 L196 63" fill="none" stroke={ink} strokeWidth={2} />
            {/* mouth line */}
            {!mouthOpen && (mood === "sad" ? (
              <path d="M150 77 L166 74 L190 72" fill="none" strokeWidth={1.4} />
            ) : (
              <path d="M150 76 L172 73 L194 70" fill="none" strokeWidth={1.4} />
            ))}

            {/* eye: almond with a slit pupil, glowing */}
            <g className="dr-blink">
              {mood === "sleep" ? (
                <path d="M146 61 L163 58" fill="none" strokeWidth={2} />
              ) : happy ? (
                <path d="M146 61 Q155 55 164 58" fill="none" strokeWidth={2.4} />
              ) : (
                <g>
                  <path d={mood === "danger" ? "M145 61 Q154 51 165 56 Q158 66 145 61 Z" : "M145 61 Q154 54 165 57 Q157 64 145 61 Z"} fill={p.iris} />
                  <path className="dr-pupil" d={mood === "danger" ? "M155 56 L155 61" : "M156 56 L155.5 62"} fill="none" stroke={ink} strokeWidth={mood === "danger" ? 1.2 : 1.8} />
                  <circle cx="159" cy="57.5" r="1.1" fill="#fff" stroke="none" />
                </g>
              )}
            </g>
            {/* brow ridge: an angry overhang, droops when sad */}
            <path d={mood === "sad" ? "M142 56 L158 52 L166 55 L158 55 Z" : "M141 57 L160 49 L170 54 L158 54 Z"} fill={p.dark} strokeWidth={1.4} />
            {mood === "sad" && <path className="dr-tear" d="M152 66 Q149 72 152 75 Q155 72 152 66 Z" fill="#7cc4ff" strokeWidth={1} />}
            {mood === "danger" && <path className="dr-sweat" d="M172 42 Q168 49 172 52 Q176 49 172 42 Z" fill="#8fd3ff" strokeWidth={1} />}

            {mood === "c2" && (
              <g className="dr-smoke" fill="#d9dde6" stroke="none" opacity={0.9}>
                <circle cx="202" cy="58" r="4" />
                <circle cx="208" cy="50" r="5" />
                <circle cx="212" cy="40" r="6" />
              </g>
            )}
            {fire && (
              <g className="dr-fire" stroke="none">
                <path d="M194 74 Q234 50 290 62 Q266 76 294 88 Q236 94 194 80 Z" fill="url(#dfFireG)" />
                <path d="M196 76 Q226 64 262 70 Q244 78 266 84 Q228 88 196 79 Z" fill="#ffe27a" opacity={0.9} />
                <path d="M196 77 Q216 72 236 75 Q224 79 236 82 Q214 83 196 78 Z" fill="#fffbe0" />
              </g>
            )}
          </g>
          </g>
        </g>
      </g>
    </g>
  );
}
