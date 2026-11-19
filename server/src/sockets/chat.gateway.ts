import { Perm, SocketEvents, hasMention, mentionsEveryone, type ChannelActivityPayload, type MentionPayload, type MessagePinnedPayload } from "@discord-clone/shared";
import type { Server as IOServer, Socket } from "socket.io";
import { prisma } from "../db.js";
import { can } from "../permissions.js";
import { handleTriviaMessage } from "../trivia/bot.js";
import { setActivity } from "../presence/activity.js";
import { pushText, pushToUsers } from "../push/push.js";

const MAX_PINS = 50;

/** Tell everyone @mentioned in a new message (or everybody for @everyone/@here). */
async function notifyMentions(
  io: IOServer,
  channel: { id: string; name: string; serverId: string },
  message: { id: string; content: string; authorId: string; replyToId: string | null },
  author: { username: string; avatarUrl: string | null },
) {
  if (!message.content.includes("@")) return;
  const everyone = mentionsEveryone(message.content);
  const members = await prisma.membership.findMany({
    where: { serverId: channel.serverId },
    select: { userId: true, user: { select: { username: true, email: true } } },
  });
  const targets = members.filter(
    (m) => m.userId !== message.authorId && !m.user.email.endsWith("@shmirka.local") && (everyone || hasMention(message.content, m.user.username)),
  );
  if (!targets.length) return;
  const payload: MentionPayload = {
    serverId: channel.serverId,
    textChannelId: channel.id,
    channelName: channel.name,
    messageId: message.id,
    rootId: message.replyToId,
    authorId: message.authorId,
    authorUsername: author.username,
    authorAvatarUrl: author.avatarUrl,
    content: message.content.slice(0, 300),
    everyone,
  };
  io.to(targets.map((t) => `user:${t.userId}`)).emit(SocketEvents.MentionNew, payload);

  // Phones / closed apps: a push (direct @name and @everyone — not @here, that one means "who's on").
  const pushTargets = targets.filter((t) => hasMention(message.content, t.user.username) || /(^|\s)@everyone\b/i.test(message.content));
  if (pushTargets.length) {
    void pushToUsers(
      io,
      pushTargets.map((t) => t.userId),
      {
        title: `@ ${author.username} в #${channel.name}`,
        body: pushText(message.content),
        url: `/?go=${encodeURIComponent(["ch", channel.serverId, channel.id, message.id, message.replyToId ?? ""].join(":"))}`,
        tag: `ch-${channel.id}`,
      },
    );
  }
}

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
        pinnedAt: null,
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

      void notifyMentions(io, textChannel, message, message.author).catch((err) => console.error("mentions", err));

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
          pinnedAt: null,
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

      if (existing.content === trimmedContent) return;
      // Keep the version being replaced (edit history).
      const [, message] = await prisma.$transaction([
        prisma.messageEdit.create({ data: { messageId, content: existing.content } }),
        prisma.message.update({
          where: { id: messageId },
          data: { content: trimmedContent, editedAt: new Date() },
        }),
      ]);

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

  // 📌 Pin / unpin — any member of the server (it's a friends' app; everybody sees who did it).
  socket.on(SocketEvents.MessagePin, async ({ messageId, pinned }: { messageId: string; pinned: boolean }) => {
    if (typeof messageId !== "string") return;
    const message = await prisma.message.findUnique({ where: { id: messageId }, include: { textChannel: true } });
    if (!message) return;
    const membership = await prisma.membership.findUnique({
      where: { userId_serverId: { userId, serverId: message.textChannel.serverId } },
      include: { user: { select: { username: true } } },
    });
    if (!membership) return;
    if (!!pinned === !!message.pinnedAt) return;
    if (pinned) {
      const count = await prisma.message.count({ where: { textChannelId: message.textChannelId, pinnedAt: { not: null } } });
      if (count >= MAX_PINS) {
        socket.emit(SocketEvents.MessagePinned, {
          id: message.id,
          textChannelId: message.textChannelId,
          pinnedAt: null,
          byUsername: "",
          error: `Максимум ${MAX_PINS} закачени съобщения в канал.`,
        });
        return;
      }
    }
    const updated = await prisma.message.update({
      where: { id: messageId },
      data: pinned ? { pinnedAt: new Date(), pinnedById: userId } : { pinnedAt: null, pinnedById: null },
    });
    io.to(`channel:${message.textChannelId}`).emit(SocketEvents.MessagePinned, {
      id: updated.id,
      textChannelId: updated.textChannelId,
      pinnedAt: updated.pinnedAt?.toISOString() ?? null,
      byUsername: membership.user.username,
    } satisfies MessagePinnedPayload);
  });

  // 🎮 What I'm playing (from the desktop app). At most 10 changes per 10 s per connection.
  let activityWindow = 0;
  let activityCount = 0;
  socket.on(SocketEvents.PresenceActivity, (p: { activity?: { name?: unknown; icon?: unknown } | null }) => {
    const now = Date.now();
    if (now - activityWindow > 10_000) {
      activityWindow = now;
      activityCount = 0;
    }
    if (++activityCount > 10) return;
    const name = p && p.activity && typeof p.activity.name === "string" ? p.activity.name : null;
    void setActivity(io, userId, name, p?.activity?.icon).catch((err) => console.error("activity", err));
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
