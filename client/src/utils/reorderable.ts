function storageKey(groupKey: string) {
  return `iconOrder:${groupKey}`;
}

export function loadOrder(groupKey: string, defaultOrder: string[]): string[] {
  try {
    const raw = localStorage.getItem(storageKey(groupKey));
    if (!raw) return defaultOrder;
    const saved = JSON.parse(raw) as string[];
    // Keep only ids that still exist in this build, then append any new ids (e.g. a
    // feature added after the user last customized their order) at the end.
    const valid = saved.filter((id) => defaultOrder.includes(id));
    const missing = defaultOrder.filter((id) => !valid.includes(id));
    return [...valid, ...missing];
  } catch {
    return defaultOrder;
  }
}

export function saveOrder(groupKey: string, order: string[]) {
  localStorage.setItem(storageKey(groupKey), JSON.stringify(order));
}
