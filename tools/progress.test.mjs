import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { pass, progress } from './progress.mjs'

let write

const bar = (filled) => `${'█'.repeat(filled)}${'░'.repeat(24 - filled)}`

const written = () => write.mock.calls.map(([chunk]) => chunk).join('')

beforeEach(() => {
  write = vi.spyOn(process.stdout, 'write').mockReturnValue(true)
})

afterEach(() => {
  write.mockRestore()
})

test('Should render an empty bar with no trailing newline at 0%', () => {
  progress('sprites', 0, 10)

  expect(written()).toBe(`\r  sprites        ${bar(0)} 0/10`)
})

test('Should render a half filled bar with no trailing newline at 50%', () => {
  progress('sprites', 5, 10)

  expect(written()).toBe(`\r  sprites        ${bar(12)} 5/10`)
})

test('Should render a full bar and a trailing newline at 100%', () => {
  progress('sprites', 10, 10)

  expect(written()).toBe(`\r  sprites        ${bar(24)} 10/10\n`)
})

test('Should render a full bar and a trailing newline when the total is zero', () => {
  progress('sprites', 0, 0)

  expect(written()).toBe(`\r  sprites        ${bar(24)} 0/0\n`)
})

test('Should report the initial state and every completed item and return results in order', async () => {
  const results = await pass(
    'moves',
    ['a', 'b'],
    async (item) => item.toUpperCase(),
    1,
  )

  expect(results).toEqual(['A', 'B'])
  expect(written()).toBe(
    `\r  moves          ${bar(0)} 0/2` +
      `\r  moves          ${bar(12)} 1/2` +
      `\r  moves          ${bar(24)} 2/2\n`,
  )
})
