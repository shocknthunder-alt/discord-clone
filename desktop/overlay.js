// In-game overlay (1.8.0): a small transparent, click-through, always-on-top window in a screen
// corner showing who is in our voice channel (who's talking) and new chat messages.
// Shown only while a full-screen app (a game in borderless/windowed-fullscreen, a video…) is in
// front — never over the normal desktop, and never while our own window is focused.
// Exclusive-fullscreen games draw over every window, so there it can't be seen (same as any
// non-injected overlay); borderless fullscreen works.
const { BrowserWindow, screen } = require("electron");
const path = require("node:path");

let koffiApi = null;
function native() {
  if (koffiApi !== null) return koffiApi;
  try {
    const koffi = require("koffi");
    const user32 = koffi.load("user32.dll");
    const RECT = koffi.struct("SHMIRKA_OVL_RECT", { left: "long", top: "long", right: "long", bottom: "long" });
    koffiApi = {
      koffi,
      RECT,
      GetForegroundWindow: user32.func("intptr __stdcall GetForegroundWindow()"),
      GetWindowRect: user32.func("int __stdcall GetWindowRect(intptr hWnd, _Out_ SHMIRKA_OVL_RECT *lpRect)"),
      GetClassNameW: user32.func("int __stdcall GetClassNameW(intptr hWnd, uint16 *lpClassName, int nMaxCount)"),
      GetWindowLongW: user32.func("long __stdcall GetWindowLongW(intptr hWnd, int nIndex)"),
    };
  } catch (err) {
    console.warn("overlay: native helpers unavailable", err && err.message);
    koffiApi = false;
  }
  return koffiApi;
}

const WIDTH = 300;
const HEIGHT = 560;
const MARGIN = 16;

let overlayWin = null;
let mainWin = null;
let state = { enabled: false, corner: "tl", people: [], toasts: [] };
let fullscreenDisplay = null; // the display a full-screen foreground window covers, or null
let timer = null;
let ownHandles = new Set();

function hwndOf(win) {
  try {
    const buf = win.getNativeWindowHandle();
    return buf.length >= 8 ? Number(buf.readBigUInt64LE(0)) : buf.readUInt32LE(0);
  } catch {
    return 0;
  }
}

/** The display covered by the foreground window if it's full-screen (and not the desktop / us). */
function detectFullscreen() {
  const n = native();
  if (!n) return null;
  try {
    const hwnd = Number(n.GetForegroundWindow());
    if (!hwnd || ownHandles.has(hwnd)) return null;
    const cls = new Uint16Array(64);
    const len = n.GetClassNameW(hwnd, cls, 64);
    const className = String.fromCharCode(...cls.slice(0, Math.max(0, len)));
    if (["Progman", "WorkerW", "Shell_TrayWnd", "Shell_SecondaryTrayWnd"].includes(className)) return null;
    // A normal window with a title bar (e.g. a maximized browser) isn't a full-screen game.
    const WS_CAPTION = 0x00c00000;
    if ((n.GetWindowLongW(hwnd, -16) & WS_CAPTION) === WS_CAPTION) return null;
    const r = {};
    if (!n.GetWindowRect(hwnd, r)) return null;
    const dip = screen.screenToDipRect(null, { x: r.left, y: r.top, width: r.right - r.left, height: r.bottom - r.top });
    const display = screen.getDisplayMatching(dip);
    const b = display.bounds;
    const covers = dip.x <= b.x + 2 && dip.y <= b.y + 2 && dip.x + dip.width >= b.x + b.width - 2 && dip.y + dip.height >= b.y + b.height - 2;
    return covers ? display : null;
  } catch {
    return null;
  }
}

function ensureWindow() {
  if (overlayWin && !overlayWin.isDestroyed()) return overlayWin;
  overlayWin = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    focusable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: true,
    backgroundColor: "#00000000",
    webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
  });
  overlayWin.setAlwaysOnTop(true, "screen-saver");
  overlayWin.setIgnoreMouseEvents(true);
  overlayWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlayWin.loadFile(path.join(__dirname, "overlay.html"));
  overlayWin.webContents.on("did-finish-load", () => push());
  ownHandles = new Set([hwndOf(overlayWin), mainWin ? hwndOf(mainWin) : 0]);
  return overlayWin;
}

function push() {
  if (!overlayWin || overlayWin.isDestroyed()) return;
  overlayWin.webContents.executeJavaScript(`window.render && window.render(${JSON.stringify(state)})`).catch(() => {});
}

function place(display) {
  const b = display.bounds;
  const c = state.corner || "tl";
  const x = c.endsWith("r") ? b.x + b.width - WIDTH - MARGIN : b.x + MARGIN;
  const y = c.startsWith("b") ? b.y + b.height - HEIGHT - MARGIN : b.y + MARGIN;
  overlayWin.setBounds({ x: Math.round(x), y: Math.round(y), width: WIDTH, height: HEIGHT });
}

function refresh() {
  const hasContent = state.people.length > 0 || state.toasts.length > 0;
  const mainFocused = mainWin && !mainWin.isDestroyed() && mainWin.isFocused();
  const show = state.enabled && hasContent && !mainFocused && fullscreenDisplay;
  if (!show) {
    if (overlayWin && !overlayWin.isDestroyed() && overlayWin.isVisible()) overlayWin.hide();
    return;
  }
  const w = ensureWindow();
  place(fullscreenDisplay);
  if (!w.isVisible()) w.showInactive();
  w.setAlwaysOnTop(true, "screen-saver");
}

function startWatching() {
  if (timer) return;
  timer = setInterval(() => {
    const d = detectFullscreen();
    const changed = (d && d.id) !== (fullscreenDisplay && fullscreenDisplay.id);
    fullscreenDisplay = d;
    if (changed || d) refresh();
  }, 1000);
}

function stopWatching() {
  if (timer) clearInterval(timer);
  timer = null;
  fullscreenDisplay = null;
}

function init(win, ipcMain) {
  mainWin = win;
  win.on("focus", refresh);
  win.on("blur", refresh);
  ipcMain.on("overlay-update", (event, next) => {
    if (event.sender !== win.webContents || !next || typeof next !== "object") return;
    state = {
      enabled: !!next.enabled,
      corner: ["tl", "tr", "bl", "br"].includes(next.corner) ? next.corner : "tl",
      people: Array.isArray(next.people) ? next.people.slice(0, 25) : [],
      toasts: Array.isArray(next.toasts) ? next.toasts.slice(0, 4) : [],
    };
    if (state.enabled && (state.people.length || state.toasts.length)) startWatching();
    else stopWatching();
    push();
    refresh();
  });
  win.webContents.on("did-start-navigation", (details, _url, inPlace, isMainFrame) => {
    const main = details && details.isMainFrame !== undefined ? details.isMainFrame : isMainFrame;
    const sameDoc = details && details.isSameDocument !== undefined ? details.isSameDocument : inPlace;
    if (!main || sameDoc) return; // SPA route changes aren't reloads
    state = { ...state, people: [], toasts: [] };
    stopWatching();
    refresh();
  });
}

function destroy() {
  stopWatching();
  if (overlayWin && !overlayWin.isDestroyed()) overlayWin.destroy();
  overlayWin = null;
}

module.exports = { init, destroy };
