// Versions, and the machinery for moving between them.
//
// Nothing here touches the network or runs a command: the check takes a fetch, and
// the runner takes an exec. Both are stubbed, which is the only way a test about
// updating can be run a thousand times without updating anything.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Must happen before importing anything that resolves paths at module load.
const sandbox = mkdtempSync(join(tmpdir(), 'claudemon-update-'))
const realData = join(process.env.CLAUDEMON_HOME || join(homedir(), '.claudemon'), 'data')
if (existsSync(realData)) symlinkSync(realData, join(sandbox, 'data'))
process.env.CLAUDEMON_HOME = sandbox

const {
  CHECK_INTERVAL_MS, checkForUpdate, createUpdateRun, dueForCheck, fetchLatestVersion,
  readUpdateState, updateNotice, updatePlan,
} = await import('../src/update.mjs')
const {
  VERSION, compareVersions, installedVersions, isNewer, isPluginCopy, newestInstalled, versionAt,
} = await import('../src/version.mjs')
const { DEFAULT_CONFIG, updateCheckMode } = await import('../src/config.mjs')
const homeView = await import('../src/ui/views/home.mjs')
const updateView = await import('../src/ui/views/update.mjs')
const { visibleLength } = await import('../src/ui/ansi.mjs')
const { pointsElsewhere, relinkLaunchers, shimSource } = await import('../src/shim.mjs')

/** A throwaway plugin cache with the given versions in it. */
function fakeCache(...versions) {
  const cache = mkdtempSync(join(tmpdir(), 'claudemon-cache-'))
  for (const version of versions) mkdirSync(join(cache, version), { recursive: true })
  return cache
}

const updateFile = (name) => join(sandbox, `${name}.json`)

/** A fetch that answers with a manifest. */
const servingVersion = (version) => async () => ({
  ok: true,
  text: async () => JSON.stringify({ name: 'claudemon', version }),
})

const refusing = () => async () => { throw new Error('ECONNREFUSED') }

// --- Comparing versions ------------------------------------------------------

test('versions compare by number, not by string', () => {
  assert.ok(compareVersions('0.10.0', '0.9.0') > 0, '10 is past 9')
  assert.ok(compareVersions('1.0.0', '0.99.99') > 0)
  assert.equal(compareVersions('0.5.0', '0.5.0'), 0)
  assert.ok(compareVersions('0.5.0', '0.6.0') < 0)
})

test('a shorter version is the same as one padded with zeroes', () => {
  assert.equal(compareVersions('1', '1.0.0'), 0)
  assert.equal(compareVersions('1.2', '1.2.0'), 0)
  assert.ok(compareVersions('1.2.1', '1.2') > 0)
})

test('nonsense in a version compares as zero rather than throwing', () => {
  assert.equal(compareVersions('', ''), 0)
  assert.equal(compareVersions(undefined, null), 0)
  assert.equal(compareVersions('0.x.0', '0.0.0'), 0)
})

test('nothing is newer than an unknown version, in either direction', () => {
  // Both sides have to be real. Guessing here would offer an update that is not
  // there, or hide one that is.
  assert.equal(isNewer(null, '0.5.0'), false)
  assert.equal(isNewer('0.6.0', null), false)
  assert.equal(isNewer('0.6.0', '0.5.0'), true)
  assert.equal(isNewer('0.5.0', '0.5.0'), false)
})

test('this copy knows its own version, and it is the manifest that says so', () => {
  const path = fileURLToPath(new URL('../.claude-plugin/plugin.json', import.meta.url))
  assert.equal(VERSION, JSON.parse(readFileSync(path, 'utf8')).version)
  assert.match(VERSION, /^\d+\.\d+\.\d+$/)
})

test('a directory with no manifest has no version, rather than a made-up one', () => {
  assert.equal(versionAt(sandbox), null)
})

// --- What is on the disk -----------------------------------------------------

