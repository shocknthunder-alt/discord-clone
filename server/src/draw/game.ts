import {
  DRAW_H,
  DRAW_W,
  SocketEvents,
  type DrawChatLine,
  type DrawOp,
  type DrawPhase,
  type DrawStateDTO,
  type DrawTopRow,
} from "@discord-clone/shared";
import type { Server as IOServer, Socket } from "socket.io";
import { prisma } from "../db.js";
import { DRAW_WORDS } from "./words.js";

/**
 * 🎨 Paint Wars (draw & guess): one player draws a word, the others type guesses. Everything lives in
 * memory (a Render restart ends the game); only the totals are saved (DrawScore).
 *
 * Flow: lobby → (choosing → drawing → reveal) for every player, `rounds` times → over → lobby.
 */

const CHOOSE_MS = 15_000;
const REVEAL_MS = 6_000;
const MAX_OPS = 8000; // per turn
const MAX_OPS_PER_MSG = 60;
const MAX_POINTS_PER_LINE = 600;
const COLOR_RE = /^#[0-9a-f]{6}$/i;

interface Player {
  userId: string;
  username: string;
  avatarUrl: string | null;
  score: number;
  guessed: boolean;
  lastGain: number;
  away: boolean;
}

interface Game {
  channelId: string;
  serverId: string;
  phase: DrawPhase;
  players: Player[];
  drawerId: string | null;
  drawnThisRound: Set<string>;
  round: number;
  rounds: number;
  seconds: number;
  word: string | null;
  choices: string[];
  revealed: Set<number>;
  startedAt: number;
  endsAt: number | null;
  timers: ReturnType<typeof setTimeout>[];
  ops: DrawOp[];
  usedWords: Set<string>;
}

const games = new Map<string, Game>();
/** channelId → socketId → userId (who has the game on screen). */
const watchers = new Map<string, Map<string, string>>();
const channelServer = new Map<string, string>();
let lineSeq = 0;

const room = (channelId: string) => `draw:${channelId}`;

// ---------------------------------------------------------------- words

function normalize(s: string) {
  return s
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/ѝ/g, "и")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function distance(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let last = prev[0]!;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]!;
      prev[j] = Math.min(prev[j]! + 1, prev[j - 1]! + 1, last + (a[i - 1] === b[j - 1] ? 0 : 1));
      last = tmp;
    }
  }
  return prev[b.length]!;
}

function isLetter(ch: string) {
  return /[\p{L}\p{N}]/u.test(ch);
}

function masked(game: Game): string {
  const word = game.word ?? "";
  return [...word].map((ch, i) => (!isLetter(ch) ? ch : game.revealed.has(i) ? ch : "_")).join("");
}

function pickWords(game: Game, n: number): string[] {
  const fresh = DRAW_WORDS.filter((w) => !game.usedWords.has(w));
  const pool = fresh.length >= n ? fresh : DRAW_WORDS;
  const out: string[] = [];
  while (out.length < n && out.length < pool.length) {
    const w = pool[Math.floor(Math.random() * pool.length)]!;
    if (!out.includes(w)) out.push(w);
  }
  return out;
}

// ---------------------------------------------------------------- sending

function stateFor(game: Game, userId: string): DrawStateDTO {
  const isDrawer = game.drawerId === userId;
  const me = game.players.find((p) => p.userId === userId);
  const showAll = game.phase === "reveal" || game.phase === "over";
  const youKnow = !!game.word && (isDrawer || !!me?.guessed || showAll);
  const word = game.word ?? "";
  return {
    channelId: game.channelId,
    phase: game.phase,
    players: game.players.map((p) => ({ ...p })),
    drawerId: game.drawerId,
    round: game.round,
    rounds: game.rounds,
    seconds: game.seconds,
    endsAt: game.endsAt,
    word: game.phase === "drawing" || game.phase === "reveal" ? (youKnow ? word : masked(game)) : "",
    wordLengths: word ? word.split(" ").map((w) => w.length) : [],
    choices: isDrawer && game.phase === "choosing" ? game.choices : null,
    youKnow,
    serverNow: Date.now(),
  };
}

function pushState(io: IOServer, game: Game) {
  const w = watchers.get(game.channelId);
  if (!w) return;
  for (const [socketId, userId] of w) io.to(socketId).emit(SocketEvents.DrawState, stateFor(game, userId));
}

