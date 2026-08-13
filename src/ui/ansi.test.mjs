import { afterEach, expect, test, vi } from 'vitest'

const originalNoColor = process.env.NO_COLOR

afterEach(() => {
  if (originalNoColor === undefined) delete process.env.NO_COLOR
  else process.env.NO_COLOR = originalNoColor

  vi.resetModules()
})

test('Should leave styled text plain when NO_COLOR is set', async () => {
  process.env.NO_COLOR = '1'
  vi.resetModules()

  const { bg, bold, CLEAR, COLOR_ENABLED, fg, red } = await import('./ansi.mjs')

  expect(COLOR_ENABLED).toBe(false)
  expect(bold('plain')).toBe('plain')
  expect(red('plain')).toBe('plain')
  expect(fg(1, 2, 3)).toBe('')
  expect(bg(1, 2, 3)).toBe('')
  expect(CLEAR).toBe('')
})