test('installed copies come back newest first', () => {
  const cache = fakeCache('0.5.0', '0.10.0', '0.9.0')
  assert.deepEqual(installedVersions(cache), ['0.10.0', '0.9.0', '0.5.0'])
  assert.equal(newestInstalled(cache), '0.10.0')
})

test('anything in the cache that is not a version is ignored', () => {
  const cache = fakeCache('0.5.0', 'scratch', '.tmp')
  assert.deepEqual(installedVersions(cache), ['0.5.0'])
})

test('a missing cache is no copies rather than an error', () => {
  assert.deepEqual(installedVersions(join(sandbox, 'nothing-here')), [])
  assert.equal(newestInstalled(join(sandbox, 'nothing-here')), null)
})

test('a copy inside the plugin cache is a plugin, and anything else is a clone', () => {
  const cache = '/home/someone/.claude/plugins/cache/claudemon/claudemon'
  assert.equal(isPluginCopy(`${cache}/0.5.0`, cache), true)
  assert.equal(isPluginCopy(cache, cache), true)
  assert.equal(isPluginCopy('/home/someone/code/claudemon', cache), false)
  // A directory that merely starts with the same characters is not inside it.
  assert.equal(isPluginCopy(`${cache}-old/0.5.0`, cache), false)
})

test('a plugin copy is recognised whatever the path separator', () => {
  // The cache path is built with path.join, so on Windows the version dir is joined
  // with "\". Comparing against a hardcoded "/" made an installed plugin look like a
  // clone there, sending the updater down the git-pull path in a directory that is
  // not a clone and leaving the launchers unrelinked. Both separators, because a root
  // that reaches us through a shell rather than path.join can still be spelled "/".
  const cache = 'C:\\Users\\someone\\.claude\\plugins\\cache\\claudemon\\claudemon'
  assert.equal(isPluginCopy(`${cache}\\0.5.0`, cache), true)
  assert.equal(isPluginCopy(`${cache}/0.5.0`, cache), true)
  assert.equal(isPluginCopy(`${cache}-old\\0.5.0`, cache), false)
})

// --- When to look ------------------------------------------------------------

test('a check is due when there has never been one', () => {
  assert.equal(dueForCheck({}), true)
  assert.equal(dueForCheck({ checkedAt: 'not a date' }), true)
})

test('a check is not due again for a day', () => {
  const now = Date.parse('2026-03-01T12:00:00.000Z')
  const state = { checkedAt: new Date(now).toISOString() }

  assert.equal(dueForCheck(state, now + 60_000), false)
  assert.equal(dueForCheck(state, now + CHECK_INTERVAL_MS - 1000), false)
  assert.equal(dueForCheck(state, now + CHECK_INTERVAL_MS), true)
})

test('a stamp from the future counts as due', () => {
  // Otherwise a clock that was wrong once stops the check for good.
  const now = Date.parse('2026-03-01T12:00:00.000Z')
  const state = { checkedAt: new Date(now + CHECK_INTERVAL_MS * 10).toISOString() }
  assert.equal(dueForCheck(state, now), true)
})

// --- Checking ----------------------------------------------------------------

test('a check records what it found, and does not ask again the same day', async () => {
  const file = updateFile('found')
  const now = Date.parse('2026-03-01T12:00:00.000Z')
  let calls = 0
  const serve = servingVersion('9.9.9')
  const fetchImpl = (...args) => { calls++; return serve(...args) }

  const first = await checkForUpdate({ config: DEFAULT_CONFIG, now, file, fetchImpl })
  assert.equal(first.latest, '9.9.9')
  assert.equal(calls, 1)
  assert.equal(readUpdateState(file).latest, '9.9.9')

  const second = await checkForUpdate({ config: DEFAULT_CONFIG, now: now + 60_000, file, fetchImpl })
  assert.equal(second.latest, '9.9.9')
  assert.equal(calls, 1, 'the cached answer was reused')

  await checkForUpdate({ config: DEFAULT_CONFIG, now: now + CHECK_INTERVAL_MS, file, fetchImpl })
  assert.equal(calls, 2, 'a day later it asked again')
})

