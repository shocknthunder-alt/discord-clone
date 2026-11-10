import { SocketEvents } from "@discord-clone/shared";
import type { Server as IOServer } from "socket.io";
import { prisma } from "../db.js";
import { fetchEnglish, pickBulgarian, type TriviaQuestion } from "./questions.js";

const BOT_EMAIL = "trivia-bot@shmirka.local";
const BOT_NAME = "Тривия Бот";
const ANSWER_SECONDS = 25;
const PAUSE_MS = 3500;
const LETTERS = ["A", "B", "C", "D"];

interface Game {
  channelId: string;
  serverId: string;
  questions: TriviaQuestion[];
  index: number;
  current: TriviaQuestion | null;
  openedAt: number;
  timer: ReturnType<typeof setTimeout> | null;
  wrong: Set<string>;
  session: Map<string, { name: string; points: number; correct: number }>;
}

const games = new Map<string, Game>(); // channelId -> running game
let botUserId: string | null = null;

async function getBotUserId(): Promise<string> {
  if (botUserId) return botUserId;
  const bot = await prisma.user.upsert({
    where: { email: BOT_EMAIL },
    update: {},
    // No usable password: the hash is not a valid bcrypt string, so nobody can log in as the bot.
    create: { email: BOT_EMAIL, username: BOT_NAME, passwordHash: "!bot-account-no-login" },
  });
  botUserId = bot.id;
  return bot.id;
}

async function say(io: IOServer, channelId: string, content: string) {
  const authorId = await getBotUserId();
  const message = await prisma.message.create({
    data: { content, textChannelId: channelId, authorId },
    include: { author: { select: { username: true, avatarUrl: true } } },
  });
  io.to(`channel:${channelId}`).emit(SocketEvents.MessageNew, {
    id: message.id,
    textChannelId: message.textChannelId,
    authorId: message.authorId,
    authorUsername: message.author.username,
    authorAvatarUrl: message.author.avatarUrl,
    content: message.content,
    imageUrl: null,
    createdAt: message.createdAt.toISOString(),
    editedAt: null,
    reactions: [],
    replyTo: null,
  });
}

const HELP = [
  "🎲 Тривия бот — команди:",
  "!trivia — 5 въпроса на български",
  "!trivia 10 — 10 въпроса (до 20)",
  "!trivia en — въпроси на английски (от Open Trivia DB)",
  "!top — класация на сървъра",
  "!стоп — спира текущата игра",
  "Отговаряш с буква A, B, C или D. Първият верен отговор печели точки — по-бърз отговор = повече точки.",
].join("\n");

function formatQuestion(game: Game): string {
  const q = game.current!;
  return [
    `❓ Въпрос ${game.index + 1}/${game.questions.length} · ${q.category}`,
    q.question,
    ...q.options.map((o, i) => `${LETTERS[i]}) ${o}`),
    `⏱ ${ANSWER_SECONDS} секунди — пиши A, B, C или D`,
  ].join("\n");
}

function answerLabel(q: TriviaQuestion): string {
  return `${LETTERS[q.correct]}) ${q.options[q.correct]}`;
}

async function ask(io: IOServer, game: Game) {
  if (games.get(game.channelId) !== game) return;
  if (game.index >= game.questions.length) return finish(io, game);
  game.current = game.questions[game.index]!;
  game.openedAt = Date.now();
  game.wrong.clear();
  await say(io, game.channelId, formatQuestion(game));
  game.timer = setTimeout(() => void onTimeout(io, game), ANSWER_SECONDS * 1000);
}

function next(io: IOServer, game: Game) {
  game.current = null;
  game.index += 1;
  game.timer = setTimeout(() => void ask(io, game), PAUSE_MS);
}

async function onTimeout(io: IOServer, game: Game) {
  if (games.get(game.channelId) !== game || !game.current) return;
  const q = game.current;
  await say(io, game.channelId, `⌛ Времето изтече! Верният отговор е ${answerLabel(q)}`);
  next(io, game);
}

async function finish(io: IOServer, game: Game) {
  games.delete(game.channelId);
  const board = [...game.session.values()].sort((a, b) => b.points - a.points);
  if (board.length === 0) {
    await say(io, game.channelId, "🏁 Играта приключи — този път никой не отговори вярно. Напиши !trivia за нова.");
    return;
  }
  const medals = ["🥇", "🥈", "🥉"];
  const lines = board.map((p, i) => `${medals[i] ?? `${i + 1}.`} ${p.name} — ${p.points} т. (${p.correct} верни)`);
  await say(io, game.channelId, ["🏁 Край на играта! Резултати:", ...lines, "Нова игра: !trivia · Класация: !top"].join("\n"));
}

