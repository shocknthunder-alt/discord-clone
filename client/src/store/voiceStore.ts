import type { VoicePeerInfo } from "@discord-clone/shared";
import { create } from "zustand";
import {
  getMicMode,
  getPeerVolume,
  getPreferredSpeakerDeviceId,
  getPushToTalkKey,
  getScreenShareQuality,
  setMicMode as persistMicMode,
  setPeerVolume,
  setPreferredSpeakerDeviceId,
  setPushToTalkKey as persistPushToTalkKey,
  setScreenShareQuality as persistScreenShareQuality,
  type MicMode,
  type ScreenShareQuality,
} from "../webrtc/devicePrefs";

export interface RemotePeer {
  userId: string;
  username: string;
  avatarUrl: string | null;
  socketId: string;
  audioStream: MediaStream | null;
  screenStream: MediaStream | null;
  isMuted: boolean;
  isDeafened: boolean;
  isScreenSharing: boolean;
  screenShareLabel: string | null;
  // Local-only: this viewer's personal volume/mute for this peer, never synced to the
  // server or other clients (distinct from isMuted, which reflects the peer's own mic).
  localVolume: number;
  localMuted: boolean;
  // Per-peer, since in a mesh call quality to one person is independent of quality to
  // another — a single global indicator can't represent that.
  connectionQuality: ConnectionQuality;
  rttMs: number | null;
}

export type ConnectionQuality = "good" | "medium" | "poor" | "unknown";

interface VoiceState {
  activeVoiceChannelId: string | null;
  localStream: MediaStream | null;
  localScreenStream: MediaStream | null;
  isMuted: boolean;
  isDeafened: boolean;
  isScreenSharing: boolean;
  peers: Map<string, RemotePeer>;
  preferredSpeakerId: string;
  connectionQuality: ConnectionQuality;
  // Lightweight roster per voice channel (name/avatar/mute, no media) — covers channels
  // the local user hasn't joined, so the sidebar can show who's already in them.
  channelOccupants: Map<string, VoicePeerInfo[]>;
  micMode: MicMode;
  pushToTalkKey: string | null;
  // Whether the push-to-talk key is currently held — irrelevant in voice-activation mode.
  isPushToTalkActive: boolean;
  screenShareQuality: ScreenShareQuality;

  setActiveVoiceChannel: (id: string | null) => void;
  setLocalStream: (stream: MediaStream | null) => void;
  setLocalScreenStream: (stream: MediaStream | null) => void;
  setMuted: (muted: boolean) => void;
  setDeafened: (deafened: boolean) => void;
  setScreenSharing: (sharing: boolean) => void;
  upsertPeer: (peer: Partial<RemotePeer> & { socketId: string }) => void;
  removePeer: (socketId: string) => void;
  setPeerLocalVolume: (socketId: string, volume: number) => void;
  setPeerLocalMuted: (socketId: string, muted: boolean) => void;
  setPreferredSpeakerId: (deviceId: string) => void;
  setConnectionQuality: (quality: ConnectionQuality) => void;
  setPeerQuality: (socketId: string, quality: ConnectionQuality, rttMs: number | null) => void;
  setChannelOccupants: (voiceChannelId: string, peers: VoicePeerInfo[]) => void;
  setMicMode: (mode: MicMode) => void;
  setPushToTalkKey: (code: string | null) => void;
  setPushToTalkActive: (active: boolean) => void;
  setScreenShareQuality: (quality: ScreenShareQuality) => void;
  reset: () => void;
}

function emptyPeer(socketId: string): RemotePeer {
  return {
    userId: "",
    username: "",
    avatarUrl: null,
    socketId,
    audioStream: null,
    screenStream: null,
    isMuted: false,
    isDeafened: false,
    isScreenSharing: false,
    screenShareLabel: null,
    localVolume: 100,
    localMuted: false,
    connectionQuality: "unknown",
    rttMs: null,
  };
}

