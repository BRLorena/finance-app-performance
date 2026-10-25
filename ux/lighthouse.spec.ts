import { test, chromium, expect } from "@playwright/test";
import lighthouse from "lighthouse";
import desktopConfig from "lighthouse/core/config/desktop-config.js";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PAGES, uxPhase } from "./lib/target.ts";

/**
 * Lighthouse performance audits (desktop preset), driven through a
 * Playwright-launched Chromium so the dashboard is audited logged in.
 * Lighthouse opens its own tab, so the session cookies go into the
 * browser's default context rather than a Playwright context.
 */
const PORT = 9333;

export interface LighthouseResult {
  score: number;
  fcp: number;
  lcp: number;
  tbt: number;
  cls: number;
  speedIndex: number;
  serverResponse: number;
}

test("lighthouse audits", async ({ baseURL }, testInfo) => {
  const context = await chromium.launchPersistentContext(
    join(tmpdir(), `lh-profile-${Date.now()}`),
    { args: [`--remote-debugging-port=${PORT}`], headless: true },
  );
  const state = JSON.parse(
    readFileSync(testInfo.project.use.storageState as string, "utf8"),
  );

  const results: Record<string, LighthouseResult> = {};
  mkdirSync("results/lighthouse", { recursive: true });
  for (const target of PAGES) {
    await context.clearCookies();
    if (target.auth) await context.addCookies(state.cookies);

    const runner = await lighthouse(
      `${baseURL}${target.path}`,
      { port: PORT, logLevel: "error", disableStorageReset: true },
      desktopConfig,
    );
    expect(runner, `lighthouse ran on ${target.path}`).toBeTruthy();
    const { lhr, report } = runner!;
    expect(lhr.runtimeError, "lighthouse runtime error").toBeUndefined();
    expect(lhr.finalDisplayedUrl, "no redirect to login").toContain(
      target.path,
    );

    const audit = (id: string) => lhr.audits[id]?.numericValue ?? 0;
    results[target.name] = {
      score: lhr.categories.performance.score ?? 0,
      fcp: audit("first-contentful-paint"),
      lcp: audit("largest-contentful-paint"),
      tbt: audit("total-blocking-time"),
      cls: audit("cumulative-layout-shift"),
      speedIndex: audit("speed-index"),
      serverResponse: audit("server-response-time"),
    };
    writeFileSync(
      `results/lighthouse/${target.name}-${uxPhase()}.html`,
      Array.isArray(report) ? report[0] : report,
    );
  }
  await context.close();

  writeFileSync(
    `results/ux-lighthouse-${uxPhase()}.json`,
    JSON.stringify({ phase: uxPhase(), pages: results }, null, 2),
  );
});
