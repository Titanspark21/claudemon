import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    maxWorkers: 4,

    // Vitest's default is 5000ms, and that default is measured against an
    // uninstrumented run. `npm run coverage` is the same suite with V8
    // coverage on, which costs roughly 4x on the tests that do real work:
    //
    //                                              plain    coverage
    //   battleField, "clear air between them"      1.45s      6.2s
    //   screen, "always fit the message box"       0.99s      4.5s
    //
    // So the first of those failed every coverage run while passing every
    // `npm test` run, on an idle machine -- and it failed as `failure`, which
    // reads as the branch saying no rather than as a limit being hit. The
    // second was 0.5s from joining it.
    //
    // This is not headroom for slowness: the work is identical either way, and
    // 30s still fails a genuinely hung test long before the job's own
    // 20-minute limit. It is the instrumentation multiplier the default never
    // knew about.
    testTimeout: 30_000,

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
        branches: 88.2,
        functions: 96.8,
        lines: 96.8,
      },
    },
  },
})
