/**
 * 🍬 The Шмиксер gems: our own six shapes (so they differ by shape as well as colour), drawn once as
 * SVG symbols and used by every tile. Specials are drawn on top of a gem: rockets (stripes + arrows),
 * the bomb (round, with a burning fuse) and the prism (a rainbow orb).
 */

export const GEM_COLORS = ["#ff4d6d", "#3d9bff", "#33d17a", "#ffc53d", "#b06bff", "#ff8a3d"];
const LIGHT = ["#ffb3c1", "#a9d4ff", "#a6f0c6", "#fff0a8", "#e2c6ff", "#ffd0a8"];
const DARK = ["#a3122f", "#164f9e", "#13804a", "#b07d00", "#5d22a8", "#b04a0a"];

// outlines (viewBox 0 0 100 100)
const SHAPES = [
  // 0 ruby: a heart
  "M50 88 C20 66 8 50 10 34 C12 18 30 10 42 18 C46 21 49 25 50 28 C51 25 54 21 58 18 C70 10 88 18 90 34 C92 50 80 66 50 88 Z",
  // 1 sapphire: a round brilliant
  "M50 10 L78 20 L90 48 L80 78 L50 90 L20 78 L10 48 L22 20 Z",
  // 2 emerald: a rounded square cut
  "M28 12 L72 12 L88 28 L88 72 L72 88 L28 88 L12 72 L12 28 Z",
  // 3 topaz: a star
  "M50 8 L61 36 L91 37 L67 56 L76 86 L50 69 L24 86 L33 56 L9 37 L39 36 Z",
  // 4 amethyst: a tall diamond
  "M50 6 L84 46 L50 94 L16 46 Z",
  // 5 amber: a drop
  "M50 8 C62 28 82 46 82 64 C82 82 68 92 50 92 C32 92 18 82 18 64 C18 46 38 28 50 8 Z",
];
// facet lines per shape
const FACETS = [
  "M50 28 L50 70 M30 30 L50 46 L70 30",
  "M50 10 L50 30 M22 20 L36 34 M78 20 L64 34 M10 48 L32 48 M90 48 L68 48 M36 34 L64 34 L68 48 L50 72 L32 48 Z",
  "M28 26 L72 26 L74 74 L26 74 Z M28 12 L28 26 M72 12 L72 26 M88 28 L74 26 M12 28 L26 26",
  "M50 32 L56 46 L70 48 L58 56 L62 70 L50 62 L38 70 L42 56 L30 48 L44 46 Z",
  "M16 46 L84 46 M50 6 L38 46 L50 94 L62 46 Z",
  "M50 28 C58 42 68 52 68 64",
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
        {SHAPES.map((d, i) => (
          <symbol key={i} id={`mx-s${i}`} viewBox="0 0 100 100">
            <path d={d} fill={`url(#mx-g${i})`} stroke={DARK[i]} strokeWidth="4" strokeLinejoin="round" />
            <path d={FACETS[i]} fill="none" stroke="#fff" strokeOpacity="0.35" strokeWidth="2.2" strokeLinejoin="round" />
            <ellipse cx="38" cy="30" rx="14" ry="8" fill="url(#mx-shine)" transform="rotate(-25 38 30)" />
            <circle cx="66" cy="66" r="3" fill="#fff" opacity="0.5" />
          </symbol>
        ))}
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
