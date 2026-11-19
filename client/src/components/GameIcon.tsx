import { useState } from "react";
import { useMembersStore } from "../store/membersStore";
import { tr } from "../i18n";

/**
 * The icon of the game someone is playing right now (from its .exe, desktop 1.11.0+), or 🎮 when
 * there's no icon (older desktop app). Nothing when they aren't playing.
 */
export default function GameIcon({ userId, className = "" }: { userId: string | null | undefined; className?: string }) {
  const activity = useMembersStore((s) => (userId ? s.members.find((m) => m.userId === userId)?.activity : undefined));
  const [broken, setBroken] = useState<string | null>(null);
  if (!activity) return null;
  const title = `${tr("Играе", "Playing")} ${activity.name}`;
  const icon = activity.icon && activity.icon !== broken ? activity.icon : null;
  return (
    <span className={`game-icon ${className}`} title={title}>
      {icon ? <img src={icon} alt={activity.name} draggable={false} onError={() => setBroken(icon)} /> : "🎮"}
    </span>
  );
}
