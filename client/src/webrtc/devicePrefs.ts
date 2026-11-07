const MIC_DEVICE_KEY = "preferredMicDeviceId";
const SPEAKER_DEVICE_KEY = "preferredSpeakerDeviceId";

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
