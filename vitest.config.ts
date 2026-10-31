import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts", "jobs/*.test.ts", "jobs/lib/**/*.test.ts", "apps/web/lib/**/*.test.ts", "twitter/**/*.test.ts"],
    environment: "node",
    testTimeout: 30_000,
  },
});
