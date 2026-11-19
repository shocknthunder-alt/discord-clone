import { joinServer } from "../api/servers.api";
import { useServerStore } from "../store/serverStore";
import { useDmStore } from "../store/dmStore";
import { tr } from "../i18n";

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

function statusOf(err: unknown): number | undefined {
  return (err as { response?: { status?: number } }).response?.status;
}

/** No answer / 5xx: the server is asleep or restarting — worth another try. */
export function isTemporaryError(err: unknown): boolean {
  const status = statusOf(err);
  return status === undefined || status >= 500;
}

/** What went wrong with a join, in words (it used to say "invalid invite" for everything). */
export function joinErrorText(err: unknown): string {
  const status = statusOf(err);
  if (status === 404 || status === 400) return tr("Невалидна покана — провери кода и опитай пак.", "Invalid invite — check the code and try again.");
  if (status === 401 || status === 403) return tr("Сесията ти е изтекла — излез от профила и влез пак, после опитай.", "Your session expired — log out and back in, then try again.");
  if (status === undefined) return tr("Няма връзка със сървъра — провери интернета или опитай след минута.", "Can't reach the server — check the internet or try again in a minute.");
  return tr("Сървърът има проблем в момента — опитай след минута.", "The server has a problem right now — try again in a minute.");
}

/** joinServer, retried while the server is waking up / restarting (about 20 s at most). */
export async function joinWithRetry(code: string, onRetry?: () => void) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await joinServer(code);
    } catch (err) {
      if (!isTemporaryError(err) || attempt >= 5) throw err;
      onRetry?.();
      await new Promise((r) => setTimeout(r, 4000));
    }
  }
}

/** Joins the remembered invite (if any). Returns the server name, or throws on a bad code. */
export async function joinPendingInvite(): Promise<string | null> {
  let code: string | null = null;
  try {
    code = localStorage.getItem(KEY);
  } catch {
    return null;
  }
  if (!code) return null;
  let server;
  try {
    server = await joinWithRetry(code);
  } catch (err) {
    // Keep the code when the server was just unreachable — the next load tries again.
    if (!isTemporaryError(err)) localStorage.removeItem(KEY);
    throw err;
  }
  localStorage.removeItem(KEY);
  const store = useServerStore.getState();
  if (!store.servers.some((s) => s.id === server.id)) store.addServer(server);
  useDmStore.getState().setView("servers");
  store.setActiveServer(server.id);
  return server.name;
}
