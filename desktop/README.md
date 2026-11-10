# ШмиркаТа — desktop app (Electron)

Shell that serves the **built client from inside the app** (a fixed version, independent of the
website) and talks to the same production servers.

## Status
First skeleton — **not built or run yet.** Written so the work isn't lost; see the TODO list.

## Run / build
```
cd desktop
npm install
npm start          # builds the client (production URLs) and opens the app
npm run dist       # Windows installer in desktop/dist/ (Shmirka Setup x.y.z.exe)
```

## How it works
- `build-client.mjs` builds `../client` with the production API/socket/media URLs into `client-dist/`.
- `main.js` serves `client-dist/` on `http://localhost:47321` (fixed port → same origin → saved login),
  answers CORS for that origin (so the servers don't need changing), grants mic/camera/screen
  permissions and opens external links in the browser.

## TODO
1. `npm install` and the first real run; fix whatever breaks.
2. Global push-to-talk that works inside games (`uiohook-napi`, forward keys to the client's PTT logic).
3. Screen/window picker so games can be shared, with optional system audio (loopback).
4. App icon (`build.win.icon`), then the installer; test the SmartScreen "More info → Run anyway" flow.
5. Client: skip `UpdateBanner` when `window.shmirkaDesktop` exists.
6. Check YouTube embeds work from the `localhost` origin.
