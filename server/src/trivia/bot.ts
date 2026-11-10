import { SocketEvents } from "@discord-clone/shared";
import type { Server as IOServer } from "socket.io";
import { prisma } from "../db.js";
import { CATEGORIES, POOL_SIZE, buildDeck, fetchEnglish, resolveCategory, type TriviaQuestion } from "./questions.js";

/**
 * Old-school IRC trivia (in the spirit of the classic mIRC trivia scripts): a question is
 * posted as plain text, everybody types the answer freely, and every few seconds the bot
 * drops a hint with more of the answer revealed — the later you answer, the fewer points.
 * The game keeps running until someone says !стоп (or nobody has played for a while).
 */

const BOT_EMAIL = "trivia-bot@shmirka.local";
const BOT_NAME = "Тривия Бот";

// Seconds from the question being asked; the last entry is the time-out.
const HINT_AT = [15, 28, 40];
const TIME_LIMIT = 52;
// Points by stage: no hint, after hint 1, 2, 3.
const POINTS = [10, 7, 5, 3];
const PAUSE_MS = 5000;
const IDLE_LIMIT = 3; // consecutive unanswered questions before the bot goes to sleep

interface Game {
  channelId: string;
  serverId: string;
  /** Questions still to ask (a finite game) or refilled on demand (endless). */
  queue: TriviaQuestion[];
  endless: boolean;
  english: boolean;
  /** Limit to these categories (Bulgarian mode); null = everything. */
  categories: string[] | null;
  total: number; // finite games only
  asked: number;
  current: TriviaQuestion | null;
  openedAt: number;
  stage: number; // how many hints have been shown
  revealOrder: number[];
  timers: ReturnType<typeof setTimeout>[];
  idleStreak: number;
  streakUser: string | null;
  streak: number;
  session: Map<string, { name: string; points: number; correct: number }>;
}

const games = new Map<string, Game>(); // channelId -> running game
// Questions already asked per server (kept while the process lives), so games don't repeat each other.
const seenByServer = new Map<string, Set<string>>();
let botUserId: string | null = null;

async function getBotUserId(): Promise<string> {
  if (botUserId) return botUserId;
  const bot = await prisma.user.upsert({
    where: { email: BOT_EMAIL },
    update: {},
    // Not a valid bcrypt hash, so nobody can log in as the bot.
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
  "!trivia — безкрайна игра на български (до !стоп)",
  "!trivia 15 — точно 15 въпроса",
  "!trivia география / наука / игри … — само една категория (!cats — списък)",
  "!trivia en — английски въпроси от интернет базите (хиляди)",
  "!hint — подсказка веднага · !skip — пропуска въпроса",
  "!score — твоите точки · !score име — на друг · !top — топ 10 на сървъра",
  "!стоп — спира играта",
  "Пиши отговора като обикновено съобщение. Подсказките идват сами, но всяка струва точки: 10 → 7 → 5 → 3. Верни отговори подред = серия 🔥",
].join("\n");

// ---------------------------------------------------------------- answer matching

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\b(the|a|an)\b/g, " ")
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

function isCorrect(text: string, q: TriviaQuestion): boolean {
  const guess = normalize(text);
  if (!guess || guess.length > 60) return false;
  for (const candidate of [q.answer, ...q.aliases]) {
    const target = normalize(candidate);
    if (!target) continue;
    if (guess === target) return true;
    // forgive a typo or two in longer answers
    const allowed = target.length >= 9 ? 2 : target.length >= 5 ? 1 : 0;
    if (allowed && Math.abs(guess.length - target.length) <= allowed && distance(guess, target) <= allowed) return true;
  }
  return false;
}

// ---------------------------------------------------------------- hints

function revealOrderFor(answer: string): number[] {
  const idx = [...answer].map((ch, i) => (/[\p{L}\p{N}]/u.test(ch) ? i : -1)).filter((i) => i >= 0);
  // First letter is always shown first, then the rest in random order.
  const rest = idx.slice(1);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j]!, rest[i]!];
  }
  return idx.length ? [idx[0]!, ...rest] : [];
}

function maskedAnswer(answer: string, order: number[], stage: number): string {
  const total = order.length;
  const share = [0, 0.3, 0.55, 0.8][Math.min(stage, 3)]!;
  const reveal = new Set(order.slice(0, Math.max(stage === 0 ? 0 : 1, Math.round(total * share))));
  return [...answer]
    .map((ch, i) => (/[\p{L}\p{N}]/u.test(ch) ? (reveal.has(i) ? ch : "_") : ch === " " ? "   " : ch))
    .join(" ");
}

