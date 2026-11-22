import { Perm, SocketEvents, type MessageDTO, type PollDTO, type PollUpdatedPayload } from "@discord-clone/shared";
import type { Server as IOServer, Socket } from "socket.io";
import { prisma } from "./db.js";
import { can } from "./permissions.js";

/** 📊 Polls: a channel message with a question and 2–10 options; members vote (one or many). */

export function pollDto(p: { id: string; question: string; options: string[]; multi: boolean; endsAt: Date | null; votes: { userId: string; option: number }[] }): PollDTO {
  const votes: string[][] = p.options.map(() => []);
  for (const v of p.votes) if (votes[v.option]) votes[v.option].push(v.userId);
  return { id: p.id, question: p.question, options: p.options, multi: p.multi, endsAt: p.endsAt?.toISOString() ?? null, closed: !!p.endsAt && p.endsAt <= new Date(), votes };
}

function clean(s: unknown, max: number): string {
  return typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

export function registerPolls(io: IOServer, socket: Socket) {
  const userId: string = socket.data.userId;

  socket.on(
    SocketEvents.PollCreate,
    async (p: { textChannelId?: unknown; question?: unknown; options?: unknown; multi?: unknown; hours?: unknown }) => {
      const textChannelId = typeof p?.textChannelId === "string" ? p.textChannelId : "";
      const question = clean(p?.question, 300);
      const options = (Array.isArray(p?.options) ? p.options : []).map((o) => clean(o, 80)).filter(Boolean).slice(0, 10);
      if (!textChannelId || !question || options.length < 2) return;
      const hours = Math.max(0, Math.min(Number(p?.hours) || 0, 24 * 14));
      const channel = await prisma.textChannel.findUnique({ where: { id: textChannelId } });
      if (!channel || channel.type === "trivia" || channel.type === "draw" || channel.type === "blocks") return;
      const membership = await prisma.membership.findUnique({ where: { userId_serverId: { userId, serverId: channel.serverId } } });
      if (!membership) return;

      const message = await prisma.message.create({
        data: {
          content: `📊 ${question}`,
          textChannelId,
          authorId: userId,
          poll: { create: { question, options, multi: !!p?.multi, endsAt: hours ? new Date(Date.now() + hours * 3600_000) : null } },
        },
        include: { author: { select: { username: true, avatarUrl: true } }, poll: { include: { votes: true } } },
      });
      const dto: MessageDTO = {
        id: message.id,
        textChannelId,
        authorId: userId,
        authorUsername: message.author.username,
        authorAvatarUrl: message.author.avatarUrl,
        content: message.content,
        imageUrl: null,
        createdAt: message.createdAt.toISOString(),
        editedAt: null,
        pinnedAt: null,
        reactions: [],
        replyTo: null,
        poll: message.poll ? pollDto(message.poll) : null,
      };
      io.to(`channel:${textChannelId}`).emit(SocketEvents.MessageNew, dto);
      io.to(`server:${channel.serverId}`).emit(SocketEvents.ChannelActivity, {
        serverId: channel.serverId,
        textChannelId,
        authorId: userId,
        createdAt: dto.createdAt,
      });
    },
  );

  socket.on(SocketEvents.PollVote, async (p: { pollId?: unknown; option?: unknown; close?: unknown }) => {
    const pollId = typeof p?.pollId === "string" ? p.pollId : "";
    if (!pollId) return;
    const poll = await prisma.poll.findUnique({ where: { id: pollId }, include: { message: { include: { textChannel: true } } } });
    if (!poll) return;
    const serverId = poll.message.textChannel.serverId;
    const membership = await prisma.membership.findUnique({ where: { userId_serverId: { userId, serverId } } });
    if (!membership) return;

    if (p?.close === true) {
      // End it now: the author, or anyone who can manage messages.
      if (poll.message.authorId !== userId && !(await can(userId, serverId, Perm.MANAGE_MESSAGES))) return;
      if (!poll.endsAt || poll.endsAt > new Date()) await prisma.poll.update({ where: { id: pollId }, data: { endsAt: new Date() } });
    } else {
      const option = Number(p?.option);
      if (!Number.isInteger(option) || option < 0 || option >= poll.options.length) return;
      if (poll.endsAt && poll.endsAt <= new Date()) return;
      const existing = await prisma.pollVote.findUnique({ where: { pollId_userId_option: { pollId, userId, option } } });
      if (existing) {
        await prisma.pollVote.delete({ where: { id: existing.id } });
      } else {
        if (!poll.multi) await prisma.pollVote.deleteMany({ where: { pollId, userId } });
        await prisma.pollVote.create({ data: { pollId, userId, option } }).catch(() => {});
      }
    }
    const fresh = await prisma.poll.findUnique({ where: { id: pollId }, include: { votes: true } });
    if (!fresh) return;
    io.to(`channel:${poll.message.textChannelId}`).emit(SocketEvents.PollUpdated, {
      messageId: poll.messageId,
      textChannelId: poll.message.textChannelId,
      poll: pollDto(fresh),
    } satisfies PollUpdatedPayload);
  });
}
