import type { ReactNode } from "react";

/**
 * Selectable frames for a watched screen share. Every frame is an SVG drawn on the same
 * 1100x625 canvas with a transparent "hole" where the video sits (the video is rendered
 * behind the art), plus the hole's rectangle in percent so the player can be positioned.
 * The art is procedural vector work (gradients, turbulence/lighting filters) — rich, but
 * not photographs.
 */
export interface StreamFrameDef {
  id: string;
  name: string;
  screen: { l: number; t: number; w: number; h: number };
  /** Retro TV keeps scanlines/vignette over the glass; others just get a soft glare. */
  crt?: boolean;
  /** Canvas height in units (width is always 1100); defaults to 625. */
  height?: number;
  Art: () => ReactNode;
}

const W = 1100;
const H = 625;

/** Screen rect in SVG units -> percentages of the canvas. */
function rect(x: number, y: number, w: number, h: number) {
  return { l: (x / W) * 100, t: (y / H) * 100, w: (w / W) * 100, h: (h / H) * 100 };
}

function Svg({ children }: { children: ReactNode }) {
  return (
    <svg className="stream-frame-art" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
      {children}
    </svg>
  );
}

function Hole({ id, x, y, w, h, r = 0 }: { id: string; x: number; y: number; w: number; h: number; r?: number }) {
  return (
    <mask id={id}>
      <rect width={W} height={H} fill="white" />
      <rect x={x} y={y} width={w} height={h} rx={r} fill="black" />
    </mask>
  );
}

/* ───────────────────────── Retro TV (the original artwork) ───────────────────────── */

const RETRO = rect(180, 76, 625, 464);

function RetroArt() {
  return <img className="stream-frame-art" src="/tv/crt-tv.webp" alt="" draggable={false} />;
}

/* ───────────────────────── Cinema with velvet curtains ───────────────────────── */

const CINEMA_SCREEN = { x: 200, y: 96, w: 700, h: 394 };

function CinemaArt() {
  const s = CINEMA_SCREEN;
  const leftCurtain = "M0,0 H318 C282,120 214,250 238,360 C250,440 232,540 252,625 H0 Z";
  const rightCurtain = "M1100,0 H782 C818,120 886,250 862,360 C850,440 868,540 848,625 H1100 Z";
  return (
    <Svg>
      <defs>
        <Hole id="cin-hole" x={s.x} y={s.y} w={s.w} h={s.h} />
        <linearGradient id="cin-wall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1b0a0d" />
          <stop offset="1" stopColor="#070304" />
        </linearGradient>
        {/* velvet folds: a repeating light/dark ramp that gets warped by turbulence below */}
        <linearGradient id="cin-folds" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="64" y2="0" spreadMethod="repeat">
          <stop offset="0" stopColor="#4a070e" />
          <stop offset="0.22" stopColor="#9d1a26" />
          <stop offset="0.38" stopColor="#c8303c" />
          <stop offset="0.55" stopColor="#8a1621" />
          <stop offset="0.8" stopColor="#5a0a12" />
          <stop offset="1" stopColor="#4a070e" />
        </linearGradient>
        <linearGradient id="cin-depth" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#000" stopOpacity="0.65" />
          <stop offset="0.22" stopColor="#000" stopOpacity="0.1" />
          <stop offset="0.8" stopColor="#000" stopOpacity="0.15" />
          <stop offset="1" stopColor="#000" stopOpacity="0.7" />
        </linearGradient>
        <linearGradient id="cin-edge-l" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0.55" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.55" />
        </linearGradient>
        <linearGradient id="cin-edge-r" x1="1" y1="0" x2="0" y2="0">
          <stop offset="0.55" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.55" />
        </linearGradient>
        <linearGradient id="cin-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f6dc8a" />
          <stop offset="0.5" stopColor="#c4902f" />
          <stop offset="1" stopColor="#7d5714" />
        </linearGradient>
        <radialGradient id="cin-beam" cx="0.5" cy="0" r="1">
          <stop offset="0" stopColor="#fff3d6" stopOpacity="0.32" />
          <stop offset="1" stopColor="#fff3d6" stopOpacity="0" />
        </radialGradient>
        <filter id="cin-velvet" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.012 0.0035" numOctaves="2" seed="5" result="warp" />
          <feDisplacementMap in="SourceGraphic" in2="warp" scale="26" xChannelSelector="R" yChannelSelector="G" result="folded" />
          <feTurbulence type="fractalNoise" baseFrequency="0.9 0.02" numOctaves="2" seed="2" result="fiber" />
          <feColorMatrix in="fiber" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.55 -0.12" result="fiberA" />
          <feComposite in="fiberA" in2="folded" operator="in" result="fiberIn" />
          <feMerge>
            <feMergeNode in="folded" />
            <feMergeNode in="fiberIn" />
          </feMerge>
        </filter>
        <filter id="cin-soft" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
        <pattern id="cin-seat" width="74" height="52" patternUnits="userSpaceOnUse">
          <path d="M6,52 V22 C6,8 18,2 37,2 C56,2 68,8 68,22 V52 Z" fill="#12060a" />
          <path d="M12,52 V24 C12,13 21,8 37,8 C53,8 62,13 62,24 V52 Z" fill="#240c12" />
          <path d="M20,14 C26,10 48,10 54,14" stroke="#4a1a24" strokeWidth="2" fill="none" strokeLinecap="round" />
        </pattern>
        <pattern id="cin-fringe" width="9" height="22" patternUnits="userSpaceOnUse">
          <rect x="3" y="0" width="3" height="20" rx="1.5" fill="url(#cin-gold)" />
        </pattern>
      </defs>

      <g mask="url(#cin-hole)">
        <rect width={W} height={H} fill="url(#cin-wall)" />
        {/* projector light spilling around the screen */}
        <rect width={W} height={H} fill="url(#cin-beam)" opacity="0.9" />
        {/* screen surround: silver border + soft bloom */}
        <rect x={s.x - 12} y={s.y - 12} width={s.w + 24} height={s.h + 24} rx="6" fill="#d9d4cc" opacity="0.2" filter="url(#cin-soft)" />
        <rect x={s.x - 9} y={s.y - 9} width={s.w + 18} height={s.h + 18} rx="4" fill="#0a0a0a" stroke="#b9b3a8" strokeWidth="2" />

        {/* curtains */}
        <g>
          <path d={leftCurtain} fill="url(#cin-folds)" filter="url(#cin-velvet)" />
          <path d={leftCurtain} fill="url(#cin-depth)" />
          <path d={leftCurtain} fill="url(#cin-edge-l)" />
        </g>
        <g>
          <path d={rightCurtain} fill="url(#cin-folds)" filter="url(#cin-velvet)" />
          <path d={rightCurtain} fill="url(#cin-depth)" />
          <path d={rightCurtain} fill="url(#cin-edge-r)" />
        </g>

        {/* gold tie-backs with tassels */}
        <g>
          <path d="M214,338 C250,352 262,352 296,338" stroke="url(#cin-gold)" strokeWidth="9" fill="none" strokeLinecap="round" />
          <circle cx="214" cy="338" r="9" fill="url(#cin-gold)" />
          <path d="M296,338 l-6,52 h24 z" fill="url(#cin-gold)" />
          <rect x="288" y="386" width="20" height="30" rx="3" fill="url(#cin-gold)" />
          <path d="M886,338 C850,352 838,352 804,338" stroke="url(#cin-gold)" strokeWidth="9" fill="none" strokeLinecap="round" />
          <circle cx="886" cy="338" r="9" fill="url(#cin-gold)" />
          <path d="M804,338 l6,52 h-24 z" fill="url(#cin-gold)" />
          <rect x="792" y="386" width="20" height="30" rx="3" fill="url(#cin-gold)" />
        </g>

        {/* valance: scalloped velvet band with gold fringe */}
        <path
          d="M0,0 H1100 V54 Q1045,92 990,54 Q935,92 880,54 Q825,92 770,54 Q715,92 660,54 Q605,92 550,54 Q495,92 440,54 Q385,92 330,54 Q275,92 220,54 Q165,92 110,54 Q55,92 0,54 Z"
          fill="url(#cin-folds)"
          filter="url(#cin-velvet)"
        />
        <path
          d="M0,0 H1100 V54 Q1045,92 990,54 Q935,92 880,54 Q825,92 770,54 Q715,92 660,54 Q605,92 550,54 Q495,92 440,54 Q385,92 330,54 Q275,92 220,54 Q165,92 110,54 Q55,92 0,54 Z"
          fill="url(#cin-depth)"
        />
        <rect x="0" y="0" width={W} height="9" fill="url(#cin-gold)" />
        <rect x="0" y="9" width={W} height="2" fill="#3a2508" opacity="0.7" />
        <rect x="0" y="55" width={W} height="22" fill="url(#cin-fringe)" opacity="0" />

        {/* stage + audience silhouettes */}
        <rect x="0" y="548" width={W} height="30" fill="#2a1408" />
        <rect x="0" y="548" width={W} height="4" fill="#6b4318" opacity="0.8" />
        <rect x="0" y="574" width={W} height="51" fill="url(#cin-seat)" />
        <rect x="0" y="560" width={W} height="65" fill="#000" opacity="0.28" />
      </g>
    </Svg>
  );
}

