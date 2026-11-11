# ШмиркаТа — desktop app (Electron)

Shell that serves the **built client from inside the app** (a fixed version, independent of the
website) and talks to the same production servers.

## Status
Skeleton **builds and launches** (verified: `npm install`, client build, window + local server). Not yet tested end-to-end (login, voice, screen share); see the TODO list.

Note: `npm start` goes through `start.mjs`, which unsets `ELECTRON_RUN_AS_NODE` (VS Code's terminal sets it and breaks Electron).

## Run / build
```
cd desktop
npm install
npm start          # opens the app (loads the live site)
npm run dist       # Windows installer in desktop/dist/ (Shmirka Setup x.y.z.exe)
```

## How it works (v1.1+)
The app is a thin shell that loads the live site (`https://shmirka.vercel.app`), so every client update
reaches desktop users immediately - a new installer is only needed when the shell itself changes
(`main.js`, `preload.js`, `globalKeys.js`). The shell adds what a browser can't: global push-to-talk
(`uiohook-napi`), the screen/window picker and system-audio loopback. The client feature-detects
`window.shmirkaDesktop`, so an older installed shell keeps working with a newer site. Offline -> a retry page.
(v1.0 bundled the client inside the installer; those installs stay on that old client until reinstalled.)

## TODO
1. ~~`npm install` and the first real run~~ done; still test login/voice/screen share by hand.
2. ~~Global push-to-talk~~ implemented (uiohook-napi in `globalKeys.js` -> IPC -> `handlePushToTalkKey`); needs a hands-on test with a game in the foreground.
3. ~~Screen/window picker~~ implemented (in-app picker + optional loopback system audio); needs a hands-on test.
4. ~~App icon + installer~~ done: `npm run dist` -> `desktop/dist/ШмиркаТа Setup 1.0.0.exe` (unsigned; SmartScreen "More info -> Run anyway"). Icon: `build/icon.*` (regenerate with `make-icon.js`).
5. ~~Client: skip `UpdateBanner` when `window.shmirkaDesktop` exists.~~ done.
6. Check YouTube embeds work from the `localhost` origin.
