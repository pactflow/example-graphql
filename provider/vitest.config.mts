import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Verification starts a real server and talks to a real broker; running files in parallel
    // buys nothing and makes the output hard to read.
    fileParallelism: false,
    include: ['src/**/*.test.ts'],
    // Fetching pacts, verifying them and publishing results is well past vitest's 5s default.
    testTimeout: 120_000,
    hookTimeout: 60_000,
  },
});
