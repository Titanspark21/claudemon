import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { STDIN_TIMEOUT_MS } from './constants.mjs'
import { readStdin, readStdinSync } from './stdin.mjs'

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal()

  return { ...actual, readFileSync: vi.fn(actual.readFileSync) }
})

const captureStdin = () => {
  const handlers = {}
  const encodings = []

  const rememberHandler = (event, handler) => {
    handlers[event] = handler

    return process.stdin
  }

  const rememberEncoding = (encoding) => {
    encodings.push(encoding)

    return process.stdin
  }

  vi.spyOn(process.stdin, 'on').mockImplementation(rememberHandler)
  vi.spyOn(process.stdin, 'setEncoding').mockImplementation(rememberEncoding)

  return { handlers, encodings }
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

test('Should resolve with the chunks joined in order once stdin ends', async () => {
  const { handlers, encodings } = captureStdin()

  const reading = readStdin()

  handlers.data('{"session_id"')
  handlers.data(':"aaa"}')
  handlers.end()

  await expect(reading).resolves.toBe('{"session_id":"aaa"}')
  expect(encodings).toEqual(['utf8'])
})

test('Should resolve with what already arrived when stdin errors', async () => {
  const { handlers } = captureStdin()

  const reading = readStdin()

  handlers.data('{"session_id":"aaa"}')
  handlers.error(new Error('EPIPE'))

  await expect(reading).resolves.toBe('{"session_id":"aaa"}')
})

test('Should ignore whatever arrives after stdin has already settled', async () => {
  const { handlers } = captureStdin()

  const reading = readStdin()

  handlers.data('early')
  handlers.end()
  handlers.data('late')
  handlers.end()

  await expect(reading).resolves.toBe('early')
})

test('Should resolve empty when stdin never ends before the timeout', async () => {
  vi.useFakeTimers()
  captureStdin()

  const reading = readStdin()

  await vi.advanceTimersByTimeAsync(STDIN_TIMEOUT_MS)

  await expect(reading).resolves.toBe('')
})

test('Should read all of stdin in one go', () => {
  vi.mocked(readFileSync).mockReturnValue('{"workspace":{}}')

  expect(readStdinSync()).toBe('{"workspace":{}}')
  expect(readFileSync).toHaveBeenCalledTimes(1)
  expect(readFileSync).toHaveBeenCalledWith(0, 'utf8')
})

test('Should read stdin as empty when the descriptor cannot be read', () => {
  vi.mocked(readFileSync).mockImplementation(() => {
    throw new Error('EAGAIN')
  })

  expect(readStdinSync()).toBe('')
})
