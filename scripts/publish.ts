/**
 * Builds the GitHub Pages site for a finished run:
 *   history.json                      every run, newest last (capped)
 *   baseline-<target>-<profile>.json  the last *passing* run of that kind
 *   latest-<target>-<profile>.md      the gate's report for that kind
 *   index.html                        the dashboard (reads history.json)
 *
 * The previous history and baselines are downloaded from the live site
 * first (scripts in the workflow), so nothing is stored in git.
 *
 * Usage: tsx scripts/publish.ts <results dir> <previous site dir> <out dir>
 */
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join, relative } from "node:path";

const HISTORY_LIMIT = 200;

const [resultsDir = "results", previousDir = "previous-site", outDir = "site"] =
  process.argv.slice(2);

interface Run {
  date: string;
  target: string;
  profile: string;
  status: string;
  runUrl: string | null;
  appCommit: string | null;
  measurements: Record<string, number>;
}

const readJson = <T>(path: string, fallback: T): T =>
  existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as T) : fallback;

mkdirSync(outDir, { recursive: true });
// Keep everything the live site already had (other baselines, reports)
if (existsSync(previousDir)) cpSync(previousDir, outDir, { recursive: true });

const run = readJson<Run | null>(`${resultsDir}/measurements.json`, null);
if (!run) {
  console.error("No measurements.json: nothing to publish");
  process.exit(1);
}

const history = readJson<Run[]>(`${outDir}/history.json`, []);
history.push(run);
writeFileSync(
  `${outDir}/history.json`,
  JSON.stringify(history.slice(-HISTORY_LIMIT)),
);

const kind = `${run.target}-${run.profile}`;
if (run.status === "passed") {
  copyFileSync(
    `${resultsDir}/measurements.json`,
    `${outDir}/baseline-${kind}.json`,
  );
}
copyFileSync(`${resultsDir}/verdict.md`, `${outDir}/latest-${kind}.md`);
if (existsSync(`${resultsDir}/lighthouse`)) {
  cpSync(`${resultsDir}/lighthouse`, `${outDir}/lighthouse/${kind}`, {
    recursive: true,
  });
}
copyFileSync("dashboard/index.html", `${outDir}/index.html`);

// The next publish downloads exactly these files before adding its run
const files = readdirSync(outDir, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name !== "index.html")
  .map((entry) => relative(outDir, join(entry.parentPath, entry.name)));
writeFileSync(
  `${outDir}/files.json`,
  JSON.stringify(files.filter((f) => f !== "files.json")),
);

console.log(
  `Published ${kind} (${run.status}); history has ${Math.min(history.length, HISTORY_LIMIT)} runs` +
    (run.status === "passed" ? "; baseline updated" : "; baseline kept"),
);
