import {
  SURV_HEROES,
  SURV_MAX_PLAYERS,
  SocketEvents,
  cleanSurvCurses,
  cleanSurvMeta,
  type SurvCurseId,
  type SurvHeroId,
  type SurvSkinId,
  type SurvLobbyDTO,
  type SurvMemberDTO,
  type SurvMemberEventDTO,
  type SurvOverDTO,
  type SurvPartyDTO,
  type SurvRelayDTO,
  type SurvStartDTO,
} from "@discord-clone/shared";
import type { Server as IOServer, Socket } from "socket.io";
import { prisma } from "./db.js";
import { survOwnsSkinOf } from "./survivors.js";

/**
 * 🧟 Шмиркленд co-op. The HOST's browser runs the whole game; the server only keeps parties (lobby per
 * channel, up to SURV_MAX_PLAYERS) and relays: host → everyone `surv:state` snapshots (volatile, ~15/s)
 * and `surv:msg` (offers, events), guests → host `surv:input` (volatile) and `surv:msg` (picks).
 * 👁 Spectators get the same snapshots. All in memory. If the host is gone for LEFT_GRACE_MS the party
 * ends ("host-left"); a guest who leaves is dropped from the game by the host (it gets `surv:member`).
 * Scores are saved by each person's own browser (REST /survivors/run).
 */

const LEFT_GRACE_MS = 10_000;
const MAX_RELAY_BYTES = 96 * 1024;

interface Party {
  id: string;
  channelId: string;
  hostId: string;
  players: SurvMemberDTO[];
  curses: SurvCurseId[];
  state: "lobby" | "playing";
  seconds: number;
  kills: number;
  /** 👁 socket ids */
  spectators: Set<string>;
  leftTimers: Map<string, ReturnType<typeof setTimeout>>;
}

/** channelId → socketId → userId */
const watchers = new Map<string, Map<string, string>>();
const parties = new Map<string, Party>();
const channelOk = new Map<string, string>(); // channelId → serverId
let seq = 0;

const room = (channelId: string) => `surv:${channelId}`;
const heroIds = new Set<string>(SURV_HEROES.map((h) => h.id));
const cleanHero = (h: unknown): SurvHeroId | null => (typeof h === "string" && heroIds.has(h) ? (h as SurvHeroId) : null);

async function canWatch(channelId: string, userId: string): Promise<boolean> {
  let serverId = channelOk.get(channelId);
  if (!serverId) {
    const ch = await prisma.textChannel.findUnique({ where: { id: channelId }, select: { serverId: true, type: true } });
    if (!ch || ch.type !== "survivors") return false;
    serverId = ch.serverId;
    channelOk.set(channelId, serverId);
  }
  const m = await prisma.membership.findUnique({ where: { userId_serverId: { userId, serverId } }, select: { userId: true } });
  return !!m;
}

function socketsOf(channelId: string, userId: string): string[] {
  const w = watchers.get(channelId);
  return w ? [...w].filter(([, u]) => u === userId).map(([s]) => s) : [];
}
function emitTo(io: IOServer, channelId: string, userId: string, event: string, data: unknown) {
  for (const s of socketsOf(channelId, userId)) io.to(s).emit(event, data);
}

const partyOf = (userId: string) => [...parties.values()].find((p) => p.players.some((m) => m.userId === userId));

function dto(p: Party): SurvPartyDTO {
  return {
    id: p.id,
    channelId: p.channelId,
    hostId: p.hostId,
    players: p.players,
    curses: p.curses,
    state: p.state,
    ...(p.state === "playing" ? { seconds: p.seconds, kills: p.kills } : {}),
    spectators: p.spectators.size,
  };
}
function lobby(channelId: string): SurvLobbyDTO {
  return { channelId, parties: [...parties.values()].filter((p) => p.channelId === channelId).map(dto) };
}
function pushLobby(io: IOServer, channelId: string) {
  io.to(room(channelId)).emit(SocketEvents.SurvLobby, lobby(channelId));
}

function startDto(p: Party, extra: Partial<SurvStartDTO> = {}): SurvStartDTO {
  return { partyId: p.id, channelId: p.channelId, hostId: p.hostId, players: p.players, curses: p.curses, ...extra };
}

