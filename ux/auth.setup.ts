import { test as setup, expect } from "@playwright/test";
import { uxCredentials } from "./lib/target.ts";

/**
 * Gets a session the way the login form does (CSRF token, then the
 * credentials callback), through the browser context's request API so the
 * cookie lands in the saved storage state. The UX layer measures pages,
 * not the login form, so it doesn't drive the form: on CI runners the
 * form intermittently submitted empty values right after hydration.
 */
setup("log in", async ({ page, baseURL }) => {
  const { email, password } = uxCredentials();
  const request = page.context().request;

  const csrf = await request.get("/api/auth/csrf");
  const { csrfToken } = await csrf.json();
  const login = await request.post("/api/auth/callback/credentials", {
    form: {
      email,
      password,
      csrfToken,
      callbackUrl: `${baseURL}/pt/dashboard`,
    },
    maxRedirects: 0,
  });
  expect(login.status(), "credentials callback redirects").toBe(302);

  // The session must open the dashboard rather than bounce to the login
  await page.goto("/pt/dashboard");
  await expect(page).toHaveURL(/\/pt\/dashboard/);
  await page.context().storageState({ path: "results/.auth/ux.json" });
});
