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
