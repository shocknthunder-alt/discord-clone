import type { ServerDTO, TextChannelDTO, VoiceChannelDTO } from "@discord-clone/shared";
import { create } from "zustand";

interface ServerState {
  servers: ServerDTO[];
  activeServerId: string | null;
  textChannels: TextChannelDTO[];
  voiceChannels: VoiceChannelDTO[];
  activeTextChannelId: string | null;
  onlineUserIds: Set<string>;
  setServers: (servers: ServerDTO[]) => void;
  addServer: (server: ServerDTO) => void;
  updateServerInList: (server: ServerDTO) => void;
  setActiveServer: (serverId: string | null) => void;
  setChannels: (textChannels: TextChannelDTO[], voiceChannels: VoiceChannelDTO[]) => void;
  updateTextChannelInList: (channel: TextChannelDTO) => void;
  setActiveTextChannel: (channelId: string | null) => void;
  setUserOnline: (userId: string, online: boolean) => void;
}

export const useServerStore = create<ServerState>((set) => ({
  servers: [],
  activeServerId: null,
  textChannels: [],
  voiceChannels: [],
  activeTextChannelId: null,
  onlineUserIds: new Set(),
  setServers: (servers) => set({ servers }),
  addServer: (server) => set((s) => ({ servers: [...s.servers, server] })),
  updateServerInList: (server) =>
    set((s) => ({ servers: s.servers.map((sv) => (sv.id === server.id ? server : sv)) })),
  setActiveServer: (serverId) => set({ activeServerId: serverId, activeTextChannelId: null }),
  setChannels: (textChannels, voiceChannels) => set({ textChannels, voiceChannels }),
  updateTextChannelInList: (channel) =>
    set((s) => ({ textChannels: s.textChannels.map((c) => (c.id === channel.id ? channel : c)) })),
  setActiveTextChannel: (channelId) => set({ activeTextChannelId: channelId }),
  setUserOnline: (userId, online) =>
    set((s) => {
      const next = new Set(s.onlineUserIds);
      if (online) next.add(userId);
      else next.delete(userId);
      return { onlineUserIds: next };
    }),
}));
