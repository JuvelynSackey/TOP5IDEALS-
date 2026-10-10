import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// Test accounts and URLs live in the git-ignored .env.local (see docs/TESTING.md).
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

/**
 * End-to-end tests run against a deployed or locally running instance that is
 * connected to a NON-PRODUCTION Supabase project. See docs/TESTING.md.
 *
 *   E2E_BASE_URL=http://localhost:3000 npm run test:e2e
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});
