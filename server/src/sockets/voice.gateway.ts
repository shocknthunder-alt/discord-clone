import { SocketEvents, type VoicePeerInfo, type WebRTCSignal } from "@discord-clone/shared";
import type { Server as IOServer, Socket } from "socket.io";

const voiceRosters = new Map<string, Map<string, VoicePeerInfo>>();
const socketVoiceChannel = new Map<string, string>();

function roomName(voiceChannelId: string) {
  return `voice:${voiceChannelId}`;
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
}

export function registerVoiceGateway(io: IOServer, socket: Socket) {
  const userId: string = socket.data.userId;

  socket.on(SocketEvents.VoiceJoin, async ({ voiceChannelId }: { voiceChannelId: string }) => {
    // A socket can only be in one voice channel at a time.
    removeFromRoster(io, socket.id);

    await socket.join(roomName(voiceChannelId));

    const roster = voiceRosters.get(voiceChannelId) ?? new Map<string, VoicePeerInfo>();
    const existingPeers = Array.from(roster.values());

    const self: VoicePeerInfo = {
      userId,
      socketId: socket.id,
      isMuted: false,
      isDeafened: false,
      isScreenSharing: false,
    };
    roster.set(socket.id, self);
    voiceRosters.set(voiceChannelId, roster);
    socketVoiceChannel.set(socket.id, voiceChannelId);

    socket.emit(SocketEvents.VoicePeers, { peers: existingPeers });
    socket.to(roomName(voiceChannelId)).emit(SocketEvents.VoicePeerJoined, {
      userId,
      socketId: socket.id,
    });
  });

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

  socket.on(SocketEvents.ScreenShareStart, ({ voiceChannelId }: { voiceChannelId: string }) => {
    const peer = voiceRosters.get(voiceChannelId)?.get(socket.id);
    if (!peer) return;
    peer.isScreenSharing = true;
    io.to(roomName(voiceChannelId)).emit(SocketEvents.ScreenShareStarted, {
      userId,
      socketId: socket.id,
    });
  });

  socket.on(SocketEvents.ScreenShareStop, ({ voiceChannelId }: { voiceChannelId: string }) => {
    const peer = voiceRosters.get(voiceChannelId)?.get(socket.id);
    if (!peer) return;
    peer.isScreenSharing = false;
    io.to(roomName(voiceChannelId)).emit(SocketEvents.ScreenShareStopped, {
      userId,
      socketId: socket.id,
    });
  });
}

export function handleVoiceDisconnect(io: IOServer, socket: Socket) {
  removeFromRoster(io, socket.id);
}
