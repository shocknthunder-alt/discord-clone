import { useCallback, useEffect, useRef, useState } from "react";
import { useLayoutLockStore } from "../store/layoutLockStore";
import { loadPosition, savePosition, type Position } from "../utils/floatingPositions";

// Same press-vs-drag threshold as FloatingIcon: a plain click must still reach the tile's
// own click handler (it opens the per-user menu).
const DRAG_THRESHOLD = 4;

/**
 * Lets a voice-channel user tile be dragged anywhere inside the main panel while the
 * layout is unlocked (the same lock the HUD buttons use). The tile keeps its natural
 * place in the flex layout; what's stored is only an offset from that place, per user, in
 * localStorage ("floatingPos:" prefix — so "Reset icon positions" clears these too).
 */
export function useMovableTile(id: string) {
  const locked = useLayoutLockStore((s) => s.locked);
  const key = `tile:${id}`;
  const [offset, setOffset] = useState<Position>(() => loadPosition(key, { x: 0, y: 0 }));
  const [dragging, setDragging] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    startX: number;
    startY: number;
    origin: Position;
    bounds: { minX: number; maxX: number; minY: number; maxY: number } | null;
    active: boolean;
    current: Position;
  } | null>(null);
  const justDragged = useRef(false);

  // Another user's id can change under the same component (list reordering) — reload.
  useEffect(() => {
    setOffset(loadPosition(key, { x: 0, y: 0 }));
  }, [key]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (locked || e.button !== 0) return;
      // Don't start a drag from the interactive bits inside a tile (watch button, etc.).
      if ((e.target as HTMLElement).closest("button, a, input, video")) return;
      drag.current = { startX: e.clientX, startY: e.clientY, origin: offset, bounds: null, active: false, current: offset };
    },
    [locked, offset],
  );

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const el = ref.current;
    if (!d || !el) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.active) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      d.active = true;
      setDragging(true);
      el.setPointerCapture(e.pointerId);
      // Keep the tile inside the main panel: bounds are computed from where the tile would
      // sit with no offset, so they stay valid for the whole gesture.
      const container = el.closest(".main-content")?.getBoundingClientRect();
      const rect = el.getBoundingClientRect();
      if (container) {
        const naturalLeft = rect.left - d.origin.x;
        const naturalTop = rect.top - d.origin.y;
        d.bounds = {
          minX: container.left - naturalLeft,
          maxX: container.right - (naturalLeft + rect.width),
          minY: container.top - naturalTop,
          maxY: container.bottom - (naturalTop + rect.height),
        };
      }
    }
    let x = d.origin.x + dx;
    let y = d.origin.y + dy;
    if (d.bounds) {
      x = Math.min(Math.max(x, d.bounds.minX), d.bounds.maxX);
      y = Math.min(Math.max(y, d.bounds.minY), d.bounds.maxY);
    }
    d.current = { x, y };
    setOffset(d.current);
  }, []);

  const finish = useCallback(() => {
    const d = drag.current;
    drag.current = null;
    if (!d?.active) return;
    savePosition(key, d.current);
    setDragging(false);
    // The click that follows a drag's pointerup must not open the user menu.
    justDragged.current = true;
    setTimeout(() => {
      justDragged.current = false;
    }, 0);
  }, [key]);

  const onClickCapture = useCallback((e: React.MouseEvent) => {
    if (justDragged.current) {
      e.stopPropagation();
      e.preventDefault();
    }
  }, []);

  return {
    ref,
    className: `${locked ? "" : "movable"} ${dragging ? "dragging" : ""}`,
    style: offset.x || offset.y ? { transform: `translate(${offset.x}px, ${offset.y}px)` } : undefined,
    handlers: { onPointerDown, onPointerMove, onPointerUp: finish, onPointerCancel: finish, onClickCapture },
  };
}
