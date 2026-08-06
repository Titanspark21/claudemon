import { CURSOR, RESET, SCREEN_CODES } from './ansi.mjs'
import { BELL, DEFAULT_TERMINAL_SIZE } from './constants.mjs'
import { parseKey } from './keys.mjs'
import { visibleLength } from './text.mjs'

const fill = (line, cols) => {
  const padding = cols - visibleLength(line)

  if (padding <= 0) return line

  return line ? `${line}${RESET}${' '.repeat(padding)}` : ' '.repeat(padding)
}

const overlayKey = (overlay) => {
  return `${overlay.row},${overlay.col},${overlay.key}`
}

export const createScreen = ({ input, output }) => {
  let running = false
  let previousLines = []
  let previousOverlays = []
  let wipeNext = false
  const keyHandlers = new Set()
  const resizeHandlers = new Set()

  const size = () => {
    return {
      cols: output.columns || DEFAULT_TERMINAL_SIZE.cols,
      rows: output.rows || DEFAULT_TERMINAL_SIZE.rows,
    }
  }

  const repaint = () => {
    previousLines = []
    previousOverlays = []
    wipeNext = true

    if (running) output.write(SCREEN_CODES.clear)
  }

  const onData = (chunk) => {
    const key = parseKey(chunk)

    for (const handler of keyHandlers) handler(key)
  }

  const handleResize = () => {
    repaint()

    for (const handler of resizeHandlers) handler(size())
  }

  const restore = () => {
    if (!running) return

    running = false
    input.off('data', onData)
    output.off('resize', handleResize)

    if (input.isTTY) input.setRawMode(false)

    input.pause()

    let blank = ''
    const { cols, rows } = size()

    for (let row = 1; row <= rows; row++)
      blank += CURSOR.to(row, 1) + RESET + ' '.repeat(cols)

    output.write(
      blank + SCREEN_CODES.clear + CURSOR.show + SCREEN_CODES.exitAlt,
    )
  }

  const handleSignal = () => {
    restore()
    process.exit(0)
  }

  const handleUncaught = (error) => {
    restore()
    console.error(error)
    process.exit(1)
  }

  const start = () => {
    if (running) return

    running = true

    output.write(SCREEN_CODES.enterAlt + SCREEN_CODES.clear + CURSOR.hide)

    if (input.isTTY) input.setRawMode(true)

    input.resume()
    input.on('data', onData)
    output.on('resize', handleResize)

    process.once('exit', restore)
    process.once('SIGINT', handleSignal)
    process.once('SIGTERM', handleSignal)
    process.once('uncaughtException', handleUncaught)
  }

  const render = (lines, overlays = []) => {
    const { cols, rows } = size()
    const visible = lines.slice(0, rows - 1)
    const live = new Set(overlays.map(overlayKey))

    const wipeAll = wipeNext
    wipeNext = false

    const forced = new Set()

    for (const previous of previousOverlays) {
      if (live.has(previous.key)) continue

      for (let row = previous.row; row < previous.row + previous.rows; row++)
        forced.add(row - 1)
    }

    let out = ''
    const repainted = new Set()

    for (let row = 0; row < visible.length; row++) {
      if (previousLines[row] === visible[row] && !forced.has(row)) continue

      if (wipeAll || forced.has(row))
        out += CURSOR.to(row + 1, 1) + RESET + fill(visible[row], cols)
      else out += CURSOR.to(row + 1, 1) + SCREEN_CODES.clearLine + visible[row]

      repainted.add(row)
    }

    if (previousLines.length > visible.length) {
      out += CURSOR.to(visible.length + 1, 1) + SCREEN_CODES.clearBelow

      for (let row = visible.length; row < previousLines.length; row++) {
        out += CURSOR.to(row + 1, 1) + RESET + ' '.repeat(cols)
      }

      previousOverlays = []
    }

    if (wipeAll) {
      for (
        let row = Math.max(visible.length, previousLines.length);
        row < rows;
        row++
      ) {
        out += CURSOR.to(row + 1, 1) + RESET + ' '.repeat(cols)
      }
    }

    const known = new Set(previousOverlays.map((entry) => entry.key))
    const drawn = []

    for (const overlay of overlays) {
      const key = overlayKey(overlay)
      const height = overlay.rows

      let disturbed = !known.has(key)

      for (
        let row = overlay.row;
        !disturbed && row < overlay.row + height;
        row++
      ) {
        if (repainted.has(row - 1)) disturbed = true
      }

      if (disturbed)
        out += CURSOR.to(overlay.row, overlay.col) + overlay.sequence

      drawn.push({ key, row: overlay.row, rows: height })
    }

    previousOverlays = drawn

    if (out) output.write(out)

    previousLines = visible
  }

  const bell = () => {
    if (running) output.write(BELL)
  }

  const addKeyHandler = (handler) => {
    keyHandlers.add(handler)

    return () => keyHandlers.delete(handler)
  }

  const addResizeHandler = (handler) => {
    resizeHandlers.add(handler)

    return () => resizeHandlers.delete(handler)
  }

  return {
    start,
    stop: restore,
    size,
    render,
    repaint,
    bell,
    onKey: addKeyHandler,
    onResize: addResizeHandler,
  }
}
