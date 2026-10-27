import { describe, expect, it } from "vitest";
import {
  buildBaseline,
  median,
  spread,
  type PublishedRun,
} from "./baseline.ts";

const run = (
  status: string,
  login: number,
  overrides: Partial<PublishedRun> = {},
): PublishedRun => ({
  date: `2026-10-${String(login).padStart(2, "0")}`,
  target: "local",
  profile: "load",
  status,
  runUrl: null,
  measurements: { "load.p95.login": login },
  ...overrides,
});

describe("median", () => {
  it("takes the middle value, or the mean of the two middle ones", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});

describe("buildBaseline", () => {
  it("is the median of the last passing runs of that kind", () => {
    const baseline = buildBaseline(
      [
        run("passed", 1),
        run("passed", 10),
        run("failed", 99),
        run("passed", 30, { profile: "smoke" }),
        run("passed", 20),
        run("passed", 12),
      ],
      "local",
      "load",
      3,
    );
    expect(baseline).toMatchObject({
      runs: 3,
      measurements: { "load.p95.login": 12 },
      samples: { "load.p95.login": [10, 20, 12] },
    });
  });

  it("is undefined until a run of that kind passed", () => {
    expect(buildBaseline([run("failed", 5)], "local", "load")).toBeUndefined();
  });
});

describe("spread", () => {
  it("is how much worse than the median the runs got", () => {
    expect(spread([10, 12, 20])).toBe(8);
    expect(spread([0.9, 0.95, 1], true)).toBeCloseTo(0.05);
  });

  it("is 0 without samples (an old single-run baseline)", () => {
    expect(spread(undefined)).toBe(0);
  });
});
