import { io, type Socket } from "socket.io-client";

let socket: Socket | null = null;

export function connectSocket(token: string): Socket {
  if (socket) {
    socket.disconnect();
  }
  socket = io(import.meta.env.VITE_SOCKET_URL, {
    auth: { token },
    autoConnect: true,
  });
  return socket;
}

export function getSocket(): Socket | null {
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
