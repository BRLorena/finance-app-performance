import { defineConfig } from "vitest/config";

// Unit tests cover the gate only; ux/ holds Playwright specs
export default defineConfig({ test: { include: ["gate/**/*.test.ts"] } });
