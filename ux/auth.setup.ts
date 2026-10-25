import { test as setup, expect } from "@playwright/test";
import { uxCredentials } from "./lib/target.ts";

// Logs in through the real form once; every sample reuses the session
setup("log in", async ({ page }) => {
  const { email, password } = uxCredentials();
  const emailInput = page.locator("input[type=email]");
  const passwordInput = page.locator("input[type=password]");
  await page.goto("/pt/login");

  // On a slow runner React can hydrate after the fields are filled and
  // wipe them, so the form submits empty. Retry until the values stick
  // and the login redirects.
  await expect(async () => {
    await emailInput.fill(email);
    await passwordInput.fill(password);
    await expect(emailInput).toHaveValue(email);
    await expect(passwordInput).toHaveValue(password);
    await page.locator("button[type=submit]").click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });
  }).toPass({ timeout: 60_000 });

  await page.context().storageState({ path: "results/.auth/ux.json" });
});
