export function voiceStatusIcons(isMuted: boolean, isDeafened: boolean): string {
  if (isDeafened && isMuted) return "🔇🎧";
  if (isDeafened) return "🎧";
  if (isMuted) return "🔇";
  return "";
}
