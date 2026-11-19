import axios from "axios";
import { getAuthToken, renewAuthToken, useAuthStore } from "../store/authStore";
import { getSocket } from "../socket/socket";

export const http = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
});

http.interceptors.request.use((config) => {
  const token = getAuthToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

http.interceptors.response.use(
  (res) => {
    // Sliding session: the server hands out a fresh token while the app is being used.
    const fresh = res.headers["x-refreshed-token"];
    if (typeof fresh === "string" && fresh) {
      renewAuthToken(fresh);
      const socket = getSocket();
      if (socket) socket.auth = { token: fresh }; // used on its next reconnect
    }
    return res;
  },
  (err) => {
    // The login expired (or the account is gone): every request fails from now on, so go to the
    // login page instead of a "logged in" app where nothing works. Wrong password on the login
    // form itself has no token yet and isn't affected.
    // Only the session check's own answers count — a wrong *current password* is a 401 too.
    const status = err?.response?.status;
    const reason = err?.response?.data?.error;
    const sessionDead = reason === "Invalid or expired token" || reason === "Missing token";
    const sentToken = typeof err?.config?.headers?.Authorization === "string";
    if (status === 401 && sessionDead && sentToken && useAuthStore.getState().token) {
      useAuthStore.getState().logout();
    }
    return Promise.reject(err);
  },
);