/* ───────────────────────── Modern: slate monitor ───────────────────────── */

const SLATE_SCREEN = { x: 24, y: 24, w: 1052, h: 538 };

function SlateArt() {
  const s = SLATE_SCREEN;
  return (
    <Svg>
      <defs>
        <Hole id="sl-hole" x={s.x} y={s.y} w={s.w} h={s.h} r={8} />
        <linearGradient id="sl-metal" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3b3f47" />
          <stop offset="0.5" stopColor="#1d2026" />
          <stop offset="1" stopColor="#2c3037" />
        </linearGradient>
      </defs>
      <g mask="url(#sl-hole)">
        <rect x="2" y="2" width={W - 4} height={H - 4} rx="26" fill="url(#sl-metal)" />
        <rect x="2.5" y="2.5" width={W - 5} height={H - 5} rx="25.5" fill="none" stroke="#6b7280" strokeOpacity="0.55" />
      </g>
      <rect x={s.x - 1} y={s.y - 1} width={s.w + 2} height={s.h + 2} rx="9" fill="none" stroke="#000" strokeOpacity="0.8" strokeWidth="2" />
      <circle cx={W / 2} cy="12" r="3.5" fill="#0a0b0d" stroke="#555b66" />
      <g>
        <rect x={W / 2 - 40} y="590" width="80" height="5" rx="2.5" fill="#5b6270" opacity="0.7" />
        <circle cx={W - 46} cy="592" r="4" fill="#38d97a" />
      </g>
    </Svg>
  );
}

/* ───────────────────────── Modern: neon glass ───────────────────────── */

const NEON_SCREEN = { x: 44, y: 44, w: 1012, h: 505 };

function NeonArt() {
  const s = NEON_SCREEN;
  const bars = Array.from({ length: 24 }, (_, i) => i);
  return (
    <Svg>
      <defs>
        <Hole id="ne-hole" x={s.x} y={s.y} w={s.w} h={s.h} r={14} />
        <linearGradient id="ne-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff2fb3" />
          <stop offset="0.5" stopColor="#8a5cff" />
          <stop offset="1" stopColor="#00dcff" />
        </linearGradient>
        <filter id="ne-glow" x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur stdDeviation="7" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g mask="url(#ne-hole)">
        <rect x="4" y="4" width={W - 8} height={H - 8} rx="30" fill="#0a0716" fillOpacity="0.92" />
      </g>
      <rect x="10" y="10" width={W - 20} height={H - 20} rx="28" fill="none" stroke="url(#ne-grad)" strokeWidth="3" filter="url(#ne-glow)" />
      <rect x={s.x - 3} y={s.y - 3} width={s.w + 6} height={s.h + 6} rx="16" fill="none" stroke="url(#ne-grad)" strokeOpacity="0.8" strokeWidth="1.5" />
      {/* corner brackets */}
      {[
        "M24,70 V24 H70",
        "M1030,24 H1076 V70",
        "M24,555 V601 H70",
        "M1030,601 H1076 V555",
      ].map((d) => (
        <path key={d} d={d} fill="none" stroke="#fff" strokeOpacity="0.9" strokeWidth="3" strokeLinecap="round" />
      ))}
      {/* equalizer strip */}
      <g filter="url(#ne-glow)">
        {bars.map((i) => (
          <rect key={i} x={380 + i * 14} y={577} width="7" height="20" rx="3.5" fill="url(#ne-grad)">
            <animate attributeName="height" values="6;20;10;18;6" dur={`${1.1 + (i % 5) * 0.23}s`} repeatCount="indefinite" />
            <animate attributeName="y" values="595;577;591;579;595" dur={`${1.1 + (i % 5) * 0.23}s`} repeatCount="indefinite" />
          </rect>
        ))}
      </g>
    </Svg>
  );
}

/* ───────────────────────── Furry blue monster ───────────────────────── */

const MONSTER_SCREEN = { x: 150, y: 158, w: 730, h: 376 };

