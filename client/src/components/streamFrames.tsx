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

/* ───────────────────────── Everyday objects: beer mug, coffee cup, pickle jar ───────────────────────── */

const BEER_SCREEN = { x: 250, y: 215, w: 470, h: 264 };

function BeerArt() {
  const sc = BEER_SCREEN;
  const bubbles = Array.from({ length: 46 }, (_, i) => ({
    x: 232 + ((i * 53) % 506),
    y: 190 + ((i * 97) % 340),
    r: 2 + (i % 5) * 1.4,
  }));
  const foam: Array<[number, number, number]> = [
    [260, 100, 17], [318, 82, 22], [380, 66, 18], [450, 74, 24], [520, 66, 19], [590, 78, 23], [650, 84, 17], [706, 110, 20],
    [282, 140, 14], [352, 126, 19], [430, 132, 15], [505, 120, 20], [585, 134, 14], [660, 126, 18], [738, 140, 14],
  ];
  return (
    <Svg>
      <defs>
        <Hole id="be-hole" x={sc.x} y={sc.y} w={sc.w} h={sc.h} r={8} />
        <linearGradient id="be-beer" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f8c24a" />
          <stop offset="0.45" stopColor="#e8951a" />
          <stop offset="1" stopColor="#a85c08" />
        </linearGradient>
        <linearGradient id="be-glass" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.65" />
          <stop offset="0.12" stopColor="#cfe6ee" stopOpacity="0.25" />
          <stop offset="0.88" stopColor="#cfe6ee" stopOpacity="0.22" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0.55" />
        </linearGradient>
        <radialGradient id="be-foam" cx="0.5" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.7" stopColor="#fbf1d6" />
          <stop offset="1" stopColor="#e9d9ab" />
        </radialGradient>
        <linearGradient id="be-handle" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.8" />
          <stop offset="0.5" stopColor="#bfdbe4" stopOpacity="0.45" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0.7" />
        </linearGradient>
        <filter id="be-soft" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
        <filter id="be-shadow" x="-10%" y="-10%" width="120%" height="130%">
          <feDropShadow dx="0" dy="10" stdDeviation="9" floodOpacity="0.45" />
        </filter>
      </defs>
      <g filter="url(#be-shadow)">
        <path d="M758,215 C905,195 935,275 930,345 C925,430 885,500 748,492" fill="none" stroke="url(#be-handle)" strokeWidth="38" strokeLinecap="round" />
        <path d="M758,215 C905,195 935,275 930,345 C925,430 885,500 748,492" fill="none" stroke="#fff" strokeOpacity="0.55" strokeWidth="5" strokeLinecap="round" transform="translate(-6,-4)" />
        <g mask="url(#be-hole)">
          <path d="M203,150 H767 L751,562 Q749,588 722,588 H248 Q221,588 219,562 Z" fill="#cfe9f0" fillOpacity="0.55" />
          <path d="M219,160 H751 L738,546 H232 Z" fill="url(#be-beer)" />
          {bubbles.map((b, i) => (
            <circle key={i} cx={b.x} cy={b.y} r={b.r} fill="#fff" fillOpacity="0.16" stroke="#fff" strokeOpacity="0.45" strokeWidth="1" />
          ))}
          <path d="M231,546 H739 L736,580 Q734,588 722,588 H248 Q236,588 234,580 Z" fill="#e8f6fa" fillOpacity="0.8" />
          <path d="M246,556 H724" stroke="#fff" strokeOpacity="0.7" strokeWidth="3" />
          <path d="M203,150 H767 L751,562 Q749,588 722,588 H248 Q221,588 219,562 Z" fill="url(#be-glass)" />
          <path d="M236,190 L246,520" stroke="#fff" strokeOpacity="0.55" strokeWidth="14" strokeLinecap="round" filter="url(#be-soft)" />
          <path d="M728,200 L722,500" stroke="#fff" strokeOpacity="0.4" strokeWidth="8" strokeLinecap="round" filter="url(#be-soft)" />
        </g>
        <path
          d="M198,165 Q186,98 238,92 Q256,40 318,64 Q362,22 432,56 Q484,18 545,54 Q606,24 654,60 Q716,42 738,94 Q792,100 774,166 Q770,196 746,176 Q736,214 716,176 Q690,168 660,178 H300 Q262,170 246,206 Q232,176 198,165 Z"
          fill="url(#be-foam)"
        />
        {foam.map(([cx, cy, r], i) => (
          <circle key={i} cx={cx} cy={cy} r={r} fill="#fff" fillOpacity="0.5" stroke="#d9c690" strokeOpacity="0.7" strokeWidth="1.4" />
        ))}
      </g>
      <rect x={sc.x} y={sc.y} width={sc.w} height={sc.h} rx="8" fill="#f0a020" fillOpacity="0.1" />
      <rect x={sc.x} y={sc.y} width={sc.w} height={sc.h} rx="8" fill="none" stroke="#7a4306" strokeOpacity="0.5" strokeWidth="3" />
    </Svg>
  );
}

