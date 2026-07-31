// The UPDATE screen: three commands, and what they did.
//
// Reachable only from the home screen's notice, and only while there is something to
// fetch. It is the one screen that shells out, so it says exactly which step it is on
// — an update that looks stuck is indistinguishable from one that has hung, and this
// is a tab somebody left open to watch.

import { bold, brightGreen, brightRed, brightYellow, dim } from '../ansi.mjs'
import { centre, panel } from '../widgets.mjs'

/** The frames of the marker on a step being worked on. */
export const SPINNER = ['◐', '◓', '◑', '◒']

/** The marker for a step, which is also the only thing saying what tense it is in. */
function marker(status, frame) {
  switch (status) {
    case 'ok': return brightGreen('✔')
    case 'failed': return brightRed('✘')
    case 'running': return brightYellow(SPINNER[frame % SPINNER.length])
    default: return dim('·')
  }
}

function stepRows(run, frame) {
  const rows = []
  for (const step of run.steps) {
    const text = step.status === 'ok' ? step.done : step.label
    rows.push(`${marker(step.status, frame)} ${step.status === 'pending' ? dim(text) : text}`)
    if (step.detail) rows.push(`  ${dim(step.detail)}`)
  }
  return rows
}

/**
 * What is left to do by hand, once the commands are through.
 *
 * Neither of these can be done for you from in here: a running process cannot
 * replace its own code, and Claude Code reads hooks and the status line once, at
 * startup. Saying so is the difference between an update that looks like it did
 * nothing and one that is simply waiting on a restart.
 */
export function closingLines(run) {
  if (run.state === 'running') return []

  if (run.state === 'failed') {
    return [
      'Nothing was half-installed — every step here is one that can be run again.',
      `Your claudemon is still ${bold(`v${run.from}`)} and still works.`,
    ]
  }

  if (run.to && run.to === run.from) {
    return [`Already the newest there is. Still ${bold(`v${run.from}`)}.`]
  }

  return [
    `${bold(`v${run.to}`)} is on the disk. Two things left, both one-offs:`,
    '',
    `  1. Restart Claude Code, so the new hooks and status line load.`,
    `  2. Quit the game and run ${bold('claudemon')} again.`,
  ]
}

/** The footer, which is the only thing that changes what keys do. */
function footer(run) {
  if (run.state === 'running') return ' working — this cannot be interrupted safely'
  return ' [esc] back'
}

export function draw(ctx, size) {
  const { cols, rows } = size
  const lines = []
  const run = ctx.update
  const frame = ctx.updateFrame ?? 0

  lines.push(` ${brightYellow('◓')} ${bold('UPDATE')}`)
  lines.push('')

  const heading = run.state === 'running'
    ? `v${run.from} ${dim('→')} newest`
    : `v${run.from} ${dim('→')} ${run.to ? `v${run.to}` : dim('unchanged')}`
  lines.push(centre(heading, cols))
  lines.push('')

  const width = Math.min(cols - 4, 64)
  for (const row of panel(stepRows(run, frame), width, { title: 'Steps' })) {
    lines.push(`  ${row}`)
  }

  const closing = closingLines(run)
  if (closing.length > 0) {
    lines.push('')
    for (const line of closing) lines.push(line ? `  ${line}` : '')
  }

  while (lines.length < rows - 1) lines.push('')
  lines.push(dim(footer(run)))

  return { lines, overlays: [] }
}

export function onKey(ctx, key) {
  // A step is a child process mid-flight. Leaving the screen would not stop it, and
  // a half-swapped plugin cache is not a state to hand somebody back to their game
  // in — so the only thing the keyboard can do here is wait.
  if (ctx.update?.state === 'running') return

  if (key.name === 'escape' || key.name === 'enter' || key.name === 'space' || key.name === 'q') {
    ctx.finishUpdate()
  }
}
