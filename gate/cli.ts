/**
 * Reads every result file of a run, judges it and writes:
 *   results/verdict.json, results/verdict.md, results/measurements.json
 *
 * Usage: npm run gate -- --profile smoke --phases idle [--baseline file]
 * Exit code: 0 passed, 1 failed, 2 unstable, 3 no-data.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import {
  degradation,
  k6Measurements,
  k6Thresholds,
  uxMeasurements,
  type K6Summary,
  type UxResult,
} from "./collect.ts";
import { evaluate } from "./evaluate.ts";
import { toMarkdown } from "./report.ts";
import { RULES } from "./rules.ts";
import type { Measurements, Phase, Status } from "./types.ts";

const EXIT: Record<Status, number> = {
  passed: 0,
  failed: 1,
  unstable: 2,
  "no-data": 3,
};

const { values: args } = parseArgs({
  options: {
    results: { type: "string", default: "results" },
    profile: { type: "string", default: "smoke" },
    phases: { type: "string", default: "idle" },
    baseline: { type: "string" },
  },
});

function readJson<T>(path: string): T | undefined {
  return existsSync(path)
    ? (JSON.parse(readFileSync(path, "utf8")) as T)
    : undefined;
}

const dir = args.results!;
const phases = args.phases!.split(",").filter(Boolean) as Phase[];
const summary = readJson<K6Summary>(`${dir}/k6-summary.json`);

let measurements: Measurements = summary ? k6Measurements(summary) : {};
for (const phase of phases) {
  const vitals = readJson<UxResult>(`${dir}/ux-vitals-${phase}.json`);
  const lh = readJson<UxResult>(`${dir}/ux-lighthouse-${phase}.json`);
  if (vitals) Object.assign(measurements, uxMeasurements(vitals, "ux"));
  if (lh) Object.assign(measurements, uxMeasurements(lh, "lh"));
}
measurements = { ...measurements, ...degradation(measurements) };

const baseline = args.baseline
  ? readJson<{ measurements: Measurements }>(args.baseline)?.measurements
  : undefined;

const verdict = evaluate({
  measurements,
  thresholds: summary ? k6Thresholds(summary) : [],
  rules: RULES,
  phases,
  baseline,
});

const target = process.env.PERF_TARGET ?? "local";
const meta: Record<string, string> = {
  Target: target,
  Profile: args.profile!,
  "UX phases": phases.join(" + ") || "none",
  Baseline: baseline ? "previous passing run" : "none yet",
  ...(process.env.APP_COMMIT
    ? { "App commit": process.env.APP_COMMIT.slice(0, 7) }
    : {}),
};
const markdown = toMarkdown(verdict, meta);

writeFileSync(
  `${dir}/verdict.json`,
  JSON.stringify({ ...verdict, meta }, null, 2),
);
writeFileSync(`${dir}/verdict.md`, markdown);
writeFileSync(
  `${dir}/measurements.json`,
  JSON.stringify(
    {
      date: new Date().toISOString(),
      target,
      profile: args.profile,
      runUrl: process.env.RUN_URL ?? null,
      appCommit: process.env.APP_COMMIT ?? null,
      status: verdict.status,
      measurements,
    },
    null,
    2,
  ),
);
console.log(markdown);
process.exit(EXIT[verdict.status]);
