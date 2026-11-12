import type { SoundboardSoundDTO } from "@discord-clone/shared";
import { http } from "./http";

export function fetchSounds(serverId: string) {
  return http.get<{ sounds: SoundboardSoundDTO[] }>(`/api/servers/${serverId}/sounds`).then((r) => r.data.sounds);
}

export function createSound(
  serverId: string,
  body: { name: string; emoji: string; url: string; durationMs: number; volume: number },
) {
  return http.post<{ sound: SoundboardSoundDTO }>(`/api/servers/${serverId}/sounds`, body).then((r) => r.data.sound);
}

export function updateSound(serverId: string, soundId: string, body: { name?: string; emoji?: string; volume?: number }) {
  return http.patch<{ sound: SoundboardSoundDTO }>(`/api/servers/${serverId}/sounds/${soundId}`, body).then((r) => r.data.sound);
}

export function deleteSound(serverId: string, soundId: string) {
  return http.delete(`/api/servers/${serverId}/sounds/${soundId}`);
}
