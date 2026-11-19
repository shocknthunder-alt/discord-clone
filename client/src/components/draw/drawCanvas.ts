import { DRAW_H, DRAW_W, type DrawOp } from "@discord-clone/shared";

export const BG = "#ffffff";

function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function drawSegment(ctx: CanvasRenderingContext2D, c: string, w: number, p: number[]) {
  if (p.length < 2) return;
  ctx.strokeStyle = c;
  ctx.fillStyle = c;
  ctx.lineWidth = w;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (p.length === 2) {
    // a single tap = a dot
    ctx.beginPath();
    ctx.arc(p[0]!, p[1]!, w / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(p[0]!, p[1]!);
  for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i]!, p[i + 1]!);
  ctx.stroke();
}

/**
 * Paint-bucket fill. Pixels within a small colour tolerance of the clicked one are filled, so the
 * soft (anti-aliased) edge of a line doesn't leave a pale ring; the fill grows one pixel into the
 * border so there's no gap next to the line.
 */
export function floodFill(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  const img = ctx.getImageData(0, 0, DRAW_W, DRAW_H);
  const d = img.data;
  const start = (y * DRAW_W + x) * 4;
  const tr = d[start]!;
  const tg = d[start + 1]!;
  const tb = d[start + 2]!;
  const [fr, fg, fb] = hexToRgb(color);
  if (Math.abs(tr - fr) + Math.abs(tg - fg) + Math.abs(tb - fb) < 12) return;
  const TOL = 96;
  const seen = new Uint8Array(DRAW_W * DRAW_H);
  const matches = (i: number) => {
    const o = i * 4;
    return Math.abs(d[o]! - tr) + Math.abs(d[o + 1]! - tg) + Math.abs(d[o + 2]! - tb) <= TOL;
  };
  const paint = (i: number) => {
    const o = i * 4;
    d[o] = fr;
    d[o + 1] = fg;
    d[o + 2] = fb;
    d[o + 3] = 255;
  };
  const stack = [y * DRAW_W + x];
  const edge: number[] = [];
  seen[stack[0]!] = 1;
  while (stack.length) {
    const i = stack.pop()!;
    paint(i);
    const px = i % DRAW_W;
    const py = (i - px) / DRAW_W;
    const next = [px > 0 ? i - 1 : -1, px < DRAW_W - 1 ? i + 1 : -1, py > 0 ? i - DRAW_W : -1, py < DRAW_H - 1 ? i + DRAW_W : -1];
    for (const n of next) {
      if (n < 0 || seen[n]) continue;
      seen[n] = 1;
      if (matches(n)) stack.push(n);
      else edge.push(n);
    }
  }
  for (const i of edge) paint(i);
  ctx.putImageData(img, 0, 0);
}

export function drawOp(ctx: CanvasRenderingContext2D, op: DrawOp) {
  if (op.t === "line") drawSegment(ctx, op.c, op.w, op.p);
  else floodFill(ctx, op.x, op.y, op.c);
}

export function replay(ctx: CanvasRenderingContext2D, ops: DrawOp[]) {
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, DRAW_W, DRAW_H);
  for (const op of ops) drawOp(ctx, op);
}
