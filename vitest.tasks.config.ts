import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tasks/**/task.test.ts"],
    fileParallelism: false,
    testTimeout: 10_000,
  },
});
