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
  First GitHub release: v1.6.1 (2026-11-14, owner uploads manually — no `gh`/token here). Download links
  (`DESKTOP_DOWNLOAD_URL`) point to `/releases/latest`, so no more Drive uploads.
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

- **yogurthub music** (friend's Navidrome/Subsonic; octo.* = library + Tidal on demand): Render env
  `SUBSONIC_URL` (https://octo.yogurthub.xyz), `SUBSONIC_USER`, `SUBSONIC_PASSWORD` (never in the repo).
  `server/src/music/subsonic.ts` + `/api/music/subsonic/*`; socket `music:add-tracks`; queue items with
  `source:"subsonic"` + signed `streamUrl` (192k MP3 transcode, not seekable → `&timeOffset=N` for the
  shared position); client plays them in an `<audio>` in `musicPlayerEngine.ts`; 🎧 button → SubsonicSearchModal.
- **Remote control** (ticket 001, desktop 1.7.0+ streamer): viewer "🖱 Поискай контрол" on a watched
  stream → streamer prompt Разреши/Откажи → viewer's mouse/keys over the picture (`rc-capture` overlay in
  ScreenSharePlayer, coords 0..1 of the letterboxed video) relayed by the server (`control:*`, same voice
  channel only) → `desktop/remoteControl.js` injects with SendInput via **koffi** (screen = display bounds,
  window = DWM frame bounds; scan codes from uiohook keycodes). Safety: red always-on-top bar with Спри,
  Ctrl+Alt+Esc, streamer moving own mouse, stream end/leave/reload all stop it; held keys released.
  Client logic in `client/src/webrtc/remoteControl.ts`. Not from pop-out windows; anti-cheat games may ignore it.
- **Google / Microsoft sign-in**: Render env `GOOGLE_CLIENT_ID`, `MICROSOFT_CLIENT_ID` (public IDs; no
  secrets). Client gets an ID token (Google Identity Services button / MSAL `loginPopup`, redirect page
  `client/public/msal-redirect.html`), server verifies it with `jose` against the providers' JWKS
  (`server/src/utils/oauth.ts`, `controllers/oauth.controller.ts`); `OAuthIdentity` table links accounts.
  Same e-mail: Google (email_verified) links directly, Microsoft asks the password once (`/oauth/link`).
  New people get an account with a random password. Desktop app: Google refuses embedded sign-in, so the
  button opens the system browser at `/desktop-login?code=` and the app polls `/api/auth/handoff/:code`.
- **Accounts**: login with e-mail OR username; Settings → Акаунт и парола (change password/e-mail);
  login page: Забравена парола / Забравен имейл (masked) / Смяна на паролата; `/reset-password?token=`
  page. Reset tokens use a key derived from JWT_SECRET (never valid as sessions) + a fingerprint of the
  current password hash (single use). E-mail only if Render env `BREVO_API_KEY` + `MAIL_FROM` are set;
  otherwise the server OWNER makes a 24 h link (Членове → person → 🔑 Линк за нова парола).

- **Clips / voice messages / watch together / overlay** (2026-11-15):
  - Attachments ride in `imageUrl` with a URL fragment (`#voice=<ms>.<peaks>`, `#clip=<ms>`,
    `client/src/utils/attachments.ts`), uploaded to Cloudinary `video/upload` (clips play the `.mp4`
    Cloudinary makes). ChatImage dispatches to VoiceMessage/ChatVideo.
  - ✂️ Клип (last 30 s): `webrtc/clipBuffer.ts` → worker `clipWorker.ts` (MediaStreamTrackProcessor on cloned
    tracks → WebCodecs H.264 with a keyframe every 1 s we request + Opus, ~35 s kept) → `webmMux.ts` (own
    WebM writer, checked with ffprobe). MediaRecorder ignored keyframe requests → 5 s clips. Setting `clipBuffer`.
    Clip audio (2026-11-24) = `ClipAudioMix` (WebAudio, 48 kHz + limiter): the stream's sound + the call's voices
    (`getClipVoiceTracks`: others' mic consumers, own processed mic — silent when muted), re-synced every 2 s;
    prefs `clipVoices` / `clipMyMic` (Settings → Клипове).
  - Screen-share adaptation also cuts on UPLOAD packet loss (remote-inbound-rtp; 8% once / 4% twice → 80% of the
    sent rate, +15% after 30 s clean); 📊 shows "Загуби при качване" + the ceiling.
  - 📺 in the music player: the synced YouTube iframe box (never moved in the DOM) is repositioned
    over `MusicVideoWindow`.
  - Desktop 1.8.0 `overlay.js`/`overlay.html`: click-through always-on-top window, shown only when the
    foreground window covers its display without a title bar (koffi) and our window isn't focused;
    fed by `DesktopOverlayFeed` via `overlay-update`. Settings → Глас → Овърлей в игрите.

- **Chat upgrades** (2026-11-16):
  - **Formatting** `client/src/utils/markdown.tsx` (own parser: **b** *i* __u__ ~~s~~ `code` ```block```
    ||spoiler|| > quote # heading -# small, \ escapes, <link> = no preview) via `MessageText.tsx` in
    channel/thread/DM views. Message box is `ChatTextarea` (Enter sends, Shift+Enter new line, @-suggestions).
  - **@mentions** `packages/shared/src/mentions.ts` (whole-name match, names may contain spaces; @everyone/@here).
    Server `notifyMentions` in chat.gateway → `mention:new` to `user:<id>` rooms; client `mentionStore`
    (red @N on channel + server icon, cleared when viewed), ding `playMentionSound`, notification click jumps.
  - **📌 Pins**: `Message.pinnedAt/pinnedById` (migration 20261116120000), `message:pin` (any member, max 50
    per channel) → `message:pinned`; `GET /api/text-channels/:id/pins`; `PinsPanel` from the 📌 header button.
  - **Link previews**: `GET /api/media/unfurl?url=` (`server/src/utils/unfurl.ts`: public IPs only, 6 s,
    512 KB, 6 h cache; YouTube via oEmbed) → `LinkPreviews.tsx` (YouTube plays inline). Pref `linkPreviews`.
  - **GIFs**: Tenor API died 2026-06-30 → GIPHY via `/api/media/gifs/*`; needs Render env `GIPHY_API_KEY`
    (button hidden without it). GIF is sent as `imageUrl`.
  - **🎮 What I'm playing**: desktop 1.9.0 `activity.js` (koffi K32EnumProcesses + exe paths every 15 s; known
    exe list + Steam/Epic/Xbox/GOG/EA/Ubisoft/Riot library folder names) → `onActivity` → `ActivityReporter`
    → `presence:activity` → server memory map (`server/src/presence/activity.ts`, cleared on disconnect) →
    `presence:activity-updated`; `MemberDTO.activity`; shown in member list + 🎮 in voice lists. Pref `shareActivity`.
    Desktop **1.11.0** also sends the game's icon (`app.getFileIcon(exe)` → 32×32 PNG data URL, `activity.icon`,
    server accepts only `data:image/png;base64` ≤ 16 KB); `GameIcon.tsx` shows it (🎮 fallback) in the channel
    list, member list and voice tiles.
  - **Edit history** (`MessageEdit`, saved on every edit; `GET /api/messages/:id/edits`; "(редактирано)" opens it),
    **📊 polls** (`Poll`/`PollVote`, `server/src/polls.ts`, `poll:create` / `poll:vote` {close} → `poll:updated`;
    `Polls.tsx`; results hidden until you vote), **custom status** (`User.customStatus/Until`, PATCH /api/auth/me
    `customStatus` + `customStatusHours`; set by clicking yourself in the member list), **🔕 mutes** (client-only
    `muteStore`; right-click a text channel / server icon; direct @mentions still come through).
  - **🗂️ Forum channels** (`TextChannel.type = "forum"`): `ForumView` (topics = thread roots, content
    `# Title\nbody`; `GET /api/text-channels/:id/forum`, `GET /api/messages/:id/thread`), replies in `ThreadPanel forum`.
  - **🏷️ Stickers** (`Sticker` table, `/api/servers/:id/stickers`, `stickers:changed`; sent as `imageUrl#sticker`,
    `StickerPicker`; add = ADD_EMOJIS perm, delete = uploader or MANAGE_MESSAGES).
  - Gotcha: `node - <<'EOF'` edit scripts LOSE backslashes in this shell (`/\s+/` became `/s+/`) —
    put such scripts in a .cjs file in the scratchpad, or use the Edit tool.

- **📱 Mobile** (2026-11-17):
  - Phone layout below 760px (`store/mobileStore.ts`, `mobile.css`): `.app-shell.mobile.pane-nav|pane-content`,
    ☰ `MobileNavButton` in chat headers, history entry so Back returns to the list, `MobileVoiceBar` replaces
    the floating HUD, member list / threads full screen. No screen share on phones.
  - PWA: `client/public/manifest.webmanifest`, `icons/`, `sw.js` (no caching, only push + notification click).
  - Push (`server/src/push/push.ts`, `/api/push/*`, `PushSubscription`, `AppConfig` tables): Web Push with
    VAPID keys auto-made and stored in AppConfig (own RFC 8291 encryption) + FCM v1 (Render env
    `FCM_SERVICE_ACCOUNT`, optional). Sent for direct @mentions/@everyone, DMs, calls — only when none of the
    user's sockets reports visible (`client:visibility`; sockets that never report count as visible).
    Client `native/push.ts`, Settings → Известия → 📱. Tap → `/?go=ch:server:channel:msg:root` or `dm:<id>`.
  - Android app `mobile/` (Capacitor 8, standalone package, NOT a workspace; loads the live site via
    `server.url`): `ShmirkaNativePlugin` (info / startCall / stopCall / openExternal), `CallService`
    foreground service (mic + media) while in voice. Client talks to it via `window.Capacitor` (`native/native.ts`).
    `.github/workflows/android.yml` builds a signed `Shmirka.apk` onto the **"android" pre-release** (pre-release
    so the desktop updater's `/releases/latest` is untouched). Secrets: `ANDROID_KEYSTORE_BASE64`,
    `ANDROID_KEYSTORE_PASSWORD` (keystore kept on the owner's PC in `~/.shmirka-android/`, alias `shmirka` —
    never lose it, or phones refuse updates), optional `GOOGLE_SERVICES_JSON`. New APK: bump versionCode/Name in
    `mobile/android/app/build.gradle` + `LATEST_ANDROID_VERSION_CODE` in `native/native.ts`. Web changes need no new APK.

- **⌨️ Hotkeys** (2026-11-18, Settings → Клавиши, hidden on phones): `client/src/hotkeys/hotkeys.ts` (actions +
  defaults, `useHotkeyStore` in localStorage `hotkeysV1` = only overrides + per-channel rows, combo strings
  `Ctrl+Alt+Shift+Meta+<KeyboardEvent.code|Mouse3|Mouse4|Mouse5>`, `startHotkeys` listener), `hotkeyActions.ts`
  (what each does, started in AppShell), `HotkeySettings.tsx`, `HotkeyToast.tsx`. Component-owned actions
  (voice message record/send, clip, music volume/mute/type box, open settings) register via
  `useHotkeyTarget(name, fn)` — newest mounted wins. Desktop global keys run only when `!document.hasFocus()`
  (no double fire) and only for 🌐 actions. Plain keys are refused (need Ctrl/Alt/Shift) except F-keys, Numpad,
  mouse buttons; inside text boxes arrow/Backspace combos without Alt stay with the text box. Ctrl+K is now
  just the default of the "search" action. Push-to-talk accepts mouse buttons too. Desktop **1.10.0**
  `globalKeys.js` also forwards uiohook mouse buttons 3–5 as `Mouse3..5` (preload flag `mouseButtons`).

- **🧱 Шметрис** (2026-11-22, channel type="blocks", solo falling blocks; owner asked for "Tetris like the
  original" — refused the name/look, own palette + name): migration 20261122120000 adds `BlockScore` + a "шметрис"
  channel to every server. Game runs client-side: `components/blocks/engine.ts` (10×20 + 2 hidden rows, rotation
  kicks, 7-bag, hold, 3 next, ghost, 500 ms lock delay / 15 resets, T-spin 3-corner, combo, back-to-back, level per
  10 lines; **2026-11-25 extras**: spins for every piece (stuck after a rotation) + T-mini, perfect clear bonus, back-to-back
  chain ×1.5..×3, fever (clears ≤1 piece apart: 3/5/8 in a row = ×1.5/×2/×3, glowing well), bonus cells in 10% of pieces
  (`tags` grid parallel to `board`, `queueBonus`/`holdBonus`, `bonusCell()` follows rotation): 💣 5×3, ⚡ column,
  🌈 same colour, ⏳ gravity ×2.5 slower 10 s — fire when their row clears, then column gravity + cascades; 🐉 rage meter
  (lines/combos/spins/missions) → V / 🔥 touch button burns the bottom 3 rows + ×2 points 10 s; 🎯 missions (`MISSION_TEXT`,
  +500×level, dragon +3 growth, +30 rage); 🪙 golden rows (value 8, every 30 pieces while the top half is empty; clear
  = 150×level per cell; after 25 pieces → stone 9). Dev `window.__blocksGame()` for e2e. Server ceiling raised ×6), `BlocksGameView.tsx` (canvas, keys ←→↓ ↑/X Z A Space C/Shift P, touch buttons on coarse pointers,
  ↓ soft drop speed picker (`SOFT_DROP_MS`, localStorage `blocksSoftSpeed`, default 75 ms/row; a new piece waits 140 ms before soft-dropping), cells stamped from cached sprites + canvas size via ResizeObserver + the falling piece drawn between rows (`dropOffset`) for smoothness, pauses on blur, an unfinished game is kept paused when you leave the channel (module map `savedGames`); well fits the window, corner drag handle = own height in localStorage `blocksWellHeight`, ⛶ full screen), `sounds.ts` (WebAudio effects, glassy shatter on line clears; owns the audio graph), `music.ts` (`blocksMusic`: own tunes in 6 styles, 2 levels each — сърф рок (twang guitar + combo organ), диско, 80-те, рок, драм енд бас, епично 11+ (climbs a semitone per level); own synth voices (marimba, funk bass, supersaw pad, distorted power chords, reese, brass, choir, tremolo strings) + drums; riser + crash on level up, heartbeat when the stack is near the top; 🎵 toggle + volume, localStorage `blocksMusic`/`blocksMusicVol`), `Dragon.tsx` + `dragon.css` (🐉 the pet left of the well, replaced the old Бай Шмирко mascot the owner disliked: our own SVG dragon in profile looking at the well, every game starts from a new egg and it grows with THAT game's lines: Яйце 0 → Бебе 2 → Малко 8 → Младо 20 → Дракон 40 → Легендарен 70 (gold runes); colour = levels climbed in the game (`DRAGON_COLORS`, green → teal → blue → indigo → purple → magenta → orange → red → crimson → black-red with a red outline); per-stage scale of body/head/wings/eyes, horns + spikes appear; baby + small stay round/cute, from "Младо" on (stage 3+) `DragonFierce.tsx` draws a lean fantasy dragon (wedge head, slit eye, swept horns, bat wings with finger bones, S-neck, ridge spikes, tail blade; same class names, `.dr-fierce` origins) — owner wanted it less round as it grows (2026-11-25); egg cracks with progress and eyes peek out. Moods: sleep (not playing/paused), idle (bobs to the beat), c1–c4 by lines (hop → flaps + smoke → loop in the air → breathes fire at the well), danger, sad, grow (pop + sparkles + level sound). Owner's lines in the bubble, always Bulgarian. Name is editable (localStorage `blocksDragonName`, default Змейчо). Dev-only `window.__dragon(mood, stage?, color?)` for screenshots). Server `server/src/blocks.ts`: GET `/api/text-channels/:id/blocks`
  (top 10 + mine), POST `.../blocks/score` (sanity ceiling only, friends app).

- **🍬 Шмиксер** (2026-11-24, channel type="match", solo match-3; owner asked for "Candy Crush" — refused the name/look, own gems + name): migration 20261124120000 adds `MatchScore` (per server + user + mode "time"|"moves") + a "шмиксер" channel to every server. Server `server/src/match.ts` (GET `/api/text-channels/:id/match` = top + mine for both modes, POST `.../match/score`, sanity ceiling only). Client `components/match/`: `engine.ts` (8×8, 6 gems, a move → steps {popped, blasts, made, falls, spawned, combo, points}; 4 in a row = row/col rocket, L/T = bomb, 5 = prism; special pairs: cross / 3 rows+3 cols / 5×5 / prism+special / prism+prism = whole board; cascades; auto-shuffle when no move is left; **2026-11-25**: 2×2 square → ✨ firefly (pops its 4 neighbours + flies to a far gem, often a special; + rocket/bomb = carries it there, + firefly = 3 flights, prism + firefly = all of a colour become fireflies; blasts carry `tr/tc`), 🔥 fever = `streak` of strong moves (a cascade or a special) → ×1.5/×2/×3 (`feverOf`), move bonuses ⚡ Двоен удар (2+ specials made) / 💥 Мега ход (30+ gems), `timeBonus` seconds for long combos; server ceiling 200 000 per move), `MatchGameView.tsx` (DOM tiles moved with `transform` + `will-change` (never top/left: the blurred gem glows made that stutter), each tile a memoised `TileView`, sparks on one canvas (`SparkLayer`), the clock keeps the exact time in a ref and re-renders once a second, for falling, sparks / beams / rings / screen shake, combo banner Супер/Машина/Невероятно, hint after 6 s, modes 4 min / 60 moves (30 before 2026-11-26, same "moves" key) / ⚔️ duel, ⏸ 🔄 ⏹ buttons (`.mx-controls`), pause P/blur, unfinished game kept when leaving the channel, dev-only `window.__matchMove()` / `__matchBusy()` / `__matchBoard()` + `__matchSync()` for e2e), `Gems.tsx` (own SVG gem symbols, real cuts: hexagon, round brilliant, emerald cut, trillion, marquise, oval, each with a blurred glow + a glowing rune: fire / frost / lightning / sun / void / ember; owner rejected hearts/stars/drops; + rocket stripes / bomb / rainbow prism), `sounds.ts` (pentatonic pops rising with the combo, rocket whoosh, bomb boom, prism shimmer, fanfare). Music = `matchMusic` in `blocks/music.ts` (`MusicPlayer` takes a `StyleSet`; **2026-11-26** three own rock songs that take turns (`StyleSet.rotate` = 4 times round each; `Style.riff` power-chord riff with "x" palm-mute chugs, `bassFollowsRiff`, `leadEvery` 2 = lead every other time round, crash lane `z`): Галоп (E, 146), Пънк (D, 176), Хард рок (A, 128, shuffle); voices `rockGuitar` (double-tracked L/R, hot asymmetric drive + cabinet EQ), `rockBass`, `rockLead` (bends); hurry = +16 bpm + a semitone up in the last 20 s / 5 moves; board resizable by its corner, localStorage matchBoardSize). Board size uses container units (`100cqw`) of `.mx-view`.
- **⚔️ Duels** (2026-11-26) for Шмиксер and Шметрис: shared `packages/shared/src/matchDuel.ts` + `match:*` socket events, server `server/src/matchDuel.ts` (in memory: `match:watch` lobby per channel, seek / accept (`with`), 3.5 s countdown, relays scores + tiny board pictures (`MatchBoard.codes()` 64 / Шметрис visible well 200) + attacks, 10 s grace for a reload, end on time / forfeit / left / Шметрис top-out (`out: true`); wins in `MatchScore` mode "duel" / "blocks-duel": best = wins, bestCombo = best duel score; GET match lists have `duel`, GET blocks has `duel: {top, mine}`). Шмиксер duel = 2 min, higher score wins; attacks from a move (`attackOf`): prism → 🌀 scramble, bomb → 🪨 stones (engine `special:"stone"`, color -2, can't move, broken by a match next to it or a blast), rocket → 🌫️ fog (CSS overlay), combo ×4+/firefly → 🧊 ice (`tile.ice`, can't move); fever ×2+ = power +1; shown 1.8 s first (`DUEL_WARN_MS`), a strong move in that time blocks it (`match:duel-block`). UI `match/DuelPanel.tsx` (DuelLobby, OpponentCard + MiniBoard, AttackHelp). Шметрис duel = last one standing (max 10 min): `BlocksGame.versus`, `garbageOf(clear)` (2→1, 3→2, 4→4, spin ×2, b2b +1, combo, perfect +6, cascades, fever), your clears cancel `pending` first, the rest rise on a lock without a clear (grey rows with one hole, `GARBAGE` = STONE), dragon fire sends 3; red bar `.blk-garbage`, opponent `MiniWell`, Соло/Дуел switch (localStorage `blocksMode`), no pause in a duel.
  **👁 Spectating** (2026-11-24): lobby `playing` rows carry `duelId` + `spectators`; `LiveDuels` (👁 Гледай, in the duel lobby and under Play in the other modes) → `DuelSpectator` (DuelPanel.tsx, absolute over `.blk-view`, `container-type: size` sizes the boards) with `match:spectate` / `-stop` → server `Duel.spectators` (socket ids) gets `match:spectate-state` / `-update` (scores, boards, combo = Шметрис lines) / `-event` (attack / block) / `-over`. Шмиксер sends its board at the duel start too.
- **🧟 Шмиркленд** (2026-11-25, channel type="survivors", "survive the hordes" genre; owner said "like Vampire
  Survivors" — own name/folklore look, no copied names/art): migration 20261125120000 adds `SurvivorProfile` (userId PK:
  gold, upgrades {key: lvl}, bought heroes, stats `SurvStats`) + a "шмиркленд" channel to every server; top lists reuse
  `MatchScore` modes "surv" / "surv-coop" (best = seconds, bestCombo = kills). Shared `packages/shared/src/survivors.ts`
  (heroes + unlock rules, gold shop `SURV_META` cost = base × (lvl+1), curses + gold %, `survGoldMul`, co-op DTOs). Server
  `server/src/survivors.ts` (GET lists+profile, POST run (sanity ceilings, gold = (picked + s/10) × curses/greed, unlocks
  from stats), buy / refund / hero) and `server/src/survivorsCoop.ts` (in-memory parties ≤ 4 per channel, relays
  `surv:state` host→guests+👁 (volatile), `surv:input` guest→host (volatile), `surv:msg` reliable; host gone 10 s →
  "host-left"; guests' shop levels ride in `SurvMemberDTO.meta`). Client `components/survivors/`: `content.ts` (10 weapons ×8
  levels: цървул boomerang, прасе bouncing pig, Тесла chain lightning, кобилица orbit, гайда pulse ring, баница arc blast,
  чесън aura, ракия fire puddles, мартеница homing, пищов; 11 passives; evolution = weapon 8 + its passive, from a chest; 9
  heroes with a skill on Q/E; 9 enemies + 4 bosses Караконджул/Мора/Ламя/Змей every `BOSS_EVERY` 180 s; map events
  оброк/имане/прилепи/кукери/градушка; 7 curses), `engine.ts` (`World`, DOM-free; endless difficulty `hpMul` etc., spatial
  grid, dash Space with i-frames, shared XP `xpFor(level, players)`, level-up pauses until all picked (`round`), revive by
  standing next to a fallen mate, "Второ раждане"), `net.ts` (12 Hz snapshots: enemies/projs/gems as Int16 relative to an
  origin, gems every 3rd; `lerpView`; guests move themselves locally and send x/y), `sprites.ts` (all pictures drawn with
  canvas paths, cached + flash/ice/mirror variants, decor from a position hash), `render.ts` (zoom by area of ~920×540),
  `sounds.ts`, music = `survMusic` in `blocks/music.ts` (gaida + drone voices, 2 own folk-rock songs, boss = faster).
  `SurvivorsGameView.tsx`: menu (heroes, curses, co-op lobby, shop, top, bestiary), loop for solo / host / guest / 👁,
  HUD, cards (keys 1–4, 🎲 reroll), solo pause + kept when leaving the channel (`savedGames`). Dev-only `window.__surv()`,
  `__survXp(n)`, `__survWorld()`. e2e `15-survivors`. Balance checked with a headless autopilot sim (tsx).
  **2026-11-26 v2** (owner: waves, more weapons/bosses, harder, faster, bigger pickup radius, renamed heroes):
  WAVES (`WAVE_SECONDS` 30 + `WAVE_BREAK` 3; `World.wave/waveT/breakT/waveLeft/waveTotal`; difficulty by wave, not
  time; every `BOSS_WAVE_EVERY` 5th = boss wave until the bosses fall, two bosses from wave 25; swarm waves from 7);
  8 bosses (`BOSS_ORDER` + Вълчият цар, Баба Чума, Хала, Цар Вампир; enemy zone projs poison/tornado, batshot); new
  mobs wolf, yuda, pot (breakable стомна, always drops something); elite affixes (`AFFIXES`: бесен / брониран /
  взривоопасен / водач / неуморим, ring + label); 7 new weapons сърп (front arc slash), брадва (gravity arc), кавал
  (spiral notes), кошер (persistent bees), казан (bean turret), крик (delayed slam + stun), плашило (taunts enemies
  within 280); passives бяло сирене (+xp), пита мед (gold drops), луканка (+dmg to bosses/elites); kill streaks
  (`STREAKS` bonus gold); damage by weapon (`Player.dmgBy`, end-screen table); BASE_MAGNET 140, faster `xpFor`.
  Heroes keep their ids but are now: tseko = Киро Брейка (b-boy), gitsa = Спаска, strahil = Баткан (брадва, ground
  punch), gosho = Бай Гошууу, mitko = Митьо Крика (крик). Angular detailed hero art via `figure()` in sprites.ts.
  `SurvStats.bestWave`, `SurvRunDTO.wave` (optional, additive).
  **v3 (2026-11-26, owner: "more 3D, less emoji", better animations, big two-handed axes, harder, Пейо → Бай Шмирко)**:
  no real 3D (would need a WebGL engine + models for 400 enemies) — "2.5D" instead: heroes are rigged (`rig()` joints,
  frames 0..7 walk cycle, 8..9 breathing; `tube()` cylinder-shaded limbs, `shaded()` gradient shapes, shaded `head()`),
  sprite keys `h3:`; enemies / projectiles get a volume pass in `make(…, volume)` (keys `e:` / `p:`); renderer bobs and
  squashes walking enemies, Киро spins upside down, motion trails for spinning projectiles (`SPIN_TRAIL`, `lastPos`),
  garlic aura = wavy mist + circling garlic heads, gaida = wavy sound ring with notes, yoke swoosh + water drops, bee wing
  flaps. Брадва = a 64-px double-bladed axe thrown low through the crowd, curving, pierce ∞.
  **v4 (2026-11-26, goals + variety)**: every hero skill cd 20 s with its own big effect (`Renderer.skillFx`: rings,
  screen flash, cracks, particles; FX.skill carries x/y/`HEROES_ORDER` index), skill button glows when ready. 14 bosses
  (`BOSS_EASY` first then `BOSS_HARD`, shuffled per game in `World.bossQueue`, no repeat until all seen, then "Тъмен …"
  with +60% hp per cycle); each boss has 2 extra moves picked by its kind (`BossMove`: leap / firering / meteors /
  shield / summon / nova, telegraphed with MK.leap / MK.nova marks) + rage under 50% hp (faster, red glow); shield/rage
  bits 4096/8192 in the enemy flags. 5 new mobs (skeleton, raven, spider, firespirit, bear). Waves have named
  `WAVE_THEMES` (not repeated within the last ~6). 🎯 wave tasks (`World.task`, kill N of a kind / 12 s no hit / gems /
  pots / streak / elite → chest or heal + gold + XP). Meta goals: skins (`SURV_SKINS`, palette + tint, bought per hero
  "hero:skin" or unlocked by an achievement), 22 achievements (`SURV_ACHIEVEMENTS`, checked on POST run, gold added to
  goldEarned, `newAchievements`), bosses ever beaten (`bossTypes`). Stored in `SurvivorProfile.extra` (migration
  20261126120000); POST `/survivors/skin`; co-op members carry `skin` (server checks ownership).
  **v5 (2026-11-27, readability + bosses + skills)**: render order = our attacks (on an offscreen layer when the HUD
  ✨ slider `survFxAlpha` < 1) → danger marks + poison → actors → enemy shots (`FOE` kinds: dark halo + pulsing red edge,
  always on top). 🖱 mouse movement (`survMouseMove` off / hold left button / follow cursor; right click = dash; keys
  win). Every boss has its OWN two named spells (`BOSS_SPELLS` in content.ts, shown in the bestiary; moves + spiral /
  blink / wall-with-a-gap / acid (MK.acid → poison puddles)); first 10 waves cast less often. Skills scale with the wave
  (`skillDmg` = might × (1 + wave·0.14)); Баткан = "Вихър от брадви" (5 s whirl, pulls in, half damage, 12 axes at the
  end), Гошо 3 bell waves, Вела freeze → double damage (`shatterT`), Стана herb poison cloud (`herbs` flag 16), Спаска
  throws 16 banitsas. Skins are whole costumes (`costumeBack/Front/Glow` in sprites.ts, hero canvas 60×96, key `h4:`):
  Хайдутин (hood, cloak, mask), Сватбар (flower wreath, ribbons), Цар (crown, ermine, cape), Златен юнак (halo, laurel),
  Нестинар (charcoal + lava cracks + fire hair), Призрак (legs fade to a wisp, chains, glowing eyes).
  Co-op level-ups no longer stop the world (`World.pauseOnLevel` = solo only): whoever has cards open is shielded,
  host auto-picks after 15 s, a new level waits for the round. The host glides guests towards their 20 Hz positions
  (`netX/netY` + prediction along `dirX/dirY`) — they used to jump. Range inputs don't count as "typing" for the keys.
  **v6 (2026-11-27, owner: "look as good as Jotunnslayer, add similar features")** — 🧊 REAL 3D: `render3d.ts` (three.js,
  lazy-loaded chunk ~180 KB gz) on a WebGL canvas `.sv-canvas3d` UNDER the 2D canvas; `Renderer.draw(…, {three: true})` then
  skips ground/decor/actors/pickups and only overlays effects, numbers, marks, bars. Camera = hand-made OBLIQUE projection
  (`K` = 1.2: ground maps 1:1 to the 2D pixels, height goes up the screen) so both layers line up; 2D `shakeX/Y` is passed on.
  Models: CC0 KayKit packs (Adventurers / Skeletons / Halloween Bits) in `client/public/surv3d/*.glb`, built by
  `tools/surv3d/build.mjs` (meshopt, one shared rig, clips only in `skeleton_minion.glb`). Heroes = KayKit models recoloured by
  swatch cells of the 8×4 palette texture (`HERO3D`: model, visible parts, borrowed weapons, `cells(look)` from `skinLook`),
  AnimationMixer (idle/run/dodge/death/skill one-shot; Киро headspin, Баткан `2H_Melee_Attack_Spinning`). Humanoid enemies
  (`EN3D`) = skeleton models with the walk BAKED into float textures (VAT, `bakeVat`, gl_VertexID + texelFetch, one InstancedMesh
  per kind, per-instance tint/phase/flash); bosses (`BOSS3D`) own SkinnedMesh; animals/pickups = upright instanced sprites from
  the old 2D pictures (`bbSet`); props instanced per map set. 3D ANIMALS (2026-11-27): CC0 `a_*.glb` (oosawak/cc0-monsters, built by
  `tools/surv3d/animals.mjs`) — rat, vampire bat, wolf, bear, werewolf (own clips baked as VAT; models without clips bob +
  squash; `Enemy3D.clip` = clip name, `yaw` offset, `lift` for fliers) and bosses wolfking / bearking / zmey / lamia
  (`BossObj.own` clips). Spider, raven, fire spirit, pot stay upright pictures (the free 3D ones looked worse). Files can hold extra copies
  (rat.glb = 3 rats, vampire bat = static copies + a ground plane): `Enemy3D.only` keeps the named parts; the wolf model
  faces ±X (`yaw: -π/2`), the dragon +Z (no offset — check facing from the mesh, the highest part leans to the
  head; a wrong guess made Ламя walk tail first). Bosses face where they walk (they circle / charge), else the hero.
  Boss looks follow the old pictures (bestiary): `Boss3D.look` recolours KayKit people like heroes (Мора = witch with hat,
  Чума = hooded hag + staff, Цар Вампир = black/red cape, …), Караконджул = black werewolf; hala / swampking / ghostking
  have no fitting model and stay big upright pictures (not in BOSS3D). 3D zooms out by `THREE_ZOOM` 0.78 (`Renderer.zNow` is passed to the 3D layer); SPAWN_R 770.
  Balance after the gods: `giftHp()` = +5% enemy/boss hp per gift level (average per hero), wave bosses ×1.5 (and the map's
  hpMul), mission giants ×1.8. Toggle 🧊/🖼️ in the HUD (localStorage `survGfx`, phones default 2D).
  🗺️ MAPS (`MAPS` in content.ts, shared `SURV_MAPS`/`survMapsOpen`): Поляната → Мъртвата гора → Блатото → Пирин, each opens
  after winning the previous one's mission; own ground (`groundTile(map)`), light, scenery, favoured mobs, hp/dmg multiplier.
  🎯 MISSION mode (`World(…, {map, mission})`): 5 `altar` enemies (капища; guards wake on the first hit), each one = a
  gods'-gifts card round for everyone → portal (`MK.portal` 7, stand in it 4 s) → the map's giant (`FINAL_BOSSES`: velikan,
  gorskicar, blatnamaika, ledenvelikan, own AI cases) → `won` → over after 4 s; after `MISSION_SECONDS` (12 min) the giant
  comes by itself (+40% hp). Server: run `map/mission/won` (won only if ≥ 180 s), `missions` in SurvivorProfile.extra, win gold
  `winGold` (×2 first time), achievements mission1 / missionAll. ⚡ GODS' GIFTS (`GIFTS`, 4 gods × 4, levels 1–3): Перун
  lightning / crit chains / dash thunder / storm when hit, Велес poison (enemy `poisonT`, net bit 15) / bloom / skin / fang,
  Мокош veil (`veilN`, player flag 32) / water / thread / harvest, Дажбог flare / burn / wheel / dawn; 3 gifts of one god =
  blessing (`blessed`). Cards: every 5th level and every sanctuary = gifts only, else 22% one gift card. Damage index -3 =
  gifts. ᚱ RUNES (shared `SURV_RUNES`, POST `/survivors/rune` buy, `/survivors/runes` wear; 2 slots +1 at 3 bosses +1 after a
  mission win): stat runes + god runes (start with a gift of that god); co-op members get their worn runes from the server
  (`survRunesOf`). Net: enemy type now 6 bits (bit 14 = +32: there are > 32 kinds), snapshot `ms` = mission. e2e 15 test 3.
- **🎮 Games section** (2026-11-24): ChannelList puts channels of type trivia/draw/blocks/match/survivors (`GAME_TYPES`) in a folding "🎮 Игри (N)" section under the text channels (localStorage `gamesSectionOpen`; collapsed = only the open game + a dot for unread/mentions). New game types must be added to `GAME_TYPES`.
- **🎨 Paint Wars** (draw & guess; 2026-11-20, channel type="draw"; migration 20261120120000 adds a
  channel to every server + `DrawScore`, 20261120180000 renames it "paint wars"; owner asked for
  "Skribbl" — refused, that's another game's name): server `server/src/draw/game.ts` (all in memory, per
  channel: lobby → choosing 15 s → drawing N s with letter hints → reveal 6 s, every player draws once per
  round → over; guess points 50–150 + 25 first, drawer +30 per guesser; those who know the word chat only
  among themselves), words `draw/words.ts` (~390 BG). Socket `draw:*` (`packages/shared/src/draw.ts`):
  ops on a fixed 800×600 canvas (line chunks + flood fill, undo by stroke id), personalised `draw:state`.
  Client `components/draw/DrawGameView.tsx` + `drawCanvas.ts`; TextChatView renders it for draw channels.

- **🧪 E2E tests** (2026-11-21, `e2e/`, standalone package like `mobile/`, NOT a workspace): `npm run e2e` (or in `e2e/`:`npm test [-- tests/05] [-- -g name]`, `npm run report`). `run.mjs` starts a throw-away
  `embedded-postgres` (UTF-8!) → `prisma migrate deploy` → server/media/Vite on 4610/4710/5610 with their own JWT_SECRET,
  cwd `e2e/` so `server/.env` (PRODUCTION DB) is never loaded, plus a canary-user check in the local DB. Playwright with
  fake mic/camera; voice tests read real WebRTC inbound bytes. Plan + coverage + bugs found: `e2e/TEST_PLAN.md`.
  Contexts from `openAs()` must get permissions explicitly (newContext ignores `use`); voice channel locators need
  a case-sensitive regex ("General" also matches "# general").

- **✍️ Text style + 👑 owner look** (2026-11-21): `User.textStyle` (JSON, migration 20261121120000) = "Моят текст" in
  Settings → Чат (`MyTextStyleCard`, saves at once: colour / bold / italic / font mono|serif|hand|round), cleaned by shared
  `cleanTextStyle`, sent in `UserDTO` + `MemberDTO`; `useAuthorTextStyle` + `textStyleCss` wrap message text in
  `.styled-text`. Inline colour syntax `{#rrggbb}text{/}` in `markdown.tsx`. `ChatTextarea` has the **Aa** format bar
  (B/I/U/S, code, spoiler, quote, heading, 🎨) + Ctrl+B/I/U/E, Ctrl+Shift+X. Owner names: `AuthorName` (gold shimmer
  `.owner-name` + 👑 + "собственик" tag in chat) in chat/threads/member list/profile card/voice list.

- **🖼️ My pictures + 🖱️ cursors** (2026-11-21): `User.personalLooks` (JSON, migration 20261121180000) = own server
  icon / banner / channel backgrounds only that person sees (missing = server's, URL = mine, "" = hidden); shared
  `cleanPersonalLooks` (https only), PATCH /api/auth/me `personalLooks`; client `utils/personalLooks.ts` hooks
  (`useServerIcon/Banner`, `useChannelBackground`, `setPersonalLook`) + `MyLooksCard` (Settings → Външен вид). AppShell
  now calls `fetchMe()` on start so account changes from other devices show up. Cursors: `client/src/cursors/`
  (19 hand-drawn SVG skins incl. 8 dark-fantasy/arena ones with a `gauntlet()` pointer: arrow + pointer, colour, size 24–64, localStorage `cursorSkinV1`, `CursorCard`); a PostCSS
  step in `vite.config.ts` rewrites every `cursor: pointer|default` to `var(--cur-pointer|--cur-default, …)`.

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
- Stale LIVE (2026-11-26): `isScreenSharing` lives in the Render roster and only the streamer clears it. Now the streamer's
  app runs `startShareWatchdog` (SfuMediaManager `screenShareAlive`: producer/track/send transport; 3 misses ≈ 9 s → stop +
  notice), a viewer's Watch checks `hasScreenFrom(userId)` after 5 s and drops the LIVE locally, and the server re-broadcasts
  occupants on share start/stop (channel-list badge for people outside the voice room).
- Socket rooms (`server:`, `channel:`, `dm:`, voice) are per connection: anything that joins a room must join again on
  `socket.on("connect")` (reconnects after Wi-Fi drops / Render restarts / sleep). Missing this froze voice lists and chat (fixed 2026-11-23, e2e 13-reconnect).
- Screen-share bitrate ceilings (SfuMediaManager): Light 7 / Standard 14 / High 40 Mbps (Sharp a bit more);
  too-low ceilings = "smears when moving". Viewers get `jitterBufferTarget = 120` ms on screen consumers.
  Settings → Stream → Кодиране: GPU (H.264 High) / CPU (Baseline OpenH264 or VP8) + auto "refresh encoder"
  every 3/5/8 min; 🔄 in the 📊 panel = `refreshScreenVideo()` (new producer, same track, `stopTracks:false`;
  media server closes the old one; viewers keep watching via a 4 s grace in handleProducerClosed). Added for
  a friend on RX 7900 XTX whose game lost fps ~every 10 min of streaming until the share was restarted.
  Browser sharers on Firefox show "H264 · процесор", no "Енкодер" row, ~30 fps — tell them to use the desktop app.
