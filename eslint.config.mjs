import js from '@eslint/js'
import globals from 'globals'

export default [
  {
    ignores: ['data/**', 'docs/**', '.claudemon-ci/**'],
  },

  js.configs.recommended,

  {
    files: ['**/*.mjs', 'bin/claudemon'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: globals.node,
    },
    rules: {
      'no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', caughtErrors: 'none' },
      ],

      'no-empty': ['error', { allowEmptyCatch: true }],

      'array-callback-return': 'error',
      'no-template-curly-in-string': 'error',
      'no-unmodified-loop-condition': 'error',
      'no-unreachable-loop': 'error',
      'no-self-compare': 'error',
      'no-throw-literal': 'error',
      'prefer-promise-reject-errors': 'error',

      eqeqeq: ['error', 'always', { null: 'ignore' }],

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
