import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setup.ts'],
    // Whole-app tests wait up to 5 s for a screen (see setup.ts); give the test room for a few.
    testTimeout: 20_000,
    // Fixed timezone so date and sunset tests behave the same on every machine and in CI.
    env: { TZ: 'Asia/Kolkata' },
  },
})
