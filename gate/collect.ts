import type { K6Threshold, Measurements } from "./types.ts";

/** Shape of `k6 run --summary-export` (only the parts the gate reads) */
export interface K6Summary {
  metrics: Record<
    string,
    Record<string, number | Record<string, boolean>> & {
      thresholds?: Record<string, boolean>;
    }
  >;
}

/** Shape of results/ux-vitals-<phase>.json and ux-lighthouse-<phase>.json */
export interface UxResult {
  phase: string;
  pages: Record<string, Record<string, unknown>>;
}

/** Which stat a threshold expression tests: "p(95)<500" -> "p(95)" */
function thresholdStat(expression: string): string {
  return expression.split(/[<>=!]/)[0].trim();
}

/** Normalizes the stat names k6 uses in thresholds to the export's keys */
function statKey(stat: string): string {
  return stat === "rate" ? "value" : stat;
}

export function k6Thresholds(summary: K6Summary): K6Threshold[] {
  return Object.entries(summary.metrics).flatMap(([metric, data]) =>
    Object.entries(data.thresholds ?? {}).map(([expression, crossed]) => {
      const stat = thresholdStat(expression);
      const raw = data[statKey(stat)] ?? data[stat];
      return {
        metric,
        expression,
        value: typeof raw === "number" ? raw : undefined,
        crossed,
      };
    }),
  );
}

/** Pulls the load-layer metrics that get a baseline and history */
export function k6Measurements(summary: K6Summary): Measurements {
  const out: Measurements = {};
  for (const [metric, data] of Object.entries(summary.metrics)) {
    const endpoint = /^http_req_duration\{name:(\w+)\}$/.exec(metric)?.[1];
    if (endpoint && typeof data["p(95)"] === "number") {
      out[`load.p95.${endpoint}`] = data["p(95)"] as number;
    }
  }
  const num = (metric: string, stat: string) => {
    const value = summary.metrics[metric]?.[stat];
    return typeof value === "number" ? value : undefined;
  };
  const pairs: [string, number | undefined][] = [
    ["load.error_rate", num("http_req_failed", "value")],
    ["load.checks_rate", num("checks", "value")],
    ["load.iterations", num("iterations", "count")],
    ["load.throughput_rps", num("http_reqs", "rate")],
    ["load.rate_limited", num("rate_limited", "count")],
  ];
  for (const [id, value] of pairs) if (value !== undefined) out[id] = value;
  return out;
}

/** Flattens UX results to ux.<phase>.<page>.<metric> (lighthouse: lh.) */
export function uxMeasurements(
  result: UxResult,
  prefix: "ux" | "lh",
): Measurements {
  const out: Measurements = {};
  for (const [page, data] of Object.entries(result.pages)) {
    // Vitals files keep per-sample data next to the median
    const values = (prefix === "ux" ? data.median : data) as Record<
      string,
      unknown
    >;
    for (const [metric, value] of Object.entries(values ?? {})) {
      if (typeof value === "number") {
        out[`${prefix}.${result.phase}.${page}.${metric}`] = value;
      }
    }
  }
  return out;
}

/**
 * How much slower the user's experience got under load: load / idle for
 * each page metric present in both phases.
 */
export function degradation(m: Measurements): Measurements {
  const out: Measurements = {};
  for (const [id, loadValue] of Object.entries(m)) {
    const match = /^ux\.load\.(\w+)\.(\w+)$/.exec(id);
    if (!match) continue;
    const idle = m[`ux.idle.${match[1]}.${match[2]}`];
    if (idle && idle > 0) {
      out[`ux.slowdown.${match[1]}.${match[2]}`] = loadValue / idle;
    }
  }
  return out;
}