test('the three modes are what is on disk, and anything else is the default', () => {
  assert.equal(updateCheckMode(DEFAULT_CONFIG), 'daily')
  assert.equal(updateCheckMode({ updateCheck: true }), 'daily')
  assert.equal(updateCheckMode({ updateCheck: 'launch' }), 'launch')
  assert.equal(updateCheckMode({ updateCheck: false }), 'off')
  // Hand-edited nonsense, and a config from a version that had no such setting.
  assert.equal(updateCheckMode({ updateCheck: 'yes' }), 'daily')
  assert.equal(updateCheckMode({}), 'daily')
  assert.equal(updateCheckMode(), 'daily')
})

test('a forced check asks even though the last one was minutes ago', async () => {
  // What UPDATE LAUNCH buys: the day is not up, and it asks anyway.
  const file = updateFile('forced')
  const now = Date.parse('2026-03-01T12:00:00.000Z')
  let calls = 0
  const fetchImpl = (...args) => { calls++; return servingVersion('9.9.9')(...args) }
  const config = { ...DEFAULT_CONFIG, updateCheck: 'launch' }

  await checkForUpdate({ config, now, file, fetchImpl })
  assert.equal(calls, 1)

  const again = await checkForUpdate({ config, now: now + 60_000, file, fetchImpl, force: true })
  assert.equal(calls, 2, 'it asked again rather than reading the cache')
  assert.equal(again.latest, '9.9.9')
  assert.equal(again.checkedAt, new Date(now + 60_000).toISOString())

  // And without the force it is still the once-a-day question.
  await checkForUpdate({ config, now: now + 120_000, file, fetchImpl })
  assert.equal(calls, 2)
})

test('forcing a check does not override the check being switched off', async () => {
  // Off is an answer, not a schedule: nothing should be able to talk it into a socket.
  const file = updateFile('forced-off')
  let calls = 0
  const fetchImpl = (...args) => { calls++; return servingVersion('9.9.9')(...args) }

  const state = await checkForUpdate({
    config: { ...DEFAULT_CONFIG, updateCheck: false },
    file,
    fetchImpl,
    force: true,
  })
  assert.equal(calls, 0)
  assert.deepEqual(state, {})
  assert.equal(existsSync(file), false)
})

test('the check switched off never asks, whatever the cache says', async () => {
  const file = updateFile('off')
  let calls = 0
  const fetchImpl = (...args) => { calls++; return servingVersion('9.9.9')(...args) }

  const state = await checkForUpdate({ config: { ...DEFAULT_CONFIG, updateCheck: false }, file, fetchImpl })
  assert.equal(calls, 0)
  assert.deepEqual(state, {}, 'nothing was learned')
  assert.equal(existsSync(file), false, 'and nothing was written')
})

test('a failed check is remembered so it is not retried every launch', async () => {
  const file = updateFile('refused')
  const now = Date.parse('2026-03-01T12:00:00.000Z')

  const state = await checkForUpdate({ config: DEFAULT_CONFIG, now, file, fetchImpl: refusing() })
  assert.match(state.error, /ECONNREFUSED/)
  assert.equal(state.checkedAt, new Date(now).toISOString())
  assert.equal(dueForCheck(readUpdateState(file), now + 60_000), false)
})

test('a failed check does not unlearn what the last one found', async () => {
  const file = updateFile('keeps')
  const now = Date.parse('2026-03-01T12:00:00.000Z')

  await checkForUpdate({ config: DEFAULT_CONFIG, now, file, fetchImpl: servingVersion('9.9.9') })
  const after = await checkForUpdate({
    config: DEFAULT_CONFIG,
    now: now + CHECK_INTERVAL_MS,
    file,
    fetchImpl: refusing(),
  })

  assert.equal(after.latest, '9.9.9', 'still the newest version anyone here has heard of')
  assert.ok(after.error)
})

