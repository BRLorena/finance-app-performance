# Limitations

- **The CI runner isn't production.** Load runs on a 4-vCPU GitHub runner that
  hosts the app, Postgres, k6 and Chromium at once. Results are good for
  comparing runs with each other, not for capacity planning. Production
  capacity needs production-like infrastructure.
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
- **Under stress, the list endpoints degrade first.** Expense and income
  lists reach a p95 of 351–377 ms in CI at up to 140 VUs, while the
  12-query summary stays at 157 ms. Not investigated yet.
- **AI endpoints are excluded.** `/api/ai/*` call Groq's free tier (30 requests
  a minute), so load would measure Groq's quota, not the app.
- **The weekly production run is a smoke check, not a load test.** 3 virtual
  users for 50 seconds, read-only, with one dedicated account.
- **Lighthouse simulates throttling.** The desktop preset models a fast
  connection from the observed trace; scores compare well between runs but
  aren't a field measurement (that's what Vercel Speed Insights is for).