function MonsterArt() {
  const s = MONSTER_SCREEN;
  const chips: Array<[number, number]> = [
    [925, 468],
    [968, 505],
    [1000, 462],
    [958, 442],
    [1010, 500],
    [940, 530],
  ];
  const crumbs: Array<[number, number, number]> = [
    [880, 580, 4],
    [835, 596, 3],
    [905, 603, 5],
    [790, 585, 3],
    [1040, 560, 4],
    [868, 560, 3],
  ];
  return (
    <Svg>
      <defs>
        <Hole id="mo-hole" x={s.x} y={s.y} w={s.w} h={s.h} r={26} />
        <radialGradient id="mo-blue" cx="0.5" cy="0.35" r="0.8">
          <stop offset="0" stopColor="#4aa3e8" />
          <stop offset="0.6" stopColor="#2478c9" />
          <stop offset="1" stopColor="#14509a" />
        </radialGradient>
        <radialGradient id="mo-eye" cx="0.42" cy="0.38" r="0.75">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.8" stopColor="#f1f1f1" />
          <stop offset="1" stopColor="#c9ccd1" />
        </radialGradient>
        <radialGradient id="mo-cookie" cx="0.38" cy="0.35" r="0.8">
          <stop offset="0" stopColor="#e8b36a" />
          <stop offset="0.7" stopColor="#c58a45" />
          <stop offset="1" stopColor="#8d5a24" />
        </radialGradient>
        <filter id="mo-fur" x="-6%" y="-8%" width="112%" height="118%">
          <feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="2" seed="9" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="22" xChannelSelector="R" yChannelSelector="G" result="rough" />
          <feTurbulence type="fractalNoise" baseFrequency="0.9 0.16" numOctaves="3" seed="4" result="hair" />
          <feColorMatrix in="hair" type="matrix" values="0 0 0 0 0.02  0 0 0 0 0.12  0 0 0 0 0.35  0 0 0 1.1 -0.42" result="hairDark" />
          <feComposite in="hairDark" in2="rough" operator="in" result="hairIn" />
          <feMerge>
            <feMergeNode in="rough" />
            <feMergeNode in="hairIn" />
          </feMerge>
        </filter>
        <filter id="mo-drop" x="-10%" y="-10%" width="120%" height="130%">
          <feDropShadow dx="0" dy="6" stdDeviation="6" floodOpacity="0.45" />
        </filter>
      </defs>

      <g mask="url(#mo-hole)">
        <rect x="28" y="62" width="1044" height="545" rx="110" fill="url(#mo-blue)" filter="url(#mo-fur)" />
      </g>
      {/* inner shadow so the screen looks recessed into the fur */}
      <rect x={s.x - 4} y={s.y - 4} width={s.w + 8} height={s.h + 8} rx="30" fill="none" stroke="#0b2c5c" strokeOpacity="0.7" strokeWidth="8" />

      {/* eyebrows + googly eyes */}
      <g filter="url(#mo-drop)">
        <path d="M352,66 q70,-30 140,6" stroke="#1a5aa8" strokeWidth="20" strokeLinecap="round" fill="none" filter="url(#mo-fur)" />
        <path d="M608,72 q70,-36 140,-6" stroke="#1a5aa8" strokeWidth="20" strokeLinecap="round" fill="none" filter="url(#mo-fur)" />
        <circle cx="425" cy="86" r="64" fill="url(#mo-eye)" stroke="#9aa0aa" strokeWidth="3" />
        <circle cx="675" cy="86" r="64" fill="url(#mo-eye)" stroke="#9aa0aa" strokeWidth="3" />
        <circle cx="446" cy="98" r="24" fill="#0b0b0f" />
        <circle cx="654" cy="98" r="24" fill="#0b0b0f" />
        <circle cx="438" cy="90" r="7" fill="#fff" />
        <circle cx="646" cy="90" r="7" fill="#fff" />
      </g>

      {/* big bitten cookie, chips and crumbs */}
      <g filter="url(#mo-drop)">
        <path
          d="M978,402 a74,74 0 1 0 0.1,0 z M1050,436 a22,22 0 1 1 -2,36 z"
          fill="none"
        />
        <circle cx="965" cy="488" r="78" fill="url(#mo-cookie)" stroke="#7a4a1c" strokeWidth="3" />
        <circle cx="1034" cy="436" r="26" fill="#2478c9" />
        {chips.map(([cx, cy], i) => (
          <ellipse key={i} cx={cx} cy={cy} rx={9 + (i % 3) * 2} ry={7 + (i % 2) * 2} fill="#3a1f10" transform={`rotate(${i * 37} ${cx} ${cy})`} />
        ))}
      </g>
      {crumbs.map(([cx, cy, r], i) => (
        <circle key={i} cx={cx} cy={cy} r={r} fill="#c58a45" />
      ))}
      {/* happy mouth line under the screen */}
      <path d="M250,580 q300,46 600,0" stroke="#0b2c5c" strokeWidth="9" strokeLinecap="round" fill="none" opacity="0.75" />
    </Svg>
  );
}

/* ───────────────────────── Dark fantasy: stone, gold, skull and orbs ───────────────────────── */

const EXILE_SCREEN = { x: 168, y: 96, w: 764, h: 426 };

function Flame({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} filter="url(#ex-glow)">
      <path d="M0,0 C-26,-20 -22,-52 -4,-84 C-2,-60 10,-52 12,-72 C34,-44 30,-16 0,0 Z" fill="url(#ex-fire)" />
      <path d="M0,-4 C-12,-16 -10,-34 0,-52 C10,-34 14,-16 0,-4 Z" fill="#ffe7a0" opacity="0.9" />
    </g>
  );
}

function Orb({ cx, cy, color }: { cx: number; cy: number; color: "red" | "blue" }) {
  const id = color === "red" ? "ex-orb-red" : "ex-orb-blue";
  return (
    <g>
      <circle cx={cx} cy={cy} r="74" fill="#0a0806" stroke="url(#ex-gold)" strokeWidth="7" />
      <circle cx={cx} cy={cy} r="64" fill={`url(#${id})`} />
      <ellipse cx={cx - 20} cy={cy - 26} rx="26" ry="14" fill="#fff" opacity="0.32" transform={`rotate(-28 ${cx - 20} ${cy - 26})`} />
      <circle cx={cx} cy={cy} r="64" fill="none" stroke="#000" strokeOpacity="0.55" strokeWidth="3" />
    </g>
  );
}

