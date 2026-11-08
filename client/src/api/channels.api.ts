import type { MessageDTO, TextChannelDTO, VoiceChannelDTO } from "@discord-clone/shared";
import { http } from "./http";

export function fetchChannels(serverId: string) {
  return http
    .get<{ textChannels: TextChannelDTO[]; voiceChannels: VoiceChannelDTO[] }>(
      `/api/servers/${serverId}/channels`,
    )
    .then((r) => r.data);
}

export function createTextChannel(serverId: string, name: string) {
  return http
    .post<{ textChannel: TextChannelDTO }>(`/api/servers/${serverId}/text-channels`, { name })
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

export function updateVoiceChannel(channelId: string, data: { name?: string }) {
  return http
    .patch<{ voiceChannel: VoiceChannelDTO }>(`/api/voice-channels/${channelId}`, data)
    .then((r) => r.data.voiceChannel);
}

export function fetchMessages(channelId: string, cursor?: string) {
  return http
    .get<{ messages: MessageDTO[] }>(`/api/text-channels/${channelId}/messages`, {
      params: cursor ? { cursor } : undefined,
    })
    .then((r) => r.data.messages);
}
