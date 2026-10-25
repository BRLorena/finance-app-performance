import type { Rule } from "./types.ts";

/**
 * UX budgets and the regression tolerances for every layer. Load-layer
 * budgets live next to the scenario, as k6 thresholds
 * (load/scenarios/finance.ts), and the gate reads their results.
 *
 * Absolute budgets follow Google's "good" Core Web Vitals (LCP 2.5s,
 * CLS 0.1). The regression tolerance is generous because shared CI runners
 * are noisy; docs/metrics.md explains the numbers.
 */
const NOISE_PCT = Number(process.env.BASELINE_NOISE_PCT ?? 25);

const pageRules = (phase: "idle" | "load"): Rule[] => [
  {
    id: `ux.${phase}.dashboard.lcp`,
    label: `Dashboard LCP (${phase})`,
    unit: "ms",
    phase,
    max: 2500,
    regressionPct: NOISE_PCT,
    noiseFloor: 100,
  },
  {
    id: `ux.${phase}.dashboard.dataReady`,
    label: `Dashboard data ready (${phase})`,
    unit: "ms",
    phase,
    max: phase === "idle" ? 1000 : 2000,
    regressionPct: NOISE_PCT,
    noiseFloor: 100,
  },
  {
    id: `ux.${phase}.dashboard.cls`,
    label: `Dashboard CLS (${phase})`,
    unit: "score",
    phase,
    max: 0.1,
  },
  {
    id: `ux.${phase}.login.lcp`,
    label: `Login LCP (${phase})`,
    unit: "ms",
    phase,
    max: 2500,
    regressionPct: NOISE_PCT,
    noiseFloor: 100,
  },
  {
    id: `lh.${phase}.dashboard.score`,
    label: `Lighthouse dashboard score (${phase})`,
    unit: "score",
    phase,
    min: phase === "idle" ? 0.9 : 0.8,
    higherIsBetter: true,
  },
  {
    id: `lh.${phase}.login.score`,
    label: `Lighthouse login score (${phase})`,
    unit: "score",
    phase,
    min: phase === "idle" ? 0.9 : 0.8,
    higherIsBetter: true,
  },
];

export const RULES: Rule[] = [
  ...pageRules("idle"),
  ...pageRules("load"),
  {
    id: "ux.slowdown.dashboard.dataReady",
    label: "Dashboard data ready, load vs idle",
    unit: "ratio",
    phase: "load",
    max: 4,
  },
];

/** Every endpoint p95 is also compared against its baseline */
export const LOAD_REGRESSION: Pick<Rule, "regressionPct" | "noiseFloor"> = {
  regressionPct: NOISE_PCT,
  noiseFloor: 25,
};
