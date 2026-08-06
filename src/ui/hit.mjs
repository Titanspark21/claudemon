import { bold, brightYellow } from './ansi.mjs'
import { HIT_FRAMES } from './constants.mjs'
import { visibleLength } from './text.mjs'

export const hitOverlays = (top, height, centre, frame) => {
  const art = HIT_FRAMES[frame]

  if (!art || height <= 0) return []

  const start = top + Math.max(0, Math.floor((height - art.length) / 2))
  const overlays = []

  art.forEach((row, index) => {
    const line = start + index

    if (line < top || line >= top + height) return

    const indent = Math.max(0, centre - Math.floor(visibleLength(row) / 2))

    for (const run of row.matchAll(/\S+/gu)) {
      overlays.push({
        row: line + 1,
        col: indent + run.index + 1,
        sequence: bold(brightYellow(run[0])),
        rows: 1,
        key: `hit:${frame}`,
      })
    }
  })

  return overlays
}
