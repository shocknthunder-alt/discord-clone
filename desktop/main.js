const { app, BrowserWindow, Menu, desktopCapturer, ipcMain, session, shell } = require("electron");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { startGlobalKeys, stopGlobalKeys } = require("./globalKeys");

// The built client is served from a tiny local web server rather than file://, because the app
// needs a real http origin (secure context for mic/camera, YouTube embeds, SPA routing). The port
// is fixed so the origin — and with it the saved login — is the same on every launch.
const PORT = 47321;
const ORIGIN = `http://localhost:${PORT}`;
const ROOT = path.join(__dirname, "client-dist");

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".mp3": "audio/mpeg",
  ".woff2": "font/woff2", ".ico": "image/x-icon",
};

function startStaticServer() {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent((req.url || "/").split("?")[0]);
    let file = path.join(ROOT, path.normalize(url));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      file = path.join(ROOT, "index.html"); // SPA fallback
    }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(PORT, "127.0.0.1", () => resolve(server));
  });
}

if (!app.requestSingleInstanceLock()) app.quit();

app.whenReady().then(async () => {
  await startStaticServer();
  Menu.setApplicationMenu(null);

  const ses = session.defaultSession;

  // The servers only whitelist the website's origin for CORS. The desktop app has its own
  // (localhost) origin, so answer for it here instead of changing the servers.
  ses.webRequest.onHeadersReceived((details, callback) => {
    if (details.url.startsWith(ORIGIN)) return callback({});
    const headers = { ...details.responseHeaders };
    for (const key of Object.keys(headers)) {
      if (key.toLowerCase().startsWith("access-control-allow-origin") || key.toLowerCase() === "access-control-allow-credentials") {
        delete headers[key];
      }
    }
    headers["Access-Control-Allow-Origin"] = [ORIGIN];
    headers["Access-Control-Allow-Credentials"] = ["true"];
    callback({ responseHeaders: headers });
  });

  ses.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(["media", "display-capture", "notifications", "fullscreen", "clipboard-sanitized-write"].includes(permission));
  });

  // Screen sharing: the client first asks for the source list (screens + windows with thumbnails),
  // shows its own picker, and reports the choice back. The display-media handler below then hands
  // exactly that source to getDisplayMedia (optionally with system "loopback" audio).
  let chosenSource = null; // { id, audio }
  ipcMain.handle("screen-sources", async () => {
    const sources = await desktopCapturer.getSources({
      types: ["screen", "window"],
      thumbnailSize: { width: 320, height: 180 },
      fetchWindowIcons: true,
    });
    return sources.map((src) => ({
      id: src.id,
      name: src.name,
      isScreen: src.id.startsWith("screen:"),
      thumbnail: src.thumbnail.toDataURL(),
      icon: src.appIcon ? src.appIcon.toDataURL() : null,
    }));
  });
  ipcMain.handle("screen-select", (_event, id, audio) => {
    chosenSource = typeof id === "string" ? { id, audio: !!audio } : null;
  });

  ses.setDisplayMediaRequestHandler(async (_request, callback) => {
    const choice = chosenSource;
    chosenSource = null; // one-shot: a stale choice must never be reused
    const sources = await desktopCapturer.getSources({ types: ["screen", "window"] });
    const source = (choice && sources.find((s) => s.id === choice.id)) || sources.find((s) => s.id.startsWith("screen:"));
    if (!source) return callback({});
    callback(choice && choice.audio ? { video: source, audio: "loopback" } : { video: source });
  });

  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    title: "ШмиркаТа",
    backgroundColor: "#0e0e10",
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(ORIGIN)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  startGlobalKeys((code, down) => {
    if (!win.isDestroyed()) win.webContents.send("global-key", code, down);
  });

  win.loadURL(ORIGIN);
});

app.on("second-instance", () => {
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.on("window-all-closed", () => app.quit());
app.on("will-quit", stopGlobalKeys);
