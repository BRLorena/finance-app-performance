# Metrics and budgets

## Load layer (k6)

Budgets are k6 thresholds in [`load/scenarios/finance.ts`](../load/scenarios/finance.ts),
so `k6 run` fails on its own and the gate reports which ones broke.

| Metric                       | Budget  | Why                                                            |
| ---------------------------- | ------- | -------------------------------------------------------------- |
| p95 of `login`               | 1500 ms | bcrypt with cost 12 runs on every login; it's slow on purpose  |
| p95 of `dashboard_page`      | 800 ms  | Server-rendered HTML with a session check                      |
| p95 of `summary`             | 500 ms  | 12 aggregate queries per request: the heaviest endpoint        |
| p95 of lists, create, delete | 400 ms  | Single-table queries                                           |
| `http_req_failed`            | < 1%    | Any 4xx/5xx other than expected ones                           |
| `checks`                     | > 99%   | Response content, not only status codes                        |
| `rate_limited`               | 0       | Each VU has its own account; a 429 means the pool is too small |

`p95` is the 95th percentile: 1 in 20 requests is slower. Means hide the slow tail
users notice; p95 doesn't.

The weekly Vercel run multiplies these budgets by 3 (`BUDGET_SCALE`) for network
distance, serverless cold starts and the remote database.

## UX layer (Playwright + Lighthouse)

Budgets are in [`gate/rules.ts`](../gate/rules.ts). Each page is loaded 5 times
in a fresh browser context (cold cache) and the **median** is kept.

| Metric           | Meaning                                                                               | Budget                           |
| ---------------- | ------------------------------------------------------------------------------------- | -------------------------------- |
| TTFB             | Navigation start until the first byte of HTML                                         | (recorded)                       |
| FCP              | First text or image painted                                                           | (recorded)                       |
| LCP              | Largest element painted: "the page looks loaded"                                      | 2500 ms (Google's "good")        |
| CLS              | How much the layout jumps around, unitless                                            | 0.1 (Google's "good")            |
| Data ready       | Navigation start until `/api/summary` finished: when the dashboard shows real numbers | 1000 ms idle, 2000 ms under load |
| Slowdown         | Data ready under load ÷ data ready idle                                               | 4x                               |
| Lighthouse score | Performance category, desktop preset                                                  | 0.9 idle, 0.8 under load         |

"Data ready" matters most for this app: the dashboard paints its shell quickly
(good LCP) and then fetches its numbers. A slow API shows up there first.

## Baseline and noise

Every check with a tolerance is also compared with the **last passing run of the
same target and profile** (`baseline-<target>-<profile>.json` on GitHub Pages).
A metric regresses only when it's worse by more than `BASELINE_NOISE_PCT`
(default 25%) **and** by more than an absolute noise floor (100 ms for UX, 50 ms
for endpoints). The floor stops a 20 ms → 30 ms change (+50%) from failing a build.
The endpoint floor was 25 ms until a smoke run (about 24 requests per endpoint,
so the p95 is the second-slowest request) measured `expense_create` at 38 ms
against a 7 ms baseline on an unchanged app. 50 ms still catches a real
regression like the 300 ms one in demo PR #4.
Login has a 150 ms floor: bcrypt makes it track the runner's CPU, and a slow
runner moved its p95 from 244 ms to 375 ms on an unchanged app.

Failed runs never become the baseline, so a slow build can't lower the bar for
the next one.

## Verdicts

| Verdict    | Meaning                                                                                     | Exit code |
| ---------- | ------------------------------------------------------------------------------------------- | --------- |
| `passed`   | Every check ran and passed                                                                  | 0         |
| `failed`   | A budget was broken or a metric regressed                                                   | 1         |
| `unstable` | Nothing failed, but something wasn't measured (e.g. k6 crashed), so it can't count as green | 2         |
| `no-data`  | Nothing ran                                                                                 | 3         |
