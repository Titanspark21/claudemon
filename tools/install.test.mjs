import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { VERSION } from '../src/version.mjs'
import { refreshPlugin } from './install.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const copyPluginProof = (installedRoot) => {
  for (const path of [
    '.claude-plugin/plugin.json',
    'hooks/hooks.json',
    'scripts/on-activity.mjs',
  ]) {
    const target = join(installedRoot, path)

    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, readFileSync(join(root, path), 'utf8'))
  }
}

test('Should replace an already-installed same-name plugin with this checkout', () => {
  const cache = mkdtempSync(join(tmpdir(), 'claudemon-plugin-cache-'))
  const installedRoot = join(cache, VERSION)
  const calls = []
  let installed = false

  mkdirSync(installedRoot, { recursive: true })
  writeFileSync(join(installedRoot, 'foreign.txt'), 'upstream copy')

  const runCommand = (_command, args) => {
    calls.push(args.join(' '))

    if (args.join(' ') === 'plugin list') {
      return { ok: true, output: 'claudemon@claudemon', missing: false }
    }

    if (args.join(' ') === 'plugin install claudemon@claudemon') {
      copyPluginProof(installedRoot)
      installed = true
    }

    return { ok: true, output: '', missing: false }
  }

  const result = refreshPlugin({ runCommand, root, cache, version: VERSION })

  expect(result).toEqual({ ok: true, root: installedRoot })
  expect(installed).toBe(true)
  expect(calls).toContain('plugin marketplace remove claudemon')
  expect(calls).toContain(`plugin marketplace add ${root}`)
  expect(calls).toContain('plugin install claudemon@claudemon')
  expect(() => readFileSync(join(installedRoot, 'foreign.txt'))).toThrow()

  rmSync(cache, { recursive: true, force: true })
})
