/**
 * 🍬 The Шмиксер gems: our own six gem cuts (hexagon, round brilliant, emerald cut, trillion, marquise, oval — they differ by shape as well as colour), each with a soft glow and a glowing rune (fire, frost, lightning, sun, void, ember), drawn once as
 * SVG symbols and used by every tile. Specials are drawn on top of a gem: rockets (stripes + arrows),
 * the bomb (round, with a burning fuse) and the prism (a rainbow orb).
 */

export const GEM_COLORS = ["#ff4d6d", "#3d9bff", "#33d17a", "#ffc53d", "#b06bff", "#ff8a3d"];
const LIGHT = ["#ffb3c1", "#a9d4ff", "#a6f0c6", "#fff0a8", "#e2c6ff", "#ffd0a8"];
const DARK = ["#a3122f", "#164f9e", "#13804a", "#b07d00", "#5d22a8", "#b04a0a"];

// outlines (viewBox 0 0 100 100): six real gem cuts
const SHAPES = [
  // 0 ruby: hexagon
  "M50 8 L86 29 L86 71 L50 92 L14 71 L14 29 Z",
  // 1 sapphire: round brilliant
  "M50 10 L78 20 L90 48 L80 78 L50 90 L20 78 L10 48 L22 20 Z",
  // 2 emerald: emerald cut (square with cut corners)
  "M28 12 L72 12 L88 28 L88 72 L72 88 L28 88 L12 72 L12 28 Z",
  // 3 topaz: trillion (triangle)
  "M50 10 L92 84 Q50 94 8 84 Z",
  // 4 amethyst: marquise
  "M50 4 Q86 30 86 50 Q86 70 50 96 Q14 70 14 50 Q14 30 50 4 Z",
  // 5 amber: oval
  "M50 8 C78 8 90 28 90 50 C90 72 78 92 50 92 C22 92 10 72 10 50 C10 28 22 8 50 8 Z",
];
// facet lines per cut
const FACETS = [
  "M50 24 L72 37 L72 63 L50 76 L28 63 L28 37 Z M50 8 L50 24 M86 29 L72 37 M86 71 L72 63 M50 92 L50 76 M14 71 L28 63 M14 29 L28 37",
  "M50 10 L50 28 M22 20 L34 32 M78 20 L66 32 M10 48 L26 48 M90 48 L74 48 M20 78 L34 66 M80 78 L66 66 M34 32 L66 32 L74 48 L66 66 L34 66 L26 48 Z",
  "M28 26 L72 26 L74 74 L26 74 Z M28 12 L28 26 M72 12 L72 26 M88 28 L74 26 M12 28 L26 26 M26 74 L12 72 M74 74 L88 72",
  "M50 26 L76 74 L24 74 Z M50 10 L50 26 M92 84 L76 74 M8 84 L24 74",
  "M50 20 Q70 38 70 50 Q70 62 50 80 Q30 62 30 50 Q30 38 50 20 Z M50 4 L50 20 M50 96 L50 80 M14 50 L30 50 M86 50 L70 50",
  "M50 24 C64 24 72 36 72 50 C72 64 64 76 50 76 C36 76 28 64 28 50 C28 36 36 24 50 24 Z M50 8 L50 24 M50 92 L50 76 M10 50 L28 50 M90 50 L72 50",
];
// a glowing rune in the middle of each gem: fire, frost, lightning, sun, void star, ember star
const RUNES = [
  { d: "M50 32 Q62 45 56 57 Q62 54 61 48 Q67 60 58 67 Q50 73 42 67 Q34 60 40 50 Q42 58 47 58 Q41 46 50 32 Z", fill: true, y: 0 },
  { d: "M50 32 L50 68 M34 41 L66 59 M66 41 L34 59 M45 36 L50 40 L55 36 M45 64 L50 60 L55 64", fill: false, y: 0 },
  { d: "M55 31 L39 53 L50 53 L44 70 L62 46 L51 46 Z", fill: true, y: 0 },
  { d: "M50 52 m-8 0 a8 8 0 1 0 16 0 a8 8 0 1 0 -16 0 M50 36 L50 40 M50 64 L50 68 M34 52 L38 52 M62 52 L66 52 M39 41 L42 44 M61 41 L58 44 M39 63 L42 60 M61 63 L58 60", fill: false, y: 8 },
  { d: "M50 34 L50 66 M37 41 L63 59 M63 41 L37 59 M50 34 L45 39 M50 34 L55 39", fill: false, y: 0 },
  { d: "M50 34 L54.5 45 L66 46 L57 53 L60 65 L50 58.5 L40 65 L43 53 L34 46 L45.5 45 Z", fill: true, y: 0 },
];

