import { test as setup, expect } from "@playwright/test";
import { uxCredentials } from "./lib/target.ts";

// Logs in through the real form once; every sample reuses the session
setup("log in", async ({ page }) => {
  const { email, password } = uxCredentials();
  // Wait for hydration: a click before React attaches does nothing
  await page.goto("/pt/login", { waitUntil: "networkidle" });
  await page.locator("input[type=email]").fill(email);
  await page.locator("input[type=password]").fill(password);
  await page.locator("button[type=submit]").click();
  // bcrypt + a client-side redirect: slow on a cold CI runner
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
  await page.context().storageState({ path: "results/.auth/ux.json" });
});
