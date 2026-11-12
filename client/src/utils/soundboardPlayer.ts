import { useVoiceStore } from "../store/voiceStore";
import { getAppPrefs } from "./appPrefs";

/**
 * Plays soundboard clips. Only one at a time: a new clip (from anyone) stops the one that is
 * playing, so clips never pile up on top of each other.
 */
let current: HTMLAudioElement | null = null;

export function stopSoundboard() {
  if (!current) return;
  current.pause();
  current.src = "";
  current = null;
}

/** volume = the clip's own 0-100 volume; the listener's own soundboard volume is applied on top. */
export function playSoundboardClip(url: string, volume: number, opts: { force?: boolean } = {}) {
  const prefs = getAppPrefs();
  const voice = useVoiceStore.getState();
  if (!opts.force && (!prefs.soundboardEnabled || voice.isDeafened)) return;

  stopSoundboard();
  const audio = new Audio(url);
  audio.volume = Math.max(0, Math.min(1, (volume / 100) * (prefs.soundboardVolume / 100)));
  // Same output device as the voices (headphones), where the browser allows choosing it.
  const sinkId = voice.preferredSpeakerId;
  const withSink = audio as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
  if (sinkId && withSink.setSinkId) void withSink.setSinkId(sinkId).catch(() => {});
  audio.onended = () => {
    if (current === audio) current = null;
  };
  current = audio;
  void audio.play().catch(() => {});
}
