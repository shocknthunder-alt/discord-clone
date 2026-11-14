import { extractYoutubeId, SocketEvents, type MusicState, type VoicePeerInfo } from "@discord-clone/shared";
import { requestDesktopScreenSource } from "../store/screenPickerStore";
import { startNativeAppAudio, stopNativeAppAudio } from "./appAudio";
import { closePopout } from "./streamPopouts";
import { useCallback, useMemo } from "react";
import { connectMediaSocket, disconnectMediaSocket } from "../socket/mediaSocket";
import { getSocket } from "../socket/socket";
import { useAuthStore } from "../store/authStore";
import { useMusicStore } from "../store/musicStore";
import { useVoiceStore, type RemoteStreamStats } from "../store/voiceStore";
import {
  getAutoGainControlEnabled,
  getEchoCancellationEnabled,
  getHighpassFilterEnabled,
  getNoiseGateEnabled,
  getAiNoiseSuppressionEnabled,
  getNoiseGateSensitivity,
  getNoiseSuppressionEnabled,
  getPreferredMicDeviceId,
  setPreferredMicDeviceId,
  setAutoGainControlEnabled as persistAutoGainControlEnabled,
  setEchoCancellationEnabled as persistEchoCancellationEnabled,
  setHighpassFilterEnabled as persistHighpassFilterEnabled,
  setNoiseGateEnabled as persistNoiseGateEnabled,
  setAiNoiseSuppressionEnabled as persistAiNoiseSuppressionEnabled,
  setNoiseGateSensitivity as persistNoiseGateSensitivity,
  setNoiseSuppressionEnabled as persistNoiseSuppressionEnabled,
} from "./devicePrefs";
import { startMicProcessing, type MicProcessingHandle } from "./micProcessing";
import { SfuMediaManager } from "./SfuMediaManager";
import { playVoiceJoinSound } from "../utils/voiceSounds";
import { unlockMusicAudio } from "../music/musicPlayerEngine";
import { SELF_STREAM_KEY, useWatchStore } from "../store/watchStore";

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

/**
 * Media already arriving from the SFU for this person. Needed when someone re-appears in the
 * roster under a NEW socket id (their connection to the main server blipped and they rejoined)
 * while their SFU audio never stopped: the SFU won't announce those streams again, so without
 * this they'd be in the channel but silent for everyone until they refreshed.
 */
function existingMediaFor(userId: string) {
  return activeMediaManager?.mediaFor(userId) ?? {};
}

let lastScreenShareLabel: string | null = null;
/** Who just dropped out of the roster (userId → when, and what we were showing of them). */
const recentlyLeft = new Map<string, { at: number; watching: boolean; bigCam: boolean }>();
let reconnectHandler: (() => void) | null = null;

