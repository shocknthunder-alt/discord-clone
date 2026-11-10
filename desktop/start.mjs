// Launches Electron with ELECTRON_RUN_AS_NODE removed (VS Code's terminal sets it, which makes
// Electron behave as plain Node and breaks `require("electron")`).
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const electronPath = createRequire(import.meta.url)("electron");
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(electronPath, ["."], { stdio: "inherit", env });
child.on("exit", (code) => process.exit(code ?? 0));
