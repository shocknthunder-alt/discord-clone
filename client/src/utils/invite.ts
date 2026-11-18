import { joinServer } from "../api/servers.api";
import { useServerStore } from "../store/serverStore";
import { useDmStore } from "../store/dmStore";

/*
 * Invite links: https://shmirka.vercel.app/invite/<code>. Opening one before logging in keeps the
 * code until the login/registration is done; then the app joins the server and opens it.
 */
const KEY = "pendingInvite";

export function inviteLink(code: string): string {
  return `${window.location.origin}/invite/${code}`;
}

/** /invite/<code> in the address bar → remembered (survives the login page). */
export function captureInviteFromUrl(pathname: string): boolean {
  const m = /^\/invite\/([A-Za-z0-9_-]{4,64})\/?$/.exec(pathname);
  if (!m) return false;
  try {
    localStorage.setItem(KEY, m[1]);
  } catch {
    // storage blocked — the code is lost after the login page, they can still paste it
  }
  return true;
}

/** Joins the remembered invite (if any). Returns the server name, or throws on a bad code. */
export async function joinPendingInvite(): Promise<string | null> {
  let code: string | null = null;
  try {
    code = localStorage.getItem(KEY);
    localStorage.removeItem(KEY);
  } catch {
    return null;
  }
  if (!code) return null;
  const server = await joinServer(code);
  const store = useServerStore.getState();
  if (!store.servers.some((s) => s.id === server.id)) store.addServer(server);
  useDmStore.getState().setView("servers");
  store.setActiveServer(server.id);
  return server.name;
}
