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
      //
      // Measure with no audio player on PATH before raising them. A machine
      // that has one covers a good deal more of sound.mjs than the runners
      // do, and numbers taken on a laptop will not hold on Linux.
      thresholds: {
        statements: 88,
        branches: 78,
        functions: 91,
        lines: 89,
      },
    },
  },
})
