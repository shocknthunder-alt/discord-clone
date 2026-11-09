import { extractYoutubeId, SocketEvents, type MusicState, type VoicePeerInfo } from "@discord-clone/shared";
import { useCallback } from "react";
import { connectMediaSocket, disconnectMediaSocket } from "../socket/mediaSocket";
import { getSocket } from "../socket/socket";
import { useAuthStore } from "../store/authStore";
import { useMusicStore } from "../store/musicStore";
import { useVoiceStore } from "../store/voiceStore";
import {
  getAutoGainControlEnabled,
  getEchoCancellationEnabled,
  getHighpassFilterEnabled,
  getNoiseGateEnabled,
  getNoiseGateSensitivity,
  getNoiseSuppressionEnabled,
  getPreferredMicDeviceId,
  setAutoGainControlEnabled as persistAutoGainControlEnabled,
  setEchoCancellationEnabled as persistEchoCancellationEnabled,
  setHighpassFilterEnabled as persistHighpassFilterEnabled,
  setNoiseGateEnabled as persistNoiseGateEnabled,
  setNoiseGateSensitivity as persistNoiseGateSensitivity,
  setNoiseSuppressionEnabled as persistNoiseSuppressionEnabled,
} from "./devicePrefs";
import { startMicProcessing, type MicProcessingHandle } from "./micProcessing";
import { SfuMediaManager } from "./SfuMediaManager";
import { playVoiceJoinLeaveSound } from "../utils/voiceSounds";
import { unlockMusicAudio } from "../music/musicPlayerEngine";

// Module-level singleton: join/leave/mute/screenshare can be triggered from different
// components (ChannelList, FloatingVoiceHud), all of which must share the same manager
// and live connections rather than each hook instance getting its own.
let activeMediaManager: SfuMediaManager | null = null;
let activeMicProcessing: MicProcessingHandle | null = null;

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

// Single source of truth for whether the mic should actually be sending: manual mute
// always wins, otherwise voice-activation mode transmits continuously and push-to-talk
// transmits only while its bound key is held. Called from every place one of those three
// inputs changes (mute toggle, deafen, mode switch, key press/release) instead of each of
// them duplicating this logic.
function applyMicTransmitState() {
  const { localStream, isMuted, micMode, isPushToTalkActive } = useVoiceStore.getState();
  if (!localStream) return;
  const shouldTransmit = !isMuted && (micMode === "voice-activation" || isPushToTalkActive);
  localStream.getAudioTracks().forEach((t) => (t.enabled = shouldTransmit));
  activeMediaManager?.setMicEnabled(shouldTransmit);
}

let pttKeydownHandler: ((e: KeyboardEvent) => void) | null = null;
let pttKeyupHandler: ((e: KeyboardEvent) => void) | null = null;

function attachPushToTalkListeners() {
  if (pttKeydownHandler) return; // already attached for this call
  pttKeydownHandler = (e: KeyboardEvent) => {
    const { micMode, pushToTalkKey, isPushToTalkActive } = useVoiceStore.getState();
    if (micMode !== "push-to-talk" || !pushToTalkKey || e.code !== pushToTalkKey || isPushToTalkActive) return;
    useVoiceStore.getState().setPushToTalkActive(true);
    applyMicTransmitState();
  };
  pttKeyupHandler = (e: KeyboardEvent) => {
    const { micMode, pushToTalkKey } = useVoiceStore.getState();
    if (micMode !== "push-to-talk" || !pushToTalkKey || e.code !== pushToTalkKey) return;
    useVoiceStore.getState().setPushToTalkActive(false);
    applyMicTransmitState();
  };
  window.addEventListener("keydown", pttKeydownHandler);
  window.addEventListener("keyup", pttKeyupHandler);
}

function detachPushToTalkListeners() {
  if (pttKeydownHandler) window.removeEventListener("keydown", pttKeydownHandler);
  if (pttKeyupHandler) window.removeEventListener("keyup", pttKeyupHandler);
  pttKeydownHandler = null;
  pttKeyupHandler = null;
}

