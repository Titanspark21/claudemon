import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { updateJsonFile } from './fileLock.mjs'

const identity = (value) => value

const newerRevision = (current, incoming) => {
  if (!current) return incoming
  if (current.revision > incoming.revision) return current

  return incoming
}

test('Should read merge and atomically replace JSON while holding its lock', () => {
  const home = mkdtempSync(join(tmpdir(), 'claudemon-lock-'))
  const path = join(home, 'state.json')

  writeFileSync(path, JSON.stringify({ revision: 2, value: 'newer' }))

  const result = updateJsonFile({
    path,
    incoming: { revision: 1, value: 'older' },
    transformResponse: identity,
    transformRequest: identity,
    merge: newerRevision,
  })

  expect(result).toEqual({ revision: 2, value: 'newer' })
  expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(result)
})

test('Should recover a stale lock before updating the file', () => {
  const home = mkdtempSync(join(tmpdir(), 'claudemon-lock-'))
  const path = join(home, 'state.json')
  const lockPath = `${path}.lock`
  const old = new Date(Date.now() - 10_000)

  writeFileSync(lockPath, '')
  utimesSync(lockPath, old, old)

  const result = updateJsonFile({
    path,
    incoming: { revision: 1 },
    transformResponse: identity,
    transformRequest: identity,
    merge: newerRevision,
  })

  expect(result).toEqual({ revision: 1 })
  expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(result)
})

test('Should treat malformed JSON as no current value', () => {
  const home = mkdtempSync(join(tmpdir(), 'claudemon-lock-'))
  const path = join(home, 'state.json')

  writeFileSync(path, '{')

  const result = updateJsonFile({
    path,
    incoming: { revision: 1 },
    transformResponse: identity,
    transformRequest: identity,
    merge: newerRevision,
  })

  expect(result).toEqual({ revision: 1 })
})

test('Should clean up the temporary file when replacement fails', () => {
  const home = mkdtempSync(join(tmpdir(), 'claudemon-lock-'))
  const path = join(home, 'state.json')

  mkdirSync(path)

  expect(() =>
    updateJsonFile({
      path,
      incoming: { revision: 1 },
      transformResponse: identity,
      transformRequest: identity,
      merge: newerRevision,
    }),
  ).toThrow()
})
