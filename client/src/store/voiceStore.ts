import { create } from "zustand";

export interface RemotePeer {
  userId: string;
  socketId: string;
  audioStream: MediaStream | null;
  screenStream: MediaStream | null;
  isMuted: boolean;
  isDeafened: boolean;
  isScreenSharing: boolean;
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
  reset: () => void;
}

function emptyPeer(socketId: string): RemotePeer {
  return {
    userId: "",
    socketId,
    audioStream: null,
    screenStream: null,
    isMuted: false,
    isDeafened: false,
    isScreenSharing: false,
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
