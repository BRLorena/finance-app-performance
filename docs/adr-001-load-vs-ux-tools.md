# ADR 001: k6 for load, Playwright + Lighthouse for UX, not Playwright for load

**Status:** accepted · **Date:** 2026-10-25

## Context

"Load testing with Playwright" is a common portfolio idea: start many browsers and
see what breaks. It mixes up two different questions:

| Question                                                                                  | What answers it                 |
| ----------------------------------------------------------------------------------------- | ------------------------------- |
| How does the **server** behave with N concurrent users? (throughput, p95 latency, errors) | A protocol-level load generator |
| What does **one user experience** while that happens? (LCP, CLS, time to data)            | A real browser                  |

A real browser per virtual user costs hundreds of MB of RAM and a CPU core under
rendering. At 100 VUs the load generator, not the app, becomes the bottleneck,
and the numbers measure the test rig.

## Decision

Two layers, run together, judged by one gate:

1. **k6** generates the load at the protocol level. One VU is a few MB, so a
   single CI runner holds 140 VUs without becoming the bottleneck. Each VU logs
   in through the real NextAuth flow and runs the journey a user would run.
2. **Playwright + Lighthouse** measure the experience, a few samples at a time,
   **once with the app idle and once while k6 holds it at its target load**. The
   difference between the two is the result this project cares about most.
3. **A gate** in plain TypeScript (unit-tested) turns both layers' results into
   one verdict: `passed`, `failed`, `unstable` or `no-data`.

Load runs against a production build of `finance_app` started in CI with its own
Postgres, never against the live Vercel deployment (see
[limitations](limitations.md)). The live app gets one gentle, read-only smoke
check a week.

## Alternatives considered

- **Playwright for load:** rejected for the reasons above.
- **k6 browser module only:** a good fit for "a few browsers during load", but
  Lighthouse audits and Playwright's tooling (traces, storage state) are richer.
  k6 browser would be the choice if everything had to run in one tool.
- **JMeter / Gatling / Locust:** capable, but JMeter's XML plans review poorly
  in PRs, and Gatling and Locust add a JVM or Python toolchain to a TypeScript
  repo. k6 scripts are TypeScript, versioned and reviewed like code.
- **Load testing the Vercel URL:** rejected. It would spend the free tier quotas
  of Vercel and Neon, measure Vercel's CDN rather than the app, trip the per-user
  rate limits, and write test data into production.

## Consequences

- Absolute numbers come from a shared CI runner, so they're noisy. The gate
  compares with the last passing run using a tolerance and an absolute noise
  floor, and keeps Core Web Vitals budgets as hard limits.
- The app under test is built from a git ref, so any `finance_app` branch can be
  measured before it merges (`workflow_dispatch` with `app_ref`).
- Production behaviour that only exists on Vercel (cold starts, multiple
  instances, the CDN) is covered only by the weekly smoke run.
