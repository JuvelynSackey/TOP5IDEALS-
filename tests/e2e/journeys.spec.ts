import { expect, test, type Page } from "@playwright/test";
import { env, hasAccounts, login, logout, testPng } from "./helpers";

/**
 * Core marketplace journeys. Requires three pre-created accounts in a TEST
 * Supabase project with completed profiles: seller, buyer and admin (role set
 * via SQL, see docs/DEPLOYMENT.md). The buyer must already own one approved
 * listing so it can be offered in a swap.
 */
test.describe.configure({ mode: "serial" });
test.skip(!hasAccounts, "Set E2E_BASE_URL and E2E_{SELLER,BUYER,ADMIN}_{EMAIL,PASSWORD} (see docs/TESTING.md).");

const title = `E2E iPhone ${Date.now()}`;
let listingUrl = "";

async function createListing(page: Page, listingTitle: string) {
  await page.goto("/sell");
  await page.getByLabel("Brand").selectOption({ label: "Apple" });
  await page.getByLabel("Model").selectOption({ label: "iPhone 14 Pro" });
  await page.getByLabel("Storage").selectOption({ label: "256GB" });
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.getByRole("radio", { name: /Excellent/ }).click();
  await page.getByRole("button", { name: /Save and continue/ }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: "phone.png", mimeType: "image/png", buffer: testPng(1) });
  await expect(page.getByText("Cover")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /Save and continue/ }).click();
  await page.getByLabel(/Asking price/).fill("8500");
  await page.getByLabel("Open to swaps").click();
  await page.getByRole("button", { name: /Save and continue/ }).click();
  await page.getByLabel("City or town").fill("Accra");
  await page.getByRole("button", { name: /Save and continue/ }).click();
  await page.getByLabel("Title").fill(listingTitle);
  await page.getByRole("button", { name: /Submit for review/ }).click();
  await expect(page.getByRole("heading", { name: "Submitted for review" })).toBeVisible();
}

test("seller creates a listing with photos; it awaits moderation", async ({ page }) => {
  await login(page, env.seller);
  await createListing(page, title);
  await page.goto("/dashboard/listings?tab=review");
  await expect(page.getByText(title)).toBeVisible();
  await logout(page);
});

test("admin approves the listing; an unsuitable one is rejected with a reason", async ({ page }) => {
  await login(page, env.admin, "/admin/listings");
  const card = page.locator("li", { hasText: title });
  await card.getByRole("button", { name: "Approve" }).click();
  await page.getByRole("button", { name: "Approve" }).last().click();
  await expect(page.getByText(/approved and published/)).toBeVisible();
  await logout(page);
});

test("buyer searches, opens, saves and unsaves the listing", async ({ page }) => {
  await login(page, env.buyer, "/buy");
  await page.goto(`/buy?q=${encodeURIComponent(title)}`);
  await page.getByRole("link", { name: title }).click();
  listingUrl = page.url();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved to your favourites")).toBeVisible();
  await page.getByRole("button", { name: "Saved" }).click();
  await expect(page.getByText("Removed from favourites")).toBeVisible();
});

test("buyer messages the seller", async ({ page }) => {
  await login(page, env.buyer, listingUrl.replace(env.baseUrl!, ""));
  await page.getByRole("button", { name: "Message" }).first().click();
  await expect(page).toHaveURL(/\/dashboard\/messages\//);
  await page.getByLabel("Message").fill("Hello, is the iPhone still available?");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("Hello, is the iPhone still available?")).toBeVisible();
});

test("buyer makes a swap offer with cash; seller counters; buyer accepts; both confirm and review", async ({ browser }) => {
  const buyer = await (await browser.newContext()).newPage();
  await login(buyer, env.buyer, listingUrl.replace(env.baseUrl!, ""));
  await buyer.getByRole("button", { name: "Make swap offer" }).click();
  await buyer.getByRole("checkbox").first().click();
  await buyer.getByRole("button", { name: "Continue" }).click();
  await buyer.getByRole("radio", { name: "I add cash" }).click();
  await buyer.getByLabel("Amount (GH₵)").fill("1500");
  await buyer.getByRole("button", { name: "Review offer" }).click();
  await expect(buyer.getByText(/You pay .* GH₵1,500/)).toBeVisible();
  await buyer.getByRole("button", { name: "Send swap offer" }).click();
  await expect(buyer).toHaveURL(/\/dashboard\/offers\//);
  const offerPath = new URL(buyer.url()).pathname;

  const seller = await (await browser.newContext()).newPage();
  await login(seller, env.seller, offerPath);
  await seller.getByRole("button", { name: "Counteroffer" }).click();
  await seller.getByLabel("Amount (GH₵)").fill("2000");
  await seller.getByRole("button", { name: "Send counteroffer" }).click();
  await expect(seller.getByText("Counteroffer", { exact: true }).first()).toBeVisible();

  await buyer.reload();
  await expect(buyer.getByText("v2")).toBeVisible();
  await buyer.getByRole("button", { name: "Accept" }).click();
  await buyer.getByRole("button", { name: "Accept offer" }).click();
  await expect(buyer).toHaveURL(/\/dashboard\/transactions\//);
  const txPath = new URL(buyer.url()).pathname;

  for (const page of [buyer, seller]) {
    await page.goto(txPath);
    await page.getByRole("button", { name: /Confirm exchange completed/ }).click();
    for (const box of await page.getByRole("dialog").getByRole("checkbox").all()) await box.click();
    await page.getByRole("button", { name: "Confirm", exact: true }).click();
  }
  await buyer.reload();
  await expect(buyer.getByText("Completed").first()).toBeVisible();
  for (const page of [buyer, seller]) {
    await page.reload();
    for (const group of ["Overall", "Communication", "Item accuracy", "Exchange experience"]) {
      await page.getByRole("radiogroup", { name: `${group} rating` }).getByRole("radio", { name: "5 stars" }).click();
    }
    await page.getByRole("button", { name: /^Review / }).click();
    await expect(page.getByText(/Thanks for your review/)).toBeVisible();
  }
});

test("a stranger cannot read another user's conversation", async ({ page }) => {
  await login(page, env.admin, "/dashboard/messages");
  await page.goto("/dashboard/messages/00000000-0000-4000-8000-000000000000");
  await expect(page.getByRole("heading", { name: /couldn.t find that/i })).toBeVisible();
});

test("a user reports a suspicious listing", async ({ page }) => {
  await login(page, env.buyer, listingUrl.replace(env.baseUrl!, ""));
  await page.getByRole("button", { name: /Report listing/ }).first().click();
  await page.getByLabel("Reason").selectOption("fraud");
  await page.getByRole("button", { name: "Submit report" }).click();
  await expect(page.getByText(/our team will review/i)).toBeVisible();
});