// ---------------------------------------------------------------- game flow

function clearTimers(game: Game) {
  for (const t of game.timers) clearTimeout(t);
  game.timers = [];
}

async function ask(io: IOServer, game: Game) {
  if (games.get(game.channelId) !== game) return;
  if (!game.endless && game.asked >= game.total) return finish(io, game, "Това беше последният въпрос.");

  if (game.queue.length === 0) {
    const seen = seenByServer.get(game.serverId) ?? new Set<string>();
    seenByServer.set(game.serverId, seen);
    let more = game.english ? await fetchEnglish(20) : null;
    if (!more) {
      more = buildDeck(game.categories, seen);
      if (more.length === 0) {
        // the whole (selected) pool has been asked — start over
        seen.clear();
        more = buildDeck(game.categories, seen);
      }
    }
    game.queue = more;
  }
  const q = game.queue.shift()!;
  seenByServer.get(game.serverId)?.add(q.key);
  game.asked += 1;
  game.current = q;
  game.openedAt = Date.now();
  game.stage = 0;
  game.revealOrder = revealOrderFor(q.answer);

  const header = game.endless ? `Въпрос ${game.asked}` : `Въпрос ${game.asked}/${game.total}`;
  await say(io, game.channelId, `🎲 ${header} · ${q.category} · ${POINTS[0]} т.\n${q.question}`);

  HINT_AT.forEach((sec, i) => {
    game.timers.push(setTimeout(() => void showHint(io, game, i + 1), sec * 1000));
  });
  game.timers.push(setTimeout(() => void onTimeout(io, game), TIME_LIMIT * 1000));
}

async function showHint(io: IOServer, game: Game, stage: number) {
  if (games.get(game.channelId) !== game || !game.current || game.stage >= stage) return;
  game.stage = stage;
  await say(io, game.channelId, `💡 Подсказка ${stage} (${POINTS[stage]} т.):  ${maskedAnswer(game.current.answer, game.revealOrder, stage)}`);
}

function scheduleNext(io: IOServer, game: Game) {
  game.current = null;
  clearTimers(game);
  game.timers.push(setTimeout(() => void ask(io, game), PAUSE_MS));
}

async function onTimeout(io: IOServer, game: Game) {
  if (games.get(game.channelId) !== game || !game.current) return;
  const q = game.current;
  game.idleStreak += 1;
  game.streak = 0;
  game.streakUser = null;
  clearTimers(game);
  game.current = null;
  await say(io, game.channelId, `⌛ Времето изтече — никой не позна. Отговорът беше: ${q.answer}`);
  if (game.idleStreak >= IDLE_LIMIT) {
    return finish(io, game, "💤 Никой не играе — заспивам. Напиши !trivia, за да ме събудиш.");
  }
  scheduleNext(io, game);
}

async function finish(io: IOServer, game: Game, reason: string) {
  clearTimers(game);
  games.delete(game.channelId);
  const board = [...game.session.values()].sort((a, b) => b.points - a.points);
  const medals = ["🥇", "🥈", "🥉"];
  const lines = board.map((p, i) => `${medals[i] ?? `${i + 1}.`} ${p.name} — ${p.points} т. (${p.correct} верни)`);
  await say(
    io,
    game.channelId,
    [`🏁 ${reason}`, ...(lines.length ? ["Резултати от играта:", ...lines] : []), "Нова игра: !trivia · Класация: !top"].join("\n"),
  );
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
    ["📊 ТОП 10 на сървъра:", ...rows.map((r, i) => `${medals[i] ?? `${i + 1}.`} ${r.user.username} — ${r.points} т. (${r.correct} верни)`)].join("\n"),
  );
}

async function score(io: IOServer, channelId: string, serverId: string, userId: string, name: string, who?: string) {
  let targetId = userId;
  let targetName = name;
  if (who) {
    const found = await prisma.user.findFirst({ where: { username: { equals: who, mode: "insensitive" } } });
    if (!found) return say(io, channelId, `Не познавам играч „${who}“.`);
    targetId = found.id;
    targetName = found.username;
  }
  const row = await prisma.triviaScore.findUnique({ where: { serverId_userId: { serverId, userId: targetId } } });
  if (!row) return say(io, channelId, `${targetName} още няма точки.`);
  const better = await prisma.triviaScore.count({ where: { serverId, points: { gt: row.points } } });
  await say(io, channelId, `📈 ${targetName}: ${row.points} т., ${row.correct} верни отговора · място #${better + 1} на сървъра`);
}

