import { cursor, reset, screen as screenCodes, visibleLength } from './ansi.mjs'

function fill(line, cols) {
  const padding = cols - visibleLength(line)
  if (padding <= 0) return line
  return line ? `${line}${reset}${' '.repeat(padding)}` : ' '.repeat(padding)
}

export function parseKey(chunk) {
  const sequence = chunk.toString('utf8')

  switch (sequence) {
    case '\x1b[A':
    case '\x1bOA':
      return { name: 'up' }
    case '\x1b[B':
    case '\x1bOB':
      return { name: 'down' }
    case '\x1b[C':
    case '\x1bOC':
      return { name: 'right' }
    case '\x1b[D':
    case '\x1bOD':
      return { name: 'left' }
    case '\x1b[5~':
      return { name: 'pageup' }
    case '\x1b[6~':
      return { name: 'pagedown' }
    case '\x1b[H':
    case '\x1bOH':
      return { name: 'home' }
    case '\x1b[F':
    case '\x1bOF':
      return { name: 'end' }
    case '\r':
    case '\n':
      return { name: 'enter' }
    case '\t':
      return { name: 'tab' }
    case ' ':
      return { name: 'space' }
    case '\x7f':
    case '\b':
      return { name: 'backspace' }
    case '\x1b':
      return { name: 'escape' }
    case '\x03':
      return { name: 'ctrl-c' }
    case '\x04':
      return { name: 'ctrl-d' }
    default:
      return { name: sequence, char: sequence }
  }
}

function overlayKey(overlay) {
  return `${overlay.row},${overlay.col},${overlay.key ?? overlay.sequence.length}`
}

export function createScreen({
  input = process.stdin,
  output = process.stdout,
} = {}) {
  let running = false
  let previousLines = []
  let previousOverlays = []
  let wipeNext = false
  const keyHandlers = new Set()
  const resizeHandlers = new Set()

  function size() {
    return {
      cols: output.columns || 80,
      rows: output.rows || 24,
    }
  }

  function onData(chunk) {
    const key = parseKey(chunk)
    for (const handler of keyHandlers) handler(key)
  }

  function onResize() {
    repaint()
    for (const handler of resizeHandlers) handler(size())
  }

  function restore() {
    if (!running) return
    running = false
    input.off('data', onData)
    output.off?.('resize', onResize)
    if (input.isTTY) input.setRawMode(false)
    input.pause()

    let blank = ''
    const { cols, rows } = size()
    for (let row = 1; row <= rows; row++)
      blank += cursor.to(row, 1) + reset + ' '.repeat(cols)

    output.write(blank + screenCodes.clear + cursor.show + screenCodes.exitAlt)
  }

  function start() {
    if (running) return
    running = true

    output.write(screenCodes.enterAlt + screenCodes.clear + cursor.hide)
    if (input.isTTY) input.setRawMode(true)
    input.resume()
    input.on('data', onData)
    output.on('resize', onResize)

    process.once('exit', restore)
    process.once('SIGINT', () => {
      restore()
      process.exit(0)
    })
    process.once('SIGTERM', () => {
      restore()
      process.exit(0)
    })
    process.once('uncaughtException', (error) => {
      restore()
      console.error(error)
      process.exit(1)
    })
  }

  function render(lines, overlays = []) {
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
        out += cursor.to(row + 1, 1) + reset + fill(visible[row], cols)
      else out += cursor.to(row + 1, 1) + screenCodes.clearLine + visible[row]

      repainted.add(row)
    }

    if (previousLines.length > visible.length) {
      out += cursor.to(visible.length + 1, 1) + screenCodes.clearBelow
      for (let row = visible.length; row < previousLines.length; row++) {
        out += cursor.to(row + 1, 1) + reset + ' '.repeat(cols)
      }
      previousOverlays = []
    }

    if (wipeAll) {
      for (
        let row = Math.max(visible.length, previousLines.length);
        row < rows;
        row++
      ) {
        out += cursor.to(row + 1, 1) + reset + ' '.repeat(cols)
      }
    }

    const known = new Set(previousOverlays.map((entry) => entry.key))
    const drawn = []

    for (const overlay of overlays) {
      const key = overlayKey(overlay)
      const height = overlay.rows ?? 1

      let disturbed = !known.has(key)
      for (
        let row = overlay.row;
        !disturbed && row < overlay.row + height;
        row++
      ) {
        if (repainted.has(row - 1)) disturbed = true
      }
      if (disturbed)
        out += cursor.to(overlay.row, overlay.col) + overlay.sequence

      drawn.push({ key, row: overlay.row, rows: height })
    }
    previousOverlays = drawn

    if (out) output.write(out)
    previousLines = visible
  }

  function repaint() {
    previousLines = []
    previousOverlays = []
    wipeNext = true
    if (running) output.write(screenCodes.clear)
  }

  function bell() {
    if (running) output.write('\x07')
  }

  return {
    start,
    stop: restore,
    size,
    render,
    repaint,
    bell,
    onKey(handler) {
      keyHandlers.add(handler)
      return () => keyHandlers.delete(handler)
    },
    onResize(handler) {
      resizeHandlers.add(handler)
      return () => resizeHandlers.delete(handler)
    },
  }
}
