import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

// One id per build: the commit Vercel is building, or the build time elsewhere. The running app
// has it baked in; /version.json carries the id of whatever is currently deployed, so the app can
// notice that a newer version has gone live while it's open.
const BUILD_ID = process.env.VERCEL_GIT_COMMIT_SHA || String(Date.now());

function versionFile(): Plugin {
  return {
    name: "emit-version-json",
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify({ id: BUILD_ID }) });
    },
  };
}

export default defineConfig({
  plugins: [react(), versionFile()],
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  server: {
    port: 5173,
  },
});
