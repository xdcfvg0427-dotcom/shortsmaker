import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 1_800_000,
  workers: 1,
  use: {
    actionTimeout:15000,
    baseURL: process.env.TEST_BASE_URL || "http://127.0.0.1:8000",
    headless: true,
    viewport: { width: 1440, height: 1000 },
    launchOptions: {
      executablePath:
        process.env.BROWSER_EXECUTABLE ||
        (process.platform === "win32"
          ? "C:/Program Files/Google/Chrome/Application/chrome.exe"
          : undefined),
    },
  },
  reporter: [["list"], ["html", { open: "never" }]],
});
