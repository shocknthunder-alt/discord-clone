import { SocketEvents, type VoicePeerInfo, type WebRTCSignal } from "@discord-clone/shared";
import type { Server as IOServer, Socket } from "socket.io";
import { prisma } from "../db.js";

const voiceRosters = new Map<string, Map<string, VoicePeerInfo>>();
const socketVoiceChannel = new Map<string, string>();
// Lets browsing-but-not-joined clients (anyone in the server) see who's already in each
// voice channel. Cached per voiceChannelId since the server a channel belongs to never
// changes, avoiding a DB round-trip on every join/leave.
const voiceChannelServerId = new Map<string, string>();

function roomName(voiceChannelId: string) {
  return `voice:${voiceChannelId}`;
}

async function getServerIdForVoiceChannel(voiceChannelId: string): Promise<string | null> {
  const cached = voiceChannelServerId.get(voiceChannelId);
  if (cached) return cached;

  const channel = await prisma.voiceChannel.findUnique({ where: { id: voiceChannelId }, select: { serverId: true } });
  if (channel) voiceChannelServerId.set(voiceChannelId, channel.serverId);
  return channel?.serverId ?? null;
}

// Drops roster entries whose socket no longer exists (a disconnect that was missed or raced a
// reconnect) so a user who has left can't linger as a ghost in the channel list.
function pruneDeadPeers(io: IOServer, voiceChannelId: string) {
  const roster = voiceRosters.get(voiceChannelId);
  if (!roster) return;
  for (const [socketId, peer] of Array.from(roster.entries())) {
    if (io.sockets.sockets.has(socketId)) continue;
    roster.delete(socketId);
    socketVoiceChannel.delete(socketId);
    io.to(roomName(voiceChannelId)).emit(SocketEvents.VoicePeerLeft, { userId: peer.userId, socketId });
  }
  if (roster.size === 0) voiceRosters.delete(voiceChannelId);
}

async function broadcastOccupants(io: IOServer, voiceChannelId: string) {
  pruneDeadPeers(io, voiceChannelId);
  const serverId = await getServerIdForVoiceChannel(voiceChannelId);
  if (!serverId) return;

  const roster = voiceRosters.get(voiceChannelId);
  io.to(`server:${serverId}`).emit(SocketEvents.VoiceChannelOccupants, {
    voiceChannelId,
    peers: roster ? Array.from(roster.values()) : [],
  });
}

function removeFromRoster(io: IOServer, socketId: string) {
  const voiceChannelId = socketVoiceChannel.get(socketId);
  if (!voiceChannelId) return;

  const roster = voiceRosters.get(voiceChannelId);
  const peer = roster?.get(socketId);
  roster?.delete(socketId);
  socketVoiceChannel.delete(socketId);

  if (peer) {
    io.to(roomName(voiceChannelId)).emit(SocketEvents.VoicePeerLeft, {
      userId: peer.userId,
      socketId,
    });
  }

  if (roster && roster.size === 0) {
    voiceRosters.delete(voiceChannelId);
  }

  void broadcastOccupants(io, voiceChannelId);
}

