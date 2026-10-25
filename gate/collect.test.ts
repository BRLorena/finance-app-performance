import { describe, expect, it } from "vitest";
import {
  degradation,
  k6Measurements,
  k6Thresholds,
  uxMeasurements,
  type K6Summary,
} from "./collect.ts";

// Trimmed from a real `k6 run --summary-export` file
const summary: K6Summary = {
  metrics: {
    "http_req_duration{name:summary}": {
      "p(95)": 31.7,
      avg: 19.9,
      thresholds: { "p(95)<500": false },
    },
    http_req_failed: {
      passes: 0,
      fails: 138,
      value: 0,
      thresholds: { "rate<0.01": false },
    },
    checks: {
      passes: 160,
      fails: 0,
      value: 1,
      thresholds: { "rate>0.99": false },
    },
    rate_limited: { count: 0, rate: 0, thresholds: { "count==0": true } },
    iterations: { count: 22, rate: 0.4 },
    http_reqs: { count: 138, rate: 2.51 },
  },
};

describe("k6Thresholds", () => {
  it("reads every threshold with the stat it tests", () => {
    expect(k6Thresholds(summary)).toEqual([
      {
        metric: "http_req_duration{name:summary}",
        expression: "p(95)<500",
        value: 31.7,
        crossed: false,
      },
      {
        metric: "http_req_failed",
        expression: "rate<0.01",
        value: 0,
        crossed: false,
      },
      { metric: "checks", expression: "rate>0.99", value: 1, crossed: false },
      {
        metric: "rate_limited",
        expression: "count==0",
        value: 0,
        crossed: true,
      },
    ]);
  });
});

describe("k6Measurements", () => {
  it("keeps endpoint p95s and run totals", () => {
    expect(k6Measurements(summary)).toEqual({
      "load.p95.summary": 31.7,
      "load.error_rate": 0,
      "load.checks_rate": 1,
      "load.iterations": 22,
      "load.throughput_rps": 2.51,
      "load.rate_limited": 0,
    });
  });
});

describe("uxMeasurements", () => {
  it("flattens vitals medians and ignores the raw samples", () => {
    const result = uxMeasurements(
      {
        phase: "load",
        pages: {
          dashboard: {
            samples: [{ lcp: 1 }],
            median: { lcp: 800, dataReady: 950 },
          },
        },
      },
      "ux",
    );
    expect(result).toEqual({
      "ux.load.dashboard.lcp": 800,
      "ux.load.dashboard.dataReady": 950,
    });
  });

  it("flattens lighthouse results", () => {
    expect(
      uxMeasurements(
        { phase: "idle", pages: { login: { score: 0.98 } } },
        "lh",
      ),
    ).toEqual({ "lh.idle.login.score": 0.98 });
  });
});

describe("degradation", () => {
  it("divides each load metric by its idle value", () => {
    expect(
      degradation({
        "ux.idle.dashboard.dataReady": 200,
        "ux.load.dashboard.dataReady": 700,
        "ux.load.login.lcp": 300,
      }),
    ).toEqual({ "ux.slowdown.dashboard.dataReady": 3.5 });
  });
});