export const useVoiceStore = create<VoiceState>((set) => ({
  activeVoiceChannelId: null,
  localStream: null,
  localScreenStream: null,
  isMuted: false,
  isDeafened: false,
  isScreenSharing: false,
  peers: new Map(),
  preferredSpeakerId: getPreferredSpeakerDeviceId() ?? "",
  connectionQuality: "unknown",
  channelOccupants: new Map(),
  micMode: getMicMode(),
  pushToTalkKey: getPushToTalkKey(),
  isPushToTalkActive: false,
  screenShareQuality: getScreenShareQuality(),

  setActiveVoiceChannel: (id) => set({ activeVoiceChannelId: id }),
  setLocalStream: (stream) => set({ localStream: stream }),
  setLocalScreenStream: (stream) => set({ localScreenStream: stream }),
  setMuted: (muted) => set({ isMuted: muted }),
  setDeafened: (deafened) => set({ isDeafened: deafened }),
  setScreenSharing: (sharing) => set({ isScreenSharing: sharing }),

  upsertPeer: (partial) =>
    set((s) => {
      const peers = new Map(s.peers);
      const existing = peers.get(partial.socketId);
      const merged = { ...(existing ?? emptyPeer(partial.socketId)), ...partial };
      // Only on first sight of this peer (this session) — once localVolume is live in the
      // store, later upserts (mute toggles, screen-share labels, ...) must not stomp back
      // over a volume the user may have just adjusted. userId is what the saved volume is
      // keyed by, so there's nothing to look up until it's actually known.
      if (!existing && partial.userId) {
        merged.localVolume = getPeerVolume(partial.userId);
      }
      peers.set(partial.socketId, merged);
      return { peers };
    }),

  removePeer: (socketId) =>
    set((s) => {
      const peers = new Map(s.peers);
      peers.delete(socketId);
      return { peers };
    }),

  setPeerLocalVolume: (socketId, volume) =>
    set((s) => {
      const peers = new Map(s.peers);
      const existing = peers.get(socketId);
      if (existing) {
        peers.set(socketId, { ...existing, localVolume: volume });
        if (existing.userId) setPeerVolume(existing.userId, volume);
      }
      return { peers };
    }),

  setPeerLocalMuted: (socketId, muted) =>
    set((s) => {
      const peers = new Map(s.peers);
      const existing = peers.get(socketId);
      if (existing) peers.set(socketId, { ...existing, localMuted: muted });
      return { peers };
    }),

  setPreferredSpeakerId: (deviceId) => {
    setPreferredSpeakerDeviceId(deviceId || null);
    set({ preferredSpeakerId: deviceId });
  },

  setConnectionQuality: (quality) => set({ connectionQuality: quality }),

  setPeerQuality: (socketId, quality, rttMs) =>
    set((s) => {
      const peers = new Map(s.peers);
      const existing = peers.get(socketId);
      if (existing) peers.set(socketId, { ...existing, connectionQuality: quality, rttMs });
      return { peers };
    }),

  setChannelOccupants: (voiceChannelId, peers) =>
    set((s) => {
      const channelOccupants = new Map(s.channelOccupants);
      channelOccupants.set(voiceChannelId, peers);
      return { channelOccupants };
    }),

  setMicMode: (mode) => {
    persistMicMode(mode);
    set({ micMode: mode, isPushToTalkActive: false });
  },

  setPushToTalkKey: (code) => {
    persistPushToTalkKey(code);
    set({ pushToTalkKey: code });
  },

  setPushToTalkActive: (active) => set({ isPushToTalkActive: active }),

  setScreenShareQuality: (quality) => {
    persistScreenShareQuality(quality);
    set({ screenShareQuality: quality });
  },

  reset: () =>
    set({
      activeVoiceChannelId: null,
      localStream: null,
      localScreenStream: null,
      isMuted: false,
      isDeafened: false,
      isScreenSharing: false,
      peers: new Map(),
      connectionQuality: "unknown",
      isPushToTalkActive: false,
    }),
}));
