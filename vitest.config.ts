import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setup.ts'],
    // Fixed timezone so date and sunset tests behave the same on every machine and in CI.
    env: { TZ: 'Asia/Kolkata' },
  },
})