test('a manifest that is not one is a failure, not a version', async () => {
  await assert.rejects(
    () => fetchLatestVersion({ fetchImpl: async () => ({ ok: true, text: async () => '{"name":"claudemon"}' }) }),
    /no version/,
  )
  await assert.rejects(
    () => fetchLatestVersion({ fetchImpl: async () => ({ ok: false, status: 404 }) }),
    /404/,
  )
  await assert.rejects(
    () => fetchLatestVersion({ fetchImpl: async () => ({ ok: true, text: async () => 'not json' }) }),
  )
})

test('a corrupt cache file is treated as never having checked', () => {
  const file = updateFile('corrupt')
  writeFileSync(file, '{ this is not json')
  assert.deepEqual(readUpdateState(file), {})
  assert.equal(dueForCheck(readUpdateState(file)), true)
})

test('a check that blows up does not take the tab down with it', async () => {
  // It is called from a timer, so an unhandled rejection here would be fatal to a
  // game somebody left open, over a version number.
  const state = await checkForUpdate({
    config: DEFAULT_CONFIG,
    file: updateFile('exploding'),
    fetchImpl: () => { throw new TypeError('fetch is not a function') },
  })
  assert.match(state.error, /not a function/)
})

// --- What to say about it ----------------------------------------------------

test('nothing is said when this is the newest claudemon there is', () => {
  assert.equal(updateNotice({ current: '0.6.0', installed: '0.6.0', latest: '0.6.0' }), null)
  assert.equal(updateNotice({ current: '0.6.0', installed: '0.5.0', latest: '0.5.0' }), null)
  assert.equal(updateNotice({ current: '0.6.0' }), null)
})

test('a newer copy already on the disk asks for a relaunch, not an update', () => {
  const notice = updateNotice({ current: '0.5.0', installed: '0.6.0', latest: '0.6.0' })
  assert.deepEqual(notice, { kind: 'stale', version: '0.6.0' })
})

test('a version nobody here has is the one worth offering', () => {
  const notice = updateNotice({ current: '0.5.0', installed: '0.5.0', latest: '0.6.0' })
  assert.deepEqual(notice, { kind: 'available', version: '0.6.0' })
})

test('a copy on the disk beats a version on the internet', () => {
  // Both are true after Claude Code updates the plugin under an open tab. Quitting
  // is the fix, and running an update out of stale code is the stranger of the two.
  const notice = updateNotice({ current: '0.5.0', installed: '0.6.0', latest: '0.7.0' })
  assert.deepEqual(notice, { kind: 'stale', version: '0.6.0' })
})

// --- The plan ----------------------------------------------------------------

test('an installed plugin is updated through Claude Code', () => {
  const cache = fakeCache('0.5.0')
  const plan = updatePlan({ root: join(cache, '0.5.0'), cache })

  assert.equal(plan.kind, 'plugin')
  assert.deepEqual(plan.steps.map((step) => step.id), ['marketplace', 'plugin', 'install'])

  const [marketplace, plugin] = plan.steps.map((step) => step.plan())
  assert.equal(marketplace.command, 'claude')
  assert.deepEqual(marketplace.args, ['plugin', 'marketplace', 'update', 'claudemon'])
  assert.deepEqual(plugin.args, ['plugin', 'update', 'claudemon@claudemon'])
})

test('the installer that runs is the one in the copy just fetched', () => {
  const cache = fakeCache('0.5.0')
  const plan = updatePlan({ root: join(cache, '0.5.0'), cache })
  const install = plan.steps.find((step) => step.id === 'install')

  // Resolved when the step runs, not when the plan is made: at plan time the
  // directory it names does not exist yet.
  mkdirSync(join(cache, '0.6.0'), { recursive: true })
  assert.equal(install.plan().args[0], join(cache, '0.6.0', 'tools', 'install.mjs'))
  assert.equal(plan.resolveVersion(), '0.6.0')
})

