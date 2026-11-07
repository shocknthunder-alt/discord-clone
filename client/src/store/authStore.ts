import type { UserDTO } from "@discord-clone/shared";
import { create } from "zustand";

interface AuthState {
  user: UserDTO | null;
  token: string | null;
  setAuth: (user: UserDTO, token: string) => void;
  setUser: (user: UserDTO) => void;
  logout: () => void;
}

const storedToken = localStorage.getItem("token");
const storedUser = localStorage.getItem("user");

export const useAuthStore = create<AuthState>((set) => ({
  user: storedUser ? JSON.parse(storedUser) : null,
  token: storedToken,
  setAuth: (user, token) => {
    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(user));
    set({ user, token });
  },
  setUser: (user) => {
    localStorage.setItem("user", JSON.stringify(user));
    set({ user });
  },
  logout: () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    set({ user: null, token: null });
  },
}));