function ExileArt() {
  const s = EXILE_SCREEN;
  return (
    <Svg>
      <defs>
        <Hole id="ex-hole" x={s.x} y={s.y} w={s.w} h={s.h} />
        <filter id="ex-stone" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="5" seed="12" result="t" />
          <feDiffuseLighting in="t" lightingColor="#a89a86" surfaceScale="2.4" diffuseConstant="1.05">
            <feDistantLight azimuth="225" elevation="55" />
          </feDiffuseLighting>
        </filter>
        <filter id="ex-glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <linearGradient id="ex-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f3d98e" />
          <stop offset="0.45" stopColor="#b98a32" />
          <stop offset="1" stopColor="#6d4b12" />
        </linearGradient>
        <linearGradient id="ex-fire" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#e63a0a" />
          <stop offset="0.6" stopColor="#ff9a1f" />
          <stop offset="1" stopColor="#ffe27a" />
        </linearGradient>
        <radialGradient id="ex-orb-red" cx="0.4" cy="0.35" r="0.85">
          <stop offset="0" stopColor="#ff7d6a" />
          <stop offset="0.45" stopColor="#c01616" />
          <stop offset="1" stopColor="#3a0303" />
        </radialGradient>
        <radialGradient id="ex-orb-blue" cx="0.4" cy="0.35" r="0.85">
          <stop offset="0" stopColor="#8fc4ff" />
          <stop offset="0.45" stopColor="#1f58c4" />
          <stop offset="1" stopColor="#06133a" />
        </radialGradient>
        <radialGradient id="ex-bone" cx="0.5" cy="0.4" r="0.7">
          <stop offset="0" stopColor="#f1e9d4" />
          <stop offset="1" stopColor="#a89c80" />
        </radialGradient>
        <radialGradient id="ex-gem" cx="0.4" cy="0.35" r="0.8">
          <stop offset="0" stopColor="#ff8a7a" />
          <stop offset="0.6" stopColor="#b3101c" />
          <stop offset="1" stopColor="#3a0408" />
        </radialGradient>
        <linearGradient id="ex-vig" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#000" stopOpacity="0.45" />
          <stop offset="0.3" stopColor="#000" stopOpacity="0" />
          <stop offset="0.75" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.6" />
        </linearGradient>
      </defs>

      <g mask="url(#ex-hole)">
        {/* carved stone slab */}
        <rect width={W} height={H} filter="url(#ex-stone)" />
        <rect width={W} height={H} fill="#1a1510" opacity="0.55" />
        <rect width={W} height={H} fill="url(#ex-vig)" />
        {/* outer iron-gold rim */}
        <rect x="6" y="6" width={W - 12} height={H - 12} rx="4" fill="none" stroke="url(#ex-gold)" strokeWidth="5" />
        <rect x="16" y="16" width={W - 32} height={H - 32} rx="2" fill="none" stroke="#000" strokeOpacity="0.6" strokeWidth="2" />
        {/* spikes along the top */}
        {Array.from({ length: 11 }, (_, i) => (
          <path key={i} d={`M${60 + i * 98},24 l12,-0 l-6,-22 z`} fill="url(#ex-gold)" opacity="0.9" />
        ))}
      </g>

      {/* gold bezel hugging the screen */}
      <rect x={s.x - 8} y={s.y - 8} width={s.w + 16} height={s.h + 16} fill="none" stroke="url(#ex-gold)" strokeWidth="6" />
      <rect x={s.x - 2} y={s.y - 2} width={s.w + 4} height={s.h + 4} fill="none" stroke="#000" strokeOpacity="0.85" strokeWidth="3" />
      {[
        [s.x - 8, s.y - 8],
        [s.x + s.w + 8, s.y - 8],
        [s.x - 8, s.y + s.h + 8],
        [s.x + s.w + 8, s.y + s.h + 8],
      ].map(([cx, cy], i) => (
        <g key={i} transform={`translate(${cx} ${cy}) rotate(45)`}>
          <rect x="-9" y="-9" width="18" height="18" fill="url(#ex-gold)" stroke="#2b1d06" strokeWidth="2" />
          <circle r="3.5" fill="#b3101c" />
        </g>
      ))}

      {/* torches */}
      <rect x="62" y="104" width="16" height="70" rx="4" fill="#3a2a16" stroke="url(#ex-gold)" strokeWidth="2" />
      <rect x="1022" y="104" width="16" height="70" rx="4" fill="#3a2a16" stroke="url(#ex-gold)" strokeWidth="2" />
      <Flame x={70} y={108} scale={0.95} />
      <Flame x={1030} y={108} scale={0.95} />

      {/* horned skull crest with a blood gem */}
      <g transform="translate(550 64)">
        <path d="M-40,-4 C-84,-8 -112,-34 -120,-62 C-96,-44 -70,-40 -44,-42" fill="url(#ex-gold)" stroke="#2b1d06" strokeWidth="2" />
        <path d="M40,-4 C84,-8 112,-34 120,-62 C96,-44 70,-40 44,-42" fill="url(#ex-gold)" stroke="#2b1d06" strokeWidth="2" />
        <path d="M-34,-2 C-50,-34 -26,-52 0,-52 C26,-52 50,-34 34,-2 L28,20 C26,30 16,34 12,34 H-12 C-16,34 -26,30 -28,20 Z" fill="url(#ex-bone)" stroke="#2b2418" strokeWidth="2" />
        <ellipse cx="-14" cy="-10" rx="9" ry="11" fill="#0c0806" />
        <ellipse cx="14" cy="-10" rx="9" ry="11" fill="#0c0806" />
        <circle cx="-14" cy="-10" r="3" fill="#ff3b1d" filter="url(#ex-glow)" />
        <circle cx="14" cy="-10" r="3" fill="#ff3b1d" filter="url(#ex-glow)" />
        <path d="M0,4 l-5,10 h10 z" fill="#0c0806" />
        <path d="M-12,22 v10 M-4,22 v12 M4,22 v12 M12,22 v10" stroke="#2b2418" strokeWidth="2" />
        <circle cx="0" cy="-44" r="9" fill="url(#ex-gem)" stroke="url(#ex-gold)" strokeWidth="3" filter="url(#ex-glow)" />
      </g>

      {/* belt: potion slots between the two orbs */}
      <g>
        <rect x="262" y="548" width="576" height="64" rx="6" fill="#120d08" stroke="url(#ex-gold)" strokeWidth="4" />
        {Array.from({ length: 8 }, (_, i) => (
          <g key={i}>
            <rect x={278 + i * 70} y={558} width="54" height="44" rx="4" fill="#07050a" stroke="#6d4b12" strokeWidth="2" />
            <rect x={282 + i * 70} y={562} width="46" height="36" rx="3" fill="none" stroke="#000" strokeOpacity="0.8" />
            {i % 3 === 0 && <rect x={298 + i * 70} y={570} width="14" height="22" rx="4" fill="#b3101c" opacity="0.85" />}
            {i % 3 === 1 && <rect x={298 + i * 70} y={570} width="14" height="22" rx="4" fill="#1f58c4" opacity="0.85" />}
          </g>
        ))}
      </g>

      {/* health / mana orbs */}
      <Orb cx={90} cy={550} color="red" />
      <Orb cx={1010} cy={550} color="blue" />
    </Svg>
  );
}

/* ───────────────────────── Everyday objects: pickle jar ───────────────────────── */

const JAR_SCREEN = { x: 250, y: 205, w: 600, h: 338 };