test('a clone is updated with git, and reports its own manifest', () => {
  const clone = mkdtempSync(join(tmpdir(), 'claudemon-clone-'))
  mkdirSync(join(clone, '.claude-plugin'), { recursive: true })
  writeFileSync(join(clone, '.claude-plugin', 'plugin.json'), '{"version":"1.2.3"}')

  const plan = updatePlan({ root: clone, cache: fakeCache('0.5.0') })

  assert.equal(plan.kind, 'clone')
  assert.deepEqual(plan.steps.map((step) => step.id), ['pull', 'install'])
  assert.deepEqual(plan.steps[0].plan().args, ['-C', clone, 'pull', '--ff-only'])
  assert.equal(plan.steps[1].plan().args[0], join(clone, 'tools', 'install.mjs'))
  // Not the plugin cache: the clone is what the launcher runs.
  assert.equal(plan.resolveVersion(), '1.2.3')
})

// --- Running it --------------------------------------------------------------

/** A plan whose steps only record that they were asked to run. */
function fakePlan({ results = [], version = '0.6.0' } = {}) {
  const ran = []
  const steps = ['one', 'two', 'three'].map((id, index) => ({
    id,
    label: `doing ${id}`,
    done: `did ${id}`,
    plan: () => ({ command: 'true', args: [id], timeoutMs: 1000, index }),
  }))
  return {
    ran,
    plan: { kind: 'plugin', steps, resolveVersion: () => version },
    exec: async (step) => {
      ran.push(step.args[0])
      return results[step.index] ?? { ok: true, output: '' }
    },
  }
}

/** A one-step plan, for the failures that are about the message rather than order. */
const onePlan = (id) => ({
  kind: id === 'pull' ? 'clone' : 'plugin',
  steps: [{ id, label: 'x', done: 'x', plan: () => ({}) }],
  resolveVersion: () => null,
})

test('every step runs in order, and the version it left behind is read from the disk', async () => {
  const { plan, exec, ran } = fakePlan()
  const run = createUpdateRun({ plan, exec })
  await run.promise

  assert.deepEqual(ran, ['one', 'two', 'three'])
  assert.deepEqual(run.steps.map((step) => step.status), ['ok', 'ok', 'ok'])
  assert.equal(run.state, 'done')
  assert.equal(run.from, VERSION)
  assert.equal(run.to, '0.6.0')
})

test('a failure stops the steps after it', async () => {
  const { plan, exec, ran } = fakePlan({
    results: [{ ok: true, output: '' }, { ok: false, output: 'boom\nno such marketplace' }],
  })
  const run = createUpdateRun({ plan, exec })
  await run.promise

  assert.deepEqual(ran, ['one', 'two'], 'the third was never attempted')
  assert.deepEqual(run.steps.map((step) => step.status), ['ok', 'failed', 'pending'])
  assert.equal(run.state, 'failed')
  assert.equal(run.steps[1].detail, 'no such marketplace')
  assert.equal(run.to, null, 'nothing claims a new version')
})

test('a missing command says which one, and a timeout says so', async () => {
  const missing = createUpdateRun({
    plan: onePlan('plugin'),
    exec: async () => ({ ok: false, missing: true, output: '' }),
  })
  await missing.promise
  assert.match(missing.steps[0].detail, /no `claude` command/)

  const late = createUpdateRun({
    plan: onePlan('pull'),
    exec: async () => ({ ok: false, timedOut: true, output: '' }),
  })
  await late.promise
  assert.match(late.steps[0].detail, /too long/)
})

test('an exec that throws is a failed step rather than a crash', async () => {
  const run = createUpdateRun({
    plan: onePlan('one'),
    exec: async () => { throw new Error('spawn EACCES') },
  })
  await run.promise

  assert.equal(run.state, 'failed')
  assert.match(run.steps[0].detail, /EACCES/)
})

