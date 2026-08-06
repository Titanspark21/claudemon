import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { encounterTtlMs, loadConfig } from '../src/config.mjs'
import { encounterExpiresAt, readEncounter } from '../src/queue.mjs'
import { companionIsLive, readStatus } from '../src/status.mjs'
import {
  bold,
  brightCyan,
  brightGreen,
  brightYellow,
  dim,
  truncate,
} from '../src/ui/ansi.mjs'
import { money } from '../src/ui/widgets.mjs'

const WRAPPED_TIMEOUT_MS = 1000

process.stdout.on('error', () => {})

function readStdin() {
  try {
    return readFileSync(0, 'utf8')
  } catch {
    return ''
  }
}

function wrappedOutput(command, stdin) {
  if (!command) return ''
  if (command.includes('claudemon')) return ''

  try {
    const result = spawnSync(command, {
      shell: true,
      input: stdin,
      encoding: 'utf8',
      timeout: WRAPPED_TIMEOUT_MS,
    })
    if (result.status !== 0 || !result.stdout) return ''
    return result.stdout.replace(/\n+$/, '')
  } catch {
    return ''
  }
}

function gameRow(config) {
  const status = readStatus()
  const live = companionIsLive(status)

  const ttlMs = encounterTtlMs(config)
  const encounter = readEncounter(ttlMs)

  if (encounter) {
    const headline = encounter.name
      ? `A wild ${bold(encounter.name.toUpperCase())} appeared!`
      : 'A wild Pokemon appeared!'

    const call = live
      ? brightGreen('in your claudemon tab')
      : `${dim('run ')}${brightCyan('claudemon')}${dim(' in another tab')}`

    const expiresAt = encounterExpiresAt(encounter, ttlMs)
    const left =
      expiresAt == null
        ? ''
        : `  ${dim('·')}  ${dim(`${Math.max(1, Math.ceil((expiresAt - Date.now()) / 1000))}s left`)}`

    return `${brightYellow('✦')} ${headline}${left}  ${dim('·')}  ${call}`
  }

  if (!status?.lead) return ''

  const parts = [
    `${bold(status.lead.name.toUpperCase())} ${dim(`Lv${status.lead.level}`)}`,
  ]
  if (typeof status.balls === 'number') parts.push(`${status.balls} balls`)
  if (typeof status.money === 'number') parts.push(money(status.money))
  if (typeof status.caught === 'number')
    parts.push(`${status.caught}/151 caught`)

  return dim(`◉ ${parts.join('  ·  ')}`)
}

function main() {
  const stdin = readStdin()
  const config = loadConfig()

  const probeRows = Number(config.probeRows ?? process.env.CLAUDEMON_PROBE_ROWS)
  if (Number.isInteger(probeRows) && probeRows > 0) {
    const lines = []
    for (let row = 1; row <= probeRows; row++) {
      lines.push(
        `${brightYellow(`row ${row}/${probeRows}`)} ${dim('─'.repeat(24))} claudemon probe`,
      )
    }
    process.stdout.write(`${lines.join('\n')}\n`)
    return
  }

  const above = wrappedOutput(config.wrappedStatusLine, stdin)
  const row = gameRow(config)

  const width = Number(process.env.COLUMNS) || 0
  const lines = []
  if (above) lines.push(above)
  if (row) lines.push(width > 10 ? truncate(row, width - 2) : row)
  if (lines.length > 0) process.stdout.write(`${lines.join('\n')}\n`)
}

try {
  main()
} catch {}
