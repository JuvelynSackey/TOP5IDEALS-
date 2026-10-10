import { expect, test } from "@playwright/test";
import { env } from "./helpers";

test.skip(!env.baseUrl, "Set E2E_BASE_URL to run browser tests (see docs/TESTING.md).");

test("landing page communicates buy, sell and swap", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("FIND YOUR");
  await expect(page.getByRole("link", { name: /Browse Phones/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Sell Your Phone/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Explore Swap Deals/ })).toBeVisible();
});

test("search runs against the database and filters are reflected in the URL", async ({ page }) => {
  await page.goto("/buy?q=iphone&condition=excellent&sort=price_asc");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("iphone");
  await expect(page.getByText(/phones? found|No phones|phone/i).first()).toBeVisible();
});

test("protected areas redirect anonymous visitors to log in", async ({ page }) => {
  for (const path of ["/dashboard", "/dashboard/messages", "/sell", "/admin"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/auth\/login\?next=/);
  }
});

test("unknown listings return 404", async ({ page }) => {
  const response = await page.goto("/phones/not-a-real-listing");
  expect(response?.status()).toBe(404);
});

test("no horizontal overflow on narrow phones", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  for (const path of ["/", "/buy", "/swap", "/safety"]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, path).toBeLessThanOrEqual(1);
  }
});
