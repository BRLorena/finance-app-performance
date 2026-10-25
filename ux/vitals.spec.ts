import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { PAGES, SAMPLES, uxPhase } from "./lib/target.ts";
import {
  installVitalsObservers,
  median,
  readVitals,
  type VitalsSample,
} from "./lib/vitals.ts";

/**
 * Loads each page SAMPLES times in a fresh context (cold cache, like a new
 * visitor) and records the median of every metric. Medians, not means:
 * one slow sample on a shared CI runner shouldn't move the result.
 */
const results: Record<
  string,
  { samples: VitalsSample[]; median: VitalsSample }
> = {};

for (const target of PAGES) {
  test(`web vitals: ${target.name}`, async ({ browser }, testInfo) => {
    const samples: VitalsSample[] = [];
    for (let i = 0; i < SAMPLES; i++) {
      const context = await browser.newContext(
        target.auth
          ? { storageState: testInfo.project.use.storageState }
          : { storageState: { cookies: [], origins: [] } },
      );
      const page = await context.newPage();
      await installVitalsObservers(page);
      const response = await page.goto(target.path);
      expect(response?.status(), `${target.path} status`).toBe(200);
      samples.push(await readVitals(page, target.dataCall));
      await context.close();
    }

    const keys = Object.keys(samples[0]) as (keyof VitalsSample)[];
    const med = Object.fromEntries(
      keys.map((key) => [key, median(samples.map((s) => s[key] ?? 0))]),
    ) as unknown as VitalsSample;
    results[target.name] = { samples, median: med };
    testInfo.annotations.push({
      type: "median",
      description: JSON.stringify(med),
    });
  });
}

test.afterAll(() => {
  mkdirSync("results", { recursive: true });
  writeFileSync(
    `results/ux-vitals-${uxPhase()}.json`,
    JSON.stringify(
      { phase: uxPhase(), samples: SAMPLES, pages: results },
      null,
      2,
    ),
  );
});