function endParty(io: IOServer, p: Party, reason: SurvOverDTO["reason"]) {
  if (!parties.has(p.id)) return;
  parties.delete(p.id);
  for (const t of p.leftTimers.values()) clearTimeout(t);
  if (p.state === "playing") {
    const over: SurvOverDTO = { partyId: p.id, reason, seconds: p.seconds, kills: p.kills };
    for (const m of p.players) emitTo(io, p.channelId, m.userId, SocketEvents.SurvOver, over);
    for (const s of p.spectators) io.to(s).emit(SocketEvents.SurvOver, over);
  }
  pushLobby(io, p.channelId);
}

/** Someone left the party (or closed the channel for good). */
function dropMember(io: IOServer, p: Party, userId: string) {
  if (p.hostId === userId) {
    if (p.state === "lobby" && p.players.length > 1) {
      // the next one hosts the lobby
      p.players = p.players.filter((m) => m.userId !== userId);
      p.hostId = p.players[0]!.userId;
      pushLobby(io, p.channelId);
      return;
    }
    return endParty(io, p, "host-left");
  }
  p.players = p.players.filter((m) => m.userId !== userId);
  if (p.state === "playing") emitTo(io, p.channelId, p.hostId, SocketEvents.SurvMember, { partyId: p.id, userId, kind: "left" } satisfies SurvMemberEventDTO);
  pushLobby(io, p.channelId);
}

function unwatch(io: IOServer, socket: Socket, channelId: string) {
  const w = watchers.get(channelId);
  if (!w?.has(socket.id)) return;
  const userId = w.get(socket.id)!;
  w.delete(socket.id);
  if (w.size === 0) watchers.delete(channelId);
  void socket.leave(room(channelId));
  for (const p of parties.values()) if (p.channelId === channelId && p.spectators.delete(socket.id)) pushLobby(io, channelId);
  if (socketsOf(channelId, userId).length) return; // still open in another tab
  const p = partyOf(userId);
  if (!p || p.channelId !== channelId) return;
  if (p.state === "lobby") return dropMember(io, p, userId);
  if (!p.leftTimers.has(userId)) {
    p.leftTimers.set(
      userId,
      setTimeout(() => {
        p.leftTimers.delete(userId);
        if (parties.has(p.id) && !socketsOf(channelId, userId).length) dropMember(io, p, userId);
      }, LEFT_GRACE_MS),
    );
  }
}

/** Snapshots carry an ArrayBuffer; keep relays small. */
function sizeOk(d: unknown): boolean {
  if (d === null || d === undefined) return true;
  try {
    let bytes = 0;
    const walk = (v: unknown, depth: number): void => {
      if (bytes > MAX_RELAY_BYTES || depth > 6) {
        bytes = Infinity;
        return;
      }
      if (v instanceof ArrayBuffer || ArrayBuffer.isView(v)) bytes += (v as ArrayBuffer).byteLength;
      else if (typeof v === "string") bytes += v.length;
      else if (Array.isArray(v)) {
        bytes += v.length * 4;
        for (const x of v) if (typeof x === "object" && x !== null) walk(x, depth + 1);
      } else if (typeof v === "object" && v !== null) for (const x of Object.values(v)) walk(x, depth + 1);
      else bytes += 8;
    };
    walk(d, 0);
    return bytes <= MAX_RELAY_BYTES;
  } catch {
    return false;
  }
}

