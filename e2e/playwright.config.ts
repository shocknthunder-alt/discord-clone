import { defineConfig, devices } from "@playwright/test";

// Started by run.mjs, which brings the local stack up first and passes its URLs in E2E_*.
export default defineConfig({
  testDir: "./tests",
  // The specs share one database and some walk through one story (accounts → server → chat …),
  // so they run one file at a time; inside a file, tests run in order.
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "report" }]],
  outputDir: "results",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: process.env.E2E_WEB ?? "http://localhost:5610",
    locale: "bg-BG",
    viewport: { width: 1440, height: 900 },
    permissions: ["microphone", "camera", "notifications", "clipboard-read", "clipboard-write"],
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
    launchOptions: {
      args: [
        // A fake microphone/camera (beep + test pattern) and no permission prompts — voice and camera
        // tests then run without hardware.
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
        // Screen share: pick the current tab without the picker.
        "--auto-select-desktop-capture-source=Entire screen",
        "--autoplay-policy=no-user-gesture-required",
      ],
    },
  },
});
