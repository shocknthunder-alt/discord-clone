import { SocketEvents } from "@discord-clone/shared";
import type { Server as IOServer, Socket } from "socket.io";
import { prisma } from "../db.js";

export function registerChatGateway(io: IOServer, socket: Socket) {
  const userId: string = socket.data.userId;

  socket.on(SocketEvents.ServerJoin, async ({ serverId }: { serverId: string }) => {
    const membership = await prisma.membership.findUnique({
      where: { userId_serverId: { userId, serverId } },
    });
    if (!membership) return;

    await socket.join(`server:${serverId}`);
    socket.emit(SocketEvents.ServerJoined, { serverId });
  });

  socket.on(SocketEvents.ChannelJoin, async ({ textChannelId }: { textChannelId: string }) => {
    await socket.join(`channel:${textChannelId}`);
  });

  socket.on(
    SocketEvents.MessageSend,
    async ({
      textChannelId,
      content,
      imageUrl,
    }: {
      textChannelId: string;
      content: string;
      imageUrl?: string;
    }) => {
      const trimmedContent = content?.trim() ?? "";
      const safeImageUrl = typeof imageUrl === "string" && imageUrl.length <= 2000 ? imageUrl : undefined;
      if (!trimmedContent && !safeImageUrl) return;

      const textChannel = await prisma.textChannel.findUnique({ where: { id: textChannelId } });
      if (!textChannel) return;

      const membership = await prisma.membership.findUnique({
        where: { userId_serverId: { userId, serverId: textChannel.serverId } },
      });
      if (!membership) return;

      const message = await prisma.message.create({
        data: { content: trimmedContent, imageUrl: safeImageUrl, textChannelId, authorId: userId },
        include: { author: { select: { username: true } } },
      });

      io.to(`channel:${textChannelId}`).emit(SocketEvents.MessageNew, {
        id: message.id,
        textChannelId: message.textChannelId,
        authorId: message.authorId,
        authorUsername: message.author.username,
        content: message.content,
        imageUrl: message.imageUrl,
        createdAt: message.createdAt.toISOString(),
        editedAt: message.editedAt?.toISOString() ?? null,
      });
    },
  );

  socket.on(
    SocketEvents.MessageEdit,
    async ({ messageId, content }: { messageId: string; content: string }) => {
      const trimmedContent = content?.trim() ?? "";
      if (!trimmedContent) return;

      const existing = await prisma.message.findUnique({ where: { id: messageId } });
      if (!existing || existing.authorId !== userId) return;

      const message = await prisma.message.update({
        where: { id: messageId },
        data: { content: trimmedContent, editedAt: new Date() },
      });

      io.to(`channel:${message.textChannelId}`).emit(SocketEvents.MessageUpdated, {
        id: message.id,
        textChannelId: message.textChannelId,
        content: message.content,
        editedAt: message.editedAt?.toISOString() ?? null,
      });
    },
  );

  socket.on(SocketEvents.MessageDelete, async ({ messageId }: { messageId: string }) => {
    const existing = await prisma.message.findUnique({ where: { id: messageId } });
    if (!existing || existing.authorId !== userId) return;

    await prisma.message.delete({ where: { id: messageId } });

    io.to(`channel:${existing.textChannelId}`).emit(SocketEvents.MessageDeleted, {
      id: existing.id,
      textChannelId: existing.textChannelId,
    });
  });

  socket.on(SocketEvents.TypingStart, ({ textChannelId }: { textChannelId: string }) => {
    socket.to(`channel:${textChannelId}`).emit(SocketEvents.TypingUpdate, {
      userId,
      textChannelId,
      isTyping: true,
    });
  });

  socket.on(SocketEvents.TypingStop, ({ textChannelId }: { textChannelId: string }) => {
    socket.to(`channel:${textChannelId}`).emit(SocketEvents.TypingUpdate, {
      userId,
      textChannelId,
      isTyping: false,
    });
  });
}

export async function broadcastPresence(io: IOServer, userId: string, status: "online" | "offline") {
  const memberships = await prisma.membership.findMany({ where: { userId } });
  for (const membership of memberships) {
    io.to(`server:${membership.serverId}`).emit(SocketEvents.PresenceUpdate, { userId, status });
  }
}
