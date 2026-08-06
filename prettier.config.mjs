// Prettier owns the shape of the code; eslint.config.mjs owns what it does. There is
// nothing to referee between them — that config carries no stylistic rules at all — so
// there is no eslint-config-prettier here either.

/** @type {import('prettier').Config} */
export default {
  // The two that were already true of every file in the tree. Setting them is what
  // makes turning the formatter on a reflow rather than a rewrite.
  semi: false,
  singleQuote: true,

  // 100 rather than the default 80. Prettier never reflows comments, and the prose in
  // this repo is hand-wrapped near 90, so a narrower setting would fold the code tight
  // around comments that stayed exactly where they were. At 100 the first run moved
  // ~1.7k lines and left sixteen files untouched; at 80 it moved ~4.7k.
  printWidth: 100,

  overrides: [
    // The entry point carries no extension, because that is what a launcher invokes.
    // Prettier infers a parser from the name and finds nothing, so it is named here —
    // otherwise the one file every player runs is the one file nobody formats.
    { files: 'bin/claudemon', options: { parser: 'babel' } },
  ],
}