export function useVoiceChannel() {
  const store = useVoiceStore();

  const joinVoiceChannel = useCallback(async (voiceChannelId: string) => {
    const socket = getSocket();
    const token = useAuthStore.getState().token;
    if (!socket || !token) return;

    // Joining is the click that satisfies the browser's autoplay policy — unlock the shared
    // music player now so the queue is audible without anyone touching it.
    unlockMusicAudio();

    const preferredMicId = getPreferredMicDeviceId();
    const localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        ...(preferredMicId ? { deviceId: { exact: preferredMicId } } : {}),
        echoCancellation: getEchoCancellationEnabled(),
        noiseSuppression: getNoiseSuppressionEnabled(),
        autoGainControl: getAutoGainControlEnabled(),
        // 48kHz mono is the Opus "fullband" sweet spot — higher than the browser's
        // default capture rate, paired with the bitrate tuning in mediasoupConfig.ts.
        sampleRate: { ideal: 48000 },
        channelCount: 1,
      },
    });
    store.setLocalStream(localStream);
    store.setActiveVoiceChannel(voiceChannelId);

    // Our own highpass + noise gate, layered on top of the browser's native
    // echo/noise/gain correction above — this is what actually gets sent to the SFU. The
    // raw localStream is untouched (still used for the self-speaking-indicator and for
    // mute, which this graph transparently respects — see micProcessing.ts).
    activeMicProcessing?.destroy();
    activeMicProcessing = startMicProcessing(localStream, {
      highpassEnabled: getHighpassFilterEnabled(),
      noiseGateEnabled: getNoiseGateEnabled(),
      noiseGateSensitivity: getNoiseGateSensitivity(),
    });

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

    // The Render roster join has to fully land BEFORE the SFU join starts consuming
    // anyone's existing audio/video. onAudioStream/onScreenStream resolve a stream to a
    // roster entry by userId (see upsertPeerMediaByUserId) — if the SFU hands back an
    // already-live peer's stream before that peer's roster entry (with its userId) exists
    // in voiceStore yet, the lookup finds nothing and the stream is silently dropped,
    // never retried. Since the SFU connection and this one are two unrelated servers with
    // independent round-trip times, that race was winnable either way, which is exactly
    // why reports of "they can't hear me" / "I can't hear them" kept flipping direction
    // depending on timing. Registering listeners and awaiting the initial roster snapshot
    // before touching the SFU at all removes the race instead of narrowing it.
    const rosterReady = new Promise<void>((resolve) => {
      socket.once(SocketEvents.VoicePeers, ({ peers }: { peers: VoicePeerInfo[] }) => {
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
        resolve();
      });
    });
    // These listeners cover everything that lives on the Render socket — roster, screen
    // share labels, music sync — none of which has anything to do with the SFU. They're
    // registered before touching the SFU at all (below) specifically so a slow, flaky, or
    // fully unreachable media-server can never block them: this used to run AFTER the SFU
    // join, so a hung media-server connection meant every one of these listeners silently
    // never got attached — no peer-left notifications, no music sync, no quality badge,
    // nothing, even though none of it actually depends on the SFU working.
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
        playVoiceJoinLeaveSound();
      },
    );

    socket.on(SocketEvents.VoicePeerLeft, ({ socketId }: { socketId: string }) => {
      useVoiceStore.getState().removePeer(socketId);
      playVoiceJoinLeaveSound();
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

    socket.on(SocketEvents.MusicState, ({ state }: { voiceChannelId: string; state: MusicState }) => {
      useMusicStore.getState().setState(state);
    });

    socket.on(SocketEvents.MusicAddError, ({ reason }: { reason: string }) => {
      useMusicStore.getState().setAddError(reason);
    });

    socket.emit(SocketEvents.VoiceJoin, { voiceChannelId });
    await rosterReady;

    // Room joins only once the media socket is actually connected — on a fresh connect
    // this can race the "connect" event, mediaSocket.connected covers the reconnect case.
    // Capped at 8s: an unreachable media-server would otherwise hang this forever, and
    // everything registered above already works independent of it either way.
    const mediaSocketConnected = await new Promise<boolean>((resolve) => {
      if (mediaSocket.connected) {
        resolve(true);
        return;
      }
      const timeout = setTimeout(() => resolve(false), 8000);
      mediaSocket.once("connect", () => {
        clearTimeout(timeout);
        resolve(true);
      });
      // Doesn't resolve the promise on its own (the socket keeps retrying under the hood),
      // but logs immediately instead of waiting out the full timeout in silence — e.g. a
      // JWT mismatch between Render and the media-server surfaces as connect_error, not a
      // hang, and this makes that visible in devtools right away.
      mediaSocket.once("connect_error", (err) => {
        console.error("SFU media socket connect_error", err.message);
      });
    });

    if (!mediaSocketConnected) {
      console.error("SFU media socket did not connect within 8s — voice audio/video will be unavailable");
      return;
    }

    try {
      await manager.join(voiceChannelId);
      await manager.produceMic(activeMicProcessing.outputTrack);
      attachPushToTalkListeners();
      applyMicTransmitState(); // starts silent if push-to-talk mode is active, per the mode
    } catch (err) {
      // Logged rather than re-thrown: the rest of this function still has to run even if
      // the SFU side failed, so the user at least shows up in the channel instead of
      // silently vanishing — audio for them would be broken either way, but this makes
      // that failure visible in devtools instead of a confusing "can't hear/be heard" with
      // nothing to go on.
      console.error("SFU join/produce failed", err);
    }
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
      socket.off(SocketEvents.MusicState);
      socket.off(SocketEvents.MusicAddError);
    }

    activeMediaManager?.leave();
    activeMediaManager = null;
    activeMicProcessing?.destroy();
    activeMicProcessing = null;
    disconnectMediaSocket();
    detachPushToTalkListeners();

    localStream?.getTracks().forEach((t) => t.stop());
    localScreenStream?.getTracks().forEach((t) => t.stop());

    useVoiceStore.getState().reset();
    useMusicStore.getState().setState(null);
  }, []);

  const toggleMute = useCallback(() => {
    const socket = getSocket();
    const { activeVoiceChannelId, localStream, isMuted } = useVoiceStore.getState();
    if (!socket || !activeVoiceChannelId || !localStream) return;

    const next = !isMuted;
    store.setMuted(next);
    applyMicTransmitState();
    socket.emit(SocketEvents.VoiceMute, { voiceChannelId: activeVoiceChannelId, isMuted: next });
  }, [store]);

  const toggleDeafen = useCallback(() => {
    const socket = getSocket();
    const { activeVoiceChannelId, isDeafened } = useVoiceStore.getState();
    if (!socket || !activeVoiceChannelId) return;

    const next = !isDeafened;
    store.setDeafened(next);
    socket.emit(SocketEvents.VoiceDeafen, { voiceChannelId: activeVoiceChannelId, isDeafened: next });

    // Deafening also mutes the mic (nobody can hear you if you can't hear them anyway),
    // and un-deafening restores it — mirrors Discord's behavior. In push-to-talk mode,
    // un-deafening doesn't make the mic live again by itself — same as voice-activation,
    // it just clears the manual-mute override and goes back to needing the key held.
    store.setMuted(next);
    applyMicTransmitState();
    socket.emit(SocketEvents.VoiceMute, { voiceChannelId: activeVoiceChannelId, isMuted: next });
  }, [store]);

  const setMicMode = useCallback((mode: "voice-activation" | "push-to-talk") => {
    store.setMicMode(mode);
    applyMicTransmitState();
  }, [store]);

  const setPushToTalkKey = useCallback((code: string | null) => {
    store.setPushToTalkKey(code);
  }, [store]);

  const toggleScreenShare = useCallback(async () => {
    const socket = getSocket();
    const { activeVoiceChannelId, isScreenSharing } = useVoiceStore.getState();
    if (!socket || !activeVoiceChannelId || !activeMediaManager) return;

    if (isScreenSharing) {
      activeMediaManager.stopScreenShare();
      store.setLocalScreenStream(null);
      store.setScreenSharing(false);
      store.setScreenShareNotice(null);
      socket.emit(SocketEvents.ScreenShareStop, { voiceChannelId: activeVoiceChannelId });
      return;
    }

    // SfuMediaManager.startScreenShare encodes THREE simulcast layers simultaneously (for
    // per-viewer quality adaptation), which is real sustained CPU work on the sharer's own
    // machine — at 4K60 that was enough to drop frames at the SOURCE regardless of any
    // viewer's network. Standard (1080p, the safe default) still outresolves the
    // ~1100px-wide display area; High (4K) is opt-in for people whose hardware can handle
    // three layers of it, picked in Settings → Screen Share Quality.
    const quality = useVoiceStore.getState().screenShareQuality;
    const screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        width: { ideal: quality === "high" ? 3840 : 1920 },
        height: { ideal: quality === "high" ? 2160 : 1080 },
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
    // Browsers only hand over audio if the picker option for it was ticked and the surface
    // supports it (a Chrome tab, or the entire screen on Windows) — never for a plain window,
    // and Firefox never. Viewers silently get a video with no sound, so tell the sharer.
    store.setScreenShareNotice(
      screenStream.getAudioTracks().length === 0
        ? "No audio is being shared. Share a browser tab or entire screen and tick “Share audio”."
        : null,
    );
    await activeMediaManager.startScreenShare(screenStream, quality);

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

  const setScreenShareQuality = useCallback((quality: "standard" | "high") => {
    store.setScreenShareQuality(quality);
  }, [store]);

  // Native browser constraints — changing these mid-call would need re-acquiring the mic
  // track, so (like the mic device picker above) they just persist and take effect next
  // join, kept consistent with that existing behavior/messaging.
  const setEchoCancellationEnabled = useCallback((enabled: boolean) => {
    persistEchoCancellationEnabled(enabled);
  }, []);
  const setNoiseSuppressionEnabled = useCallback((enabled: boolean) => {
    persistNoiseSuppressionEnabled(enabled);
  }, []);
  const setAutoGainControlEnabled = useCallback((enabled: boolean) => {
    persistAutoGainControlEnabled(enabled);
  }, []);

  // Our own Web Audio nodes — these DO apply live to whatever call is already active.
  const setHighpassFilterEnabled = useCallback((enabled: boolean) => {
    persistHighpassFilterEnabled(enabled);
    activeMicProcessing?.setHighpassEnabled(enabled);
  }, []);
  const setNoiseGateEnabled = useCallback((enabled: boolean) => {
    persistNoiseGateEnabled(enabled);
    activeMicProcessing?.setNoiseGateEnabled(enabled);
  }, []);
  const setNoiseGateSensitivity = useCallback((sensitivity: number) => {
    persistNoiseGateSensitivity(sensitivity);
    activeMicProcessing?.setNoiseGateSensitivity(sensitivity);
  }, []);

  const addMusic = useCallback((url: string) => {
    const { activeVoiceChannelId } = useVoiceStore.getState();
    if (!activeVoiceChannelId) return;
    // Plain text is a valid input now (title search) — only reject something that looks
    // like a URL but isn't a YouTube link we can parse, catching that instantly instead of
    // waiting on a round trip to the server just to find out the same thing.
    const looksLikeUrl = /^https?:\/\//i.test(url.trim());
    if (looksLikeUrl && !extractYoutubeId(url)) {
      useMusicStore.getState().setAddError("invalid-url");
      return;
    }
    useMusicStore.getState().setAddError(null);
    getSocket()?.emit(SocketEvents.MusicAdd, { voiceChannelId: activeVoiceChannelId, url });
  }, []);

  const removeMusic = useCallback((itemId: string) => {
    const { activeVoiceChannelId } = useVoiceStore.getState();
    if (!activeVoiceChannelId) return;
    getSocket()?.emit(SocketEvents.MusicRemove, { voiceChannelId: activeVoiceChannelId, itemId });
  }, []);

  const playMusic = useCallback(() => {
    const { activeVoiceChannelId } = useVoiceStore.getState();
    if (!activeVoiceChannelId) return;
    getSocket()?.emit(SocketEvents.MusicPlay, { voiceChannelId: activeVoiceChannelId });
  }, []);

  const pauseMusic = useCallback(() => {
    const { activeVoiceChannelId } = useVoiceStore.getState();
    if (!activeVoiceChannelId) return;
    getSocket()?.emit(SocketEvents.MusicPause, { voiceChannelId: activeVoiceChannelId });
  }, []);

  const skipMusic = useCallback(() => {
    const { activeVoiceChannelId } = useVoiceStore.getState();
    if (!activeVoiceChannelId) return;
    getSocket()?.emit(SocketEvents.MusicSkip, { voiceChannelId: activeVoiceChannelId });
  }, []);

  const seekMusic = useCallback((positionSeconds: number) => {
    const { activeVoiceChannelId } = useVoiceStore.getState();
    if (!activeVoiceChannelId) return;
    getSocket()?.emit(SocketEvents.MusicSeek, { voiceChannelId: activeVoiceChannelId, positionSeconds });
  }, []);

  return {
    joinVoiceChannel,
    leaveVoiceChannel,
    toggleMute,
    toggleDeafen,
    toggleScreenShare,
    setMicMode,
    setPushToTalkKey,
    setScreenShareQuality,
    setEchoCancellationEnabled,
    setNoiseSuppressionEnabled,
    setAutoGainControlEnabled,
    setHighpassFilterEnabled,
    setNoiseGateEnabled,
    setNoiseGateSensitivity,
    addMusic,
    removeMusic,
    playMusic,
    pauseMusic,
    skipMusic,
    seekMusic,
  };
}
