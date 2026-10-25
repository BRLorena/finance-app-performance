import type { Page } from "@playwright/test";

/** One page load, in milliseconds (CLS is unitless) */
export interface VitalsSample {
  ttfb: number;
  fcp: number;
  lcp: number;
  cls: number;
  /** Navigation start until the page's data request finished */
  dataReady?: number;
}

/**
 * Installs LCP and CLS observers before any page script runs. They use
 * buffered entries, so nothing that happens before they attach is lost.
 */
export async function installVitalsObservers(page: Page) {
  await page.addInitScript(() => {
    const vitals = { lcp: 0, cls: 0 };
    Object.defineProperty(window, "__vitals", { value: vitals });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) vitals.lcp = entry.startTime;
    }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as unknown as {
        value: number;
        hadRecentInput: boolean;
      }[]) {
        if (!entry.hadRecentInput) vitals.cls += entry.value;
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
}

/** Reads the metrics once the page has painted (and fetched its data) */
export async function readVitals(
  page: Page,
  dataCall?: string,
): Promise<VitalsSample> {
  if (dataCall) {
    await page.waitForFunction(
      (path) =>
        performance
          .getEntriesByType("resource")
          .some((e) => new URL(e.name).pathname === path),
      dataCall,
    );
  }
  // LCP is reported after the frame is painted; give it one frame
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => resolve(null))),
  );
  return page.evaluate((path) => {
    const nav = performance.getEntriesByType(
      "navigation",
    )[0] as PerformanceNavigationTiming;
    const fcp = performance.getEntriesByName("first-contentful-paint")[0];
    const data = path
      ? (
          performance.getEntriesByType(
            "resource",
          ) as PerformanceResourceTiming[]
        )
          .filter((e) => new URL(e.name).pathname === path)
          .at(-1)
      : undefined;
    const vitals = (
      window as unknown as { __vitals: { lcp: number; cls: number } }
    ).__vitals;
    return {
      ttfb: nav.responseStart,
      fcp: fcp?.startTime ?? 0,
      lcp: vitals.lcp,
      cls: vitals.cls,
      ...(data ? { dataReady: data.responseEnd } : {}),
    };
  }, dataCall);
}

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
