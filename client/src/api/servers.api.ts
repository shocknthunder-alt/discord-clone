import type { CustomEmojiDTO, ServerDTO, TextChannelDTO, VoiceChannelDTO } from "@discord-clone/shared";
import { http } from "./http";

export function fetchServers() {
  return http.get<{ servers: ServerDTO[] }>("/api/servers").then((r) => r.data.servers);
}

export function createServer(name: string) {
  return http
    .post<{ server: ServerDTO & { textChannels: TextChannelDTO[]; voiceChannels: VoiceChannelDTO[] } }>(
      "/api/servers",
      { name },
    )
    .then((r) => r.data.server);
}

export function joinServer(inviteCode: string) {
  return http.post<{ server: ServerDTO }>("/api/servers/join", { inviteCode }).then((r) => r.data.server);
}

export function updateServer(serverId: string, data: { name?: string; iconUrl?: string | null }) {
  return http.patch<{ server: ServerDTO }>(`/api/servers/${serverId}`, data).then((r) => r.data.server);
}

export function fetchFeaturedInvite() {
  return http.get<{ name: string; inviteCode: string }>("/api/servers/featured-invite").then((r) => r.data);
}

export function fetchServer(serverId: string) {
  return http
    .get<{ server: ServerDTO & { textChannels: TextChannelDTO[]; voiceChannels: VoiceChannelDTO[] } }>(
      `/api/servers/${serverId}`,
    )
    .then((r) => r.data.server);
}

export function fetchCustomEmojis(serverId: string) {
  return http.get<{ emojis: CustomEmojiDTO[] }>(`/api/servers/${serverId}/emojis`).then((r) => r.data.emojis);
}

export function createCustomEmoji(serverId: string, name: string, imageUrl: string) {
  return http
    .post<{ emoji: CustomEmojiDTO }>(`/api/servers/${serverId}/emojis`, { name, imageUrl })
    .then((r) => r.data.emoji);
}
