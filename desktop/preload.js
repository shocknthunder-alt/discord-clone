const { contextBridge } = require("electron");

// The web client checks for this to know it is running inside the desktop app.
contextBridge.exposeInMainWorld("shmirkaDesktop", { isDesktop: true });