function chat(io: IOServer, game: Game, line: Omit<DrawChatLine, "id" | "channelId">, only?: (userId: string) => boolean) {
  const full: DrawChatLine = { ...line, channelId: game.channelId, id: `${Date.now().toString(36)}-${++lineSeq}` };
  const w = watchers.get(game.channelId);
  if (!w) return;
  for (const [socketId, userId] of w) if (!only || only(userId)) io.to(socketId).emit(SocketEvents.DrawChat, full);
}

const system = (io: IOServer, game: Game, text: string) => chat(io, game, { kind: "system", text });

function sendCanvas(io: IOServer, game: Game) {
  io.to(room(game.channelId)).emit(SocketEvents.DrawCanvas, { channelId: game.channelId, ops: game.ops });
}

// ---------------------------------------------------------------- flow

function clearTimers(game: Game) {
  for (const t of game.timers) clearTimeout(t);
  game.timers = [];
}

const active = (game: Game) => game.players.filter((p) => !p.away);

function startGame(io: IOServer, game: Game, rounds: number, seconds: number) {
  clearTimers(game);
  game.players = game.players.filter((p) => !p.away);
  for (const p of game.players) {
    p.score = 0;
    p.guessed = false;
    p.lastGain = 0;
  }
  game.rounds = rounds;
  game.seconds = seconds;
  game.round = 1;
  game.drawnThisRound = new Set();
  game.drawerId = null;
  game.usedWords = new Set();
  system(io, game, `🎨 Играта започва! ${rounds} ${rounds === 1 ? "рунд" : "рунда"} · ${seconds} секунди за рисунка.`);
  nextTurn(io, game);
}

function nextTurn(io: IOServer, game: Game) {
  clearTimers(game);
  if (active(game).length < 2) return void gameOver(io, game, "останахте по-малко от двама");

  let drawer = game.players.find((p) => !p.away && !game.drawnThisRound.has(p.userId));
  if (!drawer) {
    game.round += 1;
    game.drawnThisRound = new Set();
    if (game.round > game.rounds) return void gameOver(io, game);
    system(io, game, `🔁 Рунд ${game.round} от ${game.rounds}`);
    drawer = game.players.find((p) => !p.away)!;
  }
  game.drawnThisRound.add(drawer.userId);
  game.drawerId = drawer.userId;
  for (const p of game.players) {
    p.guessed = false;
    p.lastGain = 0;
  }
  game.word = null;
  game.revealed = new Set();
  game.ops = [];
  sendCanvas(io, game);
  game.choices = pickWords(game, 3);
  game.phase = "choosing";
  game.endsAt = Date.now() + CHOOSE_MS;
  game.timers.push(setTimeout(() => pick(io, game, Math.floor(Math.random() * game.choices.length)), CHOOSE_MS));
  pushState(io, game);
}

function pick(io: IOServer, game: Game, index: number) {
  if (game.phase !== "choosing") return;
  clearTimers(game);
  const word = game.choices[index] ?? game.choices[0]!;
  game.word = word;
  game.usedWords.add(word);
  game.choices = [];
  game.phase = "drawing";
  game.startedAt = Date.now();
  game.endsAt = game.startedAt + game.seconds * 1000;
  const drawer = game.players.find((p) => p.userId === game.drawerId);
  system(io, game, `✏️ ${drawer?.username ?? "?"} рисува.`);

  // Hints: a letter at half time, another at 3/4 for longer words.
  const letters = [...word].filter(isLetter).length;
  const hints = letters >= 7 ? [0.5, 0.75] : letters >= 4 ? [0.6] : [];
  for (const share of hints) {
    game.timers.push(
      setTimeout(() => {
        if (game.phase !== "drawing" || !game.word) return;
        const hidden = [...game.word].map((ch, i) => (isLetter(ch) && !game.revealed.has(i) ? i : -1)).filter((i) => i >= 0);
        if (hidden.length <= 1) return;
        game.revealed.add(hidden[Math.floor(Math.random() * hidden.length)]!);
        pushState(io, game);
      }, game.seconds * 1000 * share),
    );
  }
  game.timers.push(setTimeout(() => endTurn(io, game, "⌛ Времето свърши."), game.seconds * 1000));
  pushState(io, game);
}

function endTurn(io: IOServer, game: Game, reason: string) {
  if (game.phase !== "drawing" && game.phase !== "choosing") return;
  clearTimers(game);
  const word = game.word;
  game.phase = "reveal";
  game.endsAt = Date.now() + REVEAL_MS;
  system(io, game, word ? `${reason} Думата беше: ${word}` : reason);
  game.timers.push(setTimeout(() => nextTurn(io, game), REVEAL_MS));
  pushState(io, game);
}

