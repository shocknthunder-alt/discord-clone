import { Perm, SocketEvents, type ChannelActivityPayload } from "@discord-clone/shared";
import type { Server as IOServer, Socket } from "socket.io";
import { prisma } from "../db.js";
import { can } from "../permissions.js";
import { handleTriviaMessage } from "../trivia/bot.js";

export function groupReactions(rows: { emoji: string; userId: string }[]) {
  const map = new Map<string, string[]>();
  for (const r of rows) map.set(r.emoji, [...(map.get(r.emoji) ?? []), r.userId]);
  return Array.from(map, ([emoji, userIds]) => ({ emoji, userIds }));
}

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
      replyToId,
      alsoSendToChannel,
    }: {
      textChannelId: string;
      content: string;
      imageUrl?: string;
      replyToId?: string;
      alsoSendToChannel?: boolean;
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

      // Only honor a reply target if it's a real message in THIS channel — otherwise drop
      // it silently rather than let a stale/forged id attach a reply preview to content
      // from somewhere the sender has no business referencing. Threads are flat (like
      // Slack): replying to a message that is itself a reply attaches to THAT message's
      // root, not to it directly, so a thread never nests more than one level deep no
      // matter which reply in it you clicked.
      const replyTargetRaw =
        typeof replyToId === "string"
          ? await prisma.message.findFirst({ where: { id: replyToId, textChannelId } })
          : null;
      const rootId = replyTargetRaw ? (replyTargetRaw.replyToId ?? replyTargetRaw.id) : null;
      const replyTarget = rootId
        ? await prisma.message.findUnique({
            where: { id: rootId },
            include: { author: { select: { username: true } } },
          })
        : null;

      const message = await prisma.message.create({
        data: {
          content: trimmedContent,
          imageUrl: safeImageUrl,
          textChannelId,
          authorId: userId,
          replyToId: replyTarget?.id,
        },
        include: { author: { select: { username: true, avatarUrl: true } } },
      });

      io.to(`channel:${textChannelId}`).emit(SocketEvents.MessageNew, {
        id: message.id,
        textChannelId: message.textChannelId,
        authorId: message.authorId,
        authorUsername: message.author.username,
        authorAvatarUrl: message.author.avatarUrl,
        content: message.content,
        imageUrl: message.imageUrl,
        createdAt: message.createdAt.toISOString(),
        editedAt: message.editedAt?.toISOString() ?? null,
        reactions: [],
        replyTo: replyTarget
          ? {
              id: replyTarget.id,
              authorUsername: replyTarget.author.username,
              content: replyTarget.content,
              imageUrl: replyTarget.imageUrl,
            }
          : null,
      });

      // Unread markers: everyone in the server learns "channel X got a message" (no content —
      // the message itself only goes to people who have the channel open).
      io.to(`server:${textChannel.serverId}`).emit(SocketEvents.ChannelActivity, {
        serverId: textChannel.serverId,
        textChannelId,
        authorId: userId,
        createdAt: message.createdAt.toISOString(),
      } satisfies ChannelActivityPayload);

      // Trivia channels: the bot reads every user message (commands and answers).
      if (textChannel.type === "trivia" && !replyTarget) {
        void handleTriviaMessage(io, textChannel, userId, message.author.username, trimmedContent).catch((err) =>
          console.error("trivia bot error", err),
        );
      }

      // "Also send to channel": the thread reply above stays in the thread (that's the
      // message the thread panel renders); this is a second, independent top-level
      // message with the same content so it's visible in the normal channel feed too —
      // mirrors the visible outcome of Slack's checkbox without needing one message to
      // simultaneously belong to two different render contexts.
      if (alsoSendToChannel && replyTarget) {
        const echo = await prisma.message.create({
          data: { content: trimmedContent, imageUrl: safeImageUrl, textChannelId, authorId: userId },
          include: { author: { select: { username: true, avatarUrl: true } } },
        });
        io.to(`channel:${textChannelId}`).emit(SocketEvents.MessageNew, {
          id: echo.id,
          textChannelId: echo.textChannelId,
          authorId: echo.authorId,
          authorUsername: echo.author.username,
          authorAvatarUrl: echo.author.avatarUrl,
          content: echo.content,
          imageUrl: echo.imageUrl,
          createdAt: echo.createdAt.toISOString(),
          editedAt: echo.editedAt?.toISOString() ?? null,
          reactions: [],
          replyTo: null,
        });
      }
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
    const existing = await prisma.message.findUnique({ where: { id: messageId }, include: { textChannel: { select: { serverId: true } } } });
    if (!existing) return;
    // Your own message, or anyone's with "manage messages".
    if (existing.authorId !== userId && !(await can(userId, existing.textChannel.serverId, Perm.MANAGE_MESSAGES))) return;

    await prisma.message.delete({ where: { id: messageId } });

    io.to(`channel:${existing.textChannelId}`).emit(SocketEvents.MessageDeleted, {
      id: existing.id,
      textChannelId: existing.textChannelId,
    });
  });

  socket.on(
    SocketEvents.MessageReact,
    async ({ messageId, emoji }: { messageId: string; emoji: string }) => {
      if (typeof emoji !== "string" || !emoji || emoji.length > 32) return;

      const message = await prisma.message.findUnique({
        where: { id: messageId },
        include: { textChannel: true },
      });
      if (!message) return;

      const membership = await prisma.membership.findUnique({
        where: { userId_serverId: { userId, serverId: message.textChannel.serverId } },
      });
      if (!membership) return;

      // Toggle: reacting with an emoji you already used removes it.
      const existing = await prisma.messageReaction.findUnique({
        where: { messageId_userId_emoji: { messageId, userId, emoji } },
      });
      if (existing) await prisma.messageReaction.delete({ where: { id: existing.id } });
      else await prisma.messageReaction.create({ data: { messageId, userId, emoji } });

      const rows = await prisma.messageReaction.findMany({
        where: { messageId },
        orderBy: { createdAt: "asc" },
      });
      io.to(`channel:${message.textChannelId}`).emit(SocketEvents.MessageReactionsUpdated, {
        id: messageId,
        textChannelId: message.textChannelId,
        reactions: groupReactions(rows),
      });
    },
  );

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
