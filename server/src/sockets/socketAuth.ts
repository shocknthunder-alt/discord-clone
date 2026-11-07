import type { Socket } from "socket.io";
import { verifyToken } from "../utils/jwt.js";

export function socketAuthMiddleware(socket: Socket, next: (err?: Error) => void) {
  const token = socket.handshake.auth?.token as string | undefined;
  if (!token) {
    return next(new Error("Missing auth token"));
  }

  try {
    const payload = verifyToken(token);
    socket.data.userId = payload.userId;
    next();
  } catch {
    next(new Error("Invalid or expired token"));
  }
}
