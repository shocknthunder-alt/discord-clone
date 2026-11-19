import type { UserDTO } from "@discord-clone/shared";
import { create } from "zustand";

interface AuthState {
  user: UserDTO | null;
  token: string | null;
  setAuth: (user: UserDTO, token: string, remember?: boolean) => void;
  setUser: (user: UserDTO) => void;
  logout: () => void;
}

// "Remember me" unchecked keeps the session in sessionStorage (cleared when the tab/browser
// closes) instead of localStorage (persists indefinitely) — check both on load since either
// could hold the active session depending on what the user chose at login.
const storedToken = localStorage.getItem("token") ?? sessionStorage.getItem("token");
const storedUser = localStorage.getItem("user") ?? sessionStorage.getItem("user");

// The token requests actually send. The server renews it while the app is used (X-Refreshed-Token);
// that renewal is kept OUT of the store's `token` on purpose — that one is the session identity,
// and changing it would reconnect the socket (and drop a call) twice a day.
let currentToken: string | null = storedToken;

/** The freshest token (use this for requests and socket connections). */
export function getAuthToken(): string | null {
  return currentToken;
}

/** A renewed token from the server: saved for the next start, used from now on, no re-render. */
export function renewAuthToken(token: string) {
  if (!currentToken || token === currentToken) return;
  currentToken = token;
  const store = localStorage.getItem("token") ? localStorage : sessionStorage;
  try {
    store.setItem("token", token);
  } catch {
    // storage full / blocked — still used for this session
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  user: storedUser ? JSON.parse(storedUser) : null,
  token: storedToken,
  setAuth: (user, token, remember = true) => {
    const store = remember ? localStorage : sessionStorage;
    const other = remember ? sessionStorage : localStorage;
    store.setItem("token", token);
    store.setItem("user", JSON.stringify(user));
    other.removeItem("token");
    other.removeItem("user");
    currentToken = token;
    set({ user, token });
  },
  setUser: (user) => {
    (localStorage.getItem("token") ? localStorage : sessionStorage).setItem("user", JSON.stringify(user));
    set({ user });
  },
  logout: () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    sessionStorage.removeItem("token");
    sessionStorage.removeItem("user");
    currentToken = null;
    set({ user: null, token: null });
  },
}));