export function registerVoiceGateway(io: IOServer, socket: Socket) {
  const userId: string = socket.data.userId;
  const username: string = socket.data.username;
  const avatarUrl: string | null = socket.data.avatarUrl ?? null;

  // Lets a client see who's already in each voice channel before joining any of them —
  // fired whenever they open a server, independent of chat.gateway's own ServerJoin
  // handler (socket.io allows multiple listeners for the same event).
  socket.on(SocketEvents.ServerJoin, async ({ serverId }: { serverId: string }) => {
    const channels = await prisma.voiceChannel.findMany({ where: { serverId }, select: { id: true } });
    for (const channel of channels) {
      voiceChannelServerId.set(channel.id, serverId);
      pruneDeadPeers(io, channel.id);
      const roster = voiceRosters.get(channel.id);
      socket.emit(SocketEvents.VoiceChannelOccupants, {
        voiceChannelId: channel.id,
        peers: roster ? Array.from(roster.values()) : [],
      });
    }
  });

  socket.on(SocketEvents.VoiceJoin, async ({ voiceChannelId }: { voiceChannelId: string }) => {
    // A socket can only be in one voice channel at a time.
    removeFromRoster(io, socket.id);

    await socket.join(roomName(voiceChannelId));
    pruneDeadPeers(io, voiceChannelId);

    const roster = voiceRosters.get(voiceChannelId) ?? new Map<string, VoicePeerInfo>();
    const existingPeers = Array.from(roster.values());

    const self: VoicePeerInfo = {
      userId,
      username,
      avatarUrl,
      socketId: socket.id,
      isMuted: false,
      isDeafened: false,
      isScreenSharing: false,
      screenShareLabel: null,
    };
    roster.set(socket.id, self);
    voiceRosters.set(voiceChannelId, roster);
    socketVoiceChannel.set(socket.id, voiceChannelId);

    socket.emit(SocketEvents.VoicePeers, { peers: existingPeers });
    socket.to(roomName(voiceChannelId)).emit(SocketEvents.VoicePeerJoined, {
      userId,
      username,
      avatarUrl,
      socketId: socket.id,
    });
    void broadcastOccupants(io, voiceChannelId);
  });

  socket.on(
    SocketEvents.VoicePing,
    ({ voiceChannelId, rttMs }: { voiceChannelId: string; rttMs: number | null }) => {
      if (!voiceRosters.get(voiceChannelId)?.has(socket.id)) return;
      const rtt = typeof rttMs === "number" && Number.isFinite(rttMs) ? Math.min(Math.max(Math.round(rttMs), 0), 9999) : null;
      socket.to(roomName(voiceChannelId)).emit(SocketEvents.VoicePing, { userId, socketId: socket.id, rttMs: rtt });
    },
  );

  socket.on(
    SocketEvents.VoiceStreamStats,
    ({ voiceChannelId, stats }: { voiceChannelId: string; stats: Record<string, unknown> | null }) => {
      if (!voiceRosters.get(voiceChannelId)?.has(socket.id)) return;
      const num = (v: unknown, max: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(Math.max(v, 0), max) : 0);
      const limitations = ["none", "cpu", "bandwidth", "other"];
      const clean =
        stats && typeof stats === "object"
          ? {
              fps: Math.round(num(stats.fps, 240)),
              targetFps: Math.round(num(stats.targetFps, 240)),
              width: Math.round(num(stats.width, 16384)),
              height: Math.round(num(stats.height, 16384)),
              kbps: Math.round(num(stats.kbps, 1_000_000)),
              codec: typeof stats.codec === "string" ? stats.codec.slice(0, 16) : "",
              encoder: typeof stats.encoder === "string" ? stats.encoder.slice(0, 40) : "",
              hardware: stats.hardware === true,
              audio: stats.audio === true,
              limitation: limitations.includes(String(stats.limitation)) ? String(stats.limitation) : "none",
            }
          : null;
      socket.to(roomName(voiceChannelId)).emit(SocketEvents.VoiceStreamStats, { socketId: socket.id, stats: clean });
    },
  );

  socket.on(SocketEvents.VoiceLeave, ({ voiceChannelId }: { voiceChannelId: string }) => {
    removeFromRoster(io, socket.id);
    socket.leave(roomName(voiceChannelId));
  });

  socket.on(
    SocketEvents.VoiceSignal,
    ({ targetSocketId, signal }: { targetSocketId: string; signal: WebRTCSignal }) => {
      io.to(targetSocketId).emit(SocketEvents.VoiceSignal, { fromSocketId: socket.id, signal });
    },
  );

  socket.on(
    SocketEvents.VoiceMute,
    ({ voiceChannelId, isMuted }: { voiceChannelId: string; isMuted: boolean }) => {
      const peer = voiceRosters.get(voiceChannelId)?.get(socket.id);
      if (!peer) return;
      peer.isMuted = isMuted;
      io.to(roomName(voiceChannelId)).emit(SocketEvents.VoicePeerState, { userId, isMuted });
    },
  );

  socket.on(
    SocketEvents.VoiceDeafen,
    ({ voiceChannelId, isDeafened }: { voiceChannelId: string; isDeafened: boolean }) => {
      const peer = voiceRosters.get(voiceChannelId)?.get(socket.id);
      if (!peer) return;
      peer.isDeafened = isDeafened;
      io.to(roomName(voiceChannelId)).emit(SocketEvents.VoicePeerState, { userId, isDeafened });
    },
  );

  socket.on(
    SocketEvents.ScreenShareStart,
    ({ voiceChannelId, label }: { voiceChannelId: string; label: string | null }) => {
      const peer = voiceRosters.get(voiceChannelId)?.get(socket.id);
      if (!peer) return;
      peer.isScreenSharing = true;
      peer.screenShareLabel = label ?? null;
      io.to(roomName(voiceChannelId)).emit(SocketEvents.ScreenShareStarted, {
        userId,
        socketId: socket.id,
        label: peer.screenShareLabel,
      });
    },
  );

  socket.on(SocketEvents.ScreenShareStop, ({ voiceChannelId }: { voiceChannelId: string }) => {
    const peer = voiceRosters.get(voiceChannelId)?.get(socket.id);
    if (!peer) return;
    peer.isScreenSharing = false;
    peer.screenShareLabel = null;
    io.to(roomName(voiceChannelId)).emit(SocketEvents.ScreenShareStopped, {
      userId,
      socketId: socket.id,
    });
  });
}

export function handleVoiceDisconnect(io: IOServer, socket: Socket) {
  removeFromRoster(io, socket.id);
}
