import type { CheckResult, Verdict } from "./types.ts";

const ICON: Record<CheckResult["status"], string> = {
  passed: "✅",
  failed: "❌",
  missing: "⚠️",
};

const HEADLINE: Record<Verdict["status"], string> = {
  passed: "✅ Passed",
  failed: "❌ Failed",
  unstable: "⚠️ Unstable: a required measurement is missing",
  "no-data": "⚪ No data",
};

function format(value: number | undefined, unit: CheckResult["unit"]): string {
  if (value === undefined) return "–";
  if (unit === "ms") return `${Math.round(value)} ms`;
  if (unit === "rate") return `${(value * 100).toFixed(2)}%`;
  if (unit === "ratio") return `${value.toFixed(2)}x`;
  return `${value}`;
}

function row(c: CheckResult): string {
  const change =
    c.changePct === undefined
      ? "–"
      : `${c.changePct > 0 ? "+" : ""}${c.changePct}%`;
  return `| ${ICON[c.status]} | ${c.label} | ${format(c.value, c.unit)} | ${c.limit ?? "–"} | ${format(c.baseline, c.unit)} | ${change} | ${c.reason} |`;
}

/** Markdown for the GitHub job summary and the PR comment */
export function toMarkdown(
  verdict: Verdict,
  meta: Record<string, string>,
): string {
  const header =
    "| | Check | Value | Limit | Baseline | Change | |\n| --- | --- | --- | --- | --- | --- | --- |";
  const section = (title: string, layer: CheckResult["layer"]) => {
    const rows = verdict.checks.filter((c) => c.layer === layer);
    return rows.length
      ? `### ${title}\n\n${header}\n${rows.map(row).join("\n")}\n`
      : "";
  };
  const metaLine = Object.entries(meta)
    .map(([k, v]) => `**${k}:** ${v}`)
    .join(" · ");
  const { passed, failed, missing } = verdict.counts;
  return [
    `## Performance gate: ${HEADLINE[verdict.status]}`,
    "",
    metaLine,
    "",
    `${passed} passed · ${failed} failed · ${missing} missing`,
    "",
    section("Load (k6)", "load"),
    section("User experience (Playwright + Lighthouse)", "ux"),
  ].join("\n");
}
