import { useState } from "react";
import { loadOrder, saveOrder } from "../utils/reorderable";

export function useReorderable(groupKey: string, defaultOrder: string[]) {
  const [order, setOrder] = useState(() => loadOrder(groupKey, defaultOrder));

  function moveItem(dragId: string, dropId: string) {
    if (dragId === dropId) return;
    setOrder((prev) => {
      const fromIndex = prev.indexOf(dragId);
      const toIndex = prev.indexOf(dropId);
      if (fromIndex === -1 || toIndex === -1) return prev;

      const next = [...prev];
      next.splice(fromIndex, 1);
      next.splice(toIndex, 0, dragId);
      saveOrder(groupKey, next);
      return next;
    });
  }

  return { order, moveItem };
}
