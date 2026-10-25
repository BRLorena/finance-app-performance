import { defineConfig, devices } from "@playwright/test";

/**
 * The UX layer: real browsers measuring what a user sees, once with the
 * app idle and once while k6 holds it under load (UX_PHASE=idle | load).
 * One worker, so samples never compete with each other for the CPU.
 */
export default defineConfig({
  testDir: "ux",
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 120_000,
  reporter: [["list"]],
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3300",
    ...devices["Desktop Chrome"],
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "ux",
      testMatch: /\.spec\.ts/,
      dependencies: ["setup"],
      use: { storageState: "results/.auth/ux.json" },
    },
  ],
});
