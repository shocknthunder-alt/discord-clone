import { SocketEvents, type VoicePeerInfo } from "@discord-clone/shared";
import { useCallback } from "react";
import { connectMediaSocket, disconnectMediaSocket } from "../socket/mediaSocket";
import { getSocket } from "../socket/socket";
import { useAuthStore } from "../store/authStore";
import { useVoiceStore } from "../store/voiceStore";
import { getPreferredMicDeviceId } from "./devicePrefs";
import { SfuMediaManager } from "./SfuMediaManager";

// Module-level singleton: join/leave/mute/screenshare can be triggered from different
// components (ChannelList, FloatingVoiceHud), all of which must share the same manager
// and live connections rather than each hook instance getting its own.
let activeMediaManager: SfuMediaManager | null = null;

// Looks up a roster entry by userId to resolve a RemotePeer's socketId — the SFU's own
// callbacks carry userId (the only identifier shared between it and the Render roster;
// the two servers' socket ids are otherwise unrelated), while voiceStore.peers is still
// keyed by the Render voice socketId everywhere else.
function upsertPeerMediaByUserId(userId: string, partial: Record<string, unknown>) {
  for (const peer of useVoiceStore.getState().peers.values()) {
    if (peer.userId !== userId) continue;
    useVoiceStore.getState().upsertPeer({ socketId: peer.socketId, ...partial });
  }
}

