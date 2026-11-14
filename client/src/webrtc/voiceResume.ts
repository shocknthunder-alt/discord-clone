import { useServerStore } from "../store/serverStore";
import { useVoiceStore } from "../store/voiceStore";

/**
 * Back into the same voice channel after a restart WE caused (update banner "Обнови", desktop
 * "Рестартирай"): the current call is remembered just before restarting and re-joined on start.
 * Only a fresh note counts, so a crash days later doesn't drop someone into a call.
 */
const KEY = "voiceResumeAfterRestart";
const MAX_AGE_MS = 3 * 60_000;

export interface VoiceResume {
  serverId: string;
  voiceChannelId: string;
  muted: boolean;
  deafened: boolean;
  at: number;
}

/** Call right before reloading/restarting for an update. */
export function rememberVoiceForRestart() {
  const { activeVoiceChannelId, isMuted, isDeafened } = useVoiceStore.getState();
  const { activeServerId, voiceChannels } = useServerStore.getState();
  // Server voice channels only (a DM call can't be "rejoined" alone).
  if (!activeVoiceChannelId || !activeServerId || !voiceChannels.some((v) => v.id === activeVoiceChannelId)) return;
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        serverId: activeServerId,
        voiceChannelId: activeVoiceChannelId,
        muted: isMuted,
        deafened: isDeafened,
        at: Date.now(),
      } satisfies VoiceResume),
    );
  } catch {
    // storage blocked — they'll just click the channel again
  }
}

/** The note left before the restart (removed once read). */
export function takeVoiceResume(): VoiceResume | null {
  try {
    const raw = localStorage.getItem(KEY);
    localStorage.removeItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as VoiceResume;
    if (!v || typeof v.voiceChannelId !== "string" || typeof v.serverId !== "string") return null;
    return Date.now() - Number(v.at) < MAX_AGE_MS ? v : null;
  } catch {
    return null;
  }
}
