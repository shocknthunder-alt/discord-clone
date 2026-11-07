import { useState } from "react";
import { useLayoutLockStore } from "../store/layoutLockStore";

interface Props {
  id: string;
  onDropItem: (dragId: string, dropId: string) => void;
  className?: string;
  children: React.ReactNode;
}

/**
 * Wraps a single button/icon to make its position within a row drag-reorderable.
 * Order is persisted by the parent via useReorderable (localStorage, per group) — this
 * component only handles the native HTML5 drag events and a visual "drop target" hint.
 * Dragging is disabled globally once the user locks their layout (see layoutLockStore).
 */
export default function DraggableIcon({ id, onDropItem, className, children }: Props) {
  const [isDragOver, setIsDragOver] = useState(false);
  const locked = useLayoutLockStore((s) => s.locked);

  return (
    <div
      className={`draggable-icon ${locked ? "locked" : ""} ${isDragOver ? "drag-over" : ""} ${className ?? ""}`}
      draggable={!locked}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(e) => {
        if (locked) return;
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => {
        if (locked) return;
        e.preventDefault();
        setIsDragOver(false);
        const dragId = e.dataTransfer.getData("text/plain");
        if (dragId) onDropItem(dragId, id);
      }}
      title={locked ? undefined : "Drag to reorder"}
    >
      {children}
    </div>
  );
}
