const MIC_DEVICE_KEY = "preferredMicDeviceId";
const SPEAKER_DEVICE_KEY = "preferredSpeakerDeviceId";
const MIC_MODE_KEY = "micMode";
const PUSH_TO_TALK_KEY_KEY = "pushToTalkKey";
const SCREEN_SHARE_QUALITY_KEY = "screenShareQuality";

/** low = 720p (weak PC / slow upload), standard = 1080p, high = 4K. */
export type ScreenShareQuality = "low" | "standard" | "high";

export function getScreenShareQuality(): ScreenShareQuality {
  const v = localStorage.getItem(SCREEN_SHARE_QUALITY_KEY);
  return v === "high" || v === "low" ? v : "standard";
}

export function setScreenShareQuality(quality: ScreenShareQuality) {
  localStorage.setItem(SCREEN_SHARE_QUALITY_KEY, quality);
}

const SCREEN_SHARE_SIMULCAST_KEY = "screenShareSimulcast";

/** Experimental: send a second, lighter copy of the stream so viewers on a weak link still get a picture. */
export function getScreenShareSimulcast(): boolean {
  return localStorage.getItem(SCREEN_SHARE_SIMULCAST_KEY) === "1";
}

export function setScreenShareSimulcast(on: boolean) {
  localStorage.setItem(SCREEN_SHARE_SIMULCAST_KEY, on ? "1" : "0");
}

const SCREEN_SHARE_MODE_KEY = "screenShareMode";

/** "smooth": keep the frame rate up (games, clips). "sharp": keep every pixel (text, slides). */
export type ScreenShareMode = "smooth" | "sharp";

export function getScreenShareMode(): ScreenShareMode {
  return localStorage.getItem(SCREEN_SHARE_MODE_KEY) === "sharp" ? "sharp" : "smooth";
}

export function setScreenShareMode(mode: ScreenShareMode) {
  localStorage.setItem(SCREEN_SHARE_MODE_KEY, mode);
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

const ECHO_CANCELLATION_KEY = "audioEchoCancellation";
const NOISE_SUPPRESSION_KEY = "audioNoiseSuppression";
const AUTO_GAIN_CONTROL_KEY = "audioAutoGainControl";
const HIGHPASS_FILTER_KEY = "audioHighpassFilter";
const NOISE_GATE_ENABLED_KEY = "audioNoiseGateEnabled";
const AI_NOISE_SUPPRESSION_KEY = "audioAiNoiseSuppression";
const NOISE_GATE_SENSITIVITY_KEY = "audioNoiseGateSensitivity";

// Every one of these defaults ON — browser-native echo/noise/gain correction plus our own
// highpass + noise gate, stacked, is the "just sounds better out of the box" set most people
// want without ever opening Settings. Each is still a real toggle for the minority of mic
// setups one of these fights with (a gate clipping breathy speech, AGC pumping on a cheap
// USB mic, etc.).
function getBoolPref(key: string, defaultValue: boolean): boolean {
  const raw = localStorage.getItem(key);
  if (raw === null) return defaultValue;
  return raw === "true";
}

function setBoolPref(key: string, value: boolean) {
  localStorage.setItem(key, String(value));
}

export const getEchoCancellationEnabled = () => getBoolPref(ECHO_CANCELLATION_KEY, true);
export const setEchoCancellationEnabled = (v: boolean) => setBoolPref(ECHO_CANCELLATION_KEY, v);

export const getNoiseSuppressionEnabled = () => getBoolPref(NOISE_SUPPRESSION_KEY, true);
export const setNoiseSuppressionEnabled = (v: boolean) => setBoolPref(NOISE_SUPPRESSION_KEY, v);

export const getAutoGainControlEnabled = () => getBoolPref(AUTO_GAIN_CONTROL_KEY, true);
export const setAutoGainControlEnabled = (v: boolean) => setBoolPref(AUTO_GAIN_CONTROL_KEY, v);

// Cuts low-frequency rumble (fan/AC hum, desk thumps) below ~100Hz — below where voice
// actually lives, so it's near-impossible to notice except for the noise it removes.
export const getHighpassFilterEnabled = () => getBoolPref(HIGHPASS_FILTER_KEY, true);
export const setHighpassFilterEnabled = (v: boolean) => setBoolPref(HIGHPASS_FILTER_KEY, v);

// Mutes the mic between words/sentences once volume drops below a threshold — what
// actually "isolates" steady background noise (keyboard, fan, side conversation) that
// browser noiseSuppression alone tends to just quiet rather than fully remove.
// Neural-network noise removal (RNNoise, see rnnoise.ts) — on by default.
export const getAiNoiseSuppressionEnabled = () => getBoolPref(AI_NOISE_SUPPRESSION_KEY, true);
export const setAiNoiseSuppressionEnabled = (v: boolean) => setBoolPref(AI_NOISE_SUPPRESSION_KEY, v);

export const getNoiseGateEnabled = () => getBoolPref(NOISE_GATE_ENABLED_KEY, true);
export const setNoiseGateEnabled = (v: boolean) => setBoolPref(NOISE_GATE_ENABLED_KEY, v);

// 0-100 "sensitivity" as shown to the user; higher = gate opens more easily (lower volume
// still counts as speech). Internally mapped to a dB threshold — see micProcessing.ts.
// 40 = opens at about -42 dB: above breathing, mouse clicks and room hush, below normal speech.
// (50 used to be the default and let breathing through.) Quiet talkers can raise it in Settings.
const DEFAULT_NOISE_GATE_SENSITIVITY = 40;

export function getNoiseGateSensitivity(): number {
  const raw = localStorage.getItem(NOISE_GATE_SENSITIVITY_KEY);
  const parsed = raw === null ? NaN : Number(raw);
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 0), 100) : DEFAULT_NOISE_GATE_SENSITIVITY;
}

export function setNoiseGateSensitivity(value: number) {
  localStorage.setItem(NOISE_GATE_SENSITIVITY_KEY, String(value));
}

const PEER_VOLUME_PREFIX = "peerVolume:";
export const DEFAULT_PEER_VOLUME = 50;

// Keyed by userId, not socketId — socketId is a fresh value every reconnect/rejoin, so a
// per-socketId volume would never survive the exact moment it's needed for (someone leaving
// and coming back). userId is the one thing that's stable across that.
export function getPeerVolume(userId: string): number {
  const raw = localStorage.getItem(PEER_VOLUME_PREFIX + userId);
  const parsed = raw === null ? NaN : Number(raw);
  // Quieter than full by default — other people's voices at 100% were too loud for new users.
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 0), 100) : DEFAULT_PEER_VOLUME;
}

export function setPeerVolume(userId: string, volume: number) {
  localStorage.setItem(PEER_VOLUME_PREFIX + userId, String(volume));
}
