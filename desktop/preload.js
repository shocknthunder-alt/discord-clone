const { contextBridge, ipcRenderer } = require("electron");

// The web client checks for this to know it is running inside the desktop app.
contextBridge.exposeInMainWorld("shmirkaDesktop", {
  isDesktop: true,
  // Global (system-wide) key events: cb(code, down). Returns an unsubscribe function.
  /** Screens + windows with thumbnails: [{ id, name, isScreen, thumbnail, icon }]. */
  getScreenSources: () => ipcRenderer.invoke("screen-sources"),
  /** Remember the choice for the next getDisplayMedia call. audio = capture system sound. */
  selectScreenSource: (id, audio) => ipcRenderer.invoke("screen-select", id, audio),
  onGlobalKey(cb) {
    const handler = (_event, code, down) => cb(code, down);
    ipcRenderer.on("global-key", handler);
    return () => ipcRenderer.removeListener("global-key", handler);
  },
});
