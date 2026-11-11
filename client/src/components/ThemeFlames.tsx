import { useCallback, useEffect, useMemo, useState } from "react";
import FlameCanvas from "./FlameCanvas";

// Decorative fire wrapped around the edges of the window for the "Inferno" theme. Purely visual:
// pointer-events are off, it sits under the HUD and modals, and it only hugs the edges.
// Each strip is one SVG of flame tongues; the sides are the bottom strip rotated, so there is a
// single flame design. Only a few whole layers are animated (cheap transforms, no per-tongue work).

const W = 1600;
const H = 200;

// Small deterministic generator so the flames look the same on every render.
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function tonguePath(cx: number, w: number, h: number, lean: number, base = H) {
  const l = cx - w / 2;
  const r = cx + w / 2;
  const tipX = cx + lean;
  const tipY = base - h;
  // Left edge rises straight then bends toward the tip; right edge swells out and comes back in
  // with a hook, which is what makes it read as a licking flame rather than a leaf.
  return (
    `M${l},${base} C${l - w * 0.15},${base - h * 0.45} ${tipX - w * 0.7},${base - h * 0.62} ${tipX},${tipY} ` +
    `C${tipX + w * 0.05},${base - h * 0.72} ${r + w * 0.35},${base - h * 0.5} ${r},${base} Z`
  );
}

function buildLayer(seed: number, count: number, minH: number, maxH: number) {
  const rand = rng(seed);
  const step = W / count;
  const tongues: { outer: string; inner: string; core: string }[] = [];
  for (let i = 0; i < count; i++) {
    const cx = step * (i + 0.5) + (rand() - 0.5) * step * 0.5;
    const h = minH + rand() * (maxH - minH);
    const w = step * (0.9 + rand() * 0.5);
    const lean = (rand() - 0.5) * step * 1.6;
    tongues.push({
      outer: tonguePath(cx, w, h, lean),
      inner: tonguePath(cx + lean * 0.05, w * 0.6, h * 0.72, lean * 0.7),
      core: tonguePath(cx + lean * 0.1, w * 0.3, h * 0.45, lean * 0.4),
    });
  }
  return tongues;
}

function Strip({ id, layers }: { id: string; layers: ReturnType<typeof buildLayer>[] }) {
  return (
    <svg className="flame-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={`${id}-outer`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#3a0804" />
          <stop offset="0.35" stopColor="#c62a0c" />
          <stop offset="0.75" stopColor="#ff7a1c" />
          <stop offset="1" stopColor="#ffb340" stopOpacity="0.9" />
        </linearGradient>
        <linearGradient id={`${id}-inner`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#a8200a" />
          <stop offset="0.5" stopColor="#ff9a22" />
          <stop offset="1" stopColor="#ffd86a" stopOpacity="0.9" />
        </linearGradient>
        <linearGradient id={`${id}-core`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#ffb02a" />
          <stop offset="1" stopColor="#fff2b0" stopOpacity="0.85" />
        </linearGradient>
      </defs>
      {layers.map((layer, li) => (
        <g key={li} opacity={li === 0 ? 0.55 : 1}>
          {layer.map((t, i) => (
            <g key={i}>
              <path d={t.outer} fill={`url(#${id}-outer)`} />
              <path d={t.inner} fill={`url(#${id}-inner)`} />
              <path d={t.core} fill={`url(#${id}-core)`} />
            </g>
          ))}
        </g>
      ))}
    </svg>
  );
}

export default function ThemeFlames() {
  const [noWebgl, setNoWebgl] = useState(false);
  const onUnsupported = useCallback(() => setNoWebgl(true), []);
  const [active, setActive] = useState(() => document.documentElement.dataset.theme === "inferno");

  useEffect(() => {
    const onChange = () => setActive(document.documentElement.dataset.theme === "inferno");
    window.addEventListener("shmirka-theme", onChange);
    return () => window.removeEventListener("shmirka-theme", onChange);
  }, []);

  const layers = useMemo(() => [buildLayer(7, 20, 110, 200), buildLayer(31, 26, 70, 150)], []);

  if (!active) return null;

  return (
    <div className="flames" aria-hidden>
      <div className="flames-glow" />
      {!noWebgl && <FlameCanvas onUnsupported={onUnsupported} />}
      {noWebgl && (
        <>
      <div className="flames-edge flames-bottom">
        <Strip id="fb" layers={layers} />
      </div>
      <div className="flames-edge flames-left">
        <Strip id="fl" layers={layers} />
      </div>
      <div className="flames-edge flames-right">
        <Strip id="fr" layers={layers} />
      </div>
        </>
      )}
    </div>
  );
}
