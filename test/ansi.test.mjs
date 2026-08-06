import { test } from 'vitest'
import assert from 'node:assert/strict'

import { stripAnsi, truncate, visibleLength } from '../src/ui/ansi.mjs'

const ESC = '\x1b'
const RED = `${ESC}[31m`
const RESET = `${ESC}[0m`

test('stripping leaves the letters and takes everything else', () => {
  assert.equal(stripAnsi(`${RED}red${RESET}`), 'red')
  assert.equal(stripAnsi(`${ESC}[38;2;1;2;3mrgb${RESET}`), 'rgb')
  assert.equal(stripAnsi(`${ESC}[2J${ESC}[Hcleared`), 'cleared')
  assert.equal(stripAnsi('plain'), 'plain')
})

test('an operating system escape goes too, either way it is ended', () => {
  assert.equal(stripAnsi(`${ESC}]0;a title\x07after`), 'after')
  assert.equal(stripAnsi(`${ESC}]8;;http://x${ESC}\\after`), 'after')
})

test('width counts cells, not characters, and colour costs nothing', () => {
  assert.equal(visibleLength('hello'), 5)
  assert.equal(visibleLength(`${RED}hello${RESET}`), 5, 'colour is free')
  assert.equal(visibleLength(''), 0)
  assert.equal(visibleLength('🌱'), 2, 'an emoji takes two cells')
  assert.equal(visibleLength('★'), 1, 'a symbol takes one')
  assert.equal(visibleLength('🌱x'), 3)
})

test('text that already fits comes back untouched', () => {
  assert.equal(truncate('hello', 5), 'hello', 'exactly full is still fitting')
  assert.equal(truncate('hello', 10), 'hello')
  assert.equal(truncate('', 4), '')
})

test('text that does not fit is cut and marked', () => {
  assert.equal(truncate('hello world', 5), `hello${RESET}…`)
  assert.equal(visibleLength(truncate('hello world', 5)), 6, 'the cut plus …')
})

test('a cut keeps the colour it was cut in the middle of', () => {
  const cut = truncate(`${RED}hello world${RESET}`, 5)

  assert.ok(cut.startsWith(RED), 'the colour must survive the cut')
  assert.equal(stripAnsi(cut), 'hello…')
  assert.ok(cut.endsWith(`${RESET}…`), 'and it must be closed again')
})

test('an escape costs no width, so colour never shortens the text', () => {
  const plain = truncate('abcdefghij', 4)
  const painted = truncate(`${RED}a${RESET}${RED}bcdefghij${RESET}`, 4)

  assert.equal(stripAnsi(plain), stripAnsi(painted))
})

test('a wide character is never cut in half', () => {
  const cut = truncate('🌱🌱🌱', 5)

  assert.equal(
    stripAnsi(cut),
    '🌱🌱…',
    'five cells fit two of them, not two and a half',
  )
  assert.equal(visibleLength(cut), 5)
})

test('a width too small for even one wide character yields just the mark', () => {
  assert.equal(stripAnsi(truncate('🌱🌱', 1)), '…')
})

test('a lone escape with nothing after it does not stall the cut', () => {
  const cut = truncate(`abc${ESC}defghij`, 4)

  assert.ok(visibleLength(cut) <= 5, `${JSON.stringify(cut)} ran long`)
  assert.ok(cut.endsWith('…'))
})