export function GemDefs() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
      <defs>
        {GEM_COLORS.map((c, i) => (
          <radialGradient key={i} id={`mx-g${i}`} cx="0.38" cy="0.3" r="0.8">
            <stop offset="0" stopColor={LIGHT[i]} />
            <stop offset="0.45" stopColor={c} />
            <stop offset="1" stopColor={DARK[i]} />
          </radialGradient>
        ))}
        <linearGradient id="mx-shine" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.85" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="mx-bomb" cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#6b6f80" />
          <stop offset="0.6" stopColor="#2a2c36" />
          <stop offset="1" stopColor="#101118" />
        </radialGradient>
        <linearGradient id="mx-rainbow" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff4d6d" />
          <stop offset="0.2" stopColor="#ff8a3d" />
          <stop offset="0.4" stopColor="#ffc53d" />
          <stop offset="0.6" stopColor="#33d17a" />
          <stop offset="0.8" stopColor="#3d9bff" />
          <stop offset="1" stopColor="#b06bff" />
        </linearGradient>
        <filter id="mx-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
        <filter id="mx-rune-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.2" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        {SHAPES.map((d, i) => {
          const rune = RUNES[i]!;
          return (
            <symbol key={i} id={`mx-s${i}`} viewBox="0 0 100 100" overflow="visible">
              <path d={d} fill={GEM_COLORS[i]} opacity="0.55" filter="url(#mx-glow)" />
              <path d={d} fill={`url(#mx-g${i})`} stroke={DARK[i]} strokeWidth="4" strokeLinejoin="round" />
              <path d={FACETS[i]} fill="none" stroke="#fff" strokeOpacity="0.35" strokeWidth="2" strokeLinejoin="round" />
              <g transform={`translate(0 ${rune.y})`} filter="url(#mx-rune-glow)" className="mx-rune">
                <path
                  d={rune.d}
                  fill={rune.fill ? "#fff" : "none"}
                  fillOpacity="0.9"
                  stroke={rune.fill ? LIGHT[i] : "#fff"}
                  strokeOpacity="0.95"
                  strokeWidth={rune.fill ? 1.5 : 3.6}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </g>
              <ellipse cx="36" cy="28" rx="13" ry="7" fill="url(#mx-shine)" transform="rotate(-25 36 28)" />
              <circle cx="68" cy="66" r="2.6" fill="#fff" opacity="0.55" />
            </symbol>
          );
        })}
      </defs>
    </svg>
  );
}

export function Gem({ color, special }: { color: number; special: string | null }) {
  if (special === "prism")
    return (
      <svg viewBox="0 0 100 100" className="mx-gem-svg mx-prism">
        <circle cx="50" cy="50" r="40" fill="url(#mx-rainbow)" stroke="#fff" strokeWidth="4" />
        <circle cx="50" cy="50" r="40" fill="none" stroke="#000" strokeOpacity="0.25" strokeWidth="2" />
        <path d="M50 14 L58 42 L86 50 L58 58 L50 86 L42 58 L14 50 L42 42 Z" fill="#fff" opacity="0.85" />
        <ellipse cx="36" cy="30" rx="12" ry="6" fill="#fff" opacity="0.7" transform="rotate(-30 36 30)" />
      </svg>
    );
  if (special === "bomb")
    return (
      <svg viewBox="0 0 100 100" className="mx-gem-svg mx-bomb">
        <circle cx="50" cy="56" r="34" fill="url(#mx-bomb)" stroke={GEM_COLORS[color]} strokeWidth="6" />
        <rect x="42" y="14" width="16" height="12" rx="3" fill="#4a4d5c" stroke="#101118" strokeWidth="2" />
        <path d="M50 14 Q54 4 64 6" fill="none" stroke="#c8a36b" strokeWidth="4" strokeLinecap="round" />
        <circle className="mx-fuse" cx="65" cy="6" r="5" fill="#ffd43b" />
        <ellipse cx="38" cy="44" rx="10" ry="6" fill="#fff" opacity="0.35" transform="rotate(-30 38 44)" />
        <use href={`#mx-s${color}`} x="34" y="40" width="32" height="32" />
      </svg>
    );
  return (
    <svg viewBox="0 0 100 100" className="mx-gem-svg">
      <use href={`#mx-s${color}`} width="100" height="100" />
      {(special === "rowRocket" || special === "colRocket") && (
        <g transform={special === "colRocket" ? "rotate(90 50 50)" : undefined}>
          <path d="M14 40 L86 40 M14 50 L86 50 M14 60 L86 60" stroke="#fff" strokeWidth="5" strokeLinecap="round" opacity="0.9" />
          <path d="M4 50 L16 38 L16 62 Z M96 50 L84 38 L84 62 Z" fill="#fff" stroke="#000" strokeOpacity="0.35" strokeWidth="1.5" />
        </g>
      )}
    </svg>
  );
}
