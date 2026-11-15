import type { UserDTO } from "@discord-clone/shared";
import { http } from "./http";

export type OAuthProvider = "google" | "microsoft";

export interface OAuthConfig {
  google: string | null;
  microsoft: string | null;
}

let configPromise: Promise<OAuthConfig> | null = null;
/** Which sign-in buttons exist (their public client IDs). */
export function fetchOAuthConfig(): Promise<OAuthConfig> {
  configPromise ??= http
    .get<OAuthConfig>("/api/auth/oauth/config")
    .then((r) => r.data)
    .catch(() => {
      configPromise = null;
      return { google: null, microsoft: null };
    });
  return configPromise;
}

export type OAuthResult =
  | { kind: "ok"; user: UserDTO; token: string; created?: boolean }
  | { kind: "needsPassword"; linkToken: string; username: string; email: string };

export async function oauthSignIn(provider: OAuthProvider, idToken: string): Promise<OAuthResult> {
  try {
    const r = await http.post<{ user: UserDTO; token: string; created?: boolean }>("/api/auth/oauth", { provider, idToken });
    return { kind: "ok", ...r.data };
  } catch (err) {
    const data = (err as { response?: { status?: number; data?: { needsPassword?: boolean; linkToken?: string; username?: string; email?: string } } })
      .response;
    if (data?.status === 409 && data.data?.needsPassword && data.data.linkToken) {
      return { kind: "needsPassword", linkToken: data.data.linkToken, username: data.data.username ?? "", email: data.data.email ?? "" };
    }
    throw err;
  }
}

export function oauthLinkWithPassword(linkToken: string, password: string) {
  return http.post<{ user: UserDTO; token: string }>("/api/auth/oauth/link", { linkToken, password }).then((r) => r.data);
}

/** Browser side of the desktop sign-in: give this session to the app waiting with `code`. */
export function handOffToDesktop(code: string) {
  return http.post("/api/auth/handoff", { code });
}

/** Desktop side: the session, once the browser handed it over (null while still waiting). */
export async function takeDesktopHandoff(code: string): Promise<{ user: UserDTO; token: string } | null> {
  try {
    const r = await http.get<{ user: UserDTO; token: string }>(`/api/auth/handoff/${encodeURIComponent(code)}`);
    return r.data;
  } catch {
    return null;
  }
}
