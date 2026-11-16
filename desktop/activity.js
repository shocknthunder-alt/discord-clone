// "Какво играе" (1.9.0): every 15 s look at the running programs and recognise a game — by a list
// of well-known game .exe names, or by where it's installed (Steam / Epic / Xbox / GOG / EA /
// Ubisoft library folders → the folder name is the game's name). The page shows it next to our
// name ("🎮 Играе …") if Settings → "Показвай какво играя" is on.
// Windows only (koffi → kernel32/user32); elsewhere it simply never reports anything.
const path = require("node:path");

const INTERVAL_MS = 15_000;

// lower-case exe name → shown name
const KNOWN = {
  "cs2.exe": "Counter-Strike 2",
  "csgo.exe": "Counter-Strike: Global Offensive",
  "valorant-win64-shipping.exe": "VALORANT",
  "league of legends.exe": "League of Legends",
  "dota2.exe": "Dota 2",
  "r5apex.exe": "Apex Legends",
  "r5apex_dx12.exe": "Apex Legends",
  "fortniteclient-win64-shipping.exe": "Fortnite",
  "overwatch.exe": "Overwatch 2",
  "diablo iv.exe": "Diablo IV",
  "wow.exe": "World of Warcraft",
  "hearthstone.exe": "Hearthstone",
  "minecraft.windows.exe": "Minecraft",
  "robloxplayerbeta.exe": "Roblox",
  "gta5.exe": "Grand Theft Auto V",
  "gta5_enhanced.exe": "Grand Theft Auto V",
  "rocketleague.exe": "Rocket League",
  "eldenring.exe": "ELDEN RING",
  "cod.exe": "Call of Duty",
  "rainbowsix.exe": "Rainbow Six Siege",
  "tslgame.exe": "PUBG: BATTLEGROUNDS",
  "destiny2.exe": "Destiny 2",
  "bg3.exe": "Baldur's Gate 3",
  "bg3_dx11.exe": "Baldur's Gate 3",
  "cyberpunk2077.exe": "Cyberpunk 2077",
  "witcher3.exe": "The Witcher 3",
  "marvel-win64-shipping.exe": "Marvel Rivals",
  "escapefromtarkov.exe": "Escape from Tarkov",
  "osu!.exe": "osu!",
  "pathofexile.exe": "Path of Exile",
  "pathofexile_x64.exe": "Path of Exile",
  "pathofexilesteam.exe": "Path of Exile",
  "pathofexile_x64steam.exe": "Path of Exile",
  "pathofexile_kg.exe": "Path of Exile",
};

// Library folders whose sub-folders are games.
const LIBRARIES = [
  /\\steamapps\\common\\([^\\]+)\\/i,
  /\\epic games\\([^\\]+)\\/i,
  /\\xboxgames\\([^\\]+)\\/i,
  /\\gog galaxy\\games\\([^\\]+)\\/i,
  /\\ea games\\([^\\]+)\\/i,
  /\\ubisoft game launcher\\games\\([^\\]+)\\/i,
  /\\riot games\\([^\\]+)\\/i,
];

// Folders in those libraries that are tools, not games.
const NOT_GAMES = new Set(
  [
    "steamworks shared", "steamvr", "steam controller configs", "wallpaper_engine", "wallpaper engine", "obs studio",
    "soundpad", "lossless scaling", "fpsvr", "voicemod", "aseprite", "blender", "launcher", "epiconlineservices",
    "directxredist", "riot client", "steamlinuxruntime", "proton", "spacewar", "rpg maker", "rpg maker mz",
    "desktop+", "ovr advanced settings", "xsoverlay", "vtube studio", "krita",
  ].map((s) => s.toLowerCase()),
);

// Helper programs that live next to games but aren't the game.
const IGNORE_EXE = /crash|report|unins|setup|redist|dxsetup|prereq|helper|cefprocess|webhelper|easyanticheat|battleye|beservice|be_service|dotnet|install|updater|bugsplat|sentry/i;

