import { expect, test } from 'vitest'
import { APP_ROOT, VERSION } from './version.mjs'
import {
  runtimeIdentity,
  runtimeIdentityMatches,
  runtimeReinstallInstruction,
} from './runtime.mjs'

test('Should identify the running root, version and generated dataset together', () => {
  const identity = runtimeIdentity()

  expect(identity.root).toBe(APP_ROOT)
  expect(identity.version).toBe(VERSION)
  expect(identity.dataset.generation).toBe(7)
  expect(identity.dataset.identityVersion).toBeGreaterThan(0)
  expect(identity.dataset.fingerprint).toMatch(/^[a-f0-9]{64}$/)
  expect(runtimeIdentityMatches(identity)).toBe(true)
})

test('Should reject a different root or dataset as another runtime revision', () => {
  const identity = runtimeIdentity()

  expect(
    runtimeIdentityMatches({ ...identity, root: `${identity.root}-other` }),
  ).toBe(false)
  expect(runtimeIdentityMatches({ ...identity, version: '0.0.0' })).toBe(false)
  expect(
    runtimeIdentityMatches({
      ...identity,
      dataset: { ...identity.dataset, fingerprint: 'different' },
    }),
  ).toBe(false)
})

test('Should give one exact reinstall command for a split runtime', () => {
  expect(runtimeReinstallInstruction()).toBe(
    `Run: node "${APP_ROOT}/tools/install.mjs"`,
  )
})