export function registerSurvivorsCoopGateway(io: IOServer, socket: Socket) {
  const userId: string = socket.data.userId;
  const watching = new Set<string>();

  const myParty = (partyId: unknown) => {
    const p = typeof partyId === "string" ? parties.get(partyId) : undefined;
    return p && watching.has(p.channelId) && p.players.some((m) => m.userId === userId) ? p : undefined;
  };

  socket.on(SocketEvents.SurvWatch, async ({ channelId }: { channelId: string }) => {
    if (typeof channelId !== "string" || !(await canWatch(channelId, userId))) return;
    watching.add(channelId);
    await socket.join(room(channelId));
    const w = watchers.get(channelId) ?? new Map<string, string>();
    w.set(socket.id, userId);
    watchers.set(channelId, w);
    socket.emit(SocketEvents.SurvLobby, lobby(channelId));
    // back after a reload / reconnect
    const p = partyOf(userId);
    if (p && p.channelId === channelId && p.state === "playing") {
      const t = p.leftTimers.get(userId);
      if (t) clearTimeout(t);
      p.leftTimers.delete(userId);
      socket.emit(SocketEvents.SurvStarted, startDto(p, { resume: true }));
      if (p.hostId !== userId) emitTo(io, channelId, p.hostId, SocketEvents.SurvMember, { partyId: p.id, userId, kind: "back" } satisfies SurvMemberEventDTO);
    }
  });

  socket.on(SocketEvents.SurvUnwatch, ({ channelId }: { channelId: string }) => {
    if (typeof channelId !== "string") return;
    watching.delete(channelId);
    unwatch(io, socket, channelId);
  });

  const skinOf = async (hero: SurvHeroId, skin: unknown): Promise<SurvSkinId> =>
    typeof skin === "string" && (await survOwnsSkinOf(userId, hero, skin as SurvSkinId)) ? (skin as SurvSkinId) : "classic";
  const me = async (hero: SurvHeroId, meta: unknown, skin: unknown): Promise<SurvMemberDTO | null> => {
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { username: true, avatarUrl: true } });
    return u ? { userId, username: u.username, avatarUrl: u.avatarUrl, hero, meta: cleanSurvMeta(meta), skin: await skinOf(hero, skin) } : null;
  };

  socket.on(SocketEvents.SurvCreate, async ({ channelId, hero, curses, meta, skin }: { channelId: string; hero: unknown; curses: unknown; meta?: unknown; skin?: unknown }) => {
    const h = cleanHero(hero);
    if (typeof channelId !== "string" || !watching.has(channelId) || !h) return;
    const old = partyOf(userId);
    if (old) {
      if (old.state === "playing") return;
      dropMember(io, old, userId);
    }
    const m = await me(h, meta, skin);
    if (!m) return;
    const p: Party = {
      id: `s${Date.now().toString(36)}${++seq}`,
      channelId,
      hostId: userId,
      players: [m],
      curses: cleanSurvCurses(curses),
      state: "lobby",
      seconds: 0,
      kills: 0,
      spectators: new Set(),
      leftTimers: new Map(),
    };
    parties.set(p.id, p);
    pushLobby(io, channelId);
  });

  socket.on(SocketEvents.SurvJoin, async ({ partyId, hero, meta, skin }: { partyId: string; hero: unknown; meta?: unknown; skin?: unknown }) => {
    const h = cleanHero(hero);
    const p = typeof partyId === "string" ? parties.get(partyId) : undefined;
    if (!p || !h || !watching.has(p.channelId) || p.state !== "lobby" || p.players.length >= SURV_MAX_PLAYERS) return;
    if (p.players.some((m) => m.userId === userId)) return;
    const old = partyOf(userId);
    if (old) {
      if (old.state === "playing") return;
      dropMember(io, old, userId);
    }
    const m = await me(h, meta, skin);
    if (!m || !parties.has(p.id) || p.players.length >= SURV_MAX_PLAYERS) return;
    p.players.push(m);
    pushLobby(io, p.channelId);
  });

  socket.on(SocketEvents.SurvLeave, ({ partyId }: { partyId: string }) => {
    const p = myParty(partyId);
    if (p) dropMember(io, p, userId);
  });

  socket.on(SocketEvents.SurvSetup, async ({ partyId, hero, curses, skin }: { partyId: string; hero?: unknown; curses?: unknown; skin?: unknown }) => {
    const p = myParty(partyId);
    if (!p || p.state !== "lobby") return;
    const h = cleanHero(hero);
    if (h) {
      const sk = await skinOf(h, skin);
      p.players = p.players.map((m) => (m.userId === userId ? { ...m, hero: h, skin: sk } : m));
    }
    if (curses !== undefined && p.hostId === userId) p.curses = cleanSurvCurses(curses);
    pushLobby(io, p.channelId);
  });

  socket.on(SocketEvents.SurvStart, ({ partyId }: { partyId: string }) => {
    const p = myParty(partyId);
    if (!p || p.hostId !== userId || p.state !== "lobby") return;
    // people who closed the channel meanwhile don't come along
    p.players = p.players.filter((m) => socketsOf(p.channelId, m.userId).length);
    if (!p.players.length) return endParty(io, p, "stopped");
    p.state = "playing";
    for (const m of p.players) emitTo(io, p.channelId, m.userId, SocketEvents.SurvStarted, startDto(p));
    pushLobby(io, p.channelId);
  });

  // host → guests + spectators (snapshots are volatile: a late one is useless)
  socket.on(SocketEvents.SurvState, (msg: SurvRelayDTO) => {
    const p = myParty(msg?.partyId);
    if (!p || p.hostId !== userId || p.state !== "playing" || !sizeOk(msg.d)) return;
    const out: SurvRelayDTO = { partyId: p.id, from: userId, d: msg.d };
    for (const m of p.players) if (m.userId !== userId) for (const s of socketsOf(p.channelId, m.userId)) io.to(s).volatile.emit(SocketEvents.SurvState, out);
    for (const s of p.spectators) io.to(s).volatile.emit(SocketEvents.SurvState, out);
  });

  // guest → host
  socket.on(SocketEvents.SurvInput, (msg: SurvRelayDTO) => {
    const p = myParty(msg?.partyId);
    if (!p || p.hostId === userId || p.state !== "playing" || !sizeOk(msg.d)) return;
    for (const s of socketsOf(p.channelId, p.hostId)) io.to(s).volatile.emit(SocketEvents.SurvInput, { partyId: p.id, from: userId, d: msg.d } satisfies SurvRelayDTO);
  });

  // reliable both ways: host → one / all, guest → host
  socket.on(SocketEvents.SurvMsg, (msg: SurvRelayDTO) => {
    const p = myParty(msg?.partyId);
    if (!p || p.state !== "playing" || !sizeOk(msg.d)) return;
    const out: SurvRelayDTO = { partyId: p.id, from: userId, d: msg.d };
    if (p.hostId !== userId) return emitTo(io, p.channelId, p.hostId, SocketEvents.SurvMsg, out);
    if (typeof msg.to === "string") return emitTo(io, p.channelId, msg.to, SocketEvents.SurvMsg, out);
    for (const m of p.players) if (m.userId !== userId) emitTo(io, p.channelId, m.userId, SocketEvents.SurvMsg, out);
    for (const s of p.spectators) io.to(s).emit(SocketEvents.SurvMsg, out);
  });

  socket.on(SocketEvents.SurvProgress, ({ partyId, seconds, kills }: { partyId: string; seconds: unknown; kills: unknown }) => {
    const p = myParty(partyId);
    if (!p || p.hostId !== userId || p.state !== "playing") return;
    if (typeof seconds === "number" && Number.isFinite(seconds)) p.seconds = Math.max(0, Math.round(seconds));
    if (typeof kills === "number" && Number.isFinite(kills)) p.kills = Math.max(0, Math.round(kills));
    pushLobby(io, p.channelId);
  });

  socket.on(SocketEvents.SurvEnd, ({ partyId, seconds, kills, reason }: { partyId: string; seconds: unknown; kills: unknown; reason?: unknown }) => {
    const p = myParty(partyId);
    if (!p || p.hostId !== userId) return;
    if (typeof seconds === "number" && Number.isFinite(seconds)) p.seconds = Math.max(0, Math.round(seconds));
    if (typeof kills === "number" && Number.isFinite(kills)) p.kills = Math.max(0, Math.round(kills));
    endParty(io, p, reason === "stopped" ? "stopped" : "dead");
  });

  socket.on(SocketEvents.SurvSpectate, ({ partyId }: { partyId: string }) => {
    const p = typeof partyId === "string" ? parties.get(partyId) : undefined;
    if (!p || p.state !== "playing" || !watching.has(p.channelId) || p.players.some((m) => m.userId === userId)) return;
    for (const other of parties.values()) other.spectators.delete(socket.id);
    p.spectators.add(socket.id);
    socket.emit(SocketEvents.SurvStarted, startDto(p, { spectator: true }));
    pushLobby(io, p.channelId);
  });

  socket.on(SocketEvents.SurvSpectateStop, ({ partyId }: { partyId: string }) => {
    const p = typeof partyId === "string" ? parties.get(partyId) : undefined;
    if (p?.spectators.delete(socket.id)) pushLobby(io, p.channelId);
  });

  socket.on("disconnect", () => {
    for (const channelId of watching) unwatch(io, socket, channelId);
    watching.clear();
  });
}
