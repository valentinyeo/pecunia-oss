import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["scripts/**/*.test.ts", "packages/reports/test/**/*.test.ts"],
    testTimeout: 30_000,
  },
});
