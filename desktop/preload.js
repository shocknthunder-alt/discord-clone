const { contextBridge, ipcRenderer } = require("electron");

// The web client checks for this to know it is running inside the desktop app.
contextBridge.exposeInMainWorld("shmirkaDesktop", {
  isDesktop: true,
  /** Stream pop-outs (window.open "shmirka-stream-*") open as app windows (1.5.2+). */
  popOutWindows: true,
  // Global (system-wide) key events: cb(code, down). Returns an unsubscribe function.
  /** Screens + windows with thumbnails: [{ id, name, isScreen, thumbnail, icon }]. */
  getScreenSources: () => ipcRenderer.invoke("screen-sources"),
  /** Remember the choice for the next getDisplayMedia call. audio = capture system sound. */
  selectScreenSource: (id, audio) => ipcRenderer.invoke("screen-select", id, audio),
  /** Per-app audio for the shared window: cb(Uint8Array of 16-bit stereo 48 kHz PCM). */
  onAppAudio(cb) {
    const handler = (_event, data) => cb(data);
    ipcRenderer.on("app-audio", handler);
    return () => ipcRenderer.removeListener("app-audio", handler);
  },
  stopAppAudio: () => ipcRenderer.send("app-audio-stop"),
  /** Close and reopen the whole app (used to pick up a new site version cleanly). */
  relaunch: () => ipcRenderer.send("app-relaunch"),
  /** Desktop 1.6.0+: this app's version. */
  getVersion: () => ipcRenderer.invoke("app-version"),
  /** Desktop 1.8.0+: seconds since the last keyboard/mouse input anywhere in Windows. */
  getSystemIdleSeconds: () => ipcRenderer.invoke("system-idle"),
  /** Desktop 1.6.0+: cb(version) once a new app version has been downloaded. Returns an unsubscribe. */
  onUpdateReady(cb) {
    const handler = (_event, version) => cb(version);
    ipcRenderer.on("desktop-update-ready", handler);
    ipcRenderer.send("desktop-update-query");
    return () => ipcRenderer.removeListener("desktop-update-ready", handler);
  },
  /** Close, install the downloaded version and start again. */
  installUpdate: () => ipcRenderer.send("desktop-update-install"),
  /** Desktop 1.7.0+: let someone watching our stream control this PC (after the streamer allowed it). */
  remoteControl: {
    /** Start obeying `name` (shows the red bar + Ctrl+Alt+Esc). */
    start: (name) => ipcRenderer.invoke("rc-start", name),
    /** One input: { t: "move"|"down"|"up"|"wheel"|"keydown"|"keyup", ... } */
    input: (ev) => ipcRenderer.send("rc-input", ev),
    stop: () => ipcRenderer.send("rc-stop"),
    /** cb(reason) when it ended here (hotkey, the bar's Спри, own mouse moved, page reload). */
    onStopped(cb) {
      const handler = (_event, reason) => cb(reason);
      ipcRenderer.on("rc-stopped", handler);
      return () => ipcRenderer.removeListener("rc-stopped", handler);
    },
  },
  onGlobalKey(cb) {
    const handler = (_event, code, down) => cb(code, down);
    ipcRenderer.on("global-key", handler);
    return () => ipcRenderer.removeListener("global-key", handler);
  },
});