/** The server's roster replaces ours (after a reconnect): drop who's gone, add/refresh the rest. */
function applyPeerSnapshot(peers: VoicePeerInfo[]) {
  const store = useVoiceStore.getState();
  const ids = new Set(peers.map((p) => p.socketId));
  for (const socketId of Array.from(store.peers.keys())) {
    if (!ids.has(socketId)) store.removePeer(socketId);
  }
  for (const peer of peers) {
    store.upsertPeer({
      socketId: peer.socketId,
      userId: peer.userId,
      username: peer.username,
      avatarUrl: peer.avatarUrl,
      isMuted: peer.isMuted,
      isDeafened: peer.isDeafened,
      isScreenSharing: peer.isScreenSharing,
      screenShareLabel: peer.screenShareLabel,
      ...existingMediaFor(peer.userId),
    });
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
let pttGlobalUnsubscribe: (() => void) | null = null;

// Shared by the window key events (browser + focused desktop app) and the desktop app's
// system-wide key events (game in the foreground). Duplicates are harmless: both are no-ops
// when the state already matches.
function handlePushToTalkKey(code: string, down: boolean) {
  const { micMode, pushToTalkKey, isPushToTalkActive } = useVoiceStore.getState();
  if (micMode !== "push-to-talk" || !pushToTalkKey || code !== pushToTalkKey || isPushToTalkActive === down) return;
  useVoiceStore.getState().setPushToTalkActive(down);
  applyMicTransmitState();
}

function attachPushToTalkListeners() {
  if (pttKeydownHandler) return; // already attached for this call
  pttKeydownHandler = (e: KeyboardEvent) => handlePushToTalkKey(e.code, true);
  pttKeyupHandler = (e: KeyboardEvent) => handlePushToTalkKey(e.code, false);
  window.addEventListener("keydown", pttKeydownHandler);
  window.addEventListener("keyup", pttKeyupHandler);
  pttGlobalUnsubscribe = window.shmirkaDesktop?.onGlobalKey(handlePushToTalkKey) ?? null;
}

function detachPushToTalkListeners() {
  if (pttKeydownHandler) window.removeEventListener("keydown", pttKeydownHandler);
  if (pttKeyupHandler) window.removeEventListener("keyup", pttKeyupHandler);
  pttGlobalUnsubscribe?.();
  pttKeydownHandler = null;
  pttKeyupHandler = null;
  pttGlobalUnsubscribe = null;
}

/** The screen/window (+ its sound) to stream. */
function captureDisplay(quality: "low" | "standard" | "high"): Promise<MediaStream> {
  return navigator.mediaDevices.getDisplayMedia({
    video: {
      width: { ideal: quality === "high" ? 3840 : quality === "low" ? 1280 : 1920 },
      height: { ideal: quality === "high" ? 2160 : quality === "low" ? 720 : 1080 },
      // Both modes capture 60 fps; they differ in what the encoder sacrifices (see SfuMediaManager).
      frameRate: { ideal: 60, max: 60 },
    },
    // Capture the shared tab/system audio too (e.g. a YouTube clip) — without this the viewer
    // only ever gets video. echoCancellation/noiseSuppression/autoGainControl are mic-tuned and
    // distort music or video playback, so they're off for this stream.
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      // Keep this app's own sound (the friends' voices) out of the shared system audio, or
      // viewers would hear themselves with an echo. Chromium-only option, not in the DOM types.
      restrictOwnAudio: true,
    } as MediaTrackConstraints,
    // Chrome: pre-tick "Share system audio" in its picker (ignored elsewhere).
    systemAudio: "include",
  } as DisplayMediaStreamOptions);
}

/** Live numbers about the screen share being sent (null when not sharing). */
export function getScreenShareStats() {
  return activeMediaManager?.getScreenStats() ?? Promise.resolve(null);
}

/** New encoder for your running screen share, same capture; viewers keep watching. */
export function refreshScreenShare(): Promise<boolean> {
  return activeMediaManager?.refreshScreenVideo() ?? Promise.resolve(false);
}

/**
 * Watch / stop watching a screen share. Streams are only downloaded while watched — nothing is
 * shown or heard by default. Your own share (SELF_STREAM_KEY) is just a local preview.
 */
export function watchStream(key: string) {
  useWatchStore.getState().watch(key);
  if (key === SELF_STREAM_KEY) return;
  const userId = useVoiceStore.getState().peers.get(key)?.userId;
  if (userId) void activeMediaManager?.watchScreen(userId);
}

export function stopWatchingStream(key: string) {
  useWatchStore.getState().unwatch(key);
  closePopout(key);
  if (key === SELF_STREAM_KEY) return;
  const userId = useVoiceStore.getState().peers.get(key)?.userId;
  if (userId) activeMediaManager?.unwatchScreen(userId);
}

/** Someone else's screen share as it arrives here (null when not receiving it). */
export function getReceivedStreamStats(userId: string) {
  return activeMediaManager?.getReceivedScreenStats(userId) ?? Promise.resolve(null);
}

export function useVoiceChannel() {
  // Only the (stable) actions are used from here. Subscribing to the whole store would re-render
  // every component that calls this hook on each ping / speaking / stats update.
  const store = useMemo(() => useVoiceStore.getState(), []);

  const joinVoiceChannel = useCallback(async (voiceChannelId: string) => {
    const socket = getSocket();
    const token = useAuthStore.getState().token;
    if (!socket || !token) return;

    // Joining is the click that satisfies the browser's autoplay policy — unlock the shared
    // music player now so the queue is audible without anyone touching it.
    // Never let the music player's state be able to block joining a call.
    try {
      unlockMusicAudio();
    } catch (err) {
      console.warn("music unlock failed", err);
    }

    const preferredMicId = getPreferredMicDeviceId();
    const audioConstraints = {
      echoCancellation: getEchoCancellationEnabled(),
      noiseSuppression: getNoiseSuppressionEnabled(),
      autoGainControl: getAutoGainControlEnabled(),
      // 48kHz mono is the Opus "fullband" sweet spot — higher than the browser's
      // default capture rate, paired with the bitrate tuning in mediasoupConfig.ts.
      sampleRate: { ideal: 48000 },
      channelCount: 1,
    };
    let localStream: MediaStream;
    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        audio: { ...(preferredMicId ? { deviceId: { exact: preferredMicId } } : {}), ...audioConstraints },
      });
    } catch (err) {
      const name = (err as DOMException).name;
      if (preferredMicId && (name === "NotFoundError" || name === "OverconstrainedError")) {
        // The saved microphone isn't available any more (unplugged, renamed, a different
        // browser profile) — `exact` made that fatal and joining just silently failed.
        // Forget it and fall back to the system default.
        setPreferredMicDeviceId(null);
        try {
          localStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
        } catch (retryErr) {
          window.alert("Couldn't access a microphone. Plug one in (or allow microphone access) and try again.");
          throw retryErr;
        }
      } else {
        window.alert(
          name === "NotAllowedError"
            ? "Microphone access is blocked. Allow it for this site in the browser's address bar and try again."
            : "Couldn't access a microphone. Plug one in and try again.",
        );
        throw err;
      }
    }
    store.setLocalStream(localStream);
    store.setActiveVoiceChannel(voiceChannelId);
    useWatchStore.getState().clear(); // a fresh call watches nothing until you click Watch

    // Our own highpass + noise gate, layered on top of the browser's native
    // echo/noise/gain correction above — this is what actually gets sent to the SFU. The
    // raw localStream is untouched (still used for the self-speaking-indicator and for
    // mute, which this graph transparently respects — see micProcessing.ts).
    activeMicProcessing?.destroy();
    activeMicProcessing = startMicProcessing(localStream, {
      highpassEnabled: getHighpassFilterEnabled(),
      aiSuppressionEnabled: getAiNoiseSuppressionEnabled(),
      noiseGateEnabled: getNoiseGateEnabled(),
      noiseGateSensitivity: getNoiseGateSensitivity(),
    });

    const mediaSocket = connectMediaSocket(token);
    const manager = new SfuMediaManager(mediaSocket, {
      onAudioStream: (userId, stream) => {
        upsertPeerMediaByUserId(userId, { audioStream: stream });
      },
      onScreenStream: (userId, stream) => {
        // null also means "you stopped watching" — that must not hide the fact they're still live
        // (isScreenSharing is driven by the share started/stopped events and onScreenAvailable).
        upsertPeerMediaByUserId(userId, stream ? { screenStream: stream, isScreenSharing: true } : { screenStream: null });
      },
      onScreenAvailable: (userId) => {
        upsertPeerMediaByUserId(userId, { isScreenSharing: true });
      },
      onCameraStream: (userId, stream) => {
        upsertPeerMediaByUserId(userId, { cameraStream: stream });
      },
      onQualityChange: (quality) => {
        useVoiceStore.getState().setConnectionQuality(quality);
      },
      onPeerQualityChange: (userId, lossQuality) => {
        for (const peer of useVoiceStore.getState().peers.values()) {
          if (peer.userId !== userId) continue;
          useVoiceStore.getState().setPeerQuality(peer.socketId, lossQuality);
        }
      },
      onLocalRtt: (rttMs) => {
        useVoiceStore.getState().setLocalRtt(rttMs);
        // Tell the others OUR ping; each person's tile shows their own number, not ours.
        const channelId = useVoiceStore.getState().activeVoiceChannelId;
        if (channelId) getSocket()?.emit(SocketEvents.VoicePing, { voiceChannelId: channelId, rttMs });
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
    let rosterLoaded = false;
    const rosterReady = new Promise<void>((resolve) => {
      socket.once(SocketEvents.VoicePeers, ({ peers }: { peers: VoicePeerInfo[] }) => {
        rosterLoaded = true;
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
        // Same person back under a new connection (their link to the server blipped): take over
        // the old entry's media instead of showing a second, silent copy, and don't "ding".
        const stale = Array.from(useVoiceStore.getState().peers.values()).filter(
          (p) => p.userId === userId && p.socketId !== socketId,
        );
        const left = recentlyLeft.get(userId);
        recentlyLeft.delete(userId);
        const back = left && Date.now() - left.at < 90_000;
        const watch = useWatchStore.getState();
        const wasWatching = (back && left.watching) || stale.some((p) => watch.watching.has(p.socketId));
        const wasBigCam = (back && left.bigCam) || stale.some((p) => watch.bigCams.has(p.socketId));
        for (const p of stale) {
          closePopout(p.socketId);
          useVoiceStore.getState().removePeer(p.socketId);
        }
        useVoiceStore.getState().upsertPeer({ socketId, userId, username, avatarUrl, ...existingMediaFor(userId) });
        // Keep watching their stream / their enlarged camera under the new id.
        if (wasWatching) watch.watch(socketId);
        if (wasBigCam && !useWatchStore.getState().bigCams.has(socketId)) watch.toggleCam(socketId);
        if (stale.length === 0 && !back) playVoiceJoinSound();
      },
    );

    // Our own connection to the main server dropped and came back (Wi-Fi blip, server restart,
    // a PC busy with a game missing the heartbeat): the server forgot us, so everyone else stopped
    // seeing — and hearing — us while the SFU audio kept flowing. Join the roster again with the
    // same state; the SFU side is untouched.
    if (reconnectHandler) socket.off("connect", reconnectHandler);
    reconnectHandler = () => {
      const state = useVoiceStore.getState();
      if (state.activeVoiceChannelId !== voiceChannelId) return;
      // Still offline when we clicked join: the buffered join goes out by itself on connect.
      if (!rosterLoaded) return;
      socket.once(SocketEvents.VoicePeers, ({ peers }: { peers: VoicePeerInfo[] }) => {
        applyPeerSnapshot(peers);
        const now = useVoiceStore.getState();
        if (now.isMuted) socket.emit(SocketEvents.VoiceMute, { voiceChannelId, isMuted: true });
        if (now.isDeafened) socket.emit(SocketEvents.VoiceDeafen, { voiceChannelId, isDeafened: true });
        if (now.isScreenSharing) {
          socket.emit(SocketEvents.ScreenShareStart, { voiceChannelId, label: lastScreenShareLabel });
        }
      });
      socket.emit(SocketEvents.VoiceJoin, { voiceChannelId });
    };
    socket.on("connect", reconnectHandler);

    socket.on(SocketEvents.VoicePeerLeft, ({ socketId }: { socketId: string }) => {
      const peer = useVoiceStore.getState().peers.get(socketId);
      if (peer?.userId) {
        const watch = useWatchStore.getState();
        recentlyLeft.set(peer.userId, {
          at: Date.now(),
          watching: watch.watching.has(socketId),
          bigCam: watch.bigCams.has(socketId),
        });
      }
      closePopout(socketId);
      useVoiceStore.getState().removePeer(socketId);
    });

    socket.on(SocketEvents.VoicePing, ({ socketId, rttMs }: { socketId: string; rttMs: number | null }) => {
      useVoiceStore.getState().setPeerRtt(socketId, rttMs);
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

    socket.on(
      SocketEvents.VoiceStreamStats,
      ({ socketId, stats }: { socketId: string; stats: RemoteStreamStats | null }) => {
        useVoiceStore.getState().setRemoteStreamStats(socketId, stats);
      },
    );

    socket.on(SocketEvents.ScreenShareStopped, ({ socketId }: { socketId: string }) => {
      useVoiceStore.getState().setRemoteStreamStats(socketId, null);
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

    // SFU join + mic. If the media server was unreachable (or the join failed), keep trying in
    // the background instead of leaving a call where you hear nobody / nobody hears you / the
    // stream button does nothing until you leave and rejoin.
    const startSfu = async (): Promise<boolean> => {
      if (activeMediaManager !== manager || !activeMicProcessing) return true; // left meanwhile
      try {
        await manager.join(voiceChannelId);
        await manager.produceMic(activeMicProcessing.outputTrack);
        attachPushToTalkListeners();
        applyMicTransmitState(); // starts silent if push-to-talk mode is active, per the mode
        useVoiceStore.getState().setScreenShareNotice(null);
        return true;
      } catch (err) {
        console.error("SFU join/produce failed", err);
        return false;
      }
    };
    const retrySfu = (attempt: number) => {
      if (activeMediaManager !== manager) return;
      useVoiceStore
        .getState()
        .setScreenShareNotice("Няма връзка с гласовия сървър — опитвам отново… (ако не мине, излез и влез пак в канала)");
      const run = async () => {
        if (activeMediaManager !== manager) return;
        if (!mediaSocket.connected) {
          mediaSocket.once("connect", () => void run());
          return;
        }
        if (!(await startSfu()) && attempt < 5) setTimeout(() => retrySfu(attempt + 1), 3000 * (attempt + 1));
      };
      void run();
    };

    if (!mediaSocketConnected) {
      console.error("SFU media socket did not connect within 8s — retrying in the background");
      retrySfu(0);
      return;
    }
    if (!(await startSfu())) retrySfu(1);
  }, [store]);

  const leaveVoiceChannel = useCallback(() => {
    const socket = getSocket();
    const { activeVoiceChannelId, localStream, localScreenStream, localCameraStream } = useVoiceStore.getState();

    if (socket && activeVoiceChannelId) {
      socket.emit(SocketEvents.VoiceLeave, { voiceChannelId: activeVoiceChannelId });
      socket.off(SocketEvents.VoicePeers);
      socket.off(SocketEvents.VoicePeerJoined);
      socket.off(SocketEvents.VoicePeerLeft);
      socket.off(SocketEvents.VoicePeerState);
      socket.off(SocketEvents.VoicePing);
      socket.off(SocketEvents.VoiceStreamStats);
      socket.off(SocketEvents.ScreenShareStarted);
      socket.off(SocketEvents.ScreenShareStopped);
      socket.off(SocketEvents.MusicState);
      socket.off(SocketEvents.MusicAddError);
    }
    if (socket && reconnectHandler) socket.off("connect", reconnectHandler);
    reconnectHandler = null;
    lastScreenShareLabel = null;

    // Every teardown step is isolated: one failing must never leave the user stuck in the call.
    const safely = (step: () => void) => {
      try {
        step();
      } catch (err) {
        console.warn("voice teardown step failed", err);
      }
    };
    safely(() => activeMediaManager?.leave());
    activeMediaManager = null;
    safely(() => activeMicProcessing?.destroy());
    activeMicProcessing = null;
    safely(disconnectMediaSocket);
    safely(detachPushToTalkListeners);

    safely(() => localStream?.getTracks().forEach((t) => t.stop()));
    safely(() => localScreenStream?.getTracks().forEach((t) => t.stop()));
    safely(stopNativeAppAudio);
    safely(() => localCameraStream?.getTracks().forEach((t) => t.stop()));

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

  const toggleCamera = useCallback(async () => {
    const { activeVoiceChannelId, isCameraOn, localCameraStream } = useVoiceStore.getState();
    if (!activeVoiceChannelId || !activeMediaManager) return;

    if (isCameraOn) {
      activeMediaManager.stopCamera();
      localCameraStream?.getTracks().forEach((t) => t.stop());
      store.setLocalCameraStream(null);
      store.setCameraOn(false);
      return;
    }

    try {
      const cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
        audio: false,
      });
      store.setLocalCameraStream(cameraStream);
      store.setCameraOn(true);
      await activeMediaManager.startCamera(cameraStream.getVideoTracks()[0]!);
      // The camera can be unplugged or revoked from the browser UI.
      cameraStream.getVideoTracks()[0]!.onended = () => {
        if (useVoiceStore.getState().isCameraOn) void toggleCamera();
      };
    } catch (err) {
      store.setLocalCameraStream(null);
      store.setCameraOn(false);
      const name = (err as DOMException).name;
      window.alert(
        name === "NotAllowedError"
          ? "Camera access is blocked. Allow it for this site in the browser's address bar and try again."
          : name === "NotFoundError"
            ? "No camera was found."
            : "Couldn't start the camera.",
      );
    }
  }, [store]);

  const toggleScreenShare = useCallback(async () => {
    const socket = getSocket();
    const { activeVoiceChannelId, isScreenSharing } = useVoiceStore.getState();
    if (!socket || !activeVoiceChannelId || !activeMediaManager) return;

    if (isScreenSharing) {
      activeMediaManager.stopScreenShare();
      stopNativeAppAudio();
      store.setLocalScreenStream(null);
      store.setScreenSharing(false);
      store.setScreenShareStartedAt(null);
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
    if (!activeMediaManager.isReady) {
      store.setScreenShareNotice(
        "Стриймът не може да тръгне: няма връзка с гласовия сървър. Излез и влез пак в канала (или рефрешни).",
      );
      return;
    }

    const quality = useVoiceStore.getState().screenShareQuality;
    const mode = useVoiceStore.getState().screenShareMode;
    let desktopAudioMode: "native" | "loopback" | "none" | undefined;
    // Desktop app: pick the screen/window ourselves (browsers show their own native picker).
    if (window.shmirkaDesktop) {
      const choice = await requestDesktopScreenSource();
      if (!choice) return; // cancelled
      desktopAudioMode = await window.shmirkaDesktop.selectScreenSource(choice.id, choice.audio);
    }
    let screenStream: MediaStream;
    try {
      screenStream = await captureDisplay(quality);
    } catch (err) {
      const name = (err as DOMException)?.name;
      if (name === "NotAllowedError" && !window.shmirkaDesktop) return; // cancelled in the browser picker
      console.error("screen capture failed", err);
      if (desktopAudioMode === "native") stopNativeAppAudio();
      store.setScreenShareNotice(
        `Заснемането на екрана не тръгна (${name || "грешка"}). Опитай друг екран/прозорец${
          window.shmirkaDesktop ? " или рестартирай приложението" : ""
        }.`,
      );
      return;
    }
    // Desktop app with per-app capture: add the shared program's own sound as the stream's audio track.
    if (desktopAudioMode === "native") {
      const appAudioTrack = await startNativeAppAudio();
      if (appAudioTrack) screenStream.addTrack(appAudioTrack);
    }
    store.setLocalScreenStream(screenStream);
    store.setScreenSharing(true);
    // Browsers only hand over audio if the picker option for it was ticked and the surface
    // supports it (a Chrome tab, or the entire screen on Windows) — never for a plain window,
    // and Firefox never. Viewers silently get a video with no sound, so tell the sharer.
    const sharedSurface = screenStream.getVideoTracks()[0]?.getSettings().displaySurface;
    store.setScreenShareNotice(
      screenStream.getAudioTracks().length > 0
        ? null
        : sharedSurface === "window"
          ? "Стриймът е БЕЗ звук: браузърът не дава звук от прозорец (напр. игра). Спри и сподели „Цял екран“ с отметка „Share system audio“ — или ползвай десктоп приложението, което хваща звука само на играта."
          : "Стриймът е БЕЗ звук. Спри и сподели отново, като отметнеш „Share audio“ / „Share system audio“ в прозореца за избор.",
    );
    try {
      await activeMediaManager.startScreenShare(screenStream, quality, mode, useVoiceStore.getState().screenShareSimulcast);
    } catch (err) {
      console.error("screen share produce failed", err);
      screenStream.getTracks().forEach((t) => t.stop());
      stopNativeAppAudio();
      store.setLocalScreenStream(null);
      store.setScreenSharing(false);
      store.setScreenShareNotice("Стриймът не тръгна (гласовият сървър го отказа). Опитай пак; ако пак не става — излез и влез в канала.");
      return;
    }
    store.setScreenShareStartedAt(Date.now());

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
    lastScreenShareLabel = label;

    screenStream.getVideoTracks()[0].onended = () => {
      void toggleScreenShare();
    };
  }, [store]);

  const setScreenShareQuality = useCallback((quality: "low" | "standard" | "high") => {
    store.setScreenShareQuality(quality);
  }, [store]);

  const setScreenShareMode = useCallback((mode: "smooth" | "sharp") => {
    store.setScreenShareMode(mode);
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
  const setAiNoiseSuppressionEnabled = useCallback((enabled: boolean) => {
    persistAiNoiseSuppressionEnabled(enabled);
    activeMicProcessing?.setAiSuppressionEnabled(enabled);
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
    toggleCamera,
    setMicMode,
    setPushToTalkKey,
    setScreenShareQuality,
    setScreenShareMode,
    setEchoCancellationEnabled,
    setNoiseSuppressionEnabled,
    setAutoGainControlEnabled,
    setHighpassFilterEnabled,
    setAiNoiseSuppressionEnabled,
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
