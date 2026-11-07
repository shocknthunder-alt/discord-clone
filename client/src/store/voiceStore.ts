import { create } from "zustand";

export interface RemotePeer {
  userId: string;
  username: string;
  socketId: string;
  audioStream: MediaStream | null;
  screenStream: MediaStream | null;
  isMuted: boolean;
  isDeafened: boolean;
  isScreenSharing: boolean;
  // Local-only: this viewer's personal volume/mute for this peer, never synced to the
  // server or other clients (distinct from isMuted, which reflects the peer's own mic).
  localVolume: number;
  localMuted: boolean;
}

interface VoiceState {
  activeVoiceChannelId: string | null;
  localStream: MediaStream | null;
  localScreenStream: MediaStream | null;
  isMuted: boolean;
  isDeafened: boolean;
  isScreenSharing: boolean;
  peers: Map<string, RemotePeer>;

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
  reset: () => void;
}

function emptyPeer(socketId: string): RemotePeer {
  return {
    userId: "",
    username: "",
    socketId,
    audioStream: null,
    screenStream: null,
    isMuted: false,
    isDeafened: false,
    isScreenSharing: false,
    localVolume: 100,
    localMuted: false,
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

  setActiveVoiceChannel: (id) => set({ activeVoiceChannelId: id }),
  setLocalStream: (stream) => set({ localStream: stream }),
  setLocalScreenStream: (stream) => set({ localScreenStream: stream }),
  setMuted: (muted) => set({ isMuted: muted }),
  setDeafened: (deafened) => set({ isDeafened: deafened }),
  setScreenSharing: (sharing) => set({ isScreenSharing: sharing }),

  upsertPeer: (partial) =>
    set((s) => {
      const peers = new Map(s.peers);
      const existing = peers.get(partial.socketId) ?? emptyPeer(partial.socketId);
      peers.set(partial.socketId, { ...existing, ...partial });
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
      if (existing) peers.set(socketId, { ...existing, localVolume: volume });
      return { peers };
    }),

  setPeerLocalMuted: (socketId, muted) =>
    set((s) => {
      const peers = new Map(s.peers);
      const existing = peers.get(socketId);
      if (existing) peers.set(socketId, { ...existing, localMuted: muted });
      return { peers };
    }),

  reset: () =>
    set({
      activeVoiceChannelId: null,
      localStream: null,
      localScreenStream: null,
      isMuted: false,
      isDeafened: false,
      isScreenSharing: false,
      peers: new Map(),
    }),
}));
