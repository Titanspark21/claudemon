import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/*.test.mjs'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.mjs'],
      reporter: ['text', 'html', 'json-summary'],

      // A ratchet, not a target: these sit just under what the suite
      // covers today, so a drop fails CI and a gain is free to raise them.
      thresholds: {
        statements: 87,
        branches: 77,
        functions: 90,
        lines: 88,
      },
    },
  },
})
