# Limitations

- **The CI runner isn't production.** Load runs on a 4-vCPU GitHub runner that
  hosts the app, Postgres, k6 and Chromium at once. Results are good for
  comparing runs with each other, not for capacity planning. Production
  capacity needs production-like infrastructure.
- **UX under load is a few samples at one moment.** The browser measures 5
  page loads at a fixed point in the ramp. Under stress, whether they land in
  the server's slow tail varies: one stress run measured the dashboard 4x
  slower, the next 1.3x, with the same server numbers. Spreading samples
  across the whole plateau would make this steadier.
- **No CDN, one instance.** The local build is a single `next start` process.
  On Vercel, pages may be served from the CDN and the API runs on many
  serverless instances.
- **The rate limiter is per instance.** `finance_app` keeps its rate-limit
  counters in each server instance's memory. The rate-limit scenario checks it
  locally (one instance). On Vercel, every instance counts separately, so a
  user can exceed the limit when requests spread over instances. A shared store
  (e.g. Redis/Upstash) would fix it; this project doesn't test it on Vercel to
  avoid load on production.
- **Login isn't rate-limited.** Only `/api/register` limits by IP, so the
  credentials callback accepts unlimited attempts. Observed while writing the
  login flow; not load-tested against production.
- **Under stress, the single app process is the limit, not the database.**
  At up to 140 VUs, the dashboard, both lists and `expense_create` reach a p95
  of 350–400 ms. A stress run with `scripts/diag.sh`
  ([run](https://github.com/BRLorena/finance-app-performance/actions/runs/40589934241))
  showed:
  - **The database is mostly idle.** The slowest query averages 1.4 ms, the
    database averages 14% of one CPU, and at most 2 queries ran at once, with
    no lock waits.
  - **Medians stay at 5–16 ms for every endpoint.** The p95 comes from the share
    of requests caught behind a busy moment, which grows from 5–10% (up to
    80 VUs) to about 30% (105–140 VUs).
  - **The app container reaches 100–149% CPU in that phase.** `next start` runs
    JavaScript on one main thread, so about 100% means the process is saturated.
  - **The UX-under-load phase adds to it.** Chromium on the same runner raised
    the slow share to 31–49% while it ran (200–229 s).

  So the "slow list endpoints" were a queue every endpoint shares. On Vercel,
  traffic spreads over many instances, so this limit is specific to the
  single-process CI setup. `expenses.userId` and `incomes.userId` have no
  index, but at this data size (40 rows per user) the queries take about 1 ms,
  so an index wouldn't change these numbers.

- **AI endpoints are excluded.** `/api/ai/*` call Groq's free tier (30 requests
  a minute), so load would measure Groq's quota, not the app.
- **The weekly production run is a smoke check, not a load test.** 3 virtual
  users for 50 seconds, read-only, with one dedicated account.
- **Lighthouse simulates throttling.** The desktop preset models a fast
  connection from the observed trace; scores compare well between runs but
  aren't a field measurement (that's what Vercel Speed Insights is for).
