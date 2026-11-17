import { SocketEvents } from "@discord-clone/shared";
import { http } from "../api/http";
import type { Socket } from "socket.io-client";
import { nativeInfo, pushPlugin } from "./native";

/**
 * 📱 Push notifications (@mentions, DMs, calls) for when the app isn't on screen.
 *  - browser / installed site: Web Push via /sw.js
 *  - Android app: Firebase (the shell's PushNotifications plugin)
 * The server only pushes while none of your apps is visible — we tell it with ClientVisibility.
 */

const PREF = "pushEnabled";

export type PushState = "on" | "off" | "denied" | "unsupported" | "needs-install";

function isIos(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function isStandalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
}

function webPushPossible(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && typeof Notification !== "undefined";
}

export function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || window.Capacitor?.isNativePlatform?.()) return;
  void navigator.serviceWorker.register("/sw.js").catch((err) => console.warn("service worker", err));
}

async function nativePushReady(): Promise<boolean> {
  const info = await nativeInfo();
  return !!pushPlugin() && !!info?.firebase;
}

export async function getPushState(): Promise<PushState> {
  if (pushPlugin()) {
    if (!(await nativePushReady())) return "unsupported";
    const p = await pushPlugin()!.checkPermissions().catch(() => ({ receive: "denied" }));
    if (p.receive === "denied") return "denied";
    return localStorage.getItem(PREF) === "1" && p.receive === "granted" ? "on" : "off";
  }
  if (!webPushPossible()) return isIos() && !isStandalone() ? "needs-install" : "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub && localStorage.getItem(PREF) === "1" ? "on" : "off";
}

function b64ToBytes(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (b64url.length % 4)) % 4);
  const raw = atob(b64);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

let nativeListenersAdded = false;

async function subscribeNative(ask: boolean): Promise<boolean> {
  const push = pushPlugin();
  if (!push || !(await nativePushReady())) return false;
  let perm = await push.checkPermissions();
  if (perm.receive !== "granted" && ask) perm = await push.requestPermissions();
  if (perm.receive !== "granted") return false;
  await push.createChannel?.({ id: "messages", name: "Съобщения", importance: 4, vibration: true }).catch(() => {});
  const listeners: { remove(): Promise<void> }[] = [];
  const token = await new Promise<string | null>((resolve) => {
    const timer = setTimeout(() => resolve(null), 15_000);
    void push
      .addListener("registration", (t) => {
        clearTimeout(timer);
        resolve(t.value);
      })
      .then((l) => listeners.push(l));
    void push
      .addListener("registrationError", () => {
        clearTimeout(timer);
        resolve(null);
      })
      .then((l) => listeners.push(l));
    void push.register().catch(() => resolve(null));
  });
  for (const l of listeners) void l.remove().catch(() => {});
  if (!token) return false;
  await http.post("/api/push/subscribe", { kind: "fcm", endpoint: token });
  localStorage.setItem("pushEndpoint", token);
  return true;
}

async function subscribeWeb(ask: boolean): Promise<boolean> {
  if (!webPushPossible()) return false;
  if (Notification.permission !== "granted") {
    if (!ask) return false;
    if ((await Notification.requestPermission()) !== "granted") return false;
  }
  const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
  await navigator.serviceWorker.ready;
  const { data } = await http.get<{ vapidPublicKey: string }>("/api/push/config");
  const key = b64ToBytes(data.vapidPublicKey);
  let sub = await reg.pushManager.getSubscription();
  // Made with another key (server reset) → start over.
  if (sub) {
    const old = sub.options.applicationServerKey;
    if (old && !new Uint8Array(old).every((b, i) => b === key[i])) {
      await sub.unsubscribe();
      sub = null;
    }
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key.buffer as ArrayBuffer });
  const json = sub.toJSON();
  await http.post("/api/push/subscribe", { kind: "web", endpoint: sub.endpoint, p256dh: json.keys?.p256dh, auth: json.keys?.auth });
  localStorage.setItem("pushEndpoint", sub.endpoint);
  return true;
}

