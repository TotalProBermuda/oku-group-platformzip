import { defineConfig, devices } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5000";

export default defineConfig({
  testDir: "./tests/browser",
  testMatch: /.*\.spec\.ts$/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: BASE_URL,
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
        launchOptions: {
          executablePath: process.env.CHROMIUM_PATH ?? "/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium",
        },
      },
    },
    {
      // Plain chromium at a 375×667 viewport — we deliberately do NOT use
      // `devices["iPhone SE"]` because that descriptor flips
      // defaultBrowserType to webkit and sets isMobile=true, both of which
      // crash the launch when combined with our pinned chromium binary.
      // The goal here is layout/overflow validation, not real iOS emulation.
      name: "mobile",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 375, height: 667 },
        launchOptions: {
          executablePath: process.env.CHROMIUM_PATH ?? "/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium",
        },
      },
    },
  ],
});
