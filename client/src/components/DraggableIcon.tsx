import { useState } from "react";

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
 */
export default function DraggableIcon({ id, onDropItem, className, children }: Props) {
  const [isDragOver, setIsDragOver] = useState(false);

  return (
    <div
      className={`draggable-icon ${isDragOver ? "drag-over" : ""} ${className ?? ""}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragOver(false);
        const dragId = e.dataTransfer.getData("text/plain");
        if (dragId) onDropItem(dragId, id);
      }}
      title="Drag to reorder"
    >
      {children}
    </div>
  );
}
