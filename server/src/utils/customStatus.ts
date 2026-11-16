/** The custom status if it's set and hasn't expired yet. */
export function activeStatus(u: { customStatus?: string | null; customStatusUntil?: Date | null }): string | null {
  if (!u.customStatus) return null;
  if (u.customStatusUntil && u.customStatusUntil.getTime() <= Date.now()) return null;
  return u.customStatus;
}