function parseAnswer(text: string, q: TriviaQuestion): number | null {
  const t = text.trim().toUpperCase().replace(/[.)]+$/, "");
  // Cyrillic А/В/С look like Latin A/B/C — accept them too.
  const map: Record<string, number> = { A: 0, "А": 0, B: 1, "В": 1, C: 2, "С": 2, D: 3, "Д": 3, "1": 0, "2": 1, "3": 2, "4": 3 };
  if (t in map) return map[t]! < q.options.length ? map[t]! : null;
  const byText = q.options.findIndex((o) => o.toUpperCase() === text.trim().toUpperCase());
  return byText >= 0 ? byText : null;
}

async function award(game: Game, userId: string, name: string, points: number) {
  const cur = game.session.get(userId) ?? { name, points: 0, correct: 0 };
  cur.points += points;
  cur.correct += 1;
  game.session.set(userId, cur);
  await prisma.triviaScore.upsert({
    where: { serverId_userId: { serverId: game.serverId, userId } },
    update: { points: { increment: points }, correct: { increment: 1 } },
    create: { serverId: game.serverId, userId, points, correct: 1 },
  });
}

async function leaderboard(io: IOServer, channelId: string, serverId: string) {
  const rows = await prisma.triviaScore.findMany({
    where: { serverId },
    orderBy: { points: "desc" },
    take: 10,
    include: { user: { select: { username: true } } },
  });
  if (rows.length === 0) {
    await say(io, channelId, "📊 Още няма резултати. Напиши !trivia и започни първата игра!");
    return;
  }
  const medals = ["🥇", "🥈", "🥉"];
  await say(
    io,
    channelId,
    ["📊 Класация на сървъра:", ...rows.map((r, i) => `${medals[i] ?? `${i + 1}.`} ${r.user.username} — ${r.points} т. (${r.correct} верни)`)].join("\n"),
  );
}

async function start(io: IOServer, channelId: string, serverId: string, args: string[]) {
  if (games.has(channelId)) {
    await say(io, channelId, "Вече има игра в този канал. Напиши !стоп, за да я спреш.");
    return;
  }
  const english = args.some((a) => a.toLowerCase() === "en");
  const nArg = args.map((a) => Number.parseInt(a, 10)).find((n) => Number.isFinite(n));
  const count = Math.min(Math.max(nArg ?? 5, 1), 20);

  let questions: TriviaQuestion[] | null = null;
  if (english) {
    questions = await fetchEnglish(count);
    if (!questions) await say(io, channelId, "Не успях да взема английски въпроси — играем на български.");
  }
  questions ??= pickBulgarian(count);

  const game: Game = {
    channelId,
    serverId,
    questions,
    index: 0,
    current: null,
    openedAt: 0,
    timer: null,
    wrong: new Set(),
    session: new Map(),
  };
  games.set(channelId, game);
  await say(io, channelId, `🎲 Тривия — ${questions.length} въпроса! Отговаряй с A, B, C или D. Първият верен печели точки. Готови ли сте?`);
  game.timer = setTimeout(() => void ask(io, game), PAUSE_MS);
}

/** Called for every user message sent in a trivia channel. */
export async function handleTriviaMessage(
  io: IOServer,
  channel: { id: string; serverId: string },
  userId: string,
  username: string,
  content: string,
) {
  const text = content.trim();
  const lower = text.toLowerCase();

  if (lower.startsWith("!")) {
    const [cmd, ...args] = lower.slice(1).split(/\s+/);
    if (cmd === "trivia" || cmd === "тривия") return start(io, channel.id, channel.serverId, args);
    if (cmd === "top" || cmd === "класация") return leaderboard(io, channel.id, channel.serverId);
    if (cmd === "help" || cmd === "помощ") return say(io, channel.id, HELP);
    if (cmd === "stop" || cmd === "стоп") {
      const game = games.get(channel.id);
      if (!game) return say(io, channel.id, "Няма активна игра.");
      if (game.timer) clearTimeout(game.timer);
      games.delete(channel.id);
      return say(io, channel.id, "⏹ Играта е спряна.");
    }
    return;
  }

  const game = games.get(channel.id);
  if (!game?.current) return;
  const q = game.current;
  const picked = parseAnswer(text, q);
  if (picked === null || game.wrong.has(userId)) return;

  if (picked !== q.correct) {
    game.wrong.add(userId); // one try per question
    return;
  }

  if (game.timer) clearTimeout(game.timer);
  const secondsLeft = Math.max(0, ANSWER_SECONDS - (Date.now() - game.openedAt) / 1000);
  const points = 10 + Math.ceil(secondsLeft / 5);
  game.current = null;
  await award(game, userId, username, points);
  await say(io, channel.id, `✅ ${username} отговори вярно: ${answerLabel(q)} (+${points} т.)`);
  next(io, game);
}
