import { expect, test } from 'vitest'
import { commandInvocation, commandMissing } from './command.mjs'

test('Should hand a bare command to the Windows shell so a .cmd on the PATH is found', () => {
  expect(commandInvocation('claude', ['plugin', 'list'], 'win32')).toEqual({
    command: 'claude plugin list',
    args: [],
    shell: true,
  })
})

test('Should quote a Windows argument that would otherwise split on its spaces', () => {
  const invocation = commandInvocation(
    'claude',
    ['plugin', 'marketplace', 'add', 'C:\\My Software\\claudemon'],
    'win32',
  )

  expect(invocation.command).toBe(
    'claude plugin marketplace add "C:\\My Software\\claudemon"',
  )
})

test('Should run a command at an absolute Windows path directly, with no shell in the way', () => {
  const invocation = commandInvocation(
    'C:\\Program Files\\nodejs\\node.exe',
    ['C:\\clone\\tools\\install.mjs', '--verify'],
    'win32',
  )

  expect(invocation).toEqual({
    command: 'C:\\Program Files\\nodejs\\node.exe',
    args: ['C:\\clone\\tools\\install.mjs', '--verify'],
    shell: false,
  })
})

test('Should leave every other platform spawning the command itself', () => {
  expect(commandInvocation('claude', ['plugin', 'list'], 'darwin')).toEqual({
    command: 'claude',
    args: ['plugin', 'list'],
    shell: false,
  })
})

test('Should count a command Windows says it does not recognise as a missing one', () => {
  expect(
    commandMissing(
      { code: 1 },
      "'claude' is not recognized as an internal or external command,",
    ),
  ).toBe(true)
  expect(commandMissing({ code: 'ENOENT' }, '')).toBe(true)
  expect(commandMissing({ code: 1 }, 'no such marketplace')).toBe(false)
})
