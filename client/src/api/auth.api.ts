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

export function changePassword(currentPassword: string, newPassword: string) {
  return http.post<{ ok: true }>("/api/auth/change-password", { currentPassword, newPassword }).then((r) => r.data);
}
