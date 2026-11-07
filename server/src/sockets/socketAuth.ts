import type { Socket } from "socket.io";
import { prisma } from "../db.js";
import { verifyToken } from "../utils/jwt.js";

export async function socketAuthMiddleware(socket: Socket, next: (err?: Error) => void) {
  const token = socket.handshake.auth?.token as string | undefined;
  if (!token) {
    return next(new Error("Missing auth token"));
  }

  try {
    const payload = verifyToken(token);
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { username: true, avatarUrl: true },
    });
    if (!user) {
      return next(new Error("User not found"));
    }

    socket.data.userId = payload.userId;
    socket.data.username = user.username;
    socket.data.avatarUrl = user.avatarUrl;
    next();
  } catch {
    next(new Error("Invalid or expired token"));
  }
}
