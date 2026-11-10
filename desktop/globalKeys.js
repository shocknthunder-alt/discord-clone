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
  uIOhook.start();
}

function stopGlobalKeys() {
  if (!started) return;
  started = false;
  try { uIOhook.stop(); } catch { /* already stopped */ }
}

module.exports = { startGlobalKeys, stopGlobalKeys };
