const MIC_DEVICE_KEY = "preferredMicDeviceId";

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