test('progress is reported as it happens, not only at the end', async () => {
  const { plan, exec } = fakePlan()
  const seen = []
  const run = createUpdateRun({
    plan,
    exec,
    onChange: (current) => seen.push(current.steps.map((step) => step.status).join(',')),
  })
  await run.promise

  assert.ok(seen.includes('running,pending,pending'), 'the first step announced itself')
  assert.ok(seen.includes('ok,ok,ok'), 'and the last one did too')
})

// --- On screen ---------------------------------------------------------------

test('the version sits at the right-hand end of the home footer', () => {
  const footer = homeView.footerRow(80, '0.6.0')
  assert.match(footer, /v0\.6\.0/)
  assert.equal(visibleLength(footer), 80, 'the version reaches the edge')
  assert.ok(footer.indexOf('quit') < footer.indexOf('v0.6.0'))
})

test('a window too narrow for both keeps the hints and drops the version', () => {
  // A wrapped footer would cost a row the game has already given to something else,
  // so the version goes and what is left is the footer as it was before there was
  // one — the hints are how somebody uses the screen.
  const footer = homeView.footerRow(30, '0.6.0')
  assert.doesNotMatch(footer, /v0\.6\.0/)
  assert.match(footer, /quit/)
  assert.equal(visibleLength(footer), visibleLength(homeView.footerRow(30, null)))
})

test('a copy that cannot name its version shows no version at all', () => {
  assert.doesNotMatch(homeView.footerRow(80, null), /v/)
})

test('the update row says which key does it, and only when there is one', () => {
  assert.equal(homeView.updateRow(null), '')
  assert.match(homeView.updateRow({ kind: 'available', version: '0.6.0' }), /v0\.6\.0.*\[u\]/)
  const stale = homeView.updateRow({ kind: 'stale', version: '0.6.0' })
  assert.match(stale, /installed/)
  assert.doesNotMatch(stale, /\[u\]/, 'there is nothing to fetch')
})

test('the update screen says what is left to do by hand', () => {
  const done = updateView.closingLines({ state: 'done', from: '0.5.0', to: '0.6.0' })
  assert.match(done.join('\n'), /Restart Claude Code/)
  assert.match(done.join('\n'), /claudemon/)

  const nothing = updateView.closingLines({ state: 'done', from: '0.5.0', to: '0.5.0' })
  assert.match(nothing.join('\n'), /newest/)

  const failed = updateView.closingLines({ state: 'failed', from: '0.5.0', to: null })
  assert.match(failed.join('\n'), /still works/)

  assert.deepEqual(updateView.closingLines({ state: 'running', from: '0.5.0', to: null }), [])
})

// --- The launcher ------------------------------------------------------------
//
// The one thing an upgrade can break in silence: a `claudemon` command still handing
// over to the release that installed it. The path it names is maintained rather than
// decided once — see src/shim.mjs — and these are the assertions that keep it so.

const CACHE = '/home/someone/.claude/plugins/cache/claudemon/claudemon'

/** A launcher on disk, as the given root would have written it. */
function launcherAt(name, root, cache) {
  const path = join(sandbox, name)
  writeFileSync(path, shimSource({ target: 'bin/claudemon', root, cache }))
  return { path, target: 'bin/claudemon' }
}

/** What every version of the installer has written: our marker, and a named path. */
const asInstalledFrom = (root) =>
  `#!/bin/sh\n# Generated by claudemon's installer — rerun it rather than editing this.\napp="${root}"\n`

