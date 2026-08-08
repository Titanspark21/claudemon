import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: [
      'test/*.test.mjs',
      'src/**/*.test.mjs',
      'scripts/**/*.test.mjs',
      'tools/**/*.test.mjs',
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.mjs'],
      exclude: ['**/*.test.mjs'],
      reporter: ['text', 'html', 'json-summary'],
      thresholds: {
        statements: 95.1,
        branches: 87.6,
        functions: 95.9,
        lines: 96.3,
      },
    },
  },
})
