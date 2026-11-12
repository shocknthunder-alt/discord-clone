import { useEffect, useRef } from "react";

// Real-time fire around the window edges, drawn by a fragment shader (WebGL2). Turbulent noise
// pushes flames inward from the bottom and both sides; two layers at different speeds give
// depth, the noise's own slope is used as a height field for light/shadow (so the tongues look
// like volumes, not stickers), dark ribbons and rising sparks complete the look.
// Cost is kept low on purpose: it renders at a fraction of the window size, at most 30 fps,
// and stops while the window is hidden.

const VERT = `#version 300 es
in vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
uniform vec2 uRes;      // canvas size in canvas pixels
uniform float uScale;   // canvas px per CSS px
uniform float uTime;
out vec4 outColor;

float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 3; i++) { v += a * noise(p); p = p * 2.03 + vec2(17.0, 9.0); a *= 0.5; }
  return v;
}

// Flame heat at distance d (css px) inward from an edge, position a (css px) along it.
float fire(float a, float d, float reach, float width, float speed, float seed, float t) {
  float x = a / width + seed;
  float y = d / reach;
  float warp = fbm(vec2(x * 1.3, y * 2.0 - t * 0.9 * speed)) - 0.5;
  float n = fbm(vec2(x + warp * 1.5, y * 1.5 - t * 1.4 * speed));
  float tongues = 0.25 + 1.5 * fbm(vec2(x * 0.55 + seed * 3.0, t * 0.3 * speed));
  return clamp((n * 1.3 - y / tongues - 0.12) * 1.7, 0.0, 1.2);
}

float edgeFire(vec2 c, float seed, float t) {
  float W = uRes.x / uScale;
  float H = uRes.y / uScale;
  float bottomReach = clamp(H * 0.2, 110.0, 210.0);
  float sideReach = clamp(W * 0.05, 55.0, 100.0);
  // Only evaluate an edge's flames near that edge (taller tongues can reach ~1.6x the nominal height).
  float bot = c.y < bottomReach * 1.6 ? fire(c.x, c.y, bottomReach, 70.0, 1.0, seed, t) : 0.0;
  float lef = c.x < sideReach * 1.6 ? fire(c.y, c.x, sideReach, 80.0, 0.9, seed + 4.0, t) * 0.85 : 0.0;
  float rig = W - c.x < sideReach * 1.6 ? fire(c.y, W - c.x, sideReach, 80.0, 1.1, seed + 9.0, t) * 0.85 : 0.0;
  return max(bot, max(lef, rig));
}

void main() {
  vec2 c = gl_FragCoord.xy / uScale;           // css px, origin bottom-left
  float W = uRes.x / uScale;
  float nearest = min(c.y, min(c.x, W - c.x));
  float t = uTime;

  // Back layer (slower, darker) then front layer (brighter): parallax depth.
  float back = edgeFire(c + vec2(0.0, 6.0), 3.0, t * 0.8) * 0.75;
  float front = edgeFire(c, 11.0, t);
  float heat = max(front, back * 0.8);

  // Height-field lighting from the heat's slope (light from above-left).
  // (finite differences, not dFdx/dFdy: those work on 2x2 pixel blocks and look blocky)
  float e = 3.0;
  float hx = edgeFire(c + vec2(e, 0.0), 11.0, t);
  float hy = edgeFire(c + vec2(0.0, e), 11.0, t);
  vec2 g = (vec2(hx, hy) - front) / e;
  vec3 nrm = normalize(vec3(-g * 14.0, 1.0));
  float light = clamp(dot(nrm, normalize(vec3(-0.4, 0.6, 0.7))), 0.0, 1.0);

  vec3 col = mix(vec3(0.12, 0.0, 0.0), vec3(0.78, 0.1, 0.02), smoothstep(0.0, 0.3, heat));
  col = mix(col, vec3(1.0, 0.45, 0.05), smoothstep(0.25, 0.65, heat));
  col = mix(col, vec3(1.0, 0.86, 0.38), smoothstep(0.8, 1.2, heat) * 0.85);
  col *= 0.65 + 0.7 * light;                                    // volume shading
  col += vec3(1.0, 0.7, 0.3) * pow(light, 6.0) * 0.18 * heat;  // glossy rim

  // Dark ribbons winding through the flame (like the black strands in the reference art).
  float rib = abs(fbm(c / 70.0 + vec2(0.0, -t * 0.7)) - 0.5);
  float dark = smoothstep(0.03, 0.0, rib) * smoothstep(0.2, 0.7, heat);
  col *= 1.0 - 0.55 * dark;

  float alpha = smoothstep(0.02, 0.2, heat) * (nearest < 200.0 ? 1.0 : 0.0);

  // Sparks drifting up from the bottom edge.
  vec2 sp = vec2(c.x / 34.0, (c.y - t * 55.0) / 34.0);
  vec2 cell = floor(sp);
  vec2 f = fract(sp) - 0.5 - (vec2(hash(cell), hash(cell + 7.0)) - 0.5) * 0.6;
  float spark = smoothstep(0.075, 0.0, length(f)) * step(0.82, hash(cell + 3.0)) * smoothstep(240.0, 20.0, c.y);
  col += vec3(1.0, 0.65, 0.2) * spark;
  alpha = max(alpha, spark);

  outColor = vec4(col * alpha, alpha);            // premultiplied
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) ?? "shader error");
  return sh;
}

/** Calls onUnsupported if WebGL2 or the shader isn't available, so the caller can show a fallback. */
export default function FlameCanvas({ onUnsupported }: { onUnsupported: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false, powerPreference: "low-power" });
    if (!gl) {
      onUnsupported();
      return;
    }
    let program: WebGLProgram;
    try {
      program = gl.createProgram()!;
      gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERT));
      gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? "link error");
    } catch (err) {
      console.warn("flame shader unavailable", err);
      onUnsupported();
      return;
    }
    gl.useProgram(program);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(program, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const uRes = gl.getUniformLocation(program, "uRes");
    const uScale = gl.getUniformLocation(program, "uScale");
    const uTime = gl.getUniformLocation(program, "uTime");

    const SCALE = 0.6; // canvas pixels per CSS pixel — fire is soft anyway
    const reduced =
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      document.documentElement.classList.contains("reduce-motion");
    let raf = 0;
    let last = 0;
    const start = performance.now();

    function resize() {
      const w = Math.max(2, Math.round(window.innerWidth * SCALE));
      const h = Math.max(2, Math.round(window.innerHeight * SCALE));
      if (canvas!.width !== w || canvas!.height !== h) {
        canvas!.width = w;
        canvas!.height = h;
        gl!.viewport(0, 0, w, h);
      }
    }

    function draw(now: number) {
      resize();
      gl!.clearColor(0, 0, 0, 0);
      gl!.clear(gl!.COLOR_BUFFER_BIT);
      gl!.uniform2f(uRes, canvas!.width, canvas!.height);
      gl!.uniform1f(uScale, SCALE);
      gl!.uniform1f(uTime, reduced ? 3 : (now - start) / 1000);
      gl!.drawArrays(gl!.TRIANGLES, 0, 3);
    }

    function frame(now: number) {
      raf = requestAnimationFrame(frame);
      if (document.hidden || now - last < 33) return; // ~30 fps, nothing while hidden
      last = now;
      draw(now);
    }
    const onResize = () => draw(performance.now());
    if (reduced) draw(start);
    else raf = requestAnimationFrame(frame);
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      // No loseContext(): a remount (React StrictMode) gets the same canvas context back, and it must be alive.
    };
  }, [onUnsupported]);

  return <canvas ref={ref} className="flames-canvas" />;
}
