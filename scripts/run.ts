/**
 * Runs one full performance pass and judges it:
 *
 *   1. UX idle      Playwright vitals + Lighthouse with the app at rest
 *   2. Load         k6 with the chosen profile, in the background
 *   3. UX under load the same measurements while k6 holds the app at its
 *                   target load (skipped for smoke: 3 VUs aren't "load")
 *   4. Gate         one verdict from both layers
 *
 * Usage: npm run perf -- --profile load   (smoke | load | stress | spike)
 * Exit code: the gate's (0 passed, 1 failed, 2 unstable, 3 no-data).
 */
import { spawn } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { parseArgs } from "node:util";

const { values: args } = parseArgs({
  options: {
    profile: { type: "string", default: "smoke" },
    baseline: { type: "string" },
  },
});
const profile = args.profile!;

/** Seconds after k6 starts when the profile has reached its target load */
const UX_UNDER_LOAD_AT: Record<string, number | undefined> = {
  smoke: undefined,
  load: 70,
  stress: 200,
  spike: 45,
};
if (!(profile in UX_UNDER_LOAD_AT)) {
  console.error(`Unknown profile "${profile}"`);
  process.exit(3);
}
const uxAt = UX_UNDER_LOAD_AT[profile];

function run(
  command: string,
  commandArgs: string[],
  env: Record<string, string> = {},
): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(command, commandArgs, {
      stdio: "inherit",
      env: { ...process.env, ...env },
    });
    child.on("close", (code) => resolve(code ?? 1));
  });
}

const ux = (phase: "idle" | "load") => {
  console.log(`\n── UX (${phase}) ──`);
  return run("npx", ["playwright", "test"], { UX_PHASE: phase });
};

rmSync("results", { recursive: true, force: true });
mkdirSync("results/.auth", { recursive: true });

// Failures here don't stop the run: missing results make the gate unstable
await ux("idle");

console.log(`\n── Load (k6, ${profile}) ──`);
const k6 = run(
  "k6",
  [
    "run",
    "--quiet",
    "--summary-export",
    "results/k6-summary.json",
    "load/scenarios/finance.ts",
  ],
  { PROFILE: profile },
);

const phases = ["idle"];
if (uxAt !== undefined) {
  await new Promise((resolve) => setTimeout(resolve, uxAt * 1000));
  await ux("load");
  phases.push("load");
}
const k6Exit = await k6;
// 99 means thresholds were crossed: the gate reports which ones
if (k6Exit !== 0 && k6Exit !== 99) console.error(`k6 exited with ${k6Exit}`);

console.log("\n── Gate ──");
const gateArgs = [
  "tsx",
  "gate/cli.ts",
  "--profile",
  profile,
  "--phases",
  phases.join(","),
];
if (args.baseline) gateArgs.push("--baseline", args.baseline);
process.exit(await run("npx", gateArgs));
