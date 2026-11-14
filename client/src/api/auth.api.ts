import type { UserDTO } from "@discord-clone/shared";
import { http } from "./http";

interface AuthResponse {
  user: UserDTO;
  token: string;
}

export function registerUser(username: string, email: string, password: string) {
  return http.post<AuthResponse>("/api/auth/register", { username, email, password }).then((r) => r.data);
}

export function loginUser(email: string, password: string) {
  return http.post<AuthResponse>("/api/auth/login", { email, password }).then((r) => r.data);
}

export function fetchMe() {
  return http.get<{ user: UserDTO }>("/api/auth/me").then((r) => r.data);
}

export function updateProfile(data: { username?: string; avatarUrl?: string | null }) {
  return http.patch<{ user: UserDTO }>("/api/auth/me", data).then((r) => r.data.user);
}

/** Logged in: new password (current one required). */
export function changeMyPassword(currentPassword: string, newPassword: string) {
  return http.post<{ ok: true }>("/api/auth/me/password", { currentPassword, newPassword }).then((r) => r.data);
}

/** Logged in: new e-mail (password required). */
export function changeMyEmail(newEmail: string, password: string) {
  return http.post<{ user: UserDTO }>("/api/auth/me/email", { newEmail, password }).then((r) => r.data.user);
}

/** mail=false: e-mail isn't set up on the server — ask the server owner for a reset link. */
export function forgotPassword(login: string) {
  return http.post<{ ok: true; mail: boolean }>("/api/auth/forgot-password", { login }).then((r) => r.data);
}

export function forgotEmail(username: string) {
  return http.post<{ maskedEmail: string }>("/api/auth/forgot-email", { username }).then((r) => r.data);
}

export function resetPassword(token: string, newPassword: string) {
  return http.post<AuthResponse>("/api/auth/reset-password", { token, newPassword }).then((r) => r.data);
}

/** Server owner: a one-time "set a new password" link for a member (24 h). */
export function memberResetLink(serverId: string, userId: string) {
  return http
    .post<{ link: string; username: string }>(`/api/servers/${serverId}/members/${userId}/reset-link`)
    .then((r) => r.data);
}

export function changePassword(email: string, currentPassword: string, newPassword: string) {
  return http
    .post<{ ok: true }>("/api/auth/change-password", { email, currentPassword, newPassword })
    .then((r) => r.data);
}
