import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Every test file here writes to the same pact file. Vitest runs files in parallel by
    // default and concurrent writers clobber each other's interactions, so the writes must be
    // serialised or the published pact silently loses interactions.
    fileParallelism: false,
    include: ['src/**/*.test.ts'],
  },
});
