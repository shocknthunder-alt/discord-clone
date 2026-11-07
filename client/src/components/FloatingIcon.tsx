import { useRef, useState } from "react";
import { useLayoutLockStore } from "../store/layoutLockStore";
import { loadPosition, savePosition, type Position } from "../utils/floatingPositions";

interface Props {
  id: string;
  defaultPosition: Position;
  children: React.ReactNode;
}

const ICON_SIZE = 32;

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
export default function FloatingIcon({ id, defaultPosition, children }: Props) {
  const locked = useLayoutLockStore((s) => s.locked);
  const [pos, setPos] = useState(() => clampToViewport(loadPosition(id, defaultPosition)));
  const dragRef = useRef<{ startClientX: number; startClientY: number; origin: Position; current: Position } | null>(
    null,
  );

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (locked) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startClientX: e.clientX, startClientY: e.clientY, origin: pos, current: pos };
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const next = clampToViewport({
      x: drag.origin.x + (e.clientX - drag.startClientX),
      y: drag.origin.y + (e.clientY - drag.startClientY),
    });
    drag.current = next;
    setPos(next);
  }

  function handlePointerUp() {
    const drag = dragRef.current;
    if (!drag) return;
    savePosition(id, drag.current);
    dragRef.current = null;
  }

  return (
    <div
      className={`floating-icon ${locked ? "locked" : ""}`}
      style={{ left: pos.x, top: pos.y }}
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
