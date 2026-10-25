/**
 * Test users, shared by the seed script, k6 and Playwright.
 *
 * Each k6 virtual user logs in as its own account: the app rate-limits per
 * user (60 list requests and 30 summaries a minute), so one shared account
 * would measure 429s instead of the app. The pool is sized above the
 * highest VU count of any profile.
 */
export const LOAD_USER_COUNT = 150;

/** Local-only password, seeded into the throwaway Docker database */
export const LOCAL_PASSWORD = "perf-password-123";

export function loadUserEmail(index: number): string {
  return `perf-user-${String(index).padStart(3, "0")}@perf.local`;
}

/** Account the UX layer browses with, so it never shares limits with k6 */
export const UX_USER_EMAIL = "perf-ux@perf.local";

/** Account the rate-limit scenario bursts with */
export const RATE_LIMIT_USER_EMAIL = "perf-ratelimit@perf.local";