function Cuke({ x, y, rot, len = 150, w = 46 }: { x: number; y: number; rot: number; len?: number; w?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot})`}>
      <rect x={-len / 2} y={-w / 2} width={len} height={w} rx={w / 2.2} fill="url(#ja-cuke)" stroke="#2c4310" strokeOpacity="0.6" strokeWidth="1.5" />
      {Array.from({ length: Math.floor(len / 16) }, (_, i) => (
        <circle key={i} cx={-len / 2 + 14 + i * 16} cy={((i * 7) % 5) * 6 - 11} r={2.2} fill="#2c4310" fillOpacity="0.55" />
      ))}
      <rect x={-len / 2 + 8} y={-w / 2 + 6} width={len - 16} height={5} rx="2.5" fill="#d6ee8c" fillOpacity="0.45" />
    </g>
  );
}

function JarArt() {
  const sc = JAR_SCREEN;
  const jar = "M200,152 Q188,120 235,112 H865 Q912,120 900,152 L915,540 Q918,592 868,594 H232 Q182,592 185,540 Z";
  const dill: Array<[number, number]> = [[210, 560], [240, 575], [880, 565], [860, 580], [232, 168], [868, 172]];
  const rings: Array<[number, number]> = [[250, 548], [850, 546], [262, 196], [846, 198]];
  return (
    <Svg>
      <defs>
        <Hole id="ja-hole" x={sc.x} y={sc.y} w={sc.w} h={sc.h} r={10} />
        <linearGradient id="ja-brine" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e6efb0" stopOpacity="0.85" />
          <stop offset="1" stopColor="#a9c25f" stopOpacity="0.95" />
        </linearGradient>
        <linearGradient id="ja-cuke" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8fb23d" />
          <stop offset="0.55" stopColor="#5f8a24" />
          <stop offset="1" stopColor="#3d5f15" />
        </linearGradient>
        <linearGradient id="ja-lid" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#8d6a1e" />
          <stop offset="0.25" stopColor="#f3d77a" />
          <stop offset="0.5" stopColor="#c9a443" />
          <stop offset="0.8" stopColor="#f0d072" />
          <stop offset="1" stopColor="#7d5c16" />
        </linearGradient>
        <linearGradient id="ja-glass" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.6" />
          <stop offset="0.1" stopColor="#dff0e6" stopOpacity="0.12" />
          <stop offset="0.9" stopColor="#dff0e6" stopOpacity="0.1" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0.5" />
        </linearGradient>
        <filter id="ja-soft" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
        <filter id="ja-shadow" x="-10%" y="-10%" width="120%" height="130%">
          <feDropShadow dx="0" dy="10" stdDeviation="9" floodOpacity="0.45" />
        </filter>
      </defs>
      <g filter="url(#ja-shadow)">
        <g mask="url(#ja-hole)">
          <path d={jar} fill="url(#ja-brine)" />
          {dill.map(([x, y], i) => (
            <g key={i} stroke="#3f7a28" strokeWidth="2.4" strokeLinecap="round" fill="none">
              <path d={`M${x},${y} q-14,-26 -4,-52`} />
              <path d={`M${x},${y} q10,-24 26,-44`} />
              <path d={`M${x},${y} q-24,-12 -34,-34`} />
            </g>
          ))}
          <Cuke x={214} y={300} rot={90} len={250} w={44} />
          <Cuke x={886} y={300} rot={90} len={250} w={44} />
          <Cuke x={214} y={470} rot={84} len={170} w={42} />
          <Cuke x={886} y={470} rot={96} len={170} w={42} />
          <Cuke x={360} y={176} rot={-4} len={210} w={40} />
          <Cuke x={560} y={178} rot={3} len={190} w={40} />
          <Cuke x={730} y={176} rot={-6} len={170} w={38} />
          <Cuke x={420} y={567} rot={2} len={220} w={36} />
          <Cuke x={690} y={570} rot={-3} len={230} w={36} />
          {rings.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="14" fill="none" stroke="#c0301f" strokeWidth="6" />
          ))}
          {Array.from({ length: 26 }, (_, i) => (
            <circle key={`p${i}`} cx={198 + ((i * 71) % 700)} cy={140 + ((i * 53) % 440)} r="3" fill="#2c1b10" fillOpacity="0.6" />
          ))}
          {Array.from({ length: 22 }, (_, i) => (
            <circle key={`b${i}`} cx={196 + ((i * 89) % 710)} cy={130 + ((i * 61) % 450)} r={2.5 + (i % 4) * 1.5} fill="#fff" fillOpacity="0.25" stroke="#fff" strokeOpacity="0.55" />
          ))}
          <path d={jar} fill="url(#ja-glass)" />
          <path d="M214,160 L206,530" stroke="#fff" strokeOpacity="0.6" strokeWidth="14" strokeLinecap="round" filter="url(#ja-soft)" />
          <path d="M890,170 L896,500" stroke="#fff" strokeOpacity="0.4" strokeWidth="8" strokeLinecap="round" filter="url(#ja-soft)" />
        </g>
        <rect x="262" y="96" width="576" height="24" rx="6" fill="#d8ecdf" fillOpacity="0.7" />
        <rect x="244" y="44" width="612" height="66" rx="12" fill="url(#ja-lid)" stroke="#5c430e" strokeWidth="2" />
        {Array.from({ length: 41 }, (_, i) => (
          <line key={i} x1={262 + i * 14.4} y1="50" x2={262 + i * 14.4} y2="104" stroke="#5c430e" strokeOpacity="0.28" strokeWidth="2" />
        ))}
        <rect x="244" y="44" width="612" height="10" rx="5" fill="#fff" fillOpacity="0.35" />
      </g>
      <rect x={sc.x - 5} y={sc.y - 5} width={sc.w + 10} height={sc.h + 10} rx="14" fill="none" stroke="#f6ecd2" strokeWidth="7" />
      <rect x={sc.x - 9} y={sc.y - 9} width={sc.w + 18} height={sc.h + 18} rx="17" fill="none" stroke="#7a5a2a" strokeOpacity="0.8" strokeWidth="2" />
      <rect x={sc.x} y={sc.y} width={sc.w} height={sc.h} rx="10" fill="#cfe58a" fillOpacity="0.08" />
    </Svg>
  );
}

/* ───────────────────────── Shared neon helpers ───────────────────────── */

/** Deterministic pseudo-random numbers, so glitter/sparkles don't jump between renders. */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Bloom filters for neon tubes: wide soft halo + tight glow. */
function NeonFilters({ id }: { id: string }) {
  return (
    <>
      <filter id={`${id}-halo`} x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="14" />
      </filter>
      <filter id={`${id}-glow`} x="-10%" y="-10%" width="120%" height="120%">
        <feGaussianBlur stdDeviation="3.2" result="b" />
        <feMerge>
          <feMergeNode in="b" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </>
  );
}

/** A glass neon tube: coloured halo, coloured glowing tube and a pale hot core. */
function Tube({ d, color, core, width = 5, fid }: { d: string; color: string; core: string; width?: number; fid: string }) {
  const common = { d, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <g>
      <path {...common} stroke={color} strokeWidth={width * 3.2} strokeOpacity="0.45" filter={`url(#${fid}-halo)`} />
      <path {...common} stroke={color} strokeWidth={width} filter={`url(#${fid}-glow)`} />
      <path {...common} stroke={core} strokeWidth={width * 0.38} />
    </g>
  );
}

/** Four-point star glint with a round bloom. */
function Glint({ x, y, size, color = "#fff", fid }: { x: number; y: number; size: number; color?: string; fid: string }) {
  const s = size;
  const t = size * 0.07;
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle r={s * 0.55} fill={color} opacity="0.35" filter={`url(#${fid}-halo)`} />
      <path d={`M0,${-s} Q${t},${-t} ${s},0 Q${t},${t} 0,${s} Q${-t},${t} ${-s},0 Q${-t},${-t} 0,${-s} Z`} fill={color} />
      <circle r={s * 0.09} fill="#fff" />
    </g>
  );
}

/* ───────────────────────── ON AIR: neon sign on a brick wall ───────────────────────── */

const ONAIR_SCREEN = { x: 236, y: 80, w: 808, h: 454 };

