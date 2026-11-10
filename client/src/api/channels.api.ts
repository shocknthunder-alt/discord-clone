import type { MessageDTO, TextChannelDTO, VoiceChannelDTO } from "@discord-clone/shared";
import { http } from "./http";

export function fetchChannels(serverId: string) {
  return http
    .get<{ textChannels: TextChannelDTO[]; voiceChannels: VoiceChannelDTO[] }>(
      `/api/servers/${serverId}/channels`,
    )
    .then((r) => r.data);
}

export function createTextChannel(serverId: string, name: string, type: "text" | "trivia" = "text") {
  return http
    .post<{ textChannel: TextChannelDTO }>(`/api/servers/${serverId}/text-channels`, { name, type })
    .then((r) => r.data.textChannel);
}

export function createVoiceChannel(serverId: string, name: string) {
  return http
    .post<{ voiceChannel: VoiceChannelDTO }>(`/api/servers/${serverId}/voice-channels`, { name })
    .then((r) => r.data.voiceChannel);
}

export function updateTextChannel(channelId: string, data: { backgroundUrl?: string | null; name?: string }) {
  return http.patch<{ textChannel: TextChannelDTO }>(`/api/text-channels/${channelId}`, data).then((r) => r.data.textChannel);
}

export function updateVoiceChannel(channelId: string, data: { name?: string; backgroundUrl?: string | null }) {
  return http
    .patch<{ voiceChannel: VoiceChannelDTO }>(`/api/voice-channels/${channelId}`, data)
    .then((r) => r.data.voiceChannel);
}

export function fetchMessages(channelId: string, cursor?: string, around?: string) {
  return http
    .get<{ messages: MessageDTO[] }>(`/api/text-channels/${channelId}/messages`, {
      params: { ...(cursor ? { cursor } : {}), ...(around ? { around } : {}) },
    })
    .then((r) => r.data.messages);
}

export function reorderChannels(serverId: string, kind: "text" | "voice", orderedIds: string[]) {
  return http.put(`/api/servers/${serverId}/channel-order`, { kind, orderedIds }).then((r) => r.data);
}

export interface SearchResult {
  id: string;
  content: string;
  textChannelId: string;
  channelName: string;
  authorUsername: string;
  authorAvatarUrl: string | null;
  createdAt: string;
  replyToId: string | null;
}

export function searchMessages(serverId: string, q: string, channelId?: string) {
  return http
    .get<{ results: SearchResult[] }>(`/api/servers/${serverId}/search`, {
      params: { q, ...(channelId ? { channelId } : {}) },
    })
    .then((r) => r.data.results);
}