async function start(io: IOServer, channelId: string, serverId: string, args: string[]) {
  if (games.has(channelId)) {
    await say(io, channelId, "Вече има игра в този канал. Напиши !стоп, за да я спреш.");
    return;
  }
  const english = args.some((a) => a === "en");
  const nArg = args.map((a) => Number.parseInt(a, 10)).find((n) => Number.isFinite(n));
  const endless = nArg === undefined;
  const total = Math.min(Math.max(nArg ?? 0, 1), 50);

  const wanted = args.filter((a) => a !== "en" && a !== "mix" && !/^\d+$/.test(a));
  const categories: string[] = [];
  for (const w of wanted) {
    const c = resolveCategory(w);
    if (!c) {
      await say(io, channelId, `Не познавам категория „${w}“. Налични: ${CATEGORIES.join(", ")}.`);
      return;
    }
    if (!categories.includes(c)) categories.push(c);
  }

  let queue: TriviaQuestion[] = [];
  if (english) {
    const got = await fetchEnglish(20);
    if (got) queue = got;
    else await say(io, channelId, "Не успях да взема английски въпроси — играем на български.");
  }

  const game: Game = {
    channelId,
    serverId,
    queue,
    endless,
    english: english && queue.length > 0,
    categories: categories.length ? categories : null,
    total,
    asked: 0,
    current: null,
    openedAt: 0,
    stage: 0,
    revealOrder: [],
    timers: [],
    idleStreak: 0,
    streakUser: null,
    streak: 0,
    session: new Map(),
  };
  games.set(channelId, game);
  await say(
    io,
    channelId,
    `🎲 Тривия започва!${categories.length ? ` Категория: ${categories.join(", ")}.` : english ? " (английски)" : ""} ${endless ? "Играем, докато някой напише !стоп." : `${total} въпроса.`}\nПиши отговорите като обикновени съобщения. Подсказки: !hint · пропускане: !skip · помощ: !help · категории: !cats`,
  );
  game.timers.push(setTimeout(() => void ask(io, game), PAUSE_MS));
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

  if (text.startsWith("!")) {
    const [cmd = "", ...args] = text.slice(1).toLowerCase().split(/\s+/);
    const game = games.get(channel.id);
    switch (cmd) {
      case "trivia":
      case "тривия":
        return start(io, channel.id, channel.serverId, args);
      case "top":
      case "top10":
      case "класация":
        return leaderboard(io, channel.id, channel.serverId);
      case "score":
      case "точки":
        return score(io, channel.id, channel.serverId, userId, username, text.split(/\s+/)[1]);
      case "cats":
      case "категории":
        return say(io, channel.id, `🗂 Категории: ${CATEGORIES.join(", ")}\nНапример: !trivia география · !trivia математика 10\nВъпроси в базата: ${POOL_SIZE}+ на български (плюс безкрайна математика и анаграми) и хиляди на английски с !trivia en.`);
      case "help":
      case "помощ":
        return say(io, channel.id, HELP);
      case "stop":
      case "стоп":
        if (!game) return say(io, channel.id, "Няма активна игра.");
        return finish(io, game, "Играта е спряна.");
      case "hint":
      case "подсказка":
        if (!game?.current) return;
        return showHint(io, game, Math.min(game.stage + 1, HINT_AT.length));
      case "skip":
      case "пропусни": {
        if (!game?.current) return;
        const q = game.current;
        clearTimers(game);
        game.current = null;
        game.streak = 0;
        game.streakUser = null;
        await say(io, channel.id, `⏭ Пропуснат. Отговорът беше: ${q.answer}`);
        return scheduleNext(io, game);
      }
      default:
        return;
    }
  }

  const game = games.get(channel.id);
  if (!game?.current || !isCorrect(text, game.current)) return;

  const q = game.current;
  game.current = null; // closes the question synchronously so a second right answer can't also score
  clearTimers(game);
  game.idleStreak = 0;
  if (game.streakUser === userId) game.streak += 1;
  else {
    game.streakUser = userId;
    game.streak = 1;
  }
  const bonus = Math.min(game.streak - 1, 5);
  const points = POINTS[game.stage]! + bonus;
  await award(game, userId, username, points);
  const total = game.session.get(userId)!.points;
  await say(
    io,
    channel.id,
    `✅ ${username} позна: ${q.answer}  (+${points} т.${bonus ? `, серия ${game.streak} 🔥` : ""}) · в играта: ${total} т.`,
  );
  scheduleNext(io, game);
}
export const __test = { isCorrect, maskedAnswer, revealOrderFor, normalize };