async function gameOver(io: IOServer, game: Game, reason?: string) {
  clearTimers(game);
  const played = game.phase !== "lobby";
  game.phase = "over";
  game.endsAt = null;
  game.drawerId = null;
  game.word = null;
  const board = [...game.players].sort((a, b) => b.score - a.score);
  const best = board[0]?.score ?? 0;
  const winners = best > 0 ? board.filter((p) => p.score === best) : [];
  system(
    io,
    game,
    [
      `🏁 Край на играта${reason ? ` — ${reason}` : ""}`,
      winners.length ? `🏆 ${winners.map((w) => w.username).join(" и ")} печели с ${best} т.!` : "",
    ]
      .filter(Boolean)
      .join(" "),
  );
  pushState(io, game);
  if (!played) return;
  for (const p of game.players) {
    if (p.score <= 0 && !winners.includes(p)) continue;
    const win = winners.includes(p) ? 1 : 0;
    await prisma.drawScore
      .upsert({
        where: { serverId_userId: { serverId: game.serverId, userId: p.userId } },
        update: { points: { increment: p.score }, wins: { increment: win }, games: { increment: 1 } },
        create: { serverId: game.serverId, userId: p.userId, points: p.score, wins: win, games: 1 },
      })
      .catch((err) => console.error("draw score", err));
  }
}

function guess(io: IOServer, game: Game, userId: string, username: string, raw: string) {
  const text = raw.trim().slice(0, 120);
  if (!text) return;
  const player = game.players.find((p) => p.userId === userId && !p.away);

  if (game.phase === "drawing" && game.word && player && userId !== game.drawerId && !player.guessed) {
    const g = normalize(text);
    const target = normalize(game.word);
    if (g === target || g.replace(/ /g, "") === target.replace(/ /g, "")) {
      const left = Math.max(0, (game.endsAt ?? Date.now()) - Date.now()) / (game.seconds * 1000);
      const first = !game.players.some((p) => p.guessed);
      const gain = Math.round(50 + 100 * left) + (first ? 25 : 0);
      player.guessed = true;
      player.score += gain;
      player.lastGain = gain;
      const drawer = game.players.find((p) => p.userId === game.drawerId);
      if (drawer) {
        drawer.score += 30;
        drawer.lastGain += 30;
      }
      chat(io, game, { kind: "correct", userId, username, text: `✅ ${username} позна думата! (+${gain})` });
      const waiting = game.players.filter((p) => !p.away && p.userId !== game.drawerId && !p.guessed);
      if (waiting.length === 0) return endTurn(io, game, "🎉 Всички познаха!");
      return pushState(io, game);
    }
    const limit = target.length >= 8 ? 2 : target.length >= 4 ? 1 : 0;
    if (limit && Math.abs(g.length - target.length) <= limit && distance(g, target) <= limit) {
      chat(io, game, { kind: "close", text: `🤏 „${text}“ е много близо!` }, (u) => u === userId);
    }
  }

  // Those who already know the word only talk among themselves (no spoilers).
  const knows = (u: string) => u === game.drawerId || !!game.players.find((p) => p.userId === u)?.guessed;
  const secret = game.phase === "drawing" && knows(userId);
  chat(io, game, { kind: "guess", userId, username, text }, secret ? knows : undefined);
}

// ---------------------------------------------------------------- ops validation

function cleanOps(raw: unknown): DrawOp[] {
  if (!Array.isArray(raw)) return [];
  const out: DrawOp[] = [];
  for (const op of raw.slice(0, MAX_OPS_PER_MSG)) {
    if (!op || typeof op !== "object") continue;
    const o = op as Record<string, unknown>;
    const id = Number(o.id);
    const c = typeof o.c === "string" && COLOR_RE.test(o.c) ? o.c : null;
    if (!Number.isFinite(id) || !c) continue;
    if (o.t === "line" && Array.isArray(o.p)) {
      const w = Math.min(Math.max(Number(o.w) || 4, 1), 80);
      const p = (o.p as unknown[]).slice(0, MAX_POINTS_PER_LINE * 2).map((n, i) => {
        const v = Math.round(Number(n) || 0);
        return Math.min(Math.max(v, -50), (i % 2 === 0 ? DRAW_W : DRAW_H) + 50);
      });
      if (p.length >= 2 && p.length % 2 === 0) out.push({ t: "line", id, c, w, p });
    } else if (o.t === "fill") {
      const x = Math.round(Number(o.x));
      const y = Math.round(Number(o.y));
      if (x >= 0 && x < DRAW_W && y >= 0 && y < DRAW_H) out.push({ t: "fill", id, c, x, y });
    }
  }
  return out;
}

