/**
 * The Android app (Capacitor shell in /mobile) loads this same site and injects `window.Capacitor`.
 * Everything here is optional: in a normal browser these are no-ops. No @capacitor packages in the
 * client — we talk to the plugins through the global the shell provides.
 */

interface PluginListener {
  remove(): Promise<void>;
}

interface ShmirkaNativePlugin {
  info(): Promise<{ version: string; versionCode: number; firebase: boolean }>;
  /** Foreground service: keeps the voice call alive with the screen off / app in the background. */
  startCall(o: { title: string; text: string }): Promise<void>;
  stopCall(): Promise<void>;
  openExternal(o: { url: string }): Promise<void>;
}

interface PushPlugin {
  checkPermissions(): Promise<{ receive: string }>;
  requestPermissions(): Promise<{ receive: string }>;
  register(): Promise<void>;
  unregister?(): Promise<void>;
  createChannel?(c: { id: string; name: string; importance: number; sound?: string; vibration?: boolean }): Promise<void>;
  addListener(event: "registration", cb: (t: { value: string }) => void): Promise<PluginListener>;
  addListener(event: "registrationError", cb: (e: unknown) => void): Promise<PluginListener>;
  addListener(event: "pushNotificationActionPerformed", cb: (a: { notification: { data?: Record<string, string> } }) => void): Promise<PluginListener>;
  addListener(event: string, cb: (x: never) => void): Promise<PluginListener>;
}

interface AppPlugin {
  addListener(event: "backButton", cb: (e: { canGoBack: boolean }) => void): Promise<PluginListener>;
  exitApp(): Promise<void>;
  minimizeApp?(): Promise<void>;
}

declare global {
  interface Window {
    Capacitor?: {
      isNativePlatform?: () => boolean;
      getPlatform?: () => string;
      Plugins?: { ShmirkaNative?: ShmirkaNativePlugin; PushNotifications?: PushPlugin; App?: AppPlugin };
    };
  }
}

export function isNativeApp(): boolean {
  return !!window.Capacitor?.isNativePlatform?.();
}

export function nativePlugin(): ShmirkaNativePlugin | null {
  return isNativeApp() ? (window.Capacitor?.Plugins?.ShmirkaNative ?? null) : null;
}

export function pushPlugin(): PushPlugin | null {
  return isNativeApp() ? (window.Capacitor?.Plugins?.PushNotifications ?? null) : null;
}

export function appPlugin(): AppPlugin | null {
  return isNativeApp() ? (window.Capacitor?.Plugins?.App ?? null) : null;
}

/** Open in the phone's real browser (Google sign-in refuses embedded web views). */
export function openExternal(url: string) {
  const native = nativePlugin();
  if (native) void native.openExternal({ url }).catch(() => window.open(url, "_blank"));
  else window.open(url, "_blank");
}

export async function nativeInfo() {
  try {
    return (await nativePlugin()?.info()) ?? null;
  } catch {
    return null;
  }
}

/** Newest Android shell; older ones get a "install the new version" note in Settings. */
export const LATEST_ANDROID_VERSION_CODE = 1;
export const ANDROID_APK_URL = "https://github.com/shocknthunder-alt/discord-clone/releases/download/android/Shmirka.apk";
