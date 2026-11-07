import type { Request, Response } from "express";
import { prisma } from "../db.js";

function toUserDTO(user: { id: string; username: string; email: string; avatarUrl: string | null }) {
  return { id: user.id, username: user.username, email: user.email, avatarUrl: user.avatarUrl };
}

function orderedPair(userId: string, otherUserId: string): [string, string] {
  return userId < otherUserId ? [userId, otherUserId] : [otherUserId, userId];
}

export async function startConversation(req: Request, res: Response) {
  const { userId: otherUserId } = req.params;
  const selfId = req.userId!;

  if (otherUserId === selfId) {
    return res.status(400).json({ error: "Cannot start a conversation with yourself" });
  }

  const otherUser = await prisma.user.findUnique({ where: { id: otherUserId } });
  if (!otherUser) {
    return res.status(404).json({ error: "User not found" });
  }

  const [userAId, userBId] = orderedPair(selfId, otherUserId);

  const conversation = await prisma.dmConversation.upsert({
    where: { userAId_userBId: { userAId, userBId } },
    update: {},
    create: { userAId, userBId },
  });

  res.status(201).json({
    conversation: { id: conversation.id, otherUser: toUserDTO(otherUser), createdAt: conversation.createdAt },
  });
}

export async function listConversations(req: Request, res: Response) {
  const selfId = req.userId!;

  const conversations = await prisma.dmConversation.findMany({
    where: { OR: [{ userAId: selfId }, { userBId: selfId }] },
    include: { userA: true, userB: true },
    orderBy: { createdAt: "desc" },
  });

  res.json({
    conversations: conversations.map((c) => ({
      id: c.id,
      otherUser: toUserDTO(c.userAId === selfId ? c.userB : c.userA),
      createdAt: c.createdAt,
    })),
  });
}

async function requireParticipant(conversationId: string, userId: string) {
  const conversation = await prisma.dmConversation.findUnique({ where: { id: conversationId } });
  if (!conversation) return null;
  if (conversation.userAId !== userId && conversation.userBId !== userId) return null;
  return conversation;
}

export async function listDmMessages(req: Request, res: Response) {
  const { conversationId } = req.params;
  const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
  const limit = Math.min(Number(req.query.limit) || 50, 100);

  const conversation = await requireParticipant(conversationId, req.userId!);
  if (!conversation) {
    return res.status(403).json({ error: "Not a participant in this conversation" });
  }

  const messages = await prisma.directMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { author: { select: { username: true } } },
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  res.json({
    messages: messages.reverse().map((m) => ({
      id: m.id,
      conversationId: m.conversationId,
      content: m.content,
      imageUrl: m.imageUrl,
      authorId: m.authorId,
      authorUsername: m.author.username,
      createdAt: m.createdAt,
      editedAt: m.editedAt,
    })),
  });
}
