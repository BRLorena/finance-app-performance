import http from "k6/http";
import exec from "k6/execution";
import { check, group, sleep } from "k6";
import { Counter } from "k6/metrics";
import type { Options } from "k6/options";
import { login } from "../lib/auth.ts";
import { PROFILES, profileName } from "../lib/profiles.ts";
import {
  LOAD_USER_COUNT,
  LOCAL_PASSWORD,
  loadUserEmail,
} from "../../config/users.ts";

/**
 * The main journey: a logged-in user opens the dashboard, browses their
 * expenses and incomes, then adds an expense and deletes it again.
 *
 * Env: BASE_URL, PROFILE (smoke | load | stress | spike), and for a
 * deployed target READ_ONLY=true plus PERF_EMAIL / PERF_PASSWORD.
 */
const BASE_URL = __ENV.BASE_URL ?? "http://localhost:3300";
const READ_ONLY = __ENV.READ_ONLY === "true";
const PROFILE = profileName();
// A deployed target adds network, cold starts and a remote database
const BUDGET_SCALE = Number(__ENV.BUDGET_SCALE ?? 1);

const rateLimited = new Counter("rate_limited");

// Per-endpoint budgets for the local production build (see docs/metrics.md)
const READ_BUDGET_MS: Record<string, number> = {
  login: 1500,
  dashboard_page: 800,
  summary: 500,
  expenses_list: 400,
  incomes_list: 400,
};
const WRITE_BUDGET_MS: Record<string, number> = {
  expense_create: 400,
  expense_delete: 400,
};
// A read-only run never calls the write endpoints, so it has no budget for them
const BUDGET_MS = READ_ONLY
  ? READ_BUDGET_MS
  : { ...READ_BUDGET_MS, ...WRITE_BUDGET_MS };

export const options: Options = {
  scenarios: {
    journey: {
      executor: "ramping-vus",
      stages: PROFILES[PROFILE],
      gracefulRampDown: "10s",
    },
  },
  noCookiesReset: true,
  thresholds: {
    http_req_failed: ["rate<0.01"],
    checks: ["rate>0.99"],
    // The user pool must keep every VU under the per-user limits
    rate_limited: ["count==0"],
    ...Object.fromEntries(
      Object.entries(BUDGET_MS).map(([name, ms]) => [
        `http_req_duration{name:${name}}`,
        [`p(95)<${ms * BUDGET_SCALE}`],
      ]),
    ),
  },
  summaryTrendStats: ["avg", "med", "p(90)", "p(95)", "p(99)", "max"],
  tags: { profile: PROFILE },
};

let loggedIn = false;

function credentials() {
  if (__ENV.PERF_EMAIL && __ENV.PERF_PASSWORD) {
    return { email: __ENV.PERF_EMAIL, password: __ENV.PERF_PASSWORD };
  }
  // One account per VU, so the per-user rate limits never kick in. A
  // deployed target has one shared account instead (see THINK_SCALE)
  const vu = exec.vu.idInTest;
  if (vu > LOAD_USER_COUNT) {
    exec.test.abort(`VU ${vu} has no test user; raise LOAD_USER_COUNT`);
  }
  return { email: loadUserEmail(vu), password: LOCAL_PASSWORD };
}

function get(path: string, name: string) {
  const res = http.get(`${BASE_URL}${path}`, { tags: { name } });
  if (res.status === 429) rateLimited.add(1);
  return res;
}

// On a deployed target every VU shares PERF_EMAIL, and so its per-user
// limits (/api/summary: 30 a minute). At the normal pace 3 VUs make ~36
// summary calls a minute; twice the think time keeps them near 20.
const THINK_SCALE = __ENV.PERF_EMAIL ? 2 : 1;

function think() {
  sleep((1 + Math.random()) * THINK_SCALE);
}

export default function journey() {
  if (!loggedIn) {
    const { email, password } = credentials();
    login(BASE_URL, email, password);
    loggedIn = true;
  }

  group("dashboard", () => {
    const page = get("/pt/dashboard", "dashboard_page");
    check(page, { "dashboard renders": (r) => r.status === 200 });

    const summary = get("/api/summary", "summary");
    check(summary, {
      "summary is 200": (r) => r.status === 200,
      "summary has totals": (r) =>
        r.json("totals.expenses.count") !== undefined,
    });
  });
  think();

  group("browse", () => {
    const expenses = get("/api/expenses?page=1&limit=10", "expenses_list");
    check(expenses, { "expenses is 200": (r) => r.status === 200 });
    think();

    const incomes = get("/api/incomes?page=1&limit=10", "incomes_list");
    check(incomes, { "incomes is 200": (r) => r.status === 200 });
  });
  think();

  // A deployed target is production data: never write to it
  if (READ_ONLY) return;

  group("add and remove an expense", () => {
    const created = http.post(
      `${BASE_URL}/api/expenses`,
      JSON.stringify({
        amount: "12.34",
        description: `k6 VU ${exec.vu.idInTest} iteration ${exec.vu.iterationInScenario}`,
        category: "foodDining",
        date: new Date().toISOString().slice(0, 10),
      }),
      {
        headers: { "Content-Type": "application/json" },
        tags: { name: "expense_create" },
      },
    );
    check(created, { "expense created": (r) => r.status === 201 });
    const id = created.json("id");
    if (!id) return;

    const deleted = http.del(`${BASE_URL}/api/expenses/${id}`, null, {
      tags: { name: "expense_delete" },
    });
    check(deleted, { "expense deleted": (r) => r.status === 200 });
  });
  think();
}