// ---------------------------------------------------------------- watching / players

async function serverOfDrawChannel(channelId: string, userId: string): Promise<string | null> {
  let serverId = channelServer.get(channelId);
  if (!serverId) {
    const ch = await prisma.textChannel.findUnique({ where: { id: channelId }, select: { serverId: true, type: true } });
    if (!ch || ch.type !== "draw") return null;
    serverId = ch.serverId;
    channelServer.set(channelId, serverId);
  }
  const member = await prisma.membership.findUnique({ where: { userId_serverId: { userId, serverId } }, select: { userId: true } });
  return member ? serverId : null;
}

function getGame(channelId: string, serverId: string): Game {
  let game = games.get(channelId);
  if (!game) {
    game = {
      channelId,
      serverId,
      phase: "lobby",
      players: [],
      drawerId: null,
      drawnThisRound: new Set(),
      round: 0,
      rounds: 3,
      seconds: 80,
      word: null,
      choices: [],
      revealed: new Set(),
      startedAt: 0,
      endsAt: null,
      timers: [],
      ops: [],
      usedWords: new Set(),
    };
    games.set(channelId, game);
  }
  return game;
}

/** A socket stopped watching: if that was the user's last one there, they're away. */
function unwatch(io: IOServer, socket: Socket, channelId: string) {
  const w = watchers.get(channelId);
  if (!w?.has(socket.id)) return;
  const userId = w.get(socket.id)!;
  w.delete(socket.id);
  void socket.leave(room(channelId));
  const game = games.get(channelId);
  if (!game) return;
  const stillHere = [...w.values()].includes(userId);
  if (!stillHere) leavePlayer(io, game, userId);
  if (w.size === 0) {
    watchers.delete(channelId);
    clearTimers(game);
    games.delete(channelId);
  }
}

function leavePlayer(io: IOServer, game: Game, userId: string) {
  const p = game.players.find((x) => x.userId === userId);
  if (!p) return;
  if (game.phase === "lobby" || game.phase === "over") {
    game.players = game.players.filter((x) => x.userId !== userId);
    return pushState(io, game);
  }
  if (p.away) return;
  p.away = true;
  system(io, game, `👋 ${p.username} излезе от играта.`);
  if (active(game).length < 2) return void gameOver(io, game, "останахте по-малко от двама");
  if (game.drawerId === userId) return endTurn(io, game, "✏️ Рисуващият излезе.");
  if (game.phase === "drawing" && game.players.filter((x) => !x.away && x.userId !== game.drawerId && !x.guessed).length === 0) {
    return endTurn(io, game, "🎉 Всички познаха!");
  }
  pushState(io, game);
}

