// Streams popped out into their own windows — one real window per stream, so several can be
// spread over other monitors at once. The window shows (and plays the sound of) the stream as it is
// received here; it follows the store, so it keeps working while you browse text channels, and
// closes when you stop watching or leave the call. Position/size are remembered per streamer.
import { create } from "zustand";
import { useVoiceStore } from "../store/voiceStore";

interface PopoutState {
  open: Set<string>;
}

export const usePopoutStore = create<PopoutState>(() => ({ open: new Set() }));

const windows = new Map<string, Window>();
const RECT_KEY = "streamPopoutRect:";

function markOpen() {
  usePopoutStore.setState({ open: new Set(windows.keys()) });
}

/** Browsers can; the desktop app only from 1.5.2 (older shells send window.open to the system browser). */
export function canPopOutWindows(): boolean {
  const desktop = window.shmirkaDesktop;
  return !desktop || !!desktop.popOutWindows;
}

function loadRect(name: string): { x: number; y: number; w: number; h: number } | null {
  try {
    const r = JSON.parse(localStorage.getItem(RECT_KEY + name) ?? "null");
    return r && [r.x, r.y, r.w, r.h].every((n: unknown) => typeof n === "number") ? r : null;
  } catch {
    return null;
  }
}

function saveRect(name: string, win: Window) {
  try {
    if (win.outerWidth < 200 || win.outerHeight < 120) return;
    localStorage.setItem(
      RECT_KEY + name,
      JSON.stringify({ x: win.screenX, y: win.screenY, w: win.outerWidth, h: win.outerHeight }),
    );
  } catch {
    // window already gone / storage blocked
  }
}

function streamFor(key: string): MediaStream | null {
  return useVoiceStore.getState().peers.get(key)?.screenStream ?? null;
}

function render(win: Window, stream: MediaStream | null) {
  const doc = win.document;
  const video = doc.querySelector("video");
  const note = doc.getElementById("note");
  if (!video || !note) return;
  if (video.srcObject !== stream) {
    video.srcObject = stream;
    if (stream) void video.play().catch(() => {});
  }
  note.style.display = stream ? "none" : "flex";
}

/**
 * Opens (or focuses) the pop-out for the stream watched under `key` (the streamer's socket id).
 * `nameKey` (their user id) is what the window's position is remembered by. Returns false if the
 * window could not be opened (pop-ups blocked).
 */
export function popOutStream(key: string, nameKey: string, title: string): boolean {
  const existing = windows.get(key);
  if (existing && !existing.closed) {
    existing.focus();
    return true;
  }
  const rect = loadRect(nameKey);
  const settings = streamFor(key)?.getVideoTracks()[0]?.getSettings();
  const ratio = settings?.width && settings?.height ? settings.width / settings.height : 16 / 9;
  const w = rect?.w ?? 960;
  const h = rect?.h ?? Math.round(960 / ratio);
  const features = `popup,width=${w},height=${h}${rect ? `,left=${rect.x},top=${rect.y}` : ""}`;
  const win = window.open("", `shmirka-stream-${key}`, features);
  if (!win) return false;

  const doc = win.document;
  doc.title = `${title} — стрийм · ШмиркаТа`;
  doc.body.innerHTML = "";
  doc.body.style.cssText = "margin:0;background:#000;overflow:hidden;font-family:sans-serif;";
  const video = doc.createElement("video");
  video.autoplay = true;
  video.playsInline = true;
  video.controls = true; // native volume / mute / fullscreen on hover
  video.style.cssText = "width:100vw;height:100vh;object-fit:contain;display:block;background:#000;";
  video.title = "Двоен клик = цял екран";
  // Sound plays here while popped out (the in-app player goes quiet), starting at your stream volume.
  const vol = Number(localStorage.getItem("streamVolume"));
  video.volume = Number.isFinite(vol) && localStorage.getItem("streamVolume") !== null ? Math.min(Math.max(vol, 0), 100) / 100 : 0.5;
  video.muted = localStorage.getItem("streamMuted") === "1";
  video.ondblclick = () => {
    if (doc.fullscreenElement) void doc.exitFullscreen();
    else void video.requestFullscreen();
  };
  const note = doc.createElement("div");
  note.id = "note";
  note.textContent = "Стриймът спря";
  note.style.cssText =
    "position:fixed;inset:0;display:none;align-items:center;justify-content:center;color:#aaa;font-size:16px;pointer-events:none;";
  doc.body.append(video, note);

  windows.set(key, win);
  markOpen();
  render(win, streamFor(key));

  const forget = () => {
    saveRect(nameKey, win);
    if (windows.get(key) === win) {
      windows.delete(key);
      markOpen();
    }
  };
  win.addEventListener("beforeunload", forget);
  win.addEventListener("pagehide", forget);
  // Remember moves/resizes even if the app itself is closed first.
  const keepRect = win.setInterval(() => saveRect(nameKey, win), 3000);
  win.addEventListener("beforeunload", () => win.clearInterval(keepRect));
  return true;
}

export function closePopout(key: string) {
  const win = windows.get(key);
  windows.delete(key);
  markOpen();
  try {
    win?.close();
  } catch {
    // already closed
  }
}

export function closeAllPopouts() {
  for (const key of [...windows.keys()]) closePopout(key);
}

// Follow the store: new stream objects (the streamer restarted), ended streams, leaving the call.
useVoiceStore.subscribe((s) => {
  if (windows.size === 0) return;
  if (!s.activeVoiceChannelId) {
    closeAllPopouts();
    return;
  }
  for (const [key, win] of windows) {
    if (win.closed) {
      windows.delete(key);
      markOpen();
      continue;
    }
    render(win, s.peers.get(key)?.screenStream ?? null);
  }
});

// Closing / reloading the app closes its pop-outs too (they'd be dead windows otherwise).
window.addEventListener("beforeunload", closeAllPopouts);
