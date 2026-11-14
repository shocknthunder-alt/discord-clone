# ШмиркаТа (repo: discord-clone) — context for Claude

Friend-group Discord/Slack-style app, built iteratively with the owner (Bulgarian speaker; short
messages + screenshots; expects: implement → type-check → commit → push → deploy). Reply in Bulgarian.
Owner pronouns unknown: use they/them.

## Layout / deploys
- `client` Vite+React+Zustand → Vercel (auto on push to `main`), https://shmirka.vercel.app
- `server` Express+Socket.IO+Prisma+Postgres(Neon) → Render (auto; runs `prisma migrate deploy` on start;
  build command scoped to shared+server, set in the Render dashboard). Prod URL: https://discord-clone-xhmz.onrender.com
- `media-server` mediasoup SFU on **Hetzner Cloud CPX02** (Helsinki, 1 vCPU/1 GB + 2 GB swap, 20 TB traffic,
  ~€6.6/mo, since 2026-11-12) → **manual deploy**: `ssh -i ~/.ssh/hetzner_ed25519 root@65.21.151.146`, then as
  user `shmirka` in `~/discord-clone`: git pull, `npm ci -w media-server`, `npm run build -w media-server`;
  `systemctl restart shmirka-media.service` (restart drops calls). nginx + certbot, ufw (22/80/443, 44444 tcp+udp).
  URL https://65.21.151.146.nip.io = Vercel env `VITE_MEDIA_SERVER_URL` (change there + Redeploy).
  Measured: 1 viewer of a ~35 Mbps stream ≈ 24% CPU — upgrade to CPX22 via Rescale if 4+ viewers stutter.
  Old Oracle SFU (https://130.61.251.202.nip.io, `~/.ssh/oracle_sfu_ed25519 ubuntu@`) still running as fallback.
- `packages/shared` types + socket events (rebuild with `npm run build -w packages/shared` before tsc).
- `desktop` Electron shell (loads the live site). **Self-update since 1.6.0** (electron-updater, GitHub
  Releases of this public repo): bump `desktop/package.json` version, then in `desktop/`
  `GH_TOKEN=... npm run release` (or `npm run dist` + upload `dist/Shmirka-Setup-X.exe`, `.blockmap` and
  `latest.yml` to a GitHub release tagged `vX`). Apps check every 30 min, download quietly, page shows
  "Рестартирай" (DesktopUpdateBanner); shells < 1.6.0 get a one-time "install the new version" banner.
- Windows machine: Git Bash + PowerShell; prefer the Write tool for files with quotes/heredocs.
- Type-check: `npx tsc --noEmit -p client/tsconfig.json` and `-p server/tsconfig.json`. Commit trailer: Co-Authored-By.
- `prisma migrate dev` locally hits the PRODUCTION Neon DB — write migrations by hand when possible.

## What exists (all deployed unless noted)
- Text chat: Slack-style message toolbar (reactions, reply threads, ⋮ menu), custom emojis, live channel
  rename, drag-and-drop channel reorder, **message search** (Ctrl+K, all channels, jump-to-message).
- Voice (SFU): mic processing/noise gate, push-to-talk (browser only — global PTT needs the desktop app),
  **camera**, screen share with Smooth (60fps, H.264 if router offers it) / Sharp modes, single layer,
  movable user tiles (unlock layout), LIVE banner/edge/title for the streamer, music player (YouTube,
  synced; collapsed/expanded persisted; default volume 10 (old saved 15 migrates to 10), peers default 50).
- Stream **frames** (Settings → Stream Frame; button 🎬 while watching): retro TV, cinema, monitor, neon,
  furry monster, dark fantasy, PoE2, fire&ice, dragon, berserker, pickle jar. Image frames are cut-outs in
  `client/public/tv/*.webp` (made with GrabCut/Pillow; geometry in `client/src/components/streamFrames.tsx`).
- **Themes**: 15+ palettes via CSS variables (`client/src/theme/themes.ts`), default Path of Exile 2.
- **Trivia channel** (`🎲 trivia`, type="trivia"): IRC-style bot (`server/src/trivia/*`), free-text answers,
  hints, streaks, `!trivia [n] [category|en]`, `!top`, `!score`, `!cats`; ~990 Bulgarian questions + endless
  math/anagrams + English from OpenTDB/The Trivia API.
- **Events board** (📅 above Text Channels; `ServerEvent`/`EventRsvp`, `server/src/events/scheduler.ts`):
  name/description/date/time/end/cover image/voice channel or place/limit+reserves/daily-weekly repeat,
  RSVP ✅/🤔/❌, today banner + 📅 dot on the server icon, toasts for new events, personal reminders
  (Settings → Известия, 5/15/60 min) done client-side; the "Събития" bot posts in #general 15 min before
  (server, every 30 s — missed if Render is asleep). .ics + Google Calendar export.
- **Ranks & permissions** (`Role`, `Membership.roleId`; bit flags in `packages/shared/src/permissions.ts`,
  server checks in `server/src/permissions.ts` — `can()` / `outranks()`): one rank per member, default rank
  "Член" auto-created; owner = everything; you only manage people/ranks BELOW yours. Server Settings has
  Общи / Рангове / Членове tabs. Usernames are coloured by rank.
- **Member list** on the right (👥 in the chat header toggles it): online grouped by rank, then offline,
  🔊 shows who is in voice; click → message / rank / move / disconnect / kick. Voice channels show a count.
  Drag a person onto another voice channel to move them (`voice:move-member` → `voice:moved`, the moved
  client re-joins itself).
- Voice HUD buttons are docked by default at the bottom of the channel list (2 rows of 4 + lock button);
  `hudLayoutV2` reset everyone's saved HUD positions once.
- Update banner: polls `/version.json`; silent reload if not in voice and tab hidden.

## Pending / ideas
1. Hardware encoding (NVENC/AMF): measured on the owner's RTX 5060 Ti — Chromium hands only H.264
   **High** (64xxxx) to the GPU ("MediaFoundationVideoEncodeAccelerator (NVIDIA H.264 Encoder MFT)"),
   Constrained Baseline 42e01f is ALWAYS OpenH264, and Electron 33 never used the GPU at all (45 does,
   no flags needed; Chromium feature flags didn't help). So: router offers H.264 High 640034 first,
   client prefers it in Smooth mode, desktop 1.4.0 = Electron 45. Diagnostics "Енкодер" row shows which.
2. Streamer diagnostics panel (real fps, bitrate, `qualityLimitationReason`) — colleague saw stutter only in
   Torchlight Infinite (particle-heavy) while CS2/Apex were smooth.
3. Electron desktop app (bundled client, global PTT via uiohook-napi, screen/window picker + loopback audio,
   icon, installer; friends keep the installed version until given a new one).
4. Cleaner cut-outs for fire&ice/dragon/berserker frames; optional DM search; more trivia questions
   (owner may supply a question file); Cinema/Monster frames are still vector, not image-based.
5. Rename project "discord-clone" → "Шмирка" eventually (owner wants it, not urgent).

## Gotchas learned
- Don't touch `updatedAt` of music state without folding elapsed time into `positionSeconds` (restart bug).
- `videoTrack.contentHint = "detail"` forces screencast mode (low fps) — keep "motion" for games/video.
- Older deployed clients keep talking to the shared server: change it additively.
- Screen-share bitrate ceilings (SfuMediaManager): Light 7 / Standard 14 / High 40 Mbps (Sharp a bit more);
  too-low ceilings = "smears when moving". Viewers get `jitterBufferTarget = 120` ms on screen consumers.
  Settings → Stream → Кодиране: GPU (H.264 High) / CPU (Baseline OpenH264 or VP8) + auto "refresh encoder"
  every 3/5/8 min; 🔄 in the 📊 panel = `refreshScreenVideo()` (new producer, same track, `stopTracks:false`;
  media server closes the old one; viewers keep watching via a 4 s grace in handleProducerClosed). Added for
  a friend on RX 7900 XTX whose game lost fps ~every 10 min of streaming until the share was restarted.
  Browser sharers on Firefox show "H264 · процесор", no "Енкодер" row, ~30 fps — tell them to use the desktop app.
