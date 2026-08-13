import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    setupFiles: ['./test/setup.mjs'],
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
        statements: 95.3,
        branches: 88,
        functions: 96.1,
        lines: 96.4,
      },
    },
  },
})
