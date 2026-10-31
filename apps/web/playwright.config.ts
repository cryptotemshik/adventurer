import { defineConfig } from "@playwright/test";

const TEST_SEED = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const DB = `${process.cwd()}/.data/e2e.db`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  use: { baseURL: "http://localhost:3100", trace: "retain-on-failure" },
  webServer: {
    command: `rm -f ${DB}* && cd ../.. && MASTER_SEED="${TEST_SEED}" AGENT_SEED="${TEST_SEED}" BIAS_SQLITE_PATH=${DB} npx tsx jobs/provision.ts 0 5 --insert && cd apps/web && npx next start -p 3100`,
    url: "http://localhost:3100/api/stats",
    timeout: 180_000,
    reuseExistingServer: false,
    env: {
      BIAS_SQLITE_PATH: DB,
      DRY_RUN: "true",
      NEXT_PUBLIC_SITE_URL: "http://localhost:3100",
      HL_NETWORK: "testnet",
      LAUNCHES_ENABLED: "true",
    },
  },
});
