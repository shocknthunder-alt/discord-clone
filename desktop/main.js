const { app, BrowserWindow, Menu, desktopCapturer, ipcMain, session, shell } = require("electron");
const path = require("node:path");
const { startGlobalKeys, stopGlobalKeys } = require("./globalKeys");
const appAudio = require("./appAudio");

// The app is a thin native shell around the live website, so every client update reaches the
// desktop users immediately (no new installer). The shell only adds what a browser can't do:
// global push-to-talk, the screen/window picker and system audio. The page feature-detects
// window.shmirkaDesktop, so an older installed shell keeps working with a newer site.
const ORIGIN = "https://shmirka.vercel.app";

const OFFLINE_PAGE = `data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html><meta charset="utf-8">
<body style="margin:0;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#0e0e10;color:#ddd;font-family:sans-serif">
<h2>Няма връзка със ШмиркаТа</h2><p>Провери интернета.</p>
<button onclick="location.href='${ORIGIN}'" style="padding:10px 22px;font-size:16px;cursor:pointer">Опитай пак</button></body>`)}`;

if (!app.requestSingleInstanceLock()) app.quit();

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);

  const ses = session.defaultSession;

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
  // Returns how the sound will be captured: "native" = per-app audio streamed over IPC (the client
  // turns it into a track), "loopback" = Chromium's whole-system audio attached to the video.
  ipcMain.handle("screen-select", async (event, id, audio) => {
    if (typeof id !== "string") {
      chosenSource = null;
      return "none";
    }
    let mode = "none";
    if (audio) {
      mode = await appAudio.start(id, (chunk) => {
        if (!event.sender.isDestroyed()) event.sender.send("app-audio", chunk);
      });
    }
    chosenSource = { id, mode };
    return mode;
  });
  ipcMain.on("app-audio-stop", () => appAudio.stop());

  ses.setDisplayMediaRequestHandler(async (_request, callback) => {
    const choice = chosenSource;
    chosenSource = null; // one-shot: a stale choice must never be reused
    const sources = await desktopCapturer.getSources({ types: ["screen", "window"] });
    const source = (choice && sources.find((s) => s.id === choice.id)) || sources.find((s) => s.id.startsWith("screen:"));
    if (!source) return callback({});
    callback(choice && choice.mode === "loopback" ? { video: source, audio: "loopback" } : { video: source });
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

  win.webContents.on("did-fail-load", (_e, code, _desc, url, isMainFrame) => {
    if (isMainFrame && code !== -3 && url.startsWith(ORIGIN)) win.loadURL(OFFLINE_PAGE);
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
app.on("will-quit", () => {
  stopGlobalKeys();
  appAudio.stop();
});