function OnAirArt() {
  const s = ONAIR_SCREEN;
  const red = "#ff2b4a";
  const redCore = "#ffe3e7";
  const blue = "#19c6ff";
  const blueCore = "#e2f8ff";
  // Red sign: hugs the picture, top-right and bottom-left corners cut; open on the left where the text sits.
  const rL = s.x - 14;
  const rR = s.x + s.w + 14;
  const rT = s.y - 14;
  const rB = s.y + s.h + 14;
  const c = 58;
  const redPath = `M${rL},${rT + 128} V${rT} H${rR - c} L${rR},${rT + c} V${rB} H${rL + c} L${rL},${rB - c} V${rB - 132}`;
  // Blue sign: a size bigger and shifted out, broken into strokes like a real bent tube.
  const bL = rL - 22;
  const bR = rR + 18;
  const bT = rT - 20;
  const bB = rB + 20;
  const bc = 92;
  const blueTop = `M${bL},${bT + 96} V${bT} H${bR - bc} L${bR},${bT + bc} V${bT + 196}`;
  const blueBottom = `M${bL},${bB - 140} V${bB - bc} L${bL + bc},${bB} H${bR} V${bB - 120}`;
  const bracketTL = `M${s.x + 10},${s.y + 66} V${s.y + 12} H${s.x + 74}`;
  const bracketBR = `M${s.x + s.w - 74},${s.y + s.h - 12} H${s.x + s.w - 10} V${s.y + s.h - 66}`;
  const hole = `M${s.x},${s.y} H${s.x + s.w - 44} L${s.x + s.w},${s.y + 44} V${s.y + s.h} H${s.x + 44} L${s.x},${s.y + s.h - 44} Z`;
  const font = "'Arial Rounded MT Bold','Nunito','Varela Round','Trebuchet MS',sans-serif";

  return (
    <Svg>
      <defs>
        <mask id="oa-hole">
          <rect width={W} height={H} fill="white" />
          <path d={hole} fill="black" />
        </mask>
        <pattern id="oa-brick" width="96" height="44" patternUnits="userSpaceOnUse">
          <rect width="96" height="44" fill="#0c0510" />
          <rect x="1.5" y="1.5" width="45" height="19" rx="2.5" fill="#22102b" />
          <rect x="49.5" y="1.5" width="45" height="19" rx="2.5" fill="#1d0d25" />
          <rect x="-22.5" y="23.5" width="45" height="19" rx="2.5" fill="#1f0e27" />
          <rect x="25.5" y="23.5" width="45" height="19" rx="2.5" fill="#25112e" />
          <rect x="73.5" y="23.5" width="45" height="19" rx="2.5" fill="#1f0e27" />
          <rect x="1.5" y="1.5" width="45" height="2" fill="#3a1f45" opacity="0.6" />
          <rect x="25.5" y="23.5" width="45" height="2" fill="#3a1f45" opacity="0.6" />
        </pattern>
        <radialGradient id="oa-shade" cx="0.5" cy="0.5" r="0.75">
          <stop offset="0.45" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.75" />
        </radialGradient>
        <radialGradient id="oa-spill-red" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor={red} stopOpacity="0.35" />
          <stop offset="1" stopColor={red} stopOpacity="0" />
        </radialGradient>
        <radialGradient id="oa-spill-blue" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#5b3cff" stopOpacity="0.4" />
          <stop offset="1" stopColor="#5b3cff" stopOpacity="0" />
        </radialGradient>
        <NeonFilters id="oa" />
      </defs>

      <g mask="url(#oa-hole)">
        <rect width={W} height={H} fill="url(#oa-brick)" />
        {/* coloured light the tubes throw on the wall */}
        <ellipse cx="130" cy="300" rx="190" ry="210" fill="url(#oa-spill-red)" />
        <ellipse cx="200" cy="40" rx="170" ry="110" fill="url(#oa-spill-blue)" />
        <ellipse cx="960" cy="600" rx="190" ry="120" fill="url(#oa-spill-blue)" />
        <ellipse cx="760" cy="40" rx="260" ry="80" fill="url(#oa-spill-red)" />
        <rect width={W} height={H} fill="url(#oa-shade)" />
        {/* thin dark lip right around the picture */}
        <path d={hole} fill="none" stroke="#000" strokeOpacity="0.7" strokeWidth="6" />
      </g>

      <Tube d={blueTop} color={blue} core={blueCore} fid="oa" width={5} />
      <Tube d={blueBottom} color={blue} core={blueCore} fid="oa" width={5} />
      <Tube d={redPath} color={red} core={redCore} fid="oa" width={6} />
      <Tube d={bracketTL} color={blue} core={blueCore} fid="oa" width={4} />
      <Tube d={bracketBR} color={blue} core={blueCore} fid="oa" width={4} />

      {/* ON / AIR lettering: hollow neon outlines */}
      <g fontFamily={font} fontWeight={900} fontSize="96" textAnchor="middle" strokeLinejoin="round">
        <text x="128" y="300" fill="none" stroke={red} strokeWidth="11" strokeOpacity="0.4" filter="url(#oa-halo)">ON</text>
        <text x="128" y="300" fill="#2a0710" fillOpacity="0.55" stroke={red} strokeWidth="4" filter="url(#oa-glow)">ON</text>
        <text x="128" y="300" fill="none" stroke={redCore} strokeWidth="1.4">ON</text>
        <text x="128" y="398" fill="none" stroke={blue} strokeWidth="11" strokeOpacity="0.4" filter="url(#oa-halo)">AIR</text>
        <text x="128" y="398" fill="#04202b" fillOpacity="0.55" stroke={blue} strokeWidth="4" filter="url(#oa-glow)">AIR</text>
        <text x="128" y="398" fill="none" stroke={blueCore} strokeWidth="1.4">AIR</text>
      </g>

      {/* hot spots where the tubes catch the light */}
      <Glint x={rR - 210} y={rT} size={16} color="#ffd6dc" fid="oa" />
      <Glint x={bL + 70} y={bT} size={13} color="#d9f4ff" fid="oa" />
      <Glint x={(rL + rR) / 2} y={rB} size={14} color="#ffd6dc" fid="oa" />
      <Glint x={bR - 120} y={bB} size={12} color="#d9f4ff" fid="oa" />
    </Svg>
  );
}

/* ───────────────────────── Silver: polished frame with glitter ───────────────────────── */

const SILVER_SCREEN = { x: 94, y: 54, w: 912, h: 513 };

