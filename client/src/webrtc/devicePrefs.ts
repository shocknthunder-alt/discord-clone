const MIC_DEVICE_KEY = "preferredMicDeviceId";
const SPEAKER_DEVICE_KEY = "preferredSpeakerDeviceId";
const MIC_MODE_KEY = "micMode";
const PUSH_TO_TALK_KEY_KEY = "pushToTalkKey";
const SCREEN_SHARE_QUALITY_KEY = "screenShareQuality";

export type ScreenShareQuality = "standard" | "high";

export function getScreenShareQuality(): ScreenShareQuality {
  return localStorage.getItem(SCREEN_SHARE_QUALITY_KEY) === "high" ? "high" : "standard";
}

export function setScreenShareQuality(quality: ScreenShareQuality) {
  localStorage.setItem(SCREEN_SHARE_QUALITY_KEY, quality);
}

export type MicMode = "voice-activation" | "push-to-talk";

export function getMicMode(): MicMode {
  return localStorage.getItem(MIC_MODE_KEY) === "push-to-talk" ? "push-to-talk" : "voice-activation";
}

export function setMicMode(mode: MicMode) {
  localStorage.setItem(MIC_MODE_KEY, mode);
}

// Stores a KeyboardEvent.code (e.g. "ControlRight"), not .key — codes are layout/language
// independent, so a bound key stays correct even if the user's keyboard layout changes.
export function getPushToTalkKey(): string | null {
  return localStorage.getItem(PUSH_TO_TALK_KEY_KEY);
}

export function setPushToTalkKey(code: string | null) {
  if (code) localStorage.setItem(PUSH_TO_TALK_KEY_KEY, code);
  else localStorage.removeItem(PUSH_TO_TALK_KEY_KEY);
}

export function getPreferredMicDeviceId(): string | null {
  return localStorage.getItem(MIC_DEVICE_KEY);
}

export function setPreferredMicDeviceId(deviceId: string | null) {
  if (deviceId) localStorage.setItem(MIC_DEVICE_KEY, deviceId);
  else localStorage.removeItem(MIC_DEVICE_KEY);
}

export async function listMicDevices(): Promise<MediaDeviceInfo[]> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((d) => d.kind === "audioinput");
}

export function getPreferredSpeakerDeviceId(): string | null {
  return localStorage.getItem(SPEAKER_DEVICE_KEY);
}

export function setPreferredSpeakerDeviceId(deviceId: string | null) {
  if (deviceId) localStorage.setItem(SPEAKER_DEVICE_KEY, deviceId);
  else localStorage.removeItem(SPEAKER_DEVICE_KEY);
}

export async function listSpeakerDevices(): Promise<MediaDeviceInfo[]> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((d) => d.kind === "audiooutput");
}

export function supportsOutputDeviceSelection(): boolean {
  return typeof HTMLMediaElement !== "undefined" && "setSinkId" in HTMLMediaElement.prototype;
}

const PEER_VOLUME_PREFIX = "peerVolume:";

// Keyed by userId, not socketId — socketId is a fresh value every reconnect/rejoin, so a
// per-socketId volume would never survive the exact moment it's needed for (someone leaving
// and coming back). userId is the one thing that's stable across that.
export function getPeerVolume(userId: string): number {
  const raw = localStorage.getItem(PEER_VOLUME_PREFIX + userId);
  const parsed = raw === null ? NaN : Number(raw);
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 0), 100) : 100;
}

export function setPeerVolume(userId: string, volume: number) {
  localStorage.setItem(PEER_VOLUME_PREFIX + userId, String(volume));
}
