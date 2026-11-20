// Runs the whole of ШмиркаТа on this machine and drives it with Playwright:
//   embedded Postgres (fresh, throw-away) → prisma migrate deploy → server → media server → Vite client
//   → `playwright test` → everything stopped again.
// Production is never touched: every process gets its own DATABASE_URL / JWT_SECRET, runs with the
// working directory e2e/ (so server/.env with the production database is never loaded) and the runner
// refuses to start unless the database URL points at localhost. A canary user is then registered
// through the API and looked up directly in the local database: if it isn't there, it stops.
import { spawn, spawnSync } from "node:child_process";
import { rmSync, mkdirSync, createWriteStream } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const BIN = (p) => join(ROOT, "node_modules", p);

const PG_PORT = 54329;
const API_PORT = 4610;
const MEDIA_PORT = 4710;
const RTC_PORT = 44450;
const WEB_PORT = 5610;
const DB_NAME = "shmirka_e2e";
const DATABASE_URL = `postgresql://postgres:postgres@localhost:${PG_PORT}/${DB_NAME}?schema=public`;
const JWT_SECRET = "e2e-only-secret-not-used-anywhere-else";
const WEB = `http://localhost:${WEB_PORT}`;
const API = `http://localhost:${API_PORT}`;

if (!/^postgresql:\/\/[^@]+@localhost:/.test(DATABASE_URL)) throw new Error("refusing: DATABASE_URL is not local");

const LOGS = join(HERE, "logs");
rmSync(LOGS, { recursive: true, force: true });
mkdirSync(LOGS, { recursive: true });

const children = [];
function start(name, args, cwd, env) {
  const log = createWriteStream(join(LOGS, `${name}.log`));
  const child = spawn(process.execPath, args, {
    cwd,
    env: { ...cleanEnv(), ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.pipe(log);
  child.stderr.pipe(log);
  child.on("exit", (code) => {
    if (!stopping) console.error(`✖ ${name} exited (${code}) — see e2e/logs/${name}.log`);
  });
  children.push({ name, child });
  return child;
}

// Only what the processes need: no stray production keys (GIPHY, SUBSONIC, …) from this shell.
function cleanEnv() {
  const keep = ["PATH", "Path", "SystemRoot", "TEMP", "TMP", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "HOMEDRIVE", "HOMEPATH", "ComSpec", "PATHEXT", "NUMBER_OF_PROCESSORS", "PROCESSOR_ARCHITECTURE", "OS", "windir"];
  return Object.fromEntries(keep.filter((k) => process.env[k] !== undefined).map((k) => [k, process.env[k]]));
}

async function waitFor(url, what, ms = 90_000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`${what} did not come up at ${url} (see e2e/logs)`);
}

let stopping = false;
let pgServer;
async function stopAll() {
  if (stopping) return;
  stopping = true;
  for (const { child } of children) {
    if (child.exitCode === null) {
      if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
      else child.kill("SIGTERM");
    }
  }
  if (pgServer) await pgServer.stop().catch(() => {});
}
process.on("SIGINT", async () => {
  await stopAll();
  process.exit(130);
});

async function main() {
  const t0 = Date.now();
  console.log("▶ shared package build");
  const shared = spawnSync("npm run build -w packages/shared", { cwd: ROOT, shell: true, stdio: "inherit" });
  if (shared.status !== 0) throw new Error("shared build failed");

  console.log("▶ local Postgres (fresh)");
  const dataDir = join(HERE, ".pgdata");
  rmSync(dataDir, { recursive: true, force: true });
  pgServer = new EmbeddedPostgres({ databaseDir: dataDir, user: "postgres", password: "postgres", port: PG_PORT, persistent: false, initdbFlags: ["--encoding=UTF8", "--locale=C"], onLog: () => {} });
  await pgServer.initialise();
  await pgServer.start();
  await pgServer.createDatabase(DB_NAME);

  console.log("▶ prisma migrate deploy (local database)");
  const migrate = spawnSync(process.execPath, [BIN("prisma/build/index.js"), "migrate", "deploy", "--schema", join(ROOT, "server/prisma/schema.prisma")], {
    cwd: HERE,
    env: { ...cleanEnv(), DATABASE_URL },
    encoding: "utf8",
  });
  const migrateOut = `${migrate.stdout}\n${migrate.stderr}`;
  if (migrate.status !== 0 || !migrateOut.includes(`localhost:${PG_PORT}`)) {
    console.error(migrateOut);
    throw new Error("migrate failed or did not run against the local database");
  }

  console.log("▶ server, media server, client");
  const tsx = BIN("tsx/dist/cli.mjs");
  start("server", [tsx, join(ROOT, "server/src/index.ts")], HERE, { DATABASE_URL, JWT_SECRET, PORT: String(API_PORT), CLIENT_ORIGIN: WEB });
  start("media", [tsx, join(ROOT, "media-server/src/index.ts")], HERE, { JWT_SECRET, PORT: String(MEDIA_PORT), CLIENT_ORIGIN: WEB, ANNOUNCED_IP: "127.0.0.1", MEDIA_PORT: String(RTC_PORT) });
  start("client", [BIN("vite/bin/vite.js"), "--port", String(WEB_PORT), "--strictPort"], join(ROOT, "client"), {
    VITE_API_URL: API,
    VITE_SOCKET_URL: API,
    VITE_MEDIA_SERVER_URL: `http://localhost:${MEDIA_PORT}`,
    VITE_CLOUDINARY_CLOUD_NAME: "",
    VITE_CLOUDINARY_UPLOAD_PRESET: "",
  });
  await Promise.all([
    waitFor(`${API}/api/auth/oauth/config`, "server"),
    waitFor(`http://localhost:${MEDIA_PORT}/`, "media server"),
    waitFor(WEB, "client"),
  ]);

  // Canary: the server really writes into the local database.
  const canary = `canary${Date.now()}`;
  const reg = await fetch(`${API}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: canary, email: `${canary}@e2e.test`, password: "canary-pass-123" }),
  });
  const db = new pg.Client({ connectionString: DATABASE_URL.replace("?schema=public", "") });
  await db.connect();
  const found = await db.query('SELECT 1 FROM "User" WHERE username = $1', [canary]);
  await db.end();
  if (!reg.ok || found.rowCount !== 1) throw new Error(`canary check failed (register ${reg.status}, rows ${found.rowCount}) — stopping`);
  console.log(`✔ stack up in ${((Date.now() - t0) / 1000).toFixed(0)} s (local database confirmed)`);

  const args = process.argv.slice(2);
  const pw = spawnSync(process.execPath, [join(HERE, "node_modules/@playwright/test/cli.js"), "test", ...args], {
    cwd: HERE,
    stdio: "inherit",
    env: { ...process.env, E2E_WEB: WEB, E2E_API: API, E2E_DATABASE_URL: DATABASE_URL.replace("?schema=public", "") },
  });
  return pw.status ?? 1;
}

let code = 1;
try {
  code = await main();
} catch (err) {
  console.error("✖", err.message);
} finally {
  await stopAll();
}
process.exit(code);
