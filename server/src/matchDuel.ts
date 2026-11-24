import {
  BLOCKS_DUEL_SECONDS,
  DUEL_ATTACKS,
  DUEL_COUNTDOWN_MS,
  DUEL_SECONDS,
  SocketEvents,
  type DuelAttackKind,
  type DuelLobbyDTO,
  type DuelOverDTO,
  type DuelPlayerDTO,
  type DuelSpectateDTO,
  type DuelSpectateEventDTO,
  type DuelSpectateOverDTO,
  type DuelStartDTO,
} from "@discord-clone/shared";
import type { Server as IOServer, Socket } from "socket.io";
import { prisma } from "./db.js";

/**
 * ⚔️ Duels: two people in a "match" (Шмиксер) or "blocks" (Шметрис) channel play their own boards.
 * Шмиксер: DUEL_SECONDS, the higher score wins. Шметрис: whoever tops out first loses (at most
 * BLOCKS_DUEL_SECONDS, then the higher score). The boards run in the browsers; the server pairs people
 * up, relays scores / tiny board pictures / attacks, ends the duel and saves wins in MatchScore (it is
 * keyed by server + user + mode): mode "duel" (Шмиксер) / "blocks-duel" (Шметрис), best = wins,
 * bestCombo = best duel score. All in memory: a Render restart ends running duels without a result.
 */

const LEFT_GRACE_MS = 10_000; // a reload / Wi-Fi drop doesn't lose the duel at once
const END_GRACE_MS = 4_000; // the last moves' scores still count
const MAX_SCORE = 30_000_000;

type Kind = "match" | "blocks";

interface Duel {
  id: string;
  kind: Kind;
  channelId: string;
  serverId: string;
  players: [DuelPlayerDTO, DuelPlayerDTO];
  scores: Record<string, number>;
  boards: Record<string, number[] | undefined>;
  startsAt: number;
  endsAt: number;
  timer: ReturnType<typeof setTimeout>;
  leftTimers: Map<string, ReturnType<typeof setTimeout>>;
  over: boolean;
  /** 👁 socket ids watching this duel */
  spectators: Set<string>;
}

/** channelId → socketId → userId (who has the channel on screen). */
const watchers = new Map<string, Map<string, string>>();
const waiting = new Map<string, DuelPlayerDTO[]>();
const duels = new Map<string, Duel>();
const channelServer = new Map<string, { serverId: string; kind: Kind }>();
let seq = 0;

const room = (channelId: string) => `match:${channelId}`;

async function serverOfMatchChannel(channelId: string, userId: string): Promise<string | null> {
  let info = channelServer.get(channelId);
  if (!info) {
    const ch = await prisma.textChannel.findUnique({ where: { id: channelId }, select: { serverId: true, type: true } });
    if (!ch || (ch.type !== "match" && ch.type !== "blocks")) return null;
    info = { serverId: ch.serverId, kind: ch.type };
    channelServer.set(channelId, info);
  }
  const serverId = info.serverId;
  const member = await prisma.membership.findUnique({ where: { userId_serverId: { userId, serverId } }, select: { userId: true } });
  return member ? serverId : null;
}

function socketsOf(channelId: string, userId: string): string[] {
  const w = watchers.get(channelId);
  return w ? [...w].filter(([, u]) => u === userId).map(([s]) => s) : [];
}
function emitTo(io: IOServer, channelId: string, userId: string, event: string, data: unknown) {
  for (const s of socketsOf(channelId, userId)) io.to(s).emit(event, data);
}

const duelOf = (userId: string, channelId?: string) =>
  [...duels.values()].find((d) => !d.over && d.players.some((p) => p.userId === userId) && (!channelId || d.channelId === channelId));
const otherOf = (d: Duel, userId: string) => d.players.find((p) => p.userId !== userId)!;

function lobby(channelId: string): DuelLobbyDTO {
  return {
    channelId,
    waiting: waiting.get(channelId) ?? [],
    playing: [...duels.values()]
      .filter((d) => d.channelId === channelId && !d.over)
      .map((d) => ({
        a: d.players[0],
        b: d.players[1],
        scoreA: d.scores[d.players[0].userId] ?? 0,
        scoreB: d.scores[d.players[1].userId] ?? 0,
        duelId: d.id,
        spectators: d.spectators.size,
      })),
  };
}
function pushLobby(io: IOServer, channelId: string) {
  io.to(room(channelId)).emit(SocketEvents.MatchLobby, lobby(channelId));
}

