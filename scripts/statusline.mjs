// Status line: prints whatever status line you already had, then adds one row of
// claudemon underneath it.
//
// This is the only channel the game has to reach you while you work, since hooks
// cannot draw to the terminal and the bar accepts no input. So it stays to a
// single row and says only what matters: something is waiting for you.
//
// Set `probeRows` in ~/.claudemon/config.json to emit that many numbered rows
// instead, which is how we measure how many rows the interface tolerates. It lives
// in the config rather than an environment variable because the config is reread on
// every refresh, so the answer can be found without restarting Claude Code.

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { encounterTtlMs, loadConfig } from '../src/config.mjs'
import { encounterExpiresAt, readEncounter } from '../src/queue.mjs'
import { companionIsLive, readStatus } from '../src/status.mjs'
import { bold, brightCyan, brightGreen, brightYellow, dim, truncate } from '../src/ui/ansi.mjs'
import { money } from '../src/ui/widgets.mjs'

const WRAPPED_TIMEOUT_MS = 1000

// Claude Code cancels an in-flight status line script as soon as a newer update
// triggers, which closes our stdout mid-write. That arrives as an async error
// event, so a try/catch around main() will not see it: swallow it here or node
// dumps an EPIPE stack trace into the session.
process.stdout.on('error', () => {})

function readStdin() {
  try {
    // Claude Code writes the session JSON and closes the pipe straight away, so
    // a synchronous read of fd 0 is both safe and the fastest option.
    return readFileSync(0, 'utf8')
  } catch {
    return ''
  }
}

/**
 * Runs the status line command that was configured before claudemon took over
 * the setting, feeding it the same JSON we were handed.
 */
function wrappedOutput(command, stdin) {
  if (!command) return ''
  // Guard against the wrapped command pointing back at us.
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

/** The one row claudemon contributes. An empty string means "say nothing". */
function gameRow(config) {
  const status = readStatus()
  const live = companionIsLive(status)

  // The slot is the whole truth: the companion leaves the encounter in the file
  // until you face it, so there is never a Pokemon waiting that this cannot see —
  // and never a stale one either, since the entry ages out on its own.
  const ttlMs = encounterTtlMs(config)
  const encounter = readEncounter(ttlMs)

  if (encounter) {
    const headline = encounter.name
      ? `A wild ${bold(encounter.name.toUpperCase())} appeared!`
      : 'A wild Pokemon appeared!'

    const call = live
      ? brightGreen('in your claudemon tab')
      : `${dim('run ')}${brightCyan('claudemon')}${dim(' in another tab')}`

    // Nothing redraws the bar on its own: Claude Code runs this when the session
    // moves, so the last render of a turn is still on screen long after the turn —
    // and half a minute later there is no Pokemon behind it. The row cannot go and
    // correct itself, so it says how long was left when it was written. A count
    // that is plainly not counting reads as old, which is the truth; "A wild PIDGEY
    // appeared!" sat there on its own does not.
    const expiresAt = encounterExpiresAt(encounter, ttlMs)
    const left =
      expiresAt == null
        ? ''
        : `  ${dim('·')}  ${dim(`${Math.max(1, Math.ceil((expiresAt - Date.now()) / 1000))}s left`)}`

    return `${brightYellow('✦')} ${headline}${left}  ${dim('·')}  ${call}`
  }

  if (!status?.lead) return ''

  const parts = [`${bold(status.lead.name.toUpperCase())} ${dim(`Lv${status.lead.level}`)}`]
  if (typeof status.balls === 'number') parts.push(`${status.balls} balls`)
  if (typeof status.money === 'number') parts.push(money(status.money))
  if (typeof status.caught === 'number') parts.push(`${status.caught}/151 caught`)

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
} catch {
  // A crashing status line blanks the bar, which is worse than showing nothing.
}
