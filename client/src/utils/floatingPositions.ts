export interface Position {
  x: number;
  y: number;
}

const PREFIX = "floatingPos:";

export function loadPosition(id: string, fallback: Position): Position {
  try {
    const raw = localStorage.getItem(PREFIX + id);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Position;
    if (typeof parsed.x !== "number" || typeof parsed.y !== "number") return fallback;
    return parsed;
  } catch {
    return fallback;
  }
}

export function savePosition(id: string, position: Position) {
  localStorage.setItem(PREFIX + id, JSON.stringify(position));
}

/** Whether this icon has ever actually been dragged — distinct from "has a position", since
 * every icon always has SOME position (falling back to its computed default). Used to decide
 * whether an icon should keep tracking the viewport-relative default on resize, or stay put
 * at the spot the user explicitly dropped it. */
export function hasSavedPosition(id: string): boolean {
  return localStorage.getItem(PREFIX + id) !== null;
}

/** Clears every saved floating icon position, snapping the whole HUD back to its default layout. */
export function resetAllPositions() {
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith(PREFIX)) localStorage.removeItem(key);
  }
}
