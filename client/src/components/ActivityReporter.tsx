import { SocketEvents } from "@discord-clone/shared";
import { useEffect, useRef } from "react";
import { getSocket } from "../socket/socket";
import { useAppPrefs } from "../utils/appPrefs";

type Game = { name: string; icon?: string | null };

/**
 * 🎮 "Какво играе": the desktop app (1.9.0+) tells us which game is running (1.11.0+ also its
 * icon); we pass it to the server (unless Settings → "Показвай какво играя" is off). Renders nothing.
 */
export default function ActivityReporter() {
  const share = useAppPrefs((s) => s.shareActivity);
  const current = useRef<Game | null>(null);

  useEffect(() => {
    const desktop = window.shmirkaDesktop;
    if (!desktop?.onActivity) return;
    let sent: string | null | undefined; // name + icon that went out last
    let retry: ReturnType<typeof setTimeout> | null = null;
    const send = () => {
      const game = share ? current.current : null;
      const key = game ? `${game.name}\n${game.icon ?? ""}` : null;
      if (key === sent) return;
      const socket = getSocket();
      if (!socket?.connected) {
        // Not connected yet — try again shortly.
        if (!retry) retry = setTimeout(() => ((retry = null), send()), 3000);
        return;
      }
      sent = key;
      socket.emit(SocketEvents.PresenceActivity, { activity: game ? { name: game.name, icon: game.icon ?? null } : null });
    };
    const off = desktop.onActivity((a) => {
      current.current = a?.name ? { name: a.name, icon: a.icon ?? null } : null;
      send();
    });
    // After a reconnect the server forgot it (it only keeps it in memory).
    const socket = getSocket();
    const onConnect = () => {
      sent = undefined;
      send();
    };
    socket?.on("connect", onConnect);
    send();
    return () => {
      off?.();
      socket?.off("connect", onConnect);
      if (retry) clearTimeout(retry);
      if (sent) getSocket()?.emit(SocketEvents.PresenceActivity, { activity: null });
    };
  }, [share]);

  return null;
}
