// Builds the web client with the PRODUCTION server addresses baked in and drops it in ./client-dist,
// which main.js serves. Run through `npm run build:client` (also part of `start` and `dist`).
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const client = path.resolve(here, "..", "client");

const env = {
  ...process.env,
  VITE_API_URL: "https://discord-clone-xhmz.onrender.com",
  VITE_SOCKET_URL: "https://discord-clone-xhmz.onrender.com",
  VITE_MEDIA_SERVER_URL: "https://130.61.251.202.nip.io",
  VITE_CLOUDINARY_CLOUD_NAME: "r5a4ccgu",
  VITE_CLOUDINARY_UPLOAD_PRESET: "discord_clone",
};

const result = spawnSync(
  "npx",
  ["vite", "build", "--outDir", path.join(here, "client-dist"), "--emptyOutDir"],
  { cwd: client, env, stdio: "inherit", shell: true },
);
process.exit(result.status ?? 1);
