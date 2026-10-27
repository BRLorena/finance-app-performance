import { gunzipSync } from "node:zlib";
import { readFileSync } from "node:fs";

/**
 * Per-request timings from k6's CSV output. The summary only has
 * percentiles, so it can't say which requests made a p95 slow: whether
 * they came at the start of the run, from one VU, or from a first
 * iteration (a cold path), as the expense_create spikes did.
 */
export interface Request {
  name: string;
  /** ms since the first request of the run */
  at: number;
  duration: number;
  status: string;
  vu: number;
  iter: number;
}

/** k6 quotes a field that holds a comma, e.g. an error message */
function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted && c === '"' && line[i + 1] === '"') {
      cell += '"';
      i++;
    } else if (c === '"') {
      quoted = !quoted;
    } else if (c === "," && !quoted) {
      cells.push(cell);
      cell = "";
    } else {
      cell += c;
    }
  }
  cells.push(cell);
  return cells;
}

/** k6 --out csv, with K6_CSV_TIME_FORMAT=unix_milli and vu, iter tags */
export function parseRequests(csv: string): Request[] {
  const [header, ...lines] = csv.trim().split("\n");
  const col = Object.fromEntries(header.split(",").map((c, i) => [c, i]));
  const rows = lines
    // Skip the other metrics before paying for a full split
    .filter((line) => line.startsWith("http_req_duration,"))
    .map(splitCsvLine);
  // A loop, not Math.min(...): a stress run has too many rows to spread
  let start = Infinity;
  for (const cells of rows)
    start = Math.min(start, Number(cells[col.timestamp]));
  return rows.map((cells) => {
    const meta = new URLSearchParams(cells[col.metadata]);
    return {
      name: cells[col.name] || "unnamed",
      at: Number(cells[col.timestamp]) - start,
      duration: Number(cells[col.metric_value]),
      status: cells[col.status],
      vu: Number(meta.get("vu")),
      iter: Number(meta.get("iter")),
    };
  });
}

export function readRequests(path: string): Request[] {
  return parseRequests(gunzipSync(readFileSync(path)).toString("utf8"));
}

const ms = (value: number) => `${Math.round(value)} ms`;

/** For every endpoint: its spread and its slowest few requests */
export function slowestReport(requests: Request[], top = 3): string {
  const byName = new Map<string, Request[]>();
  for (const r of requests) {
    if (!byName.has(r.name)) byName.set(r.name, []);
    byName.get(r.name)!.push(r);
  }
  const rows = [...byName.entries()]
    .filter(([name]) => name !== "warmup")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, reqs]) => {
      const sorted = reqs.map((r) => r.duration).sort((a, b) => a - b);
      const slowest = [...reqs]
        .sort((a, b) => b.duration - a.duration)
        .slice(0, top)
        .map(
          (r) =>
            `${ms(r.duration)} at ${(r.at / 1000).toFixed(1)}s ` +
            // Only an unexpected status is worth the space
            `(VU ${r.vu}, iter ${r.iter}${/^[23]/.test(r.status) ? "" : `, ${r.status}`})`,
        );
      return `| ${name} | ${reqs.length} | ${ms(sorted[Math.floor(sorted.length / 2)])} | ${ms(sorted.at(-1)!)} | ${slowest.join("<br>")} |`;
    });
  return [
    "### Slowest requests",
    "",
    "| Endpoint | Requests | Median | Max | Slowest (time into the run, VU, iteration) |",
    "| --- | --- | --- | --- | --- |",
    ...rows,
    "",
  ].join("\n");
}
