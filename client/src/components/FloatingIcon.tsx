import { useEffect, useRef, useState } from "react";
import { useLayoutLockStore } from "../store/layoutLockStore";
import { hasSavedPosition, loadPosition, savePosition, type Position } from "../utils/floatingPositions";

interface Props {
  id: string;
  // A function, not a static value: it has to be called fresh on every resize (DevTools
  // opening/closing included — that changes window.innerWidth without a "real" resize in
  // some browsers' eyes, but still moves where the edge of the screen is), not just once
  // when the component mounts. A static default baked in at mount time is exactly what
  // left these icons stranded mid-screen after DevTools closed.
  getDefaultPosition: () => Position;
  children: React.ReactNode;
}

const ICON_SIZE = 44;
// Pixels of movement required before a pointerdown counts as a drag rather than a click.
// Without this, capturing the pointer on every pointerdown (even one that never moves)
// hijacked the click event of whatever button lives inside the icon — the lock toggle
// button specifically became unclickable while unlocked, since every press of it looked
// like the start of a drag.
const DRAG_THRESHOLD = 4;

function clampToViewport(pos: Position): Position {
  const maxX = Math.max(0, window.innerWidth - ICON_SIZE);
  const maxY = Math.max(0, window.innerHeight - ICON_SIZE);
  return { x: Math.min(Math.max(pos.x, 0), maxX), y: Math.min(Math.max(pos.y, 0), maxY) };
}

/**
 * A single icon that can be freely dragged anywhere on screen (not just reordered within
 * a row — see DraggableIcon for that). Position is pixel-based, clamped to the viewport,
 * and persisted per-id in localStorage so it survives reloads. Dragging is disabled while
 * the layout is locked (layoutLockStore), same lock used by the row-reorder groups.
 */
export default function FloatingIcon({ id, getDefaultPosition, children }: Props) {
  const locked = useLayoutLockStore((s) => s.locked);
  // `pos` is where the icon WANTS to be (saved or dragged-to), deliberately never clamped:
  // the viewport can shrink temporarily (a stream going fullscreen, a smaller window, DevTools)
  // and the icon is only *displayed* clamped. When the viewport grows back it returns to its
  // real spot instead of staying at the shoved-aside one.
  const [pos, setPos] = useState(() => loadPosition(id, getDefaultPosition()));
  const [, forceRender] = useState(0);
  const shown = clampToViewport(pos);
  const dragRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    origin: Position;
    current: Position;
    dragging: boolean;
  } | null>(null);

  // Never-dragged icons keep tracking the viewport-relative default position on resize —
  // explicitly dragged ones stay exactly where the user put them regardless of resize.
  useEffect(() => {
    function handleResize() {
      if (!hasSavedPosition(id)) setPos(getDefaultPosition());
      forceRender((n) => n + 1); // re-clamp the displayed position against the new viewport
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (locked) return;
    // Record the press but don't capture the pointer yet — see DRAG_THRESHOLD above.
    dragRef.current = {
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      origin: shown,
      current: shown,
      dragging: false,
    };
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) return;

    const dx = e.clientX - drag.startClientX;
    const dy = e.clientY - drag.startClientY;

    if (!drag.dragging) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      drag.dragging = true;
      e.currentTarget.setPointerCapture(drag.pointerId);
    }

    const next = clampToViewport({ x: drag.origin.x + dx, y: drag.origin.y + dy });
    drag.current = next;
    setPos(next);
  }

  function handlePointerUp() {
    const drag = dragRef.current;
    if (!drag) return;
    if (drag.dragging) savePosition(id, drag.current);
    dragRef.current = null;
  }

  return (
    <div
      className={`floating-icon ${locked ? "locked" : ""}`}
      style={{ left: shown.x, top: shown.y }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      title={locked ? undefined : "Drag to move anywhere"}
    >
      {children}
    </div>
  );
}
