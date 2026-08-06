import { execFile } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { updateCheckMode } from './config.mjs'
import { HOME, PLUGIN_CACHE, UPDATE_FILE } from './paths.mjs'
import {
  APP_ROOT,
  VERSION,
  isNewer,
  isPluginCopy,
  newestInstalled,
  versionAt,
} from './version.mjs'

export const MANIFEST_URL =
  process.env.CLAUDEMON_MANIFEST_URL ||
  'https://raw.githubusercontent.com/zamarrowski/claudemon/main/.claude-plugin/plugin.json'

export const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000

const FETCH_TIMEOUT_MS = 5000

export function readUpdateState(file = UPDATE_FILE) {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeUpdateState(state, file = UPDATE_FILE) {
  try {
    mkdirSync(HOME, { recursive: true })
    writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`)
  } catch {}
}

export function dueForCheck(
  state,
  now = Date.now(),
  interval = CHECK_INTERVAL_MS,
) {
  const last = Date.parse(state?.checkedAt ?? '')
  if (!Number.isFinite(last)) return true
  if (last > now) return true
  return now - last >= interval
}

export async function fetchLatestVersion({
  url = MANIFEST_URL,
  timeoutMs = FETCH_TIMEOUT_MS,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('no fetch available')

  const response = await fetchImpl(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)

  const version = JSON.parse(await response.text())?.version
  if (typeof version !== 'string' || !version)
    throw new Error('no version in the manifest')
  return version
}

export async function checkForUpdate({
  config,
  now = Date.now(),
  file = UPDATE_FILE,
  force = false,
  ...options
} = {}) {
  const state = readUpdateState(file)

  if (updateCheckMode(config) === 'off') return state
  if (!force && !dueForCheck(state, now)) return state

  const checkedAt = new Date(now).toISOString()
  try {
    const latest = await fetchLatestVersion(options)
    const next = { checkedAt, latest }
    writeUpdateState(next, file)
    return next
  } catch (error) {
    const next = { ...state, checkedAt, error: error?.message ?? String(error) }
    writeUpdateState(next, file)
    return next
  }
}

export function updateNotice({
  current = VERSION,
  installed = null,
  latest = null,
} = {}) {
  if (isNewer(installed, current)) return { kind: 'stale', version: installed }
  if (isNewer(latest, current)) return { kind: 'available', version: latest }
  return null
}

export function currentNotice({
  state = readUpdateState(),
  current = VERSION,
} = {}) {
  return updateNotice({
    current,
    installed: newestInstalled(),
    latest: state?.latest ?? null,
  })
}

export function updatePlan({ root = APP_ROOT, cache = PLUGIN_CACHE } = {}) {
  if (!isPluginCopy(root, cache)) {
    return {
      kind: 'clone',
      resolveVersion: () => versionAt(root),
      steps: [
        {
          id: 'pull',
          label: 'pulling the latest commit',
          done: 'pulled the latest commit',
          plan: () => ({
            command: 'git',
            args: ['-C', root, 'pull', '--ff-only'],
            timeoutMs: 60_000,
          }),
        },
        {
          id: 'install',
          label: 'reinstalling from the clone',
          done: 'the command, status line and sprites are up to date',
          plan: () => ({
            command: process.execPath,
            args: [join(root, 'tools', 'install.mjs')],
            timeoutMs: 180_000,
          }),
        },
      ],
    }
  }

  return {
    kind: 'plugin',
    resolveVersion: () => newestInstalled(cache),
    steps: [
      {
        id: 'marketplace',
        label: 'refreshing the marketplace',
        done: 'refreshed the marketplace',
        plan: () => ({
          command: 'claude',
          args: ['plugin', 'marketplace', 'update', 'claudemon'],
          timeoutMs: 60_000,
        }),
      },
      {
        id: 'plugin',
        label: 'fetching the new version',
        done: 'fetched the new version',
        plan: () => ({
          command: 'claude',
          args: ['plugin', 'update', 'claudemon@claudemon'],
          timeoutMs: 120_000,
        }),
      },
      {
        id: 'install',
        label: 'checking the command, status line and sprites',
        done: 'the command, status line and sprites are up to date',
        plan: () => ({
          command: process.execPath,
          args: [
            join(cache, newestInstalled(cache) ?? '', 'tools', 'install.mjs'),
          ],
          timeoutMs: 180_000,
        }),
      },
    ],
  }
}

function execCommand({ command, args, timeoutMs }) {
  return new Promise((resolve) => {
    execFile(
      command,
      args,
      { timeout: timeoutMs, encoding: 'utf8' },
      (error, stdout, stderr) => {
        const output = `${stdout ?? ''}${stderr ?? ''}`.trim()
        if (!error) {
          resolve({ ok: true, output })
          return
        }
        resolve({
          ok: false,
          output,
          missing: error.code === 'ENOENT',
          timedOut: error.signal === 'SIGTERM',
        })
      },
    )
  })
}

function explain(step, result) {
  if (result.missing) {
    return step.id === 'pull'
      ? 'no `git` command found'
      : 'no `claude` command found — is Claude Code on your PATH?'
  }
  if (result.timedOut) return 'it took too long and was given up on'

  const last = result.output.split('\n').filter(Boolean).pop()
  return last ? last.slice(0, 120) : 'it failed without saying why'
}

export function createUpdateRun({
  plan = updatePlan(),
  exec = execCommand,
  onChange = () => {},
} = {}) {
  const { steps, resolveVersion, kind } = plan

  const run = {
    kind,
    state: 'running',
    from: VERSION,
    to: null,
    steps: steps.map((step) => ({
      id: step.id,
      label: step.label,
      done: step.done,
      status: 'pending',
      detail: null,
    })),
  }

  run.promise = (async () => {
    for (let index = 0; index < steps.length; index++) {
      const shown = run.steps[index]
      shown.status = 'running'
      onChange(run)

      let result
      try {
        result = await exec(steps[index].plan())
      } catch (error) {
        result = { ok: false, output: error?.message ?? String(error) }
      }

      if (!result.ok) {
        shown.status = 'failed'
        shown.detail = explain(steps[index], result)
        run.state = 'failed'
        onChange(run)
        return run
      }

      shown.status = 'ok'
      onChange(run)
    }

    run.state = 'done'
    run.to = resolveVersion() ?? VERSION
    onChange(run)
    return run
  })()

  return run
}
