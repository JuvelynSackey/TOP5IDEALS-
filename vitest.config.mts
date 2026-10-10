import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

// Integration tests read their staging settings from the git-ignored .env.local.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/db/**/*.test.ts", "tests/integration/**/*.test.ts"],
    environment: "node",
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
