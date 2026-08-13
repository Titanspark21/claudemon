export default {
  semi: false,
  singleQuote: true,
  endOfLine: 'auto',

  printWidth: 80,

  overrides: [{ files: 'bin/claudemon', options: { parser: 'babel' } }],
}
