const { contextBridge, ipcRenderer } = require("electron");

// The web client checks for this to know it is running inside the desktop app.
contextBridge.exposeInMainWorld("shmirkaDesktop", {
  isDesktop: true,
  // Global (system-wide) key events: cb(code, down). Returns an unsubscribe function.
  onGlobalKey(cb) {
    const handler = (_event, code, down) => cb(code, down);
    ipcRenderer.on("global-key", handler);
    return () => ipcRenderer.removeListener("global-key", handler);
  },
});
