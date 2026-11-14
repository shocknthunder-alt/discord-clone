// Remote control of THIS PC by someone watching our stream (ticket 001). Only after the streamer
// clicked "Разреши" in the page; the page then forwards that one person's inputs here.
// Safety: a red always-on-top bar "X управлява · Спри", the hotkey Ctrl+Alt+Esc, and moving your
// own mouse all stop it at once; held keys/buttons are released on stop.
const { BrowserWindow, globalShortcut, screen } = require("electron");
const koffi = require("koffi");
const { scanCodeFor, uIOhook } = require("./globalKeys");

const user32 = koffi.load("user32.dll");
const dwmapi = koffi.load("dwmapi.dll");

const RECT = koffi.struct("SHMIRKA_RECT", { left: "long", top: "long", right: "long", bottom: "long" });
const MOUSEINPUT = koffi.struct("SHMIRKA_MOUSEINPUT", {
  dx: "long",
  dy: "long",
  mouseData: "uint32",
  dwFlags: "uint32",
  time: "uint32",
  dwExtraInfo: "uintptr",
});
const KEYBDINPUT = koffi.struct("SHMIRKA_KEYBDINPUT", {
  wVk: "uint16",
  wScan: "uint16",
  dwFlags: "uint32",
  time: "uint32",
  dwExtraInfo: "uintptr",
});
const HARDWAREINPUT = koffi.struct("SHMIRKA_HARDWAREINPUT", { uMsg: "uint32", wParamL: "uint16", wParamH: "uint16" });
const INPUT_U = koffi.union("SHMIRKA_INPUT_U", { mi: MOUSEINPUT, ki: KEYBDINPUT, hi: HARDWAREINPUT });
const INPUT = koffi.struct("SHMIRKA_INPUT", { type: "uint32", u: INPUT_U });

const SendInput = user32.func("uint32 __stdcall SendInput(uint32 cInputs, SHMIRKA_INPUT *pInputs, int cbSize)");
const GetSystemMetrics = user32.func("int __stdcall GetSystemMetrics(int nIndex)");
const GetWindowRect = user32.func("int __stdcall GetWindowRect(intptr hWnd, _Out_ SHMIRKA_RECT *lpRect)");
const IsWindow = user32.func("int __stdcall IsWindow(intptr hWnd)");
const DwmGetWindowAttribute = dwmapi.func(
  "long __stdcall DwmGetWindowAttribute(intptr hwnd, uint32 dwAttribute, _Out_ SHMIRKA_RECT *pvAttribute, uint32 cbAttribute)",
);

const INPUT_SIZE = koffi.sizeof(INPUT);
const INPUT_MOUSE = 0;
const INPUT_KEYBOARD = 1;
const MOUSE = { MOVE: 0x1, LDOWN: 0x2, LUP: 0x4, RDOWN: 0x8, RUP: 0x10, MDOWN: 0x20, MUP: 0x40, WHEEL: 0x800, HWHEEL: 0x1000, VIRTUALDESK: 0x4000, ABSOLUTE: 0x8000 };
const KEY = { EXTENDED: 0x1, UP: 0x2, SCANCODE: 0x8 };
const BUTTON_FLAGS = [
  [MOUSE.LDOWN, MOUSE.LUP],
  [MOUSE.MDOWN, MOUSE.MUP],
  [MOUSE.RDOWN, MOUSE.RUP],
];

function mouse(dwFlags, dx = 0, dy = 0, mouseData = 0) {
  SendInput(1, { type: INPUT_MOUSE, u: { mi: { dx, dy, mouseData: mouseData >>> 0, dwFlags, time: 0, dwExtraInfo: 0 } } }, INPUT_SIZE);
}
function key(scan, extended, up) {
  const dwFlags = KEY.SCANCODE | (extended ? KEY.EXTENDED : 0) | (up ? KEY.UP : 0);
  SendInput(1, { type: INPUT_KEYBOARD, u: { ki: { wVk: 0, wScan: scan, dwFlags, time: 0, dwExtraInfo: 0 } } }, INPUT_SIZE);
}

// ── what is being shared: a screen or a window (set by main.js when the share starts) ──
let shared = null; // { id, displayId }
function setSharedSource(source) {
  shared = source ? { id: source.id, displayId: String(source.display_id ?? "") } : null;
}

let rectCache = { at: 0, rect: null };
/** The shared picture's area on the desktop, in physical pixels: { x, y, w, h } or null. */
function targetRect() {
  if (Date.now() - rectCache.at < 400) return rectCache.rect;
  let rect = null;
  if (shared && shared.id.startsWith("window:")) {
    const hwnd = Number(shared.id.split(":")[1]);
    if (hwnd && IsWindow(hwnd)) {
      const r = {};
      // Extended frame bounds = the visible window without its invisible resize border.
      if (DwmGetWindowAttribute(hwnd, 9, r, koffi.sizeof(RECT)) !== 0) GetWindowRect(hwnd, r);
      if (r.right > r.left && r.bottom > r.top) rect = { x: r.left, y: r.top, w: r.right - r.left, h: r.bottom - r.top };
    }
  } else {
    const displays = screen.getAllDisplays();
    const d = (shared && displays.find((x) => String(x.id) === shared.displayId)) || screen.getPrimaryDisplay();
    const p = screen.dipToScreenRect(null, d.bounds);
    rect = { x: p.x, y: p.y, w: p.width, h: p.height };
  }
  rectCache = { at: Date.now(), rect };
  return rect;
}

