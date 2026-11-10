// One-off: renders build/icon.png (512x512) — run with `npx electron make-icon.js` (without ELECTRON_RUN_AS_NODE).
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2a2118"/><stop offset="1" stop-color="#0e0b08"/></linearGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f3d58a"/><stop offset="1" stop-color="#b8862f"/></linearGradient>
  </defs>
  <rect x="16" y="16" width="480" height="480" rx="104" fill="url(#bg)" stroke="#b8862f" stroke-width="8"/>
  <text x="256" y="368" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="330" text-anchor="middle" fill="url(#gold)">Ш</text>
</svg>`;

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 512, height: 512, show: false, transparent: true, frame: false });
  await win.loadURL("data:text/html,<meta charset='utf-8'><body style='margin:0;background:transparent'>" + encodeURIComponent(svg));
  await new Promise((r) => setTimeout(r, 500));
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: 512, height: 512 });
  fs.writeFileSync(path.join(__dirname, "build", "icon.png"), img.toPNG());
  app.quit();
});