export function registerDrawGateway(io: IOServer, socket: Socket) {
  const userId: string = socket.data.userId;
  const watching = new Set<string>();

  async function me() {
    return prisma.user.findUnique({ where: { id: userId }, select: { username: true, avatarUrl: true } });
  }

  /** The game of a channel this socket is watching. */
  const gameOf = (channelId: unknown) => (typeof channelId === "string" && watching.has(channelId) ? games.get(channelId) : undefined);

  socket.on(SocketEvents.DrawWatch, async ({ channelId }: { channelId: string }) => {
    if (typeof channelId !== "string") return;
    const serverId = await serverOfDrawChannel(channelId, userId);
    if (!serverId) return;
    watching.add(channelId);
    await socket.join(room(channelId));
    const w = watchers.get(channelId) ?? new Map<string, string>();
    w.set(socket.id, userId);
    watchers.set(channelId, w);
    const game = getGame(channelId, serverId);
    // Back after a reload mid-game: you're in again.
    const p = game.players.find((x) => x.userId === userId);
    if (p?.away) {
      p.away = false;
      system(io, game, `🙌 ${p.username} се върна.`);
      pushState(io, game);
    } else {
      socket.emit(SocketEvents.DrawState, stateFor(game, userId));
    }
    socket.emit(SocketEvents.DrawCanvas, { channelId, ops: game.ops });
  });

  socket.on(SocketEvents.DrawUnwatch, ({ channelId }: { channelId: string }) => {
    if (typeof channelId !== "string") return;
    watching.delete(channelId);
    unwatch(io, socket, channelId);
  });

  socket.on(SocketEvents.DrawJoin, async ({ channelId }: { channelId: string }) => {
    const game = gameOf(channelId);
    if (!game) return;
    const existing = game.players.find((p) => p.userId === userId);
    if (existing) {
      if (existing.away) {
        existing.away = false;
        pushState(io, game);
      }
      return;
    }
    if (game.players.length >= 16) return;
    const u = await me();
    if (!u) return;
    // Joining mid-game: you play from the next turn (and draw if your turn comes this round).
    game.players.push({ userId, username: u.username, avatarUrl: u.avatarUrl, score: 0, guessed: false, lastGain: 0, away: false });
    if (game.phase !== "lobby" && game.phase !== "over") system(io, game, `➕ ${u.username} се включи.`);
    pushState(io, game);
  });

  socket.on(SocketEvents.DrawLeave, ({ channelId }: { channelId: string }) => {
    const game = gameOf(channelId);
    if (game) leavePlayer(io, game, userId);
  });

  socket.on(SocketEvents.DrawStart, ({ channelId, rounds, seconds }: { channelId: string; rounds?: number; seconds?: number }) => {
    const game = gameOf(channelId);
    if (!game || (game.phase !== "lobby" && game.phase !== "over")) return;
    if (!game.players.some((p) => p.userId === userId && !p.away)) return;
    if (active(game).length < 2) return;
    const r = Math.min(Math.max(Math.round(Number(rounds) || 3), 1), 10);
    const s = Math.min(Math.max(Math.round(Number(seconds) || 80), 30), 180);
    startGame(io, game, r, s);
  });

  socket.on(SocketEvents.DrawStop, ({ channelId }: { channelId: string }) => {
    const game = gameOf(channelId);
    if (!game || game.phase === "lobby" || game.phase === "over") return;
    if (!game.players.some((p) => p.userId === userId)) return;
    const who = game.players.find((p) => p.userId === userId)?.username;
    void gameOver(io, game, `спряна от ${who}`);
  });

  socket.on(SocketEvents.DrawPick, ({ channelId, index }: { channelId: string; index: number }) => {
    const game = gameOf(channelId);
    if (!game || game.drawerId !== userId || game.phase !== "choosing") return;
    pick(io, game, Math.min(Math.max(Math.round(Number(index) || 0), 0), game.choices.length - 1));
  });

  socket.on(SocketEvents.DrawOps, ({ channelId, ops }: { channelId: string; ops: unknown }) => {
    const game = gameOf(channelId);
    if (!game || game.drawerId !== userId || game.phase !== "drawing") return;
    if (game.ops.length >= MAX_OPS) return;
    const clean = cleanOps(ops);
    if (!clean.length) return;
    game.ops.push(...clean);
    socket.to(room(channelId)).emit(SocketEvents.DrawOps, { channelId, ops: clean });
  });

  socket.on(SocketEvents.DrawUndo, ({ channelId }: { channelId: string }) => {
    const game = gameOf(channelId);
    if (!game || game.drawerId !== userId || game.phase !== "drawing" || !game.ops.length) return;
    const lastId = game.ops[game.ops.length - 1]!.id;
    game.ops = game.ops.filter((o) => o.id !== lastId);
    sendCanvas(io, game);
  });

  socket.on(SocketEvents.DrawClear, ({ channelId }: { channelId: string }) => {
    const game = gameOf(channelId);
    if (!game || game.drawerId !== userId || game.phase !== "drawing") return;
    game.ops = [];
    sendCanvas(io, game);
  });

  socket.on(SocketEvents.DrawGuess, async ({ channelId, text }: { channelId: string; text: string }) => {
    const game = gameOf(channelId);
    if (!game || typeof text !== "string") return;
    const name = game.players.find((p) => p.userId === userId)?.username ?? (await me())?.username ?? "?";
    guess(io, game, userId, name, text);
  });

  socket.on(SocketEvents.DrawTop, async ({ channelId }: { channelId: string }, ack?: (rows: DrawTopRow[]) => void) => {
    if (typeof ack !== "function") return;
    const serverId = typeof channelId === "string" ? await serverOfDrawChannel(channelId, userId) : null;
    if (!serverId) return ack([]);
    const rows = await prisma.drawScore.findMany({
      where: { serverId },
      orderBy: [{ points: "desc" }],
      take: 10,
      include: { user: { select: { username: true } } },
    });
    ack(rows.map((r) => ({ username: r.user.username, points: r.points, wins: r.wins, games: r.games })));
  });

  socket.on("disconnect", () => {
    for (const channelId of watching) unwatch(io, socket, channelId);
    watching.clear();
  });
}
