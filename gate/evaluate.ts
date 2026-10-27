import { LOAD_NOISE_FLOOR_MS, LOAD_REGRESSION } from "./rules.ts";
import type {
  CheckResult,
  K6Threshold,
  Measurements,
  Phase,
  Rule,
  Status,
  Verdict,
} from "./types.ts";

export interface GateInput {
  measurements: Measurements;
  /** Empty when no k6 summary was found */
  thresholds: K6Threshold[];
  rules: Rule[];
  /** UX phases this run was meant to measure */
  phases: Phase[];
  /** Measurements of the last passing run of the same profile */
  baseline?: Measurements;
}

interface Regression {
  regressed: boolean;
  changePct: number;
}

/** Positive changePct always means "worse" */
export function compareToBaseline(
  value: number,
  baseline: number,
  rule: Pick<Rule, "regressionPct" | "noiseFloor" | "higherIsBetter">,
): Regression | undefined {
  if (rule.regressionPct === undefined || baseline === 0) return undefined;
  const worse = rule.higherIsBetter ? baseline - value : value - baseline;
  const changePct = (worse / baseline) * 100;
  return {
    regressed: changePct > rule.regressionPct && worse > (rule.noiseFloor ?? 0),
    changePct,
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function k6Checks(input: GateInput): CheckResult[] {
  if (input.thresholds.length === 0) {
    return [
      {
        id: "load.summary",
        label: "k6 results",
        layer: "load",
        status: "missing",
        unit: "count",
        reason: "No k6 summary: the load run didn't finish",
      },
    ];
  }
  return input.thresholds.map((t) => {
    const endpoint = /\{name:(\w+)\}/.exec(t.metric)?.[1];
    const stat = t.expression.split(/[<>=!]/)[0];
    return {
      id: `load.threshold.${t.metric}.${t.expression}`,
      label: endpoint ? `${endpoint} ${stat.replace(/[()]/g, "")}` : t.metric,
      layer: "load",
      status: t.crossed ? "failed" : "passed",
      value: t.value === undefined ? undefined : round(t.value),
      unit: endpoint ? "ms" : stat === "rate" ? "rate" : "count",
      limit: t.expression,
      reason: t.crossed ? "k6 threshold crossed" : "within threshold",
    };
  });
}

function loadRegressionChecks(input: GateInput): CheckResult[] {
  if (!input.baseline) return [];
  return Object.entries(input.measurements)
    .filter(([id]) => id.startsWith("load.p95."))
    .flatMap(([id, value]): CheckResult[] => {
      const base = input.baseline![id];
      if (base === undefined) return [];
      const endpoint = id.replace("load.p95.", "");
      const r = compareToBaseline(value, base, {
        ...LOAD_REGRESSION,
        noiseFloor: LOAD_NOISE_FLOOR_MS[endpoint] ?? LOAD_REGRESSION.noiseFloor,
      });
      if (!r) return [];
      return [
        {
          id: `${id}.vs_baseline`,
          label: `${endpoint} p95 vs baseline`,
          layer: "load",
          status: r.regressed ? "failed" : "passed",
          value: round(value),
          unit: "ms",
          baseline: round(base),
          changePct: round(r.changePct),
          limit: `+${LOAD_REGRESSION.regressionPct}%`,
          reason: r.regressed
            ? `${round(r.changePct)}% slower than the baseline`
            : "within the baseline's noise tolerance",
        },
      ];
    });
}

function ruleCheck(rule: Rule, input: GateInput): CheckResult {
  const value = input.measurements[rule.id];
  const base = input.baseline?.[rule.id];
  const limit =
    rule.max !== undefined
      ? `<= ${rule.max}`
      : rule.min !== undefined
        ? `>= ${rule.min}`
        : undefined;
  const common = {
    id: rule.id,
    label: rule.label,
    layer: "ux" as const,
    unit: rule.unit,
    limit,
  };
  if (value === undefined) {
    return { ...common, status: "missing", reason: "not measured in this run" };
  }

  const problems: string[] = [];
  if (rule.max !== undefined && value > rule.max)
    problems.push(`over budget (${rule.max})`);
  if (rule.min !== undefined && value < rule.min)
    problems.push(`under budget (${rule.min})`);
  const r =
    base === undefined ? undefined : compareToBaseline(value, base, rule);
  if (r?.regressed)
    problems.push(`${round(r.changePct)}% worse than the baseline`);

  return {
    ...common,
    status: problems.length ? "failed" : "passed",
    value: round(value),
    baseline: base === undefined ? undefined : round(base),
    changePct: r ? round(r.changePct) : undefined,
    reason: problems.length ? problems.join("; ") : "within budget",
  };
}

export function overallStatus(checks: CheckResult[]): Status {
  if (checks.length === 0 || checks.every((c) => c.status === "missing")) {
    return "no-data";
  }
  if (checks.some((c) => c.status === "failed")) return "failed";
  if (checks.some((c) => c.status === "missing")) return "unstable";
  return "passed";
}

export function evaluate(input: GateInput): Verdict {
  const rules = input.rules.filter(
    (rule) => !rule.phase || input.phases.includes(rule.phase),
  );
  const checks = [
    ...k6Checks(input).sort((a, b) => a.label.localeCompare(b.label)),
    ...loadRegressionChecks(input),
    ...rules.map((rule) => ruleCheck(rule, input)),
  ];
  const counts = { passed: 0, failed: 0, missing: 0 };
  for (const check of checks) counts[check.status]++;
  return { status: overallStatus(checks), checks, counts };
}