function SilverArt() {
  const s = SILVER_SCREEN;
  const oL = s.x - 24;
  const oT = s.y - 24;
  const oR = s.x + s.w + 24;
  const oB = s.y + s.h + 24;
  const k = 44; // concave corner radius of the inner border
  const iL = s.x - 8;
  const iT = s.y - 8;
  const iR = s.x + s.w + 8;
  const iB = s.y + s.h + 8;
  const inner = `M${iL + k},${iT} H${iR - k} A${k},${k} 0 0 0 ${iR},${iT + k} V${iB - k} A${k},${k} 0 0 0 ${iR - k},${iB} H${iL + k} A${k},${k} 0 0 0 ${iL},${iB - k} V${iT + k} A${k},${k} 0 0 0 ${iL + k},${iT} Z`;
  const holeK = k - 8;
  const hole = `M${s.x + holeK},${s.y} H${s.x + s.w - holeK} A${holeK},${holeK} 0 0 0 ${s.x + s.w},${s.y + holeK} V${s.y + s.h - holeK} A${holeK},${holeK} 0 0 0 ${s.x + s.w - holeK},${s.y + s.h} H${s.x + holeK} A${holeK},${holeK} 0 0 0 ${s.x},${s.y + s.h - holeK} V${s.y + holeK} A${holeK},${holeK} 0 0 0 ${s.x + holeK},${s.y} Z`;
  // Octagon ribbon that weaves behind the frame and the picture.
  const oct = `M250,14 H850 L1050,182 V444 L850,612 H250 L50,444 V182 Z`;

  // Glitter dust drifting off the frame, densest near the glints.
  const rnd = seeded(7);
  const dust = Array.from({ length: 170 }, () => {
    const side = rnd();
    const along = rnd();
    const out = (rnd() - 0.35) * 46;
    let x: number;
    let y: number;
    if (side < 0.3) {
      x = oL + along * (oR - oL);
      y = oT - out;
    } else if (side < 0.5) {
      x = oL + along * (oR - oL);
      y = oB + out;
    } else if (side < 0.75) {
      x = oL - out;
      y = oT + along * (oB - oT);
    } else {
      x = oR + out;
      y = oT + along * (oB - oT);
    }
    return { x, y, r: 0.5 + rnd() * 1.7, o: 0.35 + rnd() * 0.65 };
  });

  return (
    <Svg>
      <defs>
        <mask id="sv-hole">
          <rect width={W} height={H} fill="white" />
          <path d={hole} fill="black" />
        </mask>
        <radialGradient id="sv-bg" cx="0.5" cy="0.5" r="0.7">
          <stop offset="0" stopColor="#3a3639" />
          <stop offset="0.7" stopColor="#1b191b" />
          <stop offset="1" stopColor="#0c0b0c" />
        </radialGradient>
        <linearGradient id="sv-metal" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f4f4f6" />
          <stop offset="0.18" stopColor="#9c9ea4" />
          <stop offset="0.35" stopColor="#e9eaee" />
          <stop offset="0.52" stopColor="#7d7f86" />
          <stop offset="0.7" stopColor="#d7d8dd" />
          <stop offset="0.86" stopColor="#8b8d93" />
          <stop offset="1" stopColor="#f1f1f3" />
        </linearGradient>
        <linearGradient id="sv-metal-v" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.5" stopColor="#8e9096" />
          <stop offset="1" stopColor="#e4e5e9" />
        </linearGradient>
        <radialGradient id="sv-rivet" cx="0.35" cy="0.32" r="0.75">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.45" stopColor="#c9cacf" />
          <stop offset="1" stopColor="#55575d" />
        </radialGradient>
        <filter id="sv-shadow" x="-5%" y="-5%" width="110%" height="110%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
        <NeonFilters id="sv" />
      </defs>

      <g mask="url(#sv-hole)">
        <rect width={W} height={H} fill="url(#sv-bg)" />
        {/* octagon ribbon behind everything */}
        <path d={oct} fill="none" stroke="url(#sv-metal)" strokeWidth="7" />
        <path d={oct} fill="none" stroke="#fff" strokeOpacity="0.35" strokeWidth="1.2" />
        {/* drop shadow of the frame */}
        <rect x={oL + 4} y={oT + 8} width={oR - oL} height={oB - oT} fill="none" stroke="#000" strokeOpacity="0.6" strokeWidth="18" filter="url(#sv-shadow)" />
        {/* outer bevelled bar */}
        <rect x={oL} y={oT} width={oR - oL} height={oB - oT} fill="none" stroke="url(#sv-metal)" strokeWidth="14" />
        <rect x={oL - 7} y={oT - 7} width={oR - oL + 14} height={oB - oT + 14} fill="none" stroke="#fff" strokeOpacity="0.55" strokeWidth="1" />
        <rect x={oL + 7} y={oT + 7} width={oR - oL - 14} height={oB - oT - 14} fill="none" stroke="#2b2c30" strokeOpacity="0.8" strokeWidth="1.2" />
        {/* inner border with scooped corners */}
        <path d={inner} fill="none" stroke="url(#sv-metal-v)" strokeWidth="3.5" />
        {/* engraved hatch in the top-right corner */}
        {[0, 1, 2, 3].map((i) => (
          <path key={i} d={`M${oR - 150 + i * 12},${oT + 22} L${oR - 22},${oT + 150 - i * 12}`} stroke="url(#sv-metal)" strokeWidth="1.6" opacity="0.85" />
        ))}
        {/* corner rivets */}
        {[
          [oL + 2, oT + 2],
          [oR - 2, oT + 2],
          [oL + 2, oB - 2],
          [oR - 2, oB - 2],
        ].map(([x, y]) => (
          <g key={`${x}-${y}`}>
            <circle cx={x} cy={y} r="17" fill="#000" opacity="0.45" filter="url(#sv-shadow)" />
            <circle cx={x} cy={y} r="14" fill="url(#sv-rivet)" stroke="#6c6e74" strokeWidth="1" />
          </g>
        ))}
        {/* glitter */}
        {dust.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={p.r} fill="#fff" opacity={p.o} />
        ))}
      </g>

      {/* glints on the metal */}
      <Glint x={550} y={oT - 4} size={34} fid="sv" />
      <Glint x={505} y={oT + 2} size={14} fid="sv" />
      <Glint x={oL} y={300} size={30} fid="sv" />
      <Glint x={oL + 6} y={346} size={14} fid="sv" />
      <Glint x={oR} y={330} size={32} fid="sv" />
      <Glint x={oR - 10} y={378} size={15} fid="sv" />
      <Glint x={850} y={oB + 2} size={12} fid="sv" />
    </Svg>
  );
}

/* ───────────────────────── Neon swirl: hand-bent pink/blue tube ───────────────────────── */

const SWIRL_SCREEN = { x: 168, y: 128, w: 764, h: 430 };