function removeWaiting(channelId: string, userId: string) {
  const list = waiting.get(channelId);
  if (!list) return false;
  const next = list.filter((p) => p.userId !== userId);
  if (next.length === list.length) return false;
  if (next.length) waiting.set(channelId, next);
  else waiting.delete(channelId);
  return true;
}

function spectateState(d: Duel): DuelSpectateDTO {
  const [a, b] = d.players;
  return {
    duelId: d.id,
    channelId: d.channelId,
    a,
    b,
    scoreA: d.scores[a.userId] ?? 0,
    scoreB: d.scores[b.userId] ?? 0,
    boardA: d.boards[a.userId],
    boardB: d.boards[b.userId],
    startsAt: d.startsAt,
    endsAt: d.endsAt,
    serverNow: Date.now(),
  };
}
function toSpectators(io: IOServer, d: Duel, event: string, data: unknown) {
  for (const s of d.spectators) io.to(s).emit(event, data);
}

function startFor(d: Duel, userId: string, resume: boolean): DuelStartDTO {
  const opp = otherOf(d, userId);
  return {
    channelId: d.channelId,
    duelId: d.id,
    opponent: opp,
    startsAt: d.startsAt,
    endsAt: d.endsAt,
    serverNow: Date.now(),
    ...(resume ? { opponentScore: d.scores[opp.userId] ?? 0, opponentBoard: d.boards[opp.userId], yourScore: d.scores[userId] ?? 0 } : {}),
  };
}

function startDuel(io: IOServer, channelId: string, serverId: string, kind: Kind, a: DuelPlayerDTO, b: DuelPlayerDTO) {
  removeWaiting(channelId, a.userId);
  removeWaiting(channelId, b.userId);
  const now = Date.now();
  const startsAt = now + DUEL_COUNTDOWN_MS;
  const endsAt = startsAt + (kind === "blocks" ? BLOCKS_DUEL_SECONDS : DUEL_SECONDS) * 1000;
  const d: Duel = {
    id: `d${Date.now().toString(36)}${++seq}`,
    kind,
    channelId,
    serverId,
    players: [a, b],
    scores: { [a.userId]: 0, [b.userId]: 0 },
    boards: {},
    startsAt,
    endsAt,
    timer: setTimeout(() => void finish(io, d, null, "time"), endsAt - now + END_GRACE_MS),
    leftTimers: new Map(),
    over: false,
    spectators: new Set(),
  };
  duels.set(d.id, d);
  for (const p of d.players) emitTo(io, channelId, p.userId, SocketEvents.MatchDuelStart, startFor(d, p.userId, false));
  pushLobby(io, channelId);
}

/** loser = forfeit / left; null = on time (higher score wins). */
async function finish(io: IOServer, d: Duel, loser: string | null, reason: DuelOverDTO["reason"]) {
  if (d.over) return;
  d.over = true;
  clearTimeout(d.timer);
  for (const t of d.leftTimers.values()) clearTimeout(t);
  duels.delete(d.id);
  const [a, b] = d.players;
  const sa = d.scores[a.userId] ?? 0;
  const sb = d.scores[b.userId] ?? 0;
  const winnerId = loser ? otherOf(d, loser).userId : sa === sb ? null : sa > sb ? a.userId : b.userId;
  const totals: Record<string, { wins: number; games: number }> = {};
  for (const p of d.players) {
    const won = winnerId === p.userId;
    const score = d.scores[p.userId] ?? 0;
    try {
      const mode = d.kind === "blocks" ? "blocks-duel" : "duel";
      const where = { serverId_userId_mode: { serverId: d.serverId, userId: p.userId, mode } };
      const prev = await prisma.matchScore.findUnique({ where });
      const row = await prisma.matchScore.upsert({
        where,
        create: { serverId: d.serverId, userId: p.userId, mode, best: won ? 1 : 0, bestCombo: score, games: 1 },
        update: {
          games: { increment: 1 },
          ...(won ? { best: { increment: 1 } } : {}),
          ...(!prev || score > prev.bestCombo ? { bestCombo: score } : {}),
        },
      });
      totals[p.userId] = { wins: row.best, games: row.games };
    } catch {
      totals[p.userId] = { wins: 0, games: 0 };
    }
  }
  const over: DuelSpectateOverDTO = { duelId: d.id, winnerId, scoreA: sa, scoreB: sb, reason };
  toSpectators(io, d, SocketEvents.MatchSpectateOver, over);
  d.spectators.clear();
  for (const p of d.players) {
    const o = otherOf(d, p.userId);
    const dto: DuelOverDTO = {
      duelId: d.id,
      channelId: d.channelId,
      you: d.scores[p.userId] ?? 0,
      them: d.scores[o.userId] ?? 0,
      winnerId,
      reason,
      wins: totals[p.userId]?.wins ?? 0,
      games: totals[p.userId]?.games ?? 0,
    };
    emitTo(io, d.channelId, p.userId, SocketEvents.MatchDuelOver, dto);
  }
  pushLobby(io, d.channelId);
}

