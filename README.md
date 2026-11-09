# Шмирка (discord-clone)

A self-hosted Discord-style chat app for a small friend group: servers, text channels with
threads and reactions, direct messages, voice channels with screen sharing, and a synced
YouTube music queue.

## Repository layout

npm workspaces monorepo:

| Package | What it is | Runs on |
| --- | --- | --- |
| `client/` | React + Vite + Zustand web app | Vercel |
| `server/` | Express + Socket.IO API, chat/DM/roster signaling, Prisma + PostgreSQL | Render |
| `media-server/` | mediasoup SFU — only carries voice/screen-share media | its own VM (not Render) |
| `packages/shared/` | TypeScript types and Socket.IO event names shared by all of the above | built into each |

Voice is split across two servers on purpose. `server/` handles everything except raw media
(who is in a channel, mute state, screen-share labels, music sync). `media-server/` only moves
audio/video; the two are correlated by `userId`.

## Getting started

Requirements: Node 22+ (24 is what Render uses) and a PostgreSQL database.

```bash
git clone https://github.com/shocknthunder-alt/discord-clone.git
cd discord-clone
npm install
npm run build -w packages/shared   # client and server import the built output
```

### Use your own database

Create your own free Postgres database (e.g. a Neon project) for development.
**Do not point `DATABASE_URL` at the shared production database** — `prisma migrate dev`
applies migrations straight to whatever it is pointed at.

### Configure the server

Copy `.env.example` to `server/.env` and fill it in:

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | yes | your own Postgres connection string |
| `JWT_SECRET` | yes | any random string, 16+ characters |
| `JWT_EXPIRES_IN` | no | default `7d` |
| `PORT` | no | default `4000` |
| `CLIENT_ORIGIN` | no | default `http://localhost:5173` (used for CORS) |
| `YOUTUBE_API_KEY` | no | only needed for searching songs by name; pasting a YouTube link works without it |

Then create the tables:

```bash
npm run prisma:migrate
```

### Configure the client

Create `client/.env`:

```
VITE_API_URL=http://localhost:4000
VITE_SOCKET_URL=http://localhost:4000
VITE_MEDIA_SERVER_URL=<url of a media-server, see below>
VITE_CLOUDINARY_CLOUD_NAME=<optional, for image/avatar/background uploads>
VITE_CLOUDINARY_UPLOAD_PRESET=<optional, an unsigned upload preset>
```

### Run it

```bash
npm run dev
```

Client: http://localhost:5173, server: http://localhost:4000. Register two accounts in two
different browsers (or one normal and one private window) to test chat between users.

### Voice and screen sharing

Text chat, threads, reactions, DMs and music all work with just the two commands above. Voice
audio and screen share additionally need a running `media-server`, which needs a public IP and an
open UDP/TCP port because WebRTC media can't go through `localhost` between browsers on
different machines. Its settings (`media-server/.env`):

| Variable | Notes |
| --- | --- |
| `JWT_SECRET` | must be identical to the server's |
| `CLIENT_ORIGIN` | the client URL it should accept (CORS) |
| `ANNOUNCED_IP` | public IP that browsers should send media to |
| `PORT` / `MEDIA_PORT` | defaults `4100` / `44444` |

If you're not working on voice, ask the maintainer for the URL of the shared media server and
use it as `VITE_MEDIA_SERVER_URL` — you'll also need your local client origin allowed on it.

## Useful commands

```bash
npm run dev                          # server + client with hot reload
npm run build                        # shared + server + client production build
npx tsc --noEmit -p client/tsconfig.json   # type-check the client (same for server/, media-server/)
npm run prisma:studio                # browse the database
```

There is no automated test suite yet — type-checking and trying the change in the browser is
the current bar. After editing anything in `packages/shared`, rebuild it
(`npm run build -w packages/shared`) before type-checking the other packages.

## Contributing

`main` is the stable branch and what gets deployed — **don't commit to it directly**.

1. Update: `git checkout main && git pull`
2. Branch off it, named for what you're doing: `feature/message-search`, `fix/stream-blur`,
   `chore/readme-typo`
3. Commit in small steps; say *why* in the message, not only what.
4. Push the branch and open a pull request into `main`, describing what changed and how you
   tested it. Include a screenshot for UI changes.
5. Someone else reviews, then it's merged (squash merge keeps `main` tidy).

Things to know before you touch certain areas:

- **Database changes** — edit `server/prisma/schema.prisma`, run
  `npx prisma migrate dev --name <what_changed>` inside `server/` against your *own* database,
  and commit the generated folder under `server/prisma/migrations/`. Render applies migrations
  automatically on deploy (`prisma migrate deploy` runs on start).
- **Shared types and socket events** live in `packages/shared`; add new events to
  `socketEvents.ts` rather than hard-coding strings.
- **`media-server/` is not deployed by Render or Vercel** — merging a change there does nothing
  until the maintainer pulls, builds and restarts it on the VM. Say so in the PR if you touch it.
- **Never commit `.env` files or secrets** — they are gitignored; keep it that way.

## Deployment

| Part | How | Trigger |
| --- | --- | --- |
| Client | Vercel | automatic on push to `main` |
| Server | Render (`render.yaml`) | automatic on push to `main` |
| Media server | systemd service on a VM | manual: `git pull`, `npm run build -w media-server`, restart service |

Render's build installs only `packages/shared` and `server` (`npm install --workspace=...`):
a plain `npm install` also pulls in `media-server`'s native `mediasoup` build, which fails on
Render. If you change workspaces or the build command, check the Render deploy actually succeeds.
