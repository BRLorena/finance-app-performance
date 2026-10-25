import { test as setup, expect } from "@playwright/test";
import { uxCredentials } from "./lib/target.ts";

// Logs in through the real form once; every sample reuses the session
setup("log in", async ({ page }) => {
  const { email, password } = uxCredentials();
  await page.goto("/pt/login");
  await page.locator("input[type=email]").fill(email);
  await page.locator("input[type=password]").fill(password);
  await page.locator("button[type=submit]").click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.context().storageState({ path: "results/.auth/ux.json" });
});
