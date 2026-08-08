import { spawnSync } from 'node:child_process'
import { beforeEach, expect, test, vi } from 'vitest'
import { clipboardCommand, copyToClipboard } from './clipboard.mjs'

vi.mock('node:child_process', () => ({ spawnSync: vi.fn() }))

beforeEach(() => {
  vi.clearAllMocks()
})

test('Should hand each platform the copier it actually has', () => {
  expect(clipboardCommand('darwin').command).toBe('pbcopy')
  expect(clipboardCommand('win32').command).toBe('clip')
  expect(clipboardCommand('linux'), 'anything else gets xclip').toEqual({
    command: 'xclip',
    args: ['-selection', 'clipboard'],
  })
})

test('Should feed the code to the copier and say it landed', () => {
  spawnSync.mockReturnValue({ status: 0 })

  expect(copyToClipboard('CMON1-abc', 'darwin')).toBe(true)
  expect(spawnSync).toHaveBeenCalledTimes(1)
  expect(spawnSync).toHaveBeenCalledWith('pbcopy', [], { input: 'CMON1-abc' })
})

test('Should report no clipboard when the copier is missing or refuses', () => {
  spawnSync.mockReturnValue({ status: null, error: new Error('ENOENT') })

  expect(copyToClipboard('CMON1-abc', 'linux')).toBe(false)

  spawnSync.mockImplementation(() => {
    throw new Error('EPERM')
  })

  expect(copyToClipboard('CMON1-abc', 'darwin')).toBe(false)
})
