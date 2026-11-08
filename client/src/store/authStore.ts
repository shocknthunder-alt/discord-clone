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
    set({ user: null, token: null });
  },
}));
