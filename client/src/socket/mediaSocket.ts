import { io, type Socket } from "socket.io-client";

// Separate connection from the main app socket (socket.ts) — this one talks only to the
// mediasoup SFU server (a different host entirely), carrying nothing but WebRTC signaling
// for voice/video. Authenticated with the same JWT the main server issues.
let mediaSocket: Socket | null = null;

export function connectMediaSocket(token: string): Socket {
  if (mediaSocket) {
    mediaSocket.disconnect();
  }
  mediaSocket = io(import.meta.env.VITE_MEDIA_SERVER_URL, {
    auth: { token },
    autoConnect: true,
  });
  return mediaSocket;
}

export function getMediaSocket(): Socket | null {
  return mediaSocket;
}

export function disconnectMediaSocket() {
  mediaSocket?.disconnect();
  mediaSocket = null;
}