function moveTo(nx, ny) {
  const r = targetRect();
  if (!r || !Number.isFinite(nx) || !Number.isFinite(ny)) return;
  const x = r.x + Math.min(Math.max(nx, 0), 1) * (r.w - 1);
  const y = r.y + Math.min(Math.max(ny, 0), 1) * (r.h - 1);
  // Absolute over the whole virtual desktop (all monitors): 0..65535.
  const vx = GetSystemMetrics(76);
  const vy = GetSystemMetrics(77);
  const vw = GetSystemMetrics(78);
  const vh = GetSystemMetrics(79);
  const ax = Math.round(((x - vx) * 65535) / Math.max(1, vw - 1));
  const ay = Math.round(((y - vy) * 65535) / Math.max(1, vh - 1));
  mouse(MOUSE.MOVE | MOUSE.ABSOLUTE | MOUSE.VIRTUALDESK, ax, ay);
}

// ── session ──
let session = null; // { controller, onStop, keys:Set, buttons:Set, lastInjectAt, startedAt, localMoves:[] }
let bar = null;
const HOTKEY = "Control+Alt+Escape";

function showBar(name) {
  const d = (() => {
    const r = targetRect();
    if (!r) return screen.getPrimaryDisplay();
    return screen.getDisplayNearestPoint(screen.screenToDipPoint({ x: r.x + r.w / 2, y: r.y + 10 }));
  })();
  const width = 420;
  bar = new BrowserWindow({
    width,
    height: 40,
    x: Math.round(d.bounds.x + (d.bounds.width - width) / 2),
    y: d.bounds.y + 6,
    frame: false,
    transparent: false,
    resizable: false,
    movable: true,
    focusable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: "#b3261e",
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  bar.setAlwaysOnTop(true, "screen-saver");
  bar.setVisibleOnAllWorkspaces(true);
  const safe = String(name).replace(/[<>&"]/g, "");
  const html = `<!doctype html><meta charset="utf-8"><body style="margin:0;height:40px;display:flex;align-items:center;gap:10px;padding:0 10px;background:#b3261e;color:#fff;font:600 13px Segoe UI,sans-serif;-webkit-app-region:drag;user-select:none;box-sizing:border-box">
<span style="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">🖱 ${safe} управлява компютъра ти</span>
<span style="opacity:.8;font-weight:400">Ctrl+Alt+Esc</span>
<a href="shmirka-stop:" style="-webkit-app-region:no-drag;background:#fff;color:#b3261e;padding:5px 12px;border-radius:6px;text-decoration:none">Спри</a></body>`;
  bar.webContents.on("will-navigate", (e, url) => {
    if (url.startsWith("shmirka-stop:")) {
      e.preventDefault();
      stop("streamer");
    }
  });
  void bar.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
}

function onLocalMouseMove() {
  if (!session) return;
  const now = Date.now();
  // Our own injected moves come back through the hook too — only count movement while the
  // controller has been still for a moment, and only after the first couple of seconds.
  if (now - session.startedAt < 2000 || now - session.lastInjectAt < 500) return;
  session.localMoves = session.localMoves.filter((t) => now - t < 400);
  session.localMoves.push(now);
  if (session.localMoves.length >= 4) stop("streamer-moved");
}

/** Begin obeying `controllerName`'s inputs. onStop(reason) is called however it ends. */
function start(controllerName, onStop) {
  stop("replaced");
  session = {
    controller: controllerName,
    onStop,
    keys: new Map(),
    buttons: new Set(),
    lastInjectAt: 0,
    startedAt: Date.now(),
    localMoves: [],
  };
  try {
    globalShortcut.register(HOTKEY, () => stop("streamer"));
  } catch {
    // taken by another app — the bar and own-mouse stop still work
  }
  uIOhook.on("mousemove", onLocalMouseMove);
  showBar(controllerName);
  return { ok: true };
}

function input(ev) {
  if (!session || !ev || typeof ev !== "object") return;
  session.lastInjectAt = Date.now();
  switch (ev.t) {
    case "move":
      moveTo(ev.x, ev.y);
      break;
    case "down":
    case "up": {
      const flags = BUTTON_FLAGS[ev.b];
      if (!flags) return;
      moveTo(ev.x, ev.y);
      mouse(ev.t === "down" ? flags[0] : flags[1]);
      if (ev.t === "down") session.buttons.add(ev.b);
      else session.buttons.delete(ev.b);
      break;
    }
    case "wheel": {
      const dy = Math.max(-10, Math.min(10, Math.round(Number(ev.dy) || 0)));
      const dx = Math.max(-10, Math.min(10, Math.round(Number(ev.dx) || 0)));
      if (dy) mouse(MOUSE.WHEEL, 0, 0, -dy * 120);
      if (dx) mouse(MOUSE.HWHEEL, 0, 0, dx * 120);
      break;
    }
    case "keydown":
    case "keyup": {
      const sc = typeof ev.code === "string" ? scanCodeFor(ev.code) : null;
      if (!sc) return;
      key(sc.scan, sc.extended, ev.t === "keyup");
      if (ev.t === "keydown") session.keys.set(ev.code, sc);
      else session.keys.delete(ev.code);
      break;
    }
  }
}

function stop(reason = "stopped") {
  if (!session) return;
  const s = session;
  session = null;
  // Never leave a key or a mouse button held down on the streamer's PC.
  for (const sc of s.keys.values()) {
    try { key(sc.scan, sc.extended, true); } catch { /* ignore */ }
  }
  for (const b of s.buttons) {
    try { mouse(BUTTON_FLAGS[b][1]); } catch { /* ignore */ }
  }
  try { globalShortcut.unregister(HOTKEY); } catch { /* ignore */ }
  uIOhook.off("mousemove", onLocalMouseMove);
  if (bar && !bar.isDestroyed()) bar.destroy();
  bar = null;
  try { s.onStop(reason); } catch { /* window gone */ }
}

function active() {
  return !!session;
}

module.exports = { setSharedSource, start, input, stop, active };