function unwatch(io: IOServer, socket: Socket, channelId: string) {
  const w = watchers.get(channelId);
  if (!w?.has(socket.id)) return;
  const userId = w.get(socket.id)!;
  w.delete(socket.id);
  if (w.size === 0) watchers.delete(channelId);
  void socket.leave(room(channelId));
  let specChanged = false;
  for (const d of duels.values()) if (d.channelId === channelId && d.spectators.delete(socket.id)) specChanged = true;
  if (specChanged) pushLobby(io, channelId);
  if (socketsOf(channelId, userId).length) return; // still open in another tab
  if (removeWaiting(channelId, userId)) pushLobby(io, channelId);
  const d = duelOf(userId, channelId);
  if (d && !d.leftTimers.has(userId)) {
    d.leftTimers.set(
      userId,
      setTimeout(() => void finish(io, d, userId, "left"), LEFT_GRACE_MS),
    );
  }
}

/** Шмиксер: 8×8 codes; Шметрис: the visible 10×20 well (cell values). */
const cleanBoard = (b: unknown): number[] | undefined =>
  Array.isArray(b) && (b.length === 64 || b.length === 200) && b.every((x) => Number.isInteger(x) && x >= 0 && x <= 40) ? (b as number[]) : undefined;

export function registerMatchDuelGateway(io: IOServer, socket: Socket) {
  const userId: string = socket.data.userId;
  const watching = new Set<string>();

  const myDuel = (duelId: unknown) => {
    const d = typeof duelId === "string" ? duels.get(duelId) : undefined;
    return d && !d.over && watching.has(d.channelId) && d.players.some((p) => p.userId === userId) ? d : undefined;
  };

  socket.on(SocketEvents.MatchWatch, async ({ channelId }: { channelId: string }) => {
    if (typeof channelId !== "string") return;
    const serverId = await serverOfMatchChannel(channelId, userId);
    if (!serverId) return;
    watching.add(channelId);
    await socket.join(room(channelId));
    const w = watchers.get(channelId) ?? new Map<string, string>();
    w.set(socket.id, userId);
    watchers.set(channelId, w);
    socket.emit(SocketEvents.MatchLobby, lobby(channelId));
    // back after a reload / reconnect: the duel goes on
    const d = duelOf(userId, channelId);
    if (d) {
      const t = d.leftTimers.get(userId);
      if (t) clearTimeout(t);
      d.leftTimers.delete(userId);
      socket.emit(SocketEvents.MatchDuelStart, startFor(d, userId, true));
    }
  });

  socket.on(SocketEvents.MatchUnwatch, ({ channelId }: { channelId: string }) => {
    if (typeof channelId !== "string") return;
    watching.delete(channelId);
    unwatch(io, socket, channelId);
  });

  socket.on(SocketEvents.MatchDuelSeek, async ({ channelId, with: withId }: { channelId: string; with?: string }) => {
    if (typeof channelId !== "string" || !watching.has(channelId)) return;
    const info = channelServer.get(channelId);
    if (!info || duelOf(userId)) return;
    const { serverId, kind } = info;
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { username: true, avatarUrl: true } });
    if (!u) return;
    const me: DuelPlayerDTO = { userId, username: u.username, avatarUrl: u.avatarUrl };
    const list = (waiting.get(channelId) ?? []).filter((p) => p.userId !== userId && socketsOf(channelId, p.userId).length && !duelOf(p.userId));
    const other = typeof withId === "string" ? list.find((p) => p.userId === withId) : list[0];
    if (other) return startDuel(io, channelId, serverId, kind, other, me);
    if (typeof withId === "string") return pushLobby(io, channelId); // they're gone already
    if (!(waiting.get(channelId) ?? []).some((p) => p.userId === userId)) waiting.set(channelId, [...list, me]);
    pushLobby(io, channelId);
  });

  socket.on(SocketEvents.MatchDuelCancel, ({ channelId }: { channelId: string }) => {
    if (typeof channelId === "string" && removeWaiting(channelId, userId)) pushLobby(io, channelId);
  });

  socket.on(SocketEvents.MatchDuelUpdate, ({ duelId, score, board, combo, out }: { duelId: string; score: unknown; board?: unknown; combo?: unknown; out?: unknown }) => {
    const d = myDuel(duelId);
    if (!d || typeof score !== "number" || !Number.isFinite(score)) return;
    if (Date.now() > d.endsAt + END_GRACE_MS) return;
    d.scores[userId] = Math.max(0, Math.min(MAX_SCORE, Math.round(score)));
    const b = cleanBoard(board);
    if (b) d.boards[userId] = b;
    const opp = otherOf(d, userId);
    emitTo(io, d.channelId, opp.userId, SocketEvents.MatchDuelOpponent, {
      duelId: d.id,
      score: d.scores[userId],
      board: b,
      combo: typeof combo === "number" ? Math.min(99, Math.max(0, Math.round(combo))) : undefined,
    });
    toSpectators(io, d, SocketEvents.MatchSpectateUpdate, {
      duelId: d.id,
      userId,
      score: d.scores[userId],
      board: b,
      combo: typeof combo === "number" ? Math.min(99, Math.max(0, Math.round(combo))) : undefined,
    });
    pushLobby(io, d.channelId);
    // Шметрис: topped out → the other one wins
    if (out === true && d.kind === "blocks") void finish(io, d, userId, "out");
  });

  socket.on(SocketEvents.MatchDuelAttack, ({ duelId, kind, power }: { duelId: string; kind: DuelAttackKind; power?: unknown }) => {
    const d = myDuel(duelId);
    if (!d || !DUEL_ATTACKS.includes(kind) || Date.now() < d.startsAt || Date.now() > d.endsAt) return;
    if ((kind === "garbage") !== (d.kind === "blocks")) return;
    const p = Math.min(kind === "garbage" ? 12 : 3, Math.max(1, Math.round(Number(power) || 1)));
    emitTo(io, d.channelId, otherOf(d, userId).userId, SocketEvents.MatchDuelAttacked, { duelId: d.id, kind, power: p });
    toSpectators(io, d, SocketEvents.MatchSpectateEvent, { duelId: d.id, from: userId, type: "attack", kind, power: p } satisfies DuelSpectateEventDTO);
  });

  socket.on(SocketEvents.MatchDuelBlock, ({ duelId }: { duelId: string }) => {
    const d = myDuel(duelId);
    if (!d) return;
    emitTo(io, d.channelId, otherOf(d, userId).userId, SocketEvents.MatchDuelBlocked, { duelId: d.id });
    toSpectators(io, d, SocketEvents.MatchSpectateEvent, { duelId: d.id, from: userId, type: "block" } satisfies DuelSpectateEventDTO);
  });

  // 👁 watch a duel in a channel you have open (not your own)
  socket.on(SocketEvents.MatchSpectate, ({ channelId, duelId }: { channelId: string; duelId: string }) => {
    if (typeof channelId !== "string" || typeof duelId !== "string" || !watching.has(channelId)) return;
    const d = duels.get(duelId);
    if (!d || d.over || d.channelId !== channelId || d.players.some((p) => p.userId === userId)) return;
    for (const other of duels.values()) if (other !== d) other.spectators.delete(socket.id);
    d.spectators.add(socket.id);
    socket.emit(SocketEvents.MatchSpectateState, spectateState(d));
    pushLobby(io, channelId);
  });

  socket.on(SocketEvents.MatchSpectateStop, ({ duelId }: { duelId: string }) => {
    const d = typeof duelId === "string" ? duels.get(duelId) : undefined;
    if (d?.spectators.delete(socket.id)) pushLobby(io, d.channelId);
  });

  socket.on(SocketEvents.MatchDuelForfeit, ({ duelId }: { duelId: string }) => {
    const d = myDuel(duelId);
    if (d) void finish(io, d, userId, "forfeit");
  });

  socket.on("disconnect", () => {
    for (const channelId of watching) unwatch(io, socket, channelId);
    watching.clear();
  });
}
