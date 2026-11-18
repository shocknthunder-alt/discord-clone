// Global keyboard listener (works while a game has focus). Forwards every key press/release to the
// renderer as a KeyboardEvent.code string; the client decides whether it matches the PTT binding.
const { UiohookKey, uIOhook } = require("uiohook-napi");

// uiohook keycode -> KeyboardEvent.code
const CODE_BY_KEYCODE = new Map();
for (const [name, keycode] of Object.entries(UiohookKey)) {
  let code = name;
  if (/^[A-Z]$/.test(name)) code = `Key${name}`;
  else if (/^[0-9]$/.test(name)) code = `Digit${name}`;
  else if (name === "Ctrl") code = "ControlLeft";
  else if (name === "CtrlRight") code = "ControlRight";
  else if (name === "Alt") code = "AltLeft";
  else if (name === "Shift") code = "ShiftLeft";
  else if (name === "Meta") code = "MetaLeft";
  else if (/^Numpad(End|Arrow|Page|Home|Insert|Delete)/.test(name)) continue; // numlock-off aliases
  CODE_BY_KEYCODE.set(keycode, code);
}

// KeyboardEvent.code -> uiohook keycode (= Windows set-1 scan code; 0xE0xx / 0x0Exx = extended key).
const KEYCODE_BY_CODE = new Map();
for (const [keycode, code] of CODE_BY_KEYCODE) if (!KEYCODE_BY_CODE.has(code)) KEYCODE_BY_CODE.set(code, keycode);
for (const [code, alias] of [["AltRight", "AltRight"], ["ShiftRight", "ShiftRight"], ["MetaRight", "MetaRight"]]) {
  if (!KEYCODE_BY_CODE.has(code) && UiohookKey[alias] !== undefined) KEYCODE_BY_CODE.set(code, UiohookKey[alias]);
}

/** { scan, extended } for a KeyboardEvent.code, or null. */
function scanCodeFor(code) {
  const keycode = KEYCODE_BY_CODE.get(code);
  if (keycode === undefined) return null;
  const high = keycode & 0xff00;
  return { scan: keycode & 0xff, extended: high === 0xe000 || high === 0x0e00 };
}

let started = false;

function startGlobalKeys(send) {
  if (started) return;
  started = true;
  const forward = (down) => (e) => {
    const code = CODE_BY_KEYCODE.get(e.keycode);
    if (code) send(code, down);
  };
  uIOhook.on("keydown", forward(true));
  uIOhook.on("keyup", forward(false));
  // 1.10.0+: the extra mouse buttons too (middle / back / forward), as "Mouse3" / "Mouse4" / "Mouse5" —
  // usable for push-to-talk and hotkeys while a game has focus. Left/right clicks are never sent.
  const mouse = (down) => (e) => {
    if (e.button >= 3 && e.button <= 5) send(`Mouse${e.button}`, down);
  };
  uIOhook.on("mousedown", mouse(true));
  uIOhook.on("mouseup", mouse(false));
  uIOhook.start();
}

function stopGlobalKeys() {
  if (!started) return;
  started = false;
  try { uIOhook.stop(); } catch { /* already stopped */ }
}

module.exports = { startGlobalKeys, stopGlobalKeys, scanCodeFor, uIOhook };
