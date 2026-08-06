import { expect, test } from 'vitest'

import { parseKey } from './keys.mjs'

const pressed = (sequence) => parseKey(Buffer.from(sequence, 'utf8'))

test('Should name both escape variants of every arrow', () => {
  expect(pressed('\x1b[A')).toEqual({ name: 'up' })
  expect(pressed('\x1bOA')).toEqual({ name: 'up' })
  expect(pressed('\x1b[B')).toEqual({ name: 'down' })
  expect(pressed('\x1bOB')).toEqual({ name: 'down' })
  expect(pressed('\x1b[C')).toEqual({ name: 'right' })
  expect(pressed('\x1bOC')).toEqual({ name: 'right' })
  expect(pressed('\x1b[D')).toEqual({ name: 'left' })
  expect(pressed('\x1bOD')).toEqual({ name: 'left' })
})

test('Should name both escape variants of home and end', () => {
  expect(pressed('\x1b[H')).toEqual({ name: 'home' })
  expect(pressed('\x1bOH')).toEqual({ name: 'home' })
  expect(pressed('\x1b[F')).toEqual({ name: 'end' })
  expect(pressed('\x1bOF')).toEqual({ name: 'end' })
})

test('Should name the page keys', () => {
  expect(pressed('\x1b[5~')).toEqual({ name: 'pageup' })
  expect(pressed('\x1b[6~')).toEqual({ name: 'pagedown' })
})

test('Should name enter for both a carriage return and a line feed', () => {
  expect(pressed('\r')).toEqual({ name: 'enter' })
  expect(pressed('\n')).toEqual({ name: 'enter' })
})

test('Should name backspace for both delete and the control code', () => {
  expect(pressed('\x7f')).toEqual({ name: 'backspace' })
  expect(pressed('\b')).toEqual({ name: 'backspace' })
})

test('Should name tab, space and a bare escape', () => {
  expect(pressed('\t')).toEqual({ name: 'tab' })
  expect(pressed(' ')).toEqual({ name: 'space' })
  expect(pressed('\x1b')).toEqual({ name: 'escape' })
})

test('Should name the two quitting control keys', () => {
  expect(pressed('\x03')).toEqual({ name: 'ctrl-c' })
  expect(pressed('\x04')).toEqual({ name: 'ctrl-d' })
})

test('Should carry a printable character through as both name and char', () => {
  expect(pressed('a')).toEqual({ name: 'a', char: 'a' })
  expect(pressed('1')).toEqual({ name: '1', char: '1' })
  expect(pressed('é')).toEqual({ name: 'é', char: 'é' })
})
