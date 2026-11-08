import jwt from "jsonwebtoken";
import type { Socket } from "socket.io";
import { env } from "./env.js";

// This server has no database of its own — it trusts the JWT signed by the main API server
// (same JWT_SECRET value configured on both), and only needs the userId out of it.
export function socketAuthMiddleware(socket: Socket, next: (err?: Error) => void) {
  const token = socket.handshake.auth?.token as string | undefined;
  if (!token) return next(new Error("Missing auth token"));

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as { userId: string };
    socket.data.userId = payload.userId;
    next();
  } catch {
    next(new Error("Invalid or expired token"));
  }
}