function SwirlArt() {
  const s = SWIRL_SCREEN;
  // Outer loop with a curl at the top-left and bottom-right, drawn freehand-ish.
  const outer =
    "M150,138 C112,140 102,104 122,88 C142,72 176,84 172,112 C170,128 154,130 150,118 " +
    "M168,86 C330,66 560,92 760,76 C860,68 950,70 990,84 C1022,96 1024,132 1018,180 " +
    "C1010,300 1028,430 1012,540 C1008,566 1032,580 1052,566 C1072,550 1060,522 1036,528 C1020,534 1024,552 1038,550 " +
    "M1012,560 C990,598 920,590 800,592 C620,596 400,580 220,592 C150,598 112,580 106,540 " +
    "C96,440 118,330 104,240 C98,190 104,160 124,140";
  // Inner loop, a little wobblier, curls at the top-right and bottom-left.
  const inner =
    "M178,128 C340,112 580,132 840,118 C900,114 938,124 944,150 " +
    "C952,180 926,196 910,182 C898,170 910,152 924,160 " +
    "M944,172 C950,300 936,420 950,540 C954,568 930,578 900,576 " +
    "C700,568 470,584 230,572 " +
    "C206,570 190,552 204,538 C218,526 236,540 226,552 " +
    "M190,560 C160,560 152,540 154,500 C160,400 146,300 156,200 C160,156 164,132 178,128";

  return (
    <Svg>
      <defs>
        <Hole id="sw-hole" x={s.x} y={s.y} w={s.w} h={s.h} r={22} />
        <linearGradient id="sw-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2a0636" />
          <stop offset="0.55" stopColor="#170a3a" />
          <stop offset="1" stopColor="#080a2e" />
        </linearGradient>
        <linearGradient id="sw-tube" gradientUnits="userSpaceOnUse" x1="120" y1="600" x2="1000" y2="80">
          <stop offset="0" stopColor="#2e7bff" />
          <stop offset="0.35" stopColor="#6a4dff" />
          <stop offset="0.6" stopColor="#e63bff" />
          <stop offset="1" stopColor="#ff4fd8" />
        </linearGradient>
        <radialGradient id="sw-spill" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ff3bd4" stopOpacity="0.28" />
          <stop offset="1" stopColor="#ff3bd4" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="sw-spill-blue" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#2e7bff" stopOpacity="0.3" />
          <stop offset="1" stopColor="#2e7bff" stopOpacity="0" />
        </radialGradient>
        <NeonFilters id="sw" />
      </defs>

      <g mask="url(#sw-hole)">
        <rect width={W} height={H} fill="url(#sw-bg)" />
        <ellipse cx="860" cy="110" rx="300" ry="140" fill="url(#sw-spill)" />
        <ellipse cx="180" cy="560" rx="280" ry="130" fill="url(#sw-spill-blue)" />
        {/* soft shadow line where the picture meets the backdrop */}
        <rect x={s.x - 2} y={s.y - 2} width={s.w + 4} height={s.h + 4} rx="24" fill="none" stroke="#000" strokeOpacity="0.55" strokeWidth="5" />
      </g>

      <Tube d={outer} color="url(#sw-tube)" core="#fbe9ff" fid="sw" width={6} />
      <Tube d={inner} color="url(#sw-tube)" core="#f3ecff" fid="sw" width={3.5} />

      <Glint x={560} y={84} size={18} color="#ffd9f6" fid="sw" />
      <Glint x={192} y={590} size={14} color="#d4e4ff" fid="sw" />
      <Glint x={1016} y={300} size={12} color="#ffd9f6" fid="sw" />
    </Svg>
  );
}

/* ───────────────────────── Path of Exile 2 key-art frame ───────────────────────── */

function Poe2Art() {
  return <img className="stream-frame-art" src="/tv/poe2-frame.webp" alt="" draggable={false} />;
}

/* ───────────────────────── Frames cut out of generated artwork ─────────────────────────
   Each is a transparent WebP (public/tv) — the ornaments wrap the window and everything
   else is see-through. The video is tucked a few pixels under the art so no seam shows. */

function ImgArt({ src }: { src: string }) {
  return <img className="stream-frame-art" src={src} alt="" draggable={false} />;
}

/** Percent-based screen rect for an image canvas, with the video slipped under the art. */
function imgFrame(id: string, name: string, file: string, w: number, h: number, hole: [number, number, number, number]): StreamFrameDef {
  const tuck = 6;
  const [x0, y0, x1, y1] = hole;
  return {
    id,
    name,
    height: Math.round((1100 * h) / w),
    screen: {
      l: ((x0 - tuck) / w) * 100,
      t: ((y0 - tuck) / h) * 100,
      w: ((x1 - x0 + tuck * 2) / w) * 100,
      h: ((y1 - y0 + tuck * 2) / h) * 100,
    },
    Art: () => <ImgArt src={`/tv/${file}.webp`} />,
  };
}

export const STREAM_FRAMES: StreamFrameDef[] = [
  { id: "retro", name: "Ретро телевизор", screen: RETRO, crt: true, Art: RetroArt },
  { id: "cinema", name: "Кино салон", screen: rect(CINEMA_SCREEN.x, CINEMA_SCREEN.y, CINEMA_SCREEN.w, CINEMA_SCREEN.h), Art: CinemaArt },
  { id: "slate", name: "Модерен монитор", screen: rect(SLATE_SCREEN.x, SLATE_SCREEN.y, SLATE_SCREEN.w, SLATE_SCREEN.h), Art: SlateArt },
  { id: "neon", name: "Неоново стъкло", screen: rect(NEON_SCREEN.x, NEON_SCREEN.y, NEON_SCREEN.w, NEON_SCREEN.h), Art: NeonArt },
  { id: "monster", name: "Синьо космато чудовище", screen: rect(MONSTER_SCREEN.x, MONSTER_SCREEN.y, MONSTER_SCREEN.w, MONSTER_SCREEN.h), Art: MonsterArt },
  { id: "exile", name: "Тъмна фантазия", screen: rect(EXILE_SCREEN.x, EXILE_SCREEN.y, EXILE_SCREEN.w, EXILE_SCREEN.h), Art: ExileArt },
  {
    id: "poe2",
    name: "Path of Exile 2",
    height: 680,
    screen: { l: (212 / 1100) * 100, t: (162 / 680) * 100, w: (676 / 1100) * 100, h: (380 / 680) * 100 },
    Art: Poe2Art,
  },
  imgFrame("fireice", "Огън и лед", "frame-fireice", 1011, 733, [124, 126, 877, 496]),
  imgFrame("dragon", "Дракон", "frame-dragon", 943, 580, [151, 173, 788, 501]),
  imgFrame("berserk", "Берсерк", "frame-berserk", 1326, 567, [316, 162, 1018, 499]),
  { id: "jar", name: "Буркан с туршия", screen: rect(JAR_SCREEN.x, JAR_SCREEN.y, JAR_SCREEN.w, JAR_SCREEN.h), Art: JarArt },
  { id: "onair", name: "ON AIR неон", screen: rect(ONAIR_SCREEN.x, ONAIR_SCREEN.y, ONAIR_SCREEN.w, ONAIR_SCREEN.h), Art: OnAirArt },
  { id: "silver", name: "Сребърен блясък", screen: rect(SILVER_SCREEN.x, SILVER_SCREEN.y, SILVER_SCREEN.w, SILVER_SCREEN.h), Art: SilverArt },
  { id: "swirl", name: "Неонов свитък", screen: rect(SWIRL_SCREEN.x, SWIRL_SCREEN.y, SWIRL_SCREEN.w, SWIRL_SCREEN.h), Art: SwirlArt },
];

export const DEFAULT_FRAME_ID = "retro";
const STORAGE_KEY = "shmirka-stream-frame";

export function getStoredFrameId(): string {
  try {
    const id = localStorage.getItem(STORAGE_KEY);
    if (id && STREAM_FRAMES.some((f) => f.id === id)) return id;
  } catch {
    // storage blocked
  }
  return DEFAULT_FRAME_ID;
}

export function storeFrameId(id: string) {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // not fatal
  }
}
