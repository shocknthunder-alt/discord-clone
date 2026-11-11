// Per-application audio capture for screen sharing (Windows).
//
//  - sharing a WINDOW  -> only that program's sound (its whole process tree, so a browser's audio
//                         helper process is included);
//  - sharing a SCREEN  -> all system sound EXCEPT this app's own (the friends' voices), so viewers
//                         never hear themselves back.
//
// Uses Windows' "process loopback" (build 20348+ i.e. Windows 11 / recent Win10). Anywhere it isn't
// available start() answers "loopback" and the caller falls back to Chromium's whole-system loopback.
const { execFile } = require("node:child_process");
const os = require("node:os");

let loopback = null;
try {
  loopback = require("loopback-capture");
} catch (err) {
  console.warn("loopback-capture unavailable, using whole-system audio:", err.message);
}

function isSupported() {
  if (!loopback || process.platform !== "win32") return false;
  const build = Number(os.release().split(".")[2]);
  return build >= 20348;
}

// Window source ids look like "window:<HWND>:0"; ask Windows which process owns that window.
function windowProcessId(sourceId) {
  const match = /^window:(\d+):/.exec(sourceId);
  if (!match) return Promise.resolve(null);
  const hwnd = match[1]; // digits only (validated above), safe to embed
  const script =
    "Add-Type -Namespace W -Name U -MemberDefinition '[DllImport(\"user32.dll\")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);';" +
    `$p=[uint32]0; [void][W.U]::GetWindowThreadProcessId([IntPtr][long]${hwnd}, [ref]$p); $p`;
  return new Promise((resolve) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      { timeout: 10000, windowsHide: true },
      (err, stdout) => {
        const pid = Number(String(stdout).trim());
        resolve(!err && Number.isInteger(pid) && pid > 0 ? pid : null);
      },
    );
  });
}

let capture = null;

function stop() {
  if (!capture) return;
  try {
    capture.stop();
  } catch {
    // already stopped
  }
  capture = null;
}

/**
 * Starts capturing for the chosen source and streams 16-bit stereo 48 kHz PCM chunks to onChunk.
 * Resolves "native" when running, "loopback" when the caller should use Chromium's system loopback.
 */
async function start(sourceId, onChunk) {
  stop();
  if (!isSupported()) return "loopback";
  try {
    const next = new loopback.LoopbackCapture();
    if (sourceId.startsWith("screen:")) {
      next.startSystemAudio((chunk) => onChunk(chunk), process.pid);
    } else {
      const pid = await windowProcessId(sourceId);
      if (!pid || pid === process.pid) return "loopback";
      next.start(pid, (chunk) => onChunk(chunk));
    }
    capture = next;
    return "native";
  } catch (err) {
    console.warn("per-app audio capture failed, using whole-system audio:", err.message);
    return "loopback";
  }
}

module.exports = { start, stop };