test('a launcher names the copy that wrote it, and falls back if it is gone', () => {
  const shim = shimSource({ target: 'bin/claudemon', root: `${CACHE}/0.6.0`, cache: CACHE })

  assert.match(shim, /^#!\/bin\/sh/)
  assert.match(shim, new RegExp(`app="${CACHE}/0\\.6\\.0"`), 'the exact copy, not a guess')
  assert.match(shim, /\[ -d "\$app" \] \|\| app=\$\(ls -td/, 'and a last resort behind it')
  assert.match(shim, /exec "\$app\/bin\/claudemon" "\$@"/)
})

test('every launcher refuses to run rather than guessing, and says how to fix it', () => {
  for (const root of [`${CACHE}/0.6.0`, '/home/someone/code/claudemon']) {
    const shim = shimSource({ target: 'scripts/run.sh', args: 'statusline.mjs', root, cache: CACHE })
    assert.match(shim, /cannot find its files/)
    assert.match(shim, /claudemon-setup/)
    assert.match(shim, /exec "\$app\/scripts\/run\.sh" statusline\.mjs "\$@"/)
  }
})

test('a launcher on an older release is one to bring up to date', () => {
  const here = `${CACHE}/0.6.0`
  assert.equal(pointsElsewhere(asInstalledFrom(`${CACHE}/0.5.0`), here, CACHE), true)
  assert.equal(pointsElsewhere(asInstalledFrom(here), here, CACHE), false, 'already here')
})

test('a launcher we did not write is never touched, whatever it says', () => {
  const theirs = `#!/bin/sh\napp="${CACHE}/0.5.0"\nexec "$app/bin/claudemon" "$@"\n`
  assert.equal(pointsElsewhere(theirs, `${CACHE}/0.6.0`, CACHE), false, 'no marker, not ours')
})

test('a launcher that only guesses is given an exact path', () => {
  // What 0.6.0 briefly wrote, and what is left if the named copy was swept away.
  const guessing = `#!/bin/sh\n# Generated by claudemon's installer — rerun it\napp=$(ls -td "${CACHE}"/*/ | head -1)\n`
  assert.equal(pointsElsewhere(guessing, `${CACHE}/0.6.0`, CACHE), true)
})

test('a hook points a launcher stuck on an older release at this one', () => {
  const cache = fakeCache('0.5.0', '0.6.0')
  const path = join(sandbox, 'stuck-launcher')
  writeFileSync(path, asInstalledFrom(join(cache, '0.5.0')))

  const here = join(cache, '0.6.0')
  const rewritten = relinkLaunchers({ root: here, cache, launchers: [{ path, target: 'bin/claudemon' }] })

  assert.deepEqual(rewritten, [path])
  const after = readFileSync(path, 'utf8')
  assert.ok(after.includes(`app="${here}"`), 'it names the copy that fixed it')
  assert.doesNotMatch(after, /0\.5\.0"/, 'and no longer the one that installed it')
})

test('relinking twice does nothing the second time', () => {
  const cache = fakeCache('0.5.0', '0.6.0')
  const path = join(sandbox, 'twice-launcher')
  writeFileSync(path, asInstalledFrom(join(cache, '0.5.0')))
  const launchers = [{ path, target: 'bin/claudemon' }]

  assert.equal(relinkLaunchers({ root: join(cache, '0.6.0'), cache, launchers }).length, 1)
  assert.equal(relinkLaunchers({ root: join(cache, '0.6.0'), cache, launchers }).length, 0)
})

test("a clone's launcher is left alone, because it is meant to win", () => {
  // The development workflow: a clone takes precedence over anything installed, and
  // a hook running from the plugin cache must not take that away.
  const cache = fakeCache('0.6.0')
  const launcher = launcherAt('clone-launcher', '/home/someone/code/claudemon', cache)
  const before = readFileSync(launcher.path, 'utf8')

  assert.deepEqual(relinkLaunchers({ root: join(cache, '0.6.0'), cache, launchers: [launcher] }), [])
  assert.equal(readFileSync(launcher.path, 'utf8'), before, 'untouched')
})

test('a launcher that was never installed is not created by relinking', () => {
  // Putting a command on somebody's PATH is the installer's job, and only ever
  // because they asked for it.
  const missing = join(sandbox, 'no-such-launcher')
  assert.deepEqual(
    relinkLaunchers({
      root: join(CACHE, '0.6.0'),
      cache: CACHE,
      launchers: [{ path: missing, target: 'bin/claudemon' }],
    }),
    [],
  )
  assert.equal(existsSync(missing), false)
})