const COFFEE_SCREEN = { x: 260, y: 205, w: 480, h: 270 };

function CoffeeArt() {
  const sc = COFFEE_SCREEN;
  return (
    <Svg>
      <defs>
        <Hole id="co-hole" x={sc.x} y={sc.y} w={sc.w} h={sc.h} r={14} />
        <linearGradient id="co-ceramic" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#c7ccd4" />
          <stop offset="0.22" stopColor="#f7f8fa" />
          <stop offset="0.6" stopColor="#ffffff" />
          <stop offset="1" stopColor="#b9bec8" />
        </linearGradient>
        <linearGradient id="co-saucer" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#b8bdc7" />
        </linearGradient>
        <radialGradient id="co-coffee" cx="0.5" cy="0.4" r="0.7">
          <stop offset="0" stopColor="#a9713f" />
          <stop offset="0.55" stopColor="#6b3e1c" />
          <stop offset="1" stopColor="#35190a" />
        </radialGradient>
        <filter id="co-blur" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
        <filter id="co-shadow" x="-10%" y="-10%" width="120%" height="140%">
          <feDropShadow dx="0" dy="12" stdDeviation="10" floodOpacity="0.4" />
        </filter>
      </defs>
      <g fill="none" stroke="#fff" strokeOpacity="0.4" strokeWidth="14" strokeLinecap="round" filter="url(#co-blur)">
        <path d="M400,96 C360,60 440,40 400,0" />
        <path d="M500,92 C460,50 540,30 500,-8" />
        <path d="M600,96 C560,60 640,40 600,0" />
      </g>
      <g filter="url(#co-shadow)">
        <ellipse cx="500" cy="584" rx="430" ry="38" fill="url(#co-saucer)" />
        <ellipse cx="500" cy="576" rx="330" ry="24" fill="#aab0bb" fillOpacity="0.55" />
        <path d="M818,215 C965,195 985,355 838,420" fill="none" stroke="url(#co-ceramic)" strokeWidth="42" strokeLinecap="round" />
        <path d="M818,215 C965,195 985,355 838,420" fill="none" stroke="#fff" strokeOpacity="0.7" strokeWidth="6" strokeLinecap="round" transform="translate(-7,-5)" />
        <g mask="url(#co-hole)">
          <path d="M170,140 L186,330 C196,460 230,525 300,540 Q320,545 340,547 H660 Q680,545 700,540 C770,525 804,460 814,330 L830,140 Z" fill="url(#co-ceramic)" />
          <path d="M170,140 L186,330 C196,460 230,525 300,540 L330,300 Z" fill="#9aa1ad" fillOpacity="0.18" />
          <path d="M236,170 L252,420" stroke="#fff" strokeOpacity="0.8" strokeWidth="12" strokeLinecap="round" filter="url(#co-blur)" />
        </g>
        <ellipse cx="500" cy="140" rx="330" ry="52" fill="url(#co-ceramic)" />
        <ellipse cx="500" cy="142" rx="300" ry="40" fill="url(#co-coffee)" />
        <ellipse cx="500" cy="136" rx="262" ry="28" fill="none" stroke="#d9a76a" strokeOpacity="0.55" strokeWidth="4" />
        <path d="M500,162 C440,140 452,118 482,124 C494,128 500,138 500,138 C500,138 506,128 518,124 C548,118 560,140 500,162 Z" fill="#f2dcb4" fillOpacity="0.85" />
      </g>
      <rect x={sc.x} y={sc.y} width={sc.w} height={sc.h} rx="14" fill="none" stroke="#8a919d" strokeOpacity="0.8" strokeWidth="4" />
      <rect x={sc.x - 6} y={sc.y - 6} width={sc.w + 12} height={sc.h + 12} rx="18" fill="none" stroke="#fff" strokeOpacity="0.9" strokeWidth="3" />
    </Svg>
  );
}

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

/* ───────────────────────── Path of Exile 2 key-art frame ───────────────────────── */

function Poe2Art() {
  return <img className="stream-frame-art" src="/tv/poe2-frame.webp" alt="" draggable={false} />;
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
  { id: "beer", name: "Халба бира", screen: rect(BEER_SCREEN.x, BEER_SCREEN.y, BEER_SCREEN.w, BEER_SCREEN.h), Art: BeerArt },
  { id: "coffee", name: "Чаша кафе", screen: rect(COFFEE_SCREEN.x, COFFEE_SCREEN.y, COFFEE_SCREEN.w, COFFEE_SCREEN.h), Art: CoffeeArt },
  { id: "jar", name: "Буркан с туршия", screen: rect(JAR_SCREEN.x, JAR_SCREEN.y, JAR_SCREEN.w, JAR_SCREEN.h), Art: JarArt },
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
