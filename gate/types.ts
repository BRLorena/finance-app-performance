/**
 * passed   - every check ran and met its budget and baseline
 * failed   - at least one check broke a budget or regressed
 * unstable - nothing failed, but a required measurement is missing, so a
 *            broken or partial run can't pass as a green one
 * no-data  - there was nothing to judge
 */
export type Status = "passed" | "failed" | "unstable" | "no-data";

/** Flat metric id -> value, e.g. "ux.load.dashboard.lcp" -> 812 */
export type Measurements = Record<string, number>;

export type Phase = "idle" | "load";

export interface Rule {
  id: string;
  label: string;
  /** rate: a 0-1 fraction shown as a percentage; ratio: a multiplier */
  unit: "ms" | "score" | "ratio" | "rate" | "count";
  /** Only evaluated when the run includes this UX phase */
  phase?: Phase;
  max?: number;
  min?: number;
  /** Fail when worse than the baseline by more than this many percent */
  regressionPct?: number;
  /** ...and by more than this absolute amount (filters runner noise) */
  noiseFloor?: number;
  higherIsBetter?: boolean;
}

export interface K6Threshold {
  /** e.g. "http_req_duration{name:summary}" */
  metric: string;
  /** e.g. "p(95)<500" */
  expression: string;
  /** The stat the expression tests, when the export has it */
  value?: number;
  crossed: boolean;
}

export interface CheckResult {
  id: string;
  label: string;
  layer: "load" | "ux";
  status: "passed" | "failed" | "missing";
  value?: number;
  unit: Rule["unit"];
  limit?: string;
  baseline?: number;
  changePct?: number;
  reason: string;
}

export interface Verdict {
  status: Status;
  checks: CheckResult[];
  counts: Record<CheckResult["status"], number>;
}
