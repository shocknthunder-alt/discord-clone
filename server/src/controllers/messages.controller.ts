import type { Request, Response } from "express";
import { prisma } from "../db.js";

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

  const messages = await prisma.message.findMany({
    where: { textChannelId: channelId },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      author: { select: { username: true } },
      replyTo: { include: { author: { select: { username: true } } } },
    },
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  res.json({
    messages: messages.reverse().map((m) => ({
      id: m.id,
      content: m.content,
      imageUrl: m.imageUrl,
      textChannelId: m.textChannelId,
      authorId: m.authorId,
      authorUsername: m.author.username,
      createdAt: m.createdAt,
      editedAt: m.editedAt,
      replyTo: m.replyTo
        ? {
            id: m.replyTo.id,
            authorUsername: m.replyTo.author.username,
            content: m.replyTo.content,
            imageUrl: m.replyTo.imageUrl,
          }
        : null,
    })),
  });
}
