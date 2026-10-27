import type { Measurements } from "./types.ts";

/**
 * The baseline is the last few passing runs of a kind, not just the last
 * one. One run can land on a fast or a slow runner: comparing with it alone
 * failed unchanged apps (expense_create 8 → 92 ms, login 244 → 375 ms).
 */
export const BASELINE_RUNS = Number(process.env.BASELINE_RUNS ?? 7);

export interface PublishedRun {
  date: string;
  target: string;
  profile: string;
  status: string;
  runUrl: string | null;
  measurements: Measurements;
}

export interface Baseline {
  /** The median of every metric, the value a run is compared with */
  measurements: Measurements;
  /** Every metric's values in those runs, oldest first */
  samples: Record<string, number[]>;
  runs: number;
  from: string;
  to: string;
  runUrls: (string | null)[];
}

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** From the history: the last BASELINE_RUNS passing runs of one kind */
export function buildBaseline(
  history: PublishedRun[],
  target: string,
  profile: string,
  runs = BASELINE_RUNS,
): Baseline | undefined {
  const passing = history
    .filter(
      (r) =>
        r.target === target && r.profile === profile && r.status === "passed",
    )
    .slice(-runs);
  if (passing.length === 0) return undefined;

  const samples: Record<string, number[]> = {};
  for (const run of passing) {
    for (const [id, value] of Object.entries(run.measurements)) {
      (samples[id] ??= []).push(value);
    }
  }
  return {
    measurements: Object.fromEntries(
      Object.entries(samples).map(([id, values]) => [id, median(values)]),
    ),
    samples,
    runs: passing.length,
    from: passing[0].date,
    to: passing.at(-1)!.date,
    runUrls: passing.map((r) => r.runUrl),
  };
}

/**
 * How much worse than the median the recent passing runs already got: a
 * run that is no worse than one of them isn't a regression.
 */
export function spread(
  samples: number[] | undefined,
  higherIsBetter = false,
): number {
  if (!samples?.length) return 0;
  const mid = median(samples);
  return higherIsBetter
    ? mid - Math.min(...samples)
    : Math.max(...samples) - mid;
}
