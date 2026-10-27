import { describe, expect, it } from "vitest";
import { compareToBaseline, evaluate, overallStatus } from "./evaluate.ts";
import type { CheckResult, K6Threshold, Rule } from "./types.ts";

const lcpRule: Rule = {
  id: "ux.idle.dashboard.lcp",
  label: "Dashboard LCP (idle)",
  unit: "ms",
  phase: "idle",
  max: 2500,
  regressionPct: 25,
  noiseFloor: 100,
};
const loadRule: Rule = {
  ...lcpRule,
  id: "ux.load.dashboard.lcp",
  phase: "load",
};
const scoreRule: Rule = {
  id: "lh.idle.dashboard.score",
  label: "Lighthouse",
  unit: "score",
  phase: "idle",
  min: 0.9,
  higherIsBetter: true,
  regressionPct: 10,
};
const passing: K6Threshold = {
  metric: "http_req_duration{name:summary}",
  expression: "p(95)<500",
  value: 120,
  crossed: false,
};

const check = (status: CheckResult["status"]): CheckResult => ({
  id: status,
  label: status,
  layer: "ux",
  unit: "ms",
  status,
  reason: "",
});

describe("compareToBaseline", () => {
  it("flags a slowdown beyond the tolerance and the noise floor", () => {
    expect(compareToBaseline(1000, 700, lcpRule)).toEqual({
      regressed: true,
      changePct: expect.closeTo(42.86, 2),
    });
  });

  it("ignores a big percentage that is only a few ms (noise floor)", () => {
    // +60% but only 60 ms: runner noise, not a regression
    expect(compareToBaseline(160, 100, lcpRule)?.regressed).toBe(false);
  });

  it("ignores a change within the tolerance", () => {
    expect(compareToBaseline(1200, 1000, lcpRule)?.regressed).toBe(false);
  });

  it("treats a lower score as worse when higher is better", () => {
    const result = compareToBaseline(0.8, 1, scoreRule);
    expect(result?.regressed).toBe(true);
    expect(result?.changePct).toBeCloseTo(20);
  });

  it("never flags an improvement", () => {
    expect(compareToBaseline(400, 1000, lcpRule)?.regressed).toBe(false);
  });

  it("skips rules without a tolerance", () => {
    expect(compareToBaseline(5, 1, {})).toBeUndefined();
  });
});

describe("overallStatus", () => {
  it("is no-data when nothing was measured", () => {
    expect(overallStatus([])).toBe("no-data");
    expect(overallStatus([check("missing"), check("missing")])).toBe("no-data");
  });

  it("is unstable when a required measurement is missing", () => {
    expect(overallStatus([check("passed"), check("missing")])).toBe("unstable");
  });

  it("lets a failure win over a missing measurement", () => {
    expect(overallStatus([check("failed"), check("missing")])).toBe("failed");
  });

  it("passes only when every check passed", () => {
    expect(overallStatus([check("passed"), check("passed")])).toBe("passed");
  });
});

describe("evaluate", () => {
  const base = {
    thresholds: [passing],
    rules: [lcpRule, loadRule, scoreRule],
    phases: ["idle" as const],
  };

  it("passes a complete, healthy run", () => {
    const verdict = evaluate({
      ...base,
      measurements: {
        "ux.idle.dashboard.lcp": 900,
        "lh.idle.dashboard.score": 0.97,
      },
    });
    expect(verdict.status).toBe("passed");
    expect(verdict.counts).toEqual({ passed: 3, failed: 0, missing: 0 });
  });

  it("only applies rules for the phases the run measured", () => {
    const verdict = evaluate({
      ...base,
      measurements: {
        "ux.idle.dashboard.lcp": 900,
        "lh.idle.dashboard.score": 0.97,
      },
    });
    expect(verdict.checks.map((c) => c.id)).not.toContain(
      "ux.load.dashboard.lcp",
    );
  });

  it("fails a crossed k6 threshold", () => {
    const verdict = evaluate({
      ...base,
      thresholds: [{ ...passing, value: 900, crossed: true }],
      measurements: {
        "ux.idle.dashboard.lcp": 900,
        "lh.idle.dashboard.score": 0.97,
      },
    });
    expect(verdict.status).toBe("failed");
    expect(verdict.checks[0]).toMatchObject({
      label: "summary p95",
      status: "failed",
      value: 900,
    });
  });

  it("fails a UX metric over its absolute budget", () => {
    const verdict = evaluate({
      ...base,
      measurements: {
        "ux.idle.dashboard.lcp": 3100,
        "lh.idle.dashboard.score": 0.97,
      },
    });
    expect(verdict.status).toBe("failed");
    expect(verdict.checks.find((c) => c.id === lcpRule.id)?.reason).toBe(
      "over budget (2500)",
    );
  });

  it("fails a regression that is still within the absolute budget", () => {
    const verdict = evaluate({
      ...base,
      measurements: {
        "ux.idle.dashboard.lcp": 1500,
        "lh.idle.dashboard.score": 0.97,
      },
      baseline: { "ux.idle.dashboard.lcp": 900 },
    });
    const lcp = verdict.checks.find((c) => c.id === lcpRule.id);
    expect(verdict.status).toBe("failed");
    expect(lcp).toMatchObject({ baseline: 900, changePct: 66.67 });
  });

  it("compares endpoint p95s with the baseline", () => {
    const verdict = evaluate({
      ...base,
      rules: [],
      measurements: { "load.p95.summary": 400 },
      baseline: { "load.p95.summary": 100 },
    });
    expect(
      verdict.checks.find((c) => c.id.endsWith("vs_baseline")),
    ).toMatchObject({
      status: "failed",
      changePct: 300,
    });
  });

  it("gives login a wider noise floor than the other endpoints", () => {
    const check = (id: string, value: number, baseline: number) =>
      evaluate({
        ...base,
        rules: [],
        measurements: { [id]: value },
        baseline: { [id]: baseline },
      }).checks.find((c) => c.id.endsWith("vs_baseline"))?.status;

    // The slow-runner run that failed nightly: +131 ms on an unchanged app
    expect(check("load.p95.login", 375, 244)).toBe("passed");
    // A real regression still fails
    expect(check("load.p95.login", 600, 244)).toBe("failed");
    // Other endpoints keep the 50 ms floor
    expect(check("load.p95.summary", 175, 100)).toBe("failed");
  });

  it("is unstable when the load run left no results", () => {
    const verdict = evaluate({
      ...base,
      thresholds: [],
      measurements: {
        "ux.idle.dashboard.lcp": 900,
        "lh.idle.dashboard.score": 0.97,
      },
    });
    expect(verdict.status).toBe("unstable");
  });

  it("is no-data when nothing ran", () => {
    expect(evaluate({ ...base, thresholds: [], measurements: {} }).status).toBe(
      "no-data",
    );
  });
});
