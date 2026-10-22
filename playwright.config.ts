import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.e2e.ts",
  workers: 1,
  timeout: 45_000,
  use: { baseURL: "http://127.0.0.1:3000", headless: true, launchOptions: process.env.PAIRPILOT_CHROMIUM ? { executablePath: process.env.PAIRPILOT_CHROMIUM } : {} },
  reporter: [["list"], ["json", { outputFile: "evidence/browser-tests.json" }]],
  webServer: { command: "npm run dev", url: "http://127.0.0.1:3000", reuseExistingServer: true, timeout: 60_000 },
});
