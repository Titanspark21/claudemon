// No style guide, on purpose. The base is `eslint:recommended` — correctness only,
// no opinion about how the code looks — and formatting stays out of CI because it is
// hand-set here: the comments are wrapped to read as prose and the escape tables in
// ansi.mjs are aligned by eye. @stylistic tuned to match this file's own conventions
// still disagreed in 94 places, and its defaults in 409; none of that is a bug, and
// all of it would have been somebody's afternoon.
import js from '@eslint/js'
import globals from 'globals'

export default [
  {
    // The dataset and the site are generated, not written. Nothing in here is source.
    ignores: ['data/**', 'docs/**', '.claudemon-ci/**'],
  },

  js.configs.recommended,

  {
    // `bin/claudemon` has no extension — it is the launcher, and the shim execs it by
    // that exact name — so ESLint does not pick it up from the default patterns.
    // Naming it here is what puts it in the run.
    files: ['**/*.mjs', 'bin/claudemon'],
    languageOptions: {
      // The floor the README promises, which is Node 20.19 and so ES2023. Parsing at
      // the floor means syntax the oldest supported Node cannot run is a lint error
      // here rather than a crash report from somebody running it.
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: globals.node,
    },
    rules: {
      // An argument named with a leading underscore is there for its position, not
      // its value — usually the ignored half of a callback signature.
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],

      // Everything below is on top of `recommended`, and every one of them was
      // checked against the code as written before being switched on: all of them
      // report nothing today. They are here to hold the line, not to start a
      // cleanup. Nothing about formatting is in here on purpose — see below.

      // Mistakes the tests would only find if they happened to run that line.
      'array-callback-return': 'error',
      'no-template-curly-in-string': 'error', // '${x}' in a plain string, in a repo that builds strings all day
      'no-unmodified-loop-condition': 'error',
      'no-unreachable-loop': 'error',
      'no-self-compare': 'error',
      'no-throw-literal': 'error',
      'prefer-promise-reject-errors': 'error',

      // `== null` is deliberate all over this codebase: it is the short way to mean
      // "null or undefined". Exempting it is what makes the rule free, and every
      // other loose comparison still has to say what it means.
      eqeqeq: ['error', 'always', { null: 'ignore' }],

      // Habits, not opinions: each of these is code that does nothing.
      'no-var': 'error',
      'prefer-const': 'error',
      'no-useless-return': 'error',
      'no-useless-concat': 'error',
      'no-useless-rename': 'error',
      'no-lone-blocks': 'error',
      'no-param-reassign': 'error',
      radix: 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
    },
  },
]
