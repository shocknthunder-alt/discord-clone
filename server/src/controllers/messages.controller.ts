import type { Request, Response } from "express";
import { prisma } from "../db.js";
import { groupReactions } from "../sockets/chat.gateway.js";
import { pollDto } from "../polls.js";

type MessageRow = Awaited<ReturnType<typeof findRows>>[number];
// Only used to derive MessageRow's shape.
function findRows() {
  return prisma.message.findMany({
    include: {
      author: { select: { username: true, avatarUrl: true } },
      replyTo: { include: { author: { select: { username: true } } } },
      reactions: true,
      poll: { include: { votes: true } },
    },
  });
}

export function messageDto(m: MessageRow) {
  return {
    id: m.id,
    content: m.content,
    imageUrl: m.imageUrl,
    textChannelId: m.textChannelId,
    authorId: m.authorId,
    authorUsername: m.author.username,
    authorAvatarUrl: m.author.avatarUrl,
    createdAt: m.createdAt,
    editedAt: m.editedAt,
    pinnedAt: m.pinnedAt,
    poll: m.poll ? pollDto(m.poll) : null,
    reactions: groupReactions(m.reactions),
    replyTo: m.replyTo
      ? {
          id: m.replyTo.id,
          authorUsername: m.replyTo.author.username,
          content: m.replyTo.content,
          imageUrl: m.replyTo.imageUrl,
        }
      : null,
  };
}

/** 📌 The pinned messages of a channel, newest pin first. */
export async function listPins(req: Request, res: Response) {
  const { channelId } = req.params;
  const textChannel = await prisma.textChannel.findUnique({ where: { id: channelId } });
  if (!textChannel) return res.status(404).json({ error: "Channel not found" });
  const membership = await prisma.membership.findUnique({
    where: { userId_serverId: { userId: req.userId!, serverId: textChannel.serverId } },
  });
  if (!membership) return res.status(403).json({ error: "Not a member of this server" });
  const rows = await prisma.message.findMany({
    where: { textChannelId: channelId, pinnedAt: { not: null } },
    orderBy: { pinnedAt: "desc" },
    take: 100,
    include: {
      author: { select: { username: true, avatarUrl: true } },
      replyTo: { include: { author: { select: { username: true } } } },
      reactions: { orderBy: { createdAt: "asc" } },
      poll: { include: { votes: true } },
    },
  });
  const pinnerIds = [...new Set(rows.map((r) => r.pinnedById).filter((x): x is string => !!x))];
  const pinners = pinnerIds.length ? await prisma.user.findMany({ where: { id: { in: pinnerIds } }, select: { id: true, username: true } }) : [];
  const nameOf = new Map(pinners.map((p) => [p.id, p.username]));
  res.json({ messages: rows.map((m) => ({ ...messageDto(m), pinnedByUsername: m.pinnedById ? (nameOf.get(m.pinnedById) ?? null) : null })) });
}

export async function listMessages(req: Request, res: Response) {
  const { channelId } = req.params;
  const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
  const limit = Math.min(Number(req.query.limit) || 50, 100);

  const textChannel = await prisma.textChannel.findUnique({ where: { id: channelId } });
  if (!textChannel) {
    return res.status(404).json({ error: "Channel not found" });
  }

  const membership = await prisma.membership.findUnique({
    where: { userId_serverId: { userId: req.userId!, serverId: textChannel.serverId } },
  });
  if (!membership) {
    return res.status(403).json({ error: "Not a member of this server" });
  }

  // ?around=<messageId> returns a window of messages centred on that one — used by
  // "jump to message" from search, so a hit older than the latest page can still be shown.
  const around = typeof req.query.around === "string" ? req.query.around : undefined;
  let aroundMessages: MessageRow[] | null = null;
  const include = {
    author: { select: { username: true, avatarUrl: true } },
    replyTo: { include: { author: { select: { username: true } } } },
    reactions: { orderBy: { createdAt: "asc" as const } },
    poll: { include: { votes: true } },
  };
  if (around) {
    const target = await prisma.message.findUnique({ where: { id: around } });
    if (target && target.textChannelId === channelId) {
      const [before, after] = await Promise.all([
        prisma.message.findMany({
          where: { textChannelId: channelId, createdAt: { lte: target.createdAt } },
          orderBy: { createdAt: "desc" },
          take: 30,
          include,
        }),
        prisma.message.findMany({
          where: { textChannelId: channelId, createdAt: { gt: target.createdAt } },
          orderBy: { createdAt: "asc" },
          take: 20,
          include,
        }),
      ]);
      // `before` is newest-first; the response below reverses once, so feed it newest-first.
      aroundMessages = [...after.reverse(), ...before];
    }
  }

  const messages = aroundMessages ?? await prisma.message.findMany({
    where: { textChannelId: channelId },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      author: { select: { username: true, avatarUrl: true } },
      replyTo: { include: { author: { select: { username: true } } } },
      reactions: { orderBy: { createdAt: "asc" } },
      poll: { include: { votes: true } },
    },
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  res.json({
    messages: messages.reverse().map(messageDto),
  });
}

/** Case-insensitive text search across every text channel of a server the caller belongs to. */
export async function searchMessages(req: Request, res: Response) {
  const { serverId } = req.params;
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const channelId = typeof req.query.channelId === "string" ? req.query.channelId : undefined;
  const limit = Math.min(Number(req.query.limit) || 30, 60);

  if (q.length < 2) return res.json({ results: [] });

  const membership = await prisma.membership.findUnique({
    where: { userId_serverId: { userId: req.userId!, serverId } },
  });
  if (!membership) return res.status(403).json({ error: "Not a member of this server" });

  const rows = await prisma.message.findMany({
    where: {
      content: { contains: q, mode: "insensitive" },
      textChannel: { serverId },
      ...(channelId ? { textChannelId: channelId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      author: { select: { username: true, avatarUrl: true } },
      textChannel: { select: { name: true } },
    },
  });

  res.json({
    results: rows.map((m) => ({
      id: m.id,
      content: m.content,
      textChannelId: m.textChannelId,
      channelName: m.textChannel.name,
      authorUsername: m.author.username,
      authorAvatarUrl: m.author.avatarUrl,
      createdAt: m.createdAt,
      replyToId: m.replyToId,
    })),
  });
}

/** Earlier versions of an edited message, newest first. */
export async function listEdits(req: Request, res: Response) {
  const message = await prisma.message.findUnique({ where: { id: req.params.messageId }, include: { textChannel: { select: { serverId: true } } } });
  if (!message) return res.status(404).json({ error: "Message not found" });
  const membership = await prisma.membership.findUnique({
    where: { userId_serverId: { userId: req.userId!, serverId: message.textChannel.serverId } },
  });
  if (!membership) return res.status(403).json({ error: "Not a member of this server" });
  const edits = await prisma.messageEdit.findMany({ where: { messageId: message.id }, orderBy: { createdAt: "desc" }, take: 50 });
  res.json({ edits: edits.map((e) => ({ content: e.content, replacedAt: e.createdAt.toISOString() })) });
}