/** Turn on (asks for permission). Returns the new state. */
export async function enablePush(): Promise<PushState> {
  const ok = pushPlugin() ? await subscribeNative(true) : await subscribeWeb(true);
  if (ok) localStorage.setItem(PREF, "1");
  return getPushState();
}

export async function disablePush(): Promise<PushState> {
  localStorage.removeItem(PREF);
  const endpoint = localStorage.getItem("pushEndpoint");
  if (endpoint) await http.post("/api/push/unsubscribe", { endpoint }).catch(() => {});
  localStorage.removeItem("pushEndpoint");
  if (!pushPlugin() && webPushPossible()) {
    const sub = await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription();
    await sub?.unsubscribe().catch(() => {});
  }
  return getPushState();
}

/** After login / app start: make sure the server has this device under the current account. */
export async function syncPush() {
  if (localStorage.getItem(PREF) !== "1") return;
  try {
    if (pushPlugin()) await subscribeNative(false);
    else await subscribeWeb(false);
  } catch (err) {
    console.warn("push sync", err);
  }
}

/** On logout: this device stops getting the old account's notifications. */
export async function forgetPushOnLogout(token: string | null) {
  const endpoint = localStorage.getItem("pushEndpoint");
  if (endpoint && token) await http.post("/api/push/unsubscribe", { endpoint }, { headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
}

/** Tell the server whether this app is on screen (no pushes while it is). */
export function reportVisibility(socket: Socket): () => void {
  let paused = false;
  const send = () => socket.emit(SocketEvents.ClientVisibility, { visible: !paused && document.visibilityState === "visible" });
  const onPause = () => {
    paused = true;
    send();
  };
  const onResume = () => {
    paused = false;
    send();
  };
  send();
  socket.on("connect", send);
  document.addEventListener("visibilitychange", send);
  // Capacitor fires these on the document when the Android app goes to the background / comes back.
  document.addEventListener("pause", onPause);
  document.addEventListener("resume", onResume);
  return () => {
    socket.off("connect", send);
    document.removeEventListener("visibilitychange", send);
    document.removeEventListener("pause", onPause);
    document.removeEventListener("resume", onResume);
  };
}

/** Taps on a notification: "/?go=…" when the app starts, a message from the service worker, or the native plugin. */
export function listenForPushTaps(open: (go: string) => void): () => void {
  const fromUrl = (url: string) => {
    try {
      const go = new URL(url, window.location.origin).searchParams.get("go");
      if (go) open(go);
    } catch {
      /* ignore */
    }
  };
  // Started from a notification.
  const initial = new URLSearchParams(window.location.search).get("go");
  if (initial) {
    open(initial);
    const clean = new URL(window.location.href);
    clean.searchParams.delete("go");
    window.history.replaceState(window.history.state, "", clean.pathname + clean.search + clean.hash);
  }
  const onMessage = (e: MessageEvent) => {
    if (e.data?.type === "push-open" && typeof e.data.url === "string") fromUrl(e.data.url);
  };
  navigator.serviceWorker?.addEventListener("message", onMessage);
  let nativeListener: { remove(): Promise<void> } | null = null;
  let stopped = false;
  if (pushPlugin() && !nativeListenersAdded) {
    nativeListenersAdded = true;
    void pushPlugin()!
      .addListener("pushNotificationActionPerformed", (a) => {
        const url = a.notification.data?.url;
        if (url) fromUrl(url);
      })
      .then((l) => {
        if (stopped) {
          void l.remove();
          nativeListenersAdded = false;
        } else nativeListener = l;
      });
  }
  return () => {
    stopped = true;
    navigator.serviceWorker?.removeEventListener("message", onMessage);
    if (nativeListener) {
      void nativeListener.remove();
      nativeListenersAdded = false;
    }
  };
}