let api = null;
function native() {
  if (api !== null) return api;
  try {
    if (process.platform !== "win32") throw new Error("not windows");
    const koffi = require("koffi");
    const kernel32 = koffi.load("kernel32.dll");
    const user32 = koffi.load("user32.dll");
    api = {
      EnumProcesses: kernel32.func("bool __stdcall K32EnumProcesses(_Out_ uint32_t *pids, uint32_t cb, _Out_ uint32_t *needed)"),
      OpenProcess: kernel32.func("intptr __stdcall OpenProcess(uint32_t access, bool inherit, uint32_t pid)"),
      QueryFullProcessImageNameW: kernel32.func(
        "bool __stdcall QueryFullProcessImageNameW(intptr h, uint32_t flags, _Out_ uint16_t *name, _Inout_ uint32_t *size)",
      ),
      CloseHandle: kernel32.func("bool __stdcall CloseHandle(intptr h)"),
      GetForegroundWindow: user32.func("intptr __stdcall GetForegroundWindow()"),
      GetWindowThreadProcessId: user32.func("uint32_t __stdcall GetWindowThreadProcessId(intptr hWnd, _Out_ uint32_t *pid)"),
    };
  } catch (err) {
    console.warn("activity: unavailable", err && err.message);
    api = false;
  }
  return api;
}

const pathCache = new Map(); // pid → exe path ("" = couldn't read)

function exePath(n, pid) {
  if (pathCache.has(pid)) return pathCache.get(pid);
  let out = "";
  const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
  const h = n.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid);
  if (h) {
    try {
      const buf = new Uint16Array(1024);
      const size = [1024];
      if (n.QueryFullProcessImageNameW(h, 0, buf, size)) out = String.fromCharCode(...buf.subarray(0, size[0]));
    } finally {
      n.CloseHandle(h);
    }
  }
  pathCache.set(pid, out);
  return out;
}

function gameFromPath(p) {
  if (!p) return null;
  const exe = path.win32.basename(p).toLowerCase();
  const known = KNOWN[exe];
  if (known) {
    if (known === "Path of Exile" && /path of exile 2/i.test(p)) return "Path of Exile 2";
    return known;
  }
  if (IGNORE_EXE.test(exe)) return null;
  for (const re of LIBRARIES) {
    const m = p.match(re);
    if (!m) continue;
    const folder = m[1].trim();
    if (NOT_GAMES.has(folder.toLowerCase())) return null;
    return folder.replace(/_/g, " ").replace(/\s+/g, " ").slice(0, 64);
  }
  return null;
}

/** The game being played now, or null. */
function detect(prev) {
  const n = native();
  if (!n) return null;
  const pids = new Uint32Array(4096);
  const needed = [0];
  if (!n.EnumProcesses(pids, pids.byteLength, needed)) return null;
  const count = Math.min(pids.length, Math.floor(needed[0] / 4));
  const alive = new Set();
  const found = new Map(); // pid → game
  for (let i = 0; i < count; i++) {
    const pid = pids[i];
    if (!pid) continue;
    alive.add(pid);
    const game = gameFromPath(exePath(n, pid));
    if (game) found.set(pid, game);
  }
  for (const pid of pathCache.keys()) if (!alive.has(pid)) pathCache.delete(pid);
  if (!found.size) return null;
  // Prefer the game in front, then the one we already reported (no flapping), then any.
  try {
    const fg = n.GetForegroundWindow();
    if (fg) {
      const out = [0];
      n.GetWindowThreadProcessId(fg, out);
      if (found.has(out[0])) return found.get(out[0]);
    }
  } catch {
    /* ignore */
  }
  const names = [...found.values()];
  if (prev && names.includes(prev)) return prev;
  return names[0];
}

let timer = null;
let current = null; // { name, since } | null

function start(win, ipcMain) {
  const send = () => {
    if (!win.isDestroyed()) win.webContents.send("activity", current ? { name: current.name } : null);
  };
  ipcMain.on("activity-query", (event) => {
    if (event.sender === win.webContents) send();
  });
  const tick = () => {
    let name = null;
    try {
      name = detect(current && current.name);
    } catch (err) {
      console.warn("activity: detect failed", err && err.message);
    }
    if ((name || null) === (current ? current.name : null)) return;
    current = name ? { name, since: Date.now() } : null;
    send();
  };
  setTimeout(tick, 3000);
  timer = setInterval(tick, INTERVAL_MS);
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { start, stop, gameFromPath };
