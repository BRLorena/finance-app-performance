import http from "k6/http";
import { check } from "k6";
import type { Options } from "k6/options";
import { login } from "../lib/auth.ts";
import { LOCAL_PASSWORD, RATE_LIMIT_USER_EMAIL } from "../../config/users.ts";

/**
 * Verifies the app's own protection instead of tripping over it: one user
 * bursts /api/summary (limit: 30 a minute) and must get 429s with the
 * rate-limit headers once the budget is spent, and nothing but 429s after.
 *
 * Local target only: the limiter keeps its counters in each server
 * instance's memory, so on Vercel the result depends on which instance
 * answers (see docs/limitations.md).
 */
const BASE_URL = __ENV.BASE_URL ?? "http://localhost:3300";
const LIMIT = 30;
const BURST = LIMIT + 10;

export const options: Options = {
  scenarios: {
    burst: { executor: "shared-iterations", vus: 1, iterations: 1 },
  },
  thresholds: { checks: ["rate==1"] },
};

export default function burst() {
  login(BASE_URL, RATE_LIMIT_USER_EMAIL, LOCAL_PASSWORD);

  const statuses: number[] = [];
  let lastLimited: http.RefinedResponse<"text"> | undefined;
  for (let i = 0; i < BURST; i++) {
    const res = http.get(`${BASE_URL}/api/summary`, {
      tags: { name: "summary_burst" },
      responseCallback: http.expectedStatuses(200, 429),
    });
    statuses.push(res.status);
    if (res.status === 429) lastLimited = res;
  }

  const firstLimited = statuses.indexOf(429);
  check(statuses, {
    "never more than the limit succeeds": (s) =>
      s.filter((x) => x === 200).length <= LIMIT,
    "the burst gets rate limited": () => firstLimited !== -1,
    "only 200 or 429": (s) => s.every((x) => x === 200 || x === 429),
    "no 200 once limited": (s) =>
      firstLimited !== -1 && s.slice(firstLimited).every((x) => x === 429),
  });
  check(lastLimited, {
    "429 reports the limit": (r) =>
      r?.headers["X-Ratelimit-Limit"] === `${LIMIT}`,
    "429 reports nothing remaining": (r) =>
      r?.headers["X-Ratelimit-Remaining"] === "0",
  });
}
