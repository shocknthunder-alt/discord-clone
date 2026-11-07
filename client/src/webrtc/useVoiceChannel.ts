import { SocketEvents, type VoicePeerInfo } from "@discord-clone/shared";
import { useCallback } from "react";
import { getSocket } from "../socket/socket";
import { useVoiceStore } from "../store/voiceStore";
import { getPreferredMicDeviceId } from "./devicePrefs";
import { PeerConnectionManager } from "./PeerConnectionManager";

// Module-level singleton: join/leave/mute/screenshare can be triggered from different
// components (ChannelList, VoiceControlBar), all of which must share the same manager
// and live connections rather than each hook instance getting its own.
let activeManager: PeerConnectionManager | null = null;

export function useVoiceChannel() {
  const store = useVoiceStore();

  const joinVoiceChannel = useCallback(async (voiceChannelId: string) => {
    const socket = getSocket();
    if (!socket) return;

    const preferredMicId = getPreferredMicDeviceId();
    const localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        ...(preferredMicId ? { deviceId: { exact: preferredMicId } } : {}),
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        // 48kHz mono is the Opus "fullband" sweet spot — higher than the browser's
        // default capture rate, paired with the bitrate bump in PeerConnectionManager.
        sampleRate: { ideal: 48000 },
        channelCount: 1,
      },
    });
    store.setLocalStream(localStream);
    store.setActiveVoiceChannel(voiceChannelId);

    const manager = new PeerConnectionManager(socket, {
      onAudioStream: (socketId, userId, stream) => {
        useVoiceStore.getState().upsertPeer({ socketId, userId, audioStream: stream });
      },
      onScreenStream: (socketId, stream) => {
        useVoiceStore.getState().upsertPeer({ socketId, screenStream: stream, isScreenSharing: !!stream });
      },
      onPeerClosed: (socketId) => {
        useVoiceStore.getState().removePeer(socketId);
      },
      onQualityChange: (quality) => {
        useVoiceStore.getState().setConnectionQuality(quality);
      },
    });
    manager.setLocalStream(localStream);
    activeManager = manager;

    socket.on(SocketEvents.VoicePeers, ({ peers }: { peers: VoicePeerInfo[] }) => {
      for (const peer of peers) {
        useVoiceStore.getState().upsertPeer({
          socketId: peer.socketId,
          userId: peer.userId,
          username: peer.username,
          avatarUrl: peer.avatarUrl,
          isMuted: peer.isMuted,
          isDeafened: peer.isDeafened,
          isScreenSharing: peer.isScreenSharing,
        });
        manager.addPeerAndInitiate(peer.socketId, peer.userId);
      }
    });

    socket.on(
      SocketEvents.VoicePeerJoined,
      ({
        userId,
        username,
        avatarUrl,
        socketId,
      }: {
        userId: string;
        username: string;
        avatarUrl: string | null;
        socketId: string;
      }) => {
        useVoiceStore.getState().upsertPeer({ socketId, userId, username, avatarUrl });
        manager.registerIncomingPeer(socketId, userId);
      },
    );

    socket.on(SocketEvents.VoicePeerLeft, ({ socketId }: { socketId: string }) => {
      manager.removePeer(socketId);
    });

    socket.on(
      SocketEvents.VoicePeerState,
      ({ userId, isMuted, isDeafened }: { userId: string; isMuted?: boolean; isDeafened?: boolean }) => {
        for (const peer of useVoiceStore.getState().peers.values()) {
          if (peer.userId !== userId) continue;
          useVoiceStore.getState().upsertPeer({
            socketId: peer.socketId,
            ...(isMuted !== undefined ? { isMuted } : {}),
            ...(isDeafened !== undefined ? { isDeafened } : {}),
          });
        }
      },
    );

    socket.on(SocketEvents.ScreenShareStopped, ({ socketId }: { socketId: string }) => {
      useVoiceStore.getState().upsertPeer({ socketId, screenStream: null, isScreenSharing: false });
    });

    socket.emit(SocketEvents.VoiceJoin, { voiceChannelId });
  }, [store]);

  const leaveVoiceChannel = useCallback(() => {
    const socket = getSocket();
    const { activeVoiceChannelId, localStream, localScreenStream } = useVoiceStore.getState();

    if (socket && activeVoiceChannelId) {
      socket.emit(SocketEvents.VoiceLeave, { voiceChannelId: activeVoiceChannelId });
      socket.off(SocketEvents.VoicePeers);
      socket.off(SocketEvents.VoicePeerJoined);
      socket.off(SocketEvents.VoicePeerLeft);
      socket.off(SocketEvents.VoicePeerState);
      socket.off(SocketEvents.ScreenShareStopped);
    }

    activeManager?.closeAll();
    activeManager = null;

    localStream?.getTracks().forEach((t) => t.stop());
    localScreenStream?.getTracks().forEach((t) => t.stop());

    useVoiceStore.getState().reset();
  }, []);

  const toggleMute = useCallback(() => {
    const socket = getSocket();
    const { activeVoiceChannelId, localStream, isMuted } = useVoiceStore.getState();
    if (!socket || !activeVoiceChannelId || !localStream) return;

    const next = !isMuted;
    localStream.getAudioTracks().forEach((t) => (t.enabled = !next));
    store.setMuted(next);
    socket.emit(SocketEvents.VoiceMute, { voiceChannelId: activeVoiceChannelId, isMuted: next });
  }, [store]);

  const toggleDeafen = useCallback(() => {
    const socket = getSocket();
    const { activeVoiceChannelId, isDeafened } = useVoiceStore.getState();
    if (!socket || !activeVoiceChannelId) return;

    const next = !isDeafened;
    store.setDeafened(next);
    socket.emit(SocketEvents.VoiceDeafen, { voiceChannelId: activeVoiceChannelId, isDeafened: next });
  }, [store]);

  const toggleScreenShare = useCallback(async () => {
    const socket = getSocket();
    const { activeVoiceChannelId, isScreenSharing } = useVoiceStore.getState();
    if (!socket || !activeVoiceChannelId || !activeManager) return;

    if (isScreenSharing) {
      activeManager.stopScreenShare();
      store.setLocalScreenStream(null);
      store.setScreenSharing(false);
      socket.emit(SocketEvents.ScreenShareStop, { voiceChannelId: activeVoiceChannelId });
      return;
    }

    const screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        // Request up to 4K — the browser/source caps this at whatever the actual
        // display supports; the real quality lever is the sender bitrate set in
        // PeerConnectionManager.startScreenShare, since WebRTC's default bandwidth
        // estimate (~2 Mbps) looks blurry at 2K/4K regardless of captured resolution.
        width: { ideal: 3840 },
        height: { ideal: 2160 },
        frameRate: { ideal: 30, max: 60 },
      },
      audio: false,
    });
    store.setLocalScreenStream(screenStream);
    store.setScreenSharing(true);
    activeManager.startScreenShare(screenStream);
    socket.emit(SocketEvents.ScreenShareStart, { voiceChannelId: activeVoiceChannelId });

    screenStream.getVideoTracks()[0].onended = () => {
      void toggleScreenShare();
    };
  }, [store]);

  return { joinVoiceChannel, leaveVoiceChannel, toggleMute, toggleDeafen, toggleScreenShare };
}
