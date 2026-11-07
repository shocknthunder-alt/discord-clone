import { SocketEvents } from "@discord-clone/shared";
import type { Server as IOServer, Socket } from "socket.io";
import { prisma } from "../db.js";

async function requireParticipant(conversationId: string, userId: string) {
  const conversation = await prisma.dmConversation.findUnique({ where: { id: conversationId } });
  if (!conversation) return null;
  if (conversation.userAId !== userId && conversation.userBId !== userId) return null;
  return conversation;
}

export function registerDmGateway(io: IOServer, socket: Socket) {
  const userId: string = socket.data.userId;

  socket.on(SocketEvents.DmJoin, async ({ conversationId }: { conversationId: string }) => {
    const conversation = await requireParticipant(conversationId, userId);
    if (!conversation) return;
    await socket.join(`dm:${conversationId}`);
  });

  socket.on(
    SocketEvents.DmSend,
    async ({
      conversationId,
      content,
      imageUrl,
    }: {
      conversationId: string;
      content: string;
      imageUrl?: string;
    }) => {
      const trimmedContent = content?.trim() ?? "";
      const safeImageUrl = typeof imageUrl === "string" && imageUrl.length <= 2000 ? imageUrl : undefined;
      if (!trimmedContent && !safeImageUrl) return;

      const conversation = await requireParticipant(conversationId, userId);
      if (!conversation) return;

      const message = await prisma.directMessage.create({
        data: { content: trimmedContent, imageUrl: safeImageUrl, conversationId, authorId: userId },
        include: { author: { select: { username: true } } },
      });

      io.to(`dm:${conversationId}`).emit(SocketEvents.DmNew, {
        id: message.id,
        conversationId: message.conversationId,
        content: message.content,
        imageUrl: message.imageUrl,
        authorId: message.authorId,
        authorUsername: message.author.username,
        createdAt: message.createdAt.toISOString(),
        editedAt: message.editedAt?.toISOString() ?? null,
      });
    },
  );

  socket.on(SocketEvents.DmEdit, async ({ messageId, content }: { messageId: string; content: string }) => {
    const trimmedContent = content?.trim() ?? "";
    if (!trimmedContent) return;

    const existing = await prisma.directMessage.findUnique({ where: { id: messageId } });
    if (!existing || existing.authorId !== userId) return;

    const message = await prisma.directMessage.update({
      where: { id: messageId },
      data: { content: trimmedContent, editedAt: new Date() },
    });

    io.to(`dm:${message.conversationId}`).emit(SocketEvents.DmUpdated, {
      id: message.id,
      conversationId: message.conversationId,
      content: message.content,
      editedAt: message.editedAt?.toISOString() ?? null,
    });
  });

  socket.on(SocketEvents.DmDelete, async ({ messageId }: { messageId: string }) => {
    const existing = await prisma.directMessage.findUnique({ where: { id: messageId } });
    if (!existing || existing.authorId !== userId) return;

    await prisma.directMessage.delete({ where: { id: messageId } });

    io.to(`dm:${existing.conversationId}`).emit(SocketEvents.DmDeleted, {
      id: existing.id,
      conversationId: existing.conversationId,
    });
  });

  socket.on(SocketEvents.DmTypingStart, ({ conversationId }: { conversationId: string }) => {
    socket.to(`dm:${conversationId}`).emit(SocketEvents.DmTypingUpdate, { conversationId, userId, isTyping: true });
  });

  socket.on(SocketEvents.DmTypingStop, ({ conversationId }: { conversationId: string }) => {
    socket.to(`dm:${conversationId}`).emit(SocketEvents.DmTypingUpdate, { conversationId, userId, isTyping: false });
  });

  socket.on(SocketEvents.DmRing, async ({ conversationId }: { conversationId: string }) => {
    const conversation = await requireParticipant(conversationId, userId);
    if (!conversation) return;

    const calleeId = conversation.userAId === userId ? conversation.userBId : conversation.userAId;
    const caller = await prisma.user.findUnique({ where: { id: userId }, select: { username: true } });
    if (!caller) return;

    io.to(`user:${calleeId}`).emit(SocketEvents.DmRing, {
      conversationId,
      callerUserId: userId,
      callerUsername: caller.username,
      voiceRoomId: `dm:${conversationId}`,
    });
  });
}
