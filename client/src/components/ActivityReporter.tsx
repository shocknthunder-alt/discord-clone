import { SocketEvents } from "@discord-clone/shared";
import { useEffect, useRef } from "react";
import { getSocket } from "../socket/socket";
import { useAppPrefs } from "../utils/appPrefs";

/**
 * 🎮 "Какво играе": the desktop app (1.9.0+) tells us which game is running; we pass it to the
 * server (unless Settings → "Показвай какво играя" is off). Renders nothing.
 */
export default function ActivityReporter() {
  const share = useAppPrefs((s) => s.shareActivity);
  const current = useRef<string | null>(null);

  useEffect(() => {
    const desktop = window.shmirkaDesktop;
    if (!desktop?.onActivity) return;
    let sent: string | null | undefined;
    let retry: ReturnType<typeof setTimeout> | null = null;
    const send = () => {
      const name = share ? current.current : null;
      if (name === sent) return;
      const socket = getSocket();
      if (!socket?.connected) {
        // Not connected yet — try again shortly.
        if (!retry) retry = setTimeout(() => ((retry = null), send()), 3000);
        return;
      }
      sent = name;
      socket.emit(SocketEvents.PresenceActivity, { activity: name ? { name } : null });
    };
    const off = desktop.onActivity((a) => {
      current.current = a?.name ?? null;
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