export function useVoiceChannel() {
  const store = useVoiceStore();

  const joinVoiceChannel = useCallback(async (voiceChannelId: string) => {
    const socket = getSocket();
    const token = useAuthStore.getState().token;
    if (!socket || !token) return;

    const preferredMicId = getPreferredMicDeviceId();
    const localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        ...(preferredMicId ? { deviceId: { exact: preferredMicId } } : {}),
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        // 48kHz mono is the Opus "fullband" sweet spot — higher than the browser's
        // default capture rate, paired with the bitrate tuning in mediasoupConfig.ts.
        sampleRate: { ideal: 48000 },
        channelCount: 1,
      },
    });
    store.setLocalStream(localStream);
    store.setActiveVoiceChannel(voiceChannelId);

    const mediaSocket = connectMediaSocket(token);
    const manager = new SfuMediaManager(mediaSocket, {
      onAudioStream: (userId, stream) => {
        upsertPeerMediaByUserId(userId, { audioStream: stream });
      },
      onScreenStream: (userId, stream) => {
        upsertPeerMediaByUserId(userId, { screenStream: stream, isScreenSharing: !!stream });
      },
      onQualityChange: (quality) => {
        useVoiceStore.getState().setConnectionQuality(quality);
      },
      onPeerQualityChange: (userId, quality, rttMs) => {
        for (const peer of useVoiceStore.getState().peers.values()) {
          if (peer.userId !== userId) continue;
          useVoiceStore.getState().setPeerQuality(peer.socketId, quality, rttMs);
        }
      },
    });
    activeMediaManager = manager;

    // Room joins only once the media socket is actually connected — on a fresh connect
    // this can race the "connect" event, mediaSocket.connected covers the reconnect case.
    await new Promise<void>((resolve) => {
      if (mediaSocket.connected) resolve();
      else mediaSocket.once("connect", () => resolve());
    });
    try {
      await manager.join(voiceChannelId);
      await manager.produceMic(localStream.getAudioTracks()[0]);
    } catch (err) {
      // Logged rather than re-thrown: the Render roster join below still has to run even
      // if the SFU side failed, so the user at least shows up in the channel instead of
      // silently vanishing — audio for them would be broken either way, but this makes
      // that failure visible in devtools instead of a confusing "can't hear/be heard" with
      // nothing to go on.
      console.error("SFU join/produce failed", err);
    }

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
          screenShareLabel: peer.screenShareLabel,
        });
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
      },
    );

    socket.on(SocketEvents.VoicePeerLeft, ({ socketId }: { socketId: string }) => {
      useVoiceStore.getState().removePeer(socketId);
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

    socket.on(
      SocketEvents.ScreenShareStarted,
      ({ socketId, label }: { socketId: string; label: string | null }) => {
        // isScreenSharing has to be set here, not just screenShareLabel — the UI's "someone
        // is sharing" indicator reads isScreenSharing directly, and it would otherwise only
        // ever flip true once the SFU consumer for the screen track happens to arrive
        // (onScreenStream below), which is a separate, best-effort path that can lag behind
        // or — for a peer who joined the voice channel after this share already started —
        // never fire the "started" transition at all, leaving a share that's actually live
        // showing no indicator whatsoever.
        useVoiceStore.getState().upsertPeer({ socketId, screenShareLabel: label, isScreenSharing: true });
      },
    );

    socket.on(SocketEvents.ScreenShareStopped, ({ socketId }: { socketId: string }) => {
      useVoiceStore.getState().upsertPeer({
        socketId,
        screenStream: null,
        isScreenSharing: false,
        screenShareLabel: null,
      });
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
      socket.off(SocketEvents.ScreenShareStarted);
      socket.off(SocketEvents.ScreenShareStopped);
    }

    activeMediaManager?.leave();
    activeMediaManager = null;
    disconnectMediaSocket();

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
    activeMediaManager?.setMicEnabled(!next);
    store.setMuted(next);
    socket.emit(SocketEvents.VoiceMute, { voiceChannelId: activeVoiceChannelId, isMuted: next });
  }, [store]);

  const toggleDeafen = useCallback(() => {
    const socket = getSocket();
    const { activeVoiceChannelId, isDeafened, localStream } = useVoiceStore.getState();
    if (!socket || !activeVoiceChannelId) return;

    const next = !isDeafened;
    store.setDeafened(next);
    socket.emit(SocketEvents.VoiceDeafen, { voiceChannelId: activeVoiceChannelId, isDeafened: next });

    // Deafening also mutes the mic (nobody can hear you if you can't hear them anyway),
    // and un-deafening restores it — mirrors Discord's behavior.
    localStream?.getAudioTracks().forEach((t) => (t.enabled = !next));
    activeMediaManager?.setMicEnabled(!next);
    store.setMuted(next);
    socket.emit(SocketEvents.VoiceMute, { voiceChannelId: activeVoiceChannelId, isMuted: next });
  }, [store]);

  const toggleScreenShare = useCallback(async () => {
    const socket = getSocket();
    const { activeVoiceChannelId, isScreenSharing } = useVoiceStore.getState();
    if (!socket || !activeVoiceChannelId || !activeMediaManager) return;

    if (isScreenSharing) {
      activeMediaManager.stopScreenShare();
      store.setLocalScreenStream(null);
      store.setScreenSharing(false);
      socket.emit(SocketEvents.ScreenShareStop, { voiceChannelId: activeVoiceChannelId });
      return;
    }

    const screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        // Up to 4K — unlike the old mesh sender, this capture/bitrate no longer gets
        // multiplied by viewer count (the SFU receives ONE copy regardless of audience
        // size), so there's no reason to cap it low anymore. Still useful even when
        // displayed small in the panel, and matters once a viewer goes fullscreen.
        width: { ideal: 3840 },
        height: { ideal: 2160 },
        frameRate: { ideal: 30, max: 60 },
      },
      // Capture the shared tab/system audio too (e.g. a YouTube clip) — without this the
      // viewer only ever gets video. Chrome asks separately for this when sharing a tab;
      // echoCancellation/noiseSuppression/autoGainControl are mic-tuned and distort music
      // or video playback, so turn them off for this stream specifically.
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    store.setLocalScreenStream(screenStream);
    store.setScreenSharing(true);
    await activeMediaManager.startScreenShare(screenStream);

    const displaySurface = screenStream.getVideoTracks()[0]?.getSettings().displaySurface;
    const label =
      displaySurface === "monitor"
        ? "Entire Screen"
        : displaySurface === "window"
          ? "a Window"
          : displaySurface === "browser"
            ? "a Browser Tab"
            : null;
    socket.emit(SocketEvents.ScreenShareStart, { voiceChannelId: activeVoiceChannelId, label });

    screenStream.getVideoTracks()[0].onended = () => {
      void toggleScreenShare();
    };
  }, [store]);

  return { joinVoiceChannel, leaveVoiceChannel, toggleMute, toggleDeafen, toggleScreenShare };
}
