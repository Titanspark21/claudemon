import { bold, brightGreen, brightRed, brightYellow, dim } from '../ansi.mjs'
import { centre, panel } from '../widgets.mjs'

export const SPINNER = ['◐', '◓', '◑', '◒']

function marker(status, frame) {
  switch (status) {
    case 'ok':
      return brightGreen('✔')
    case 'failed':
      return brightRed('✘')
    case 'running':
      return brightYellow(SPINNER[frame % SPINNER.length])
    default:
      return dim('·')
  }
}

function stepRows(run, frame) {
  const rows = []
  for (const step of run.steps) {
    const text = step.status === 'ok' ? step.done : step.label
    rows.push(
      `${marker(step.status, frame)} ${step.status === 'pending' ? dim(text) : text}`,
    )
    if (step.detail) rows.push(`  ${dim(step.detail)}`)
  }
  return rows
}

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

function footer(run) {
  if (run.state === 'running')
    return ' working — this cannot be interrupted safely'
  return ' [esc] back'
}

export function draw(ctx, size) {
  const { cols, rows } = size
  const lines = []
  const run = ctx.update
  const frame = ctx.updateFrame ?? 0

  lines.push(` ${brightYellow('◓')} ${bold('UPDATE')}`)
  lines.push('')

  const heading =
    run.state === 'running'
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
  if (ctx.update?.state === 'running') return

  if (
    key.name === 'escape' ||
    key.name === 'enter' ||
    key.name === 'space' ||
    key.name === 'q'
  ) {
    ctx.finishUpdate()
  }
}
