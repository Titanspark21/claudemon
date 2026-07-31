// Owning the terminal: alternate buffer, raw keys, redraws that do not flicker.
//
// The companion runs in its own tab, so unlike the status line it gets a real TTY
// and can do all the things a game needs.

import { cursor, reset, screen as screenCodes, visibleLength } from './ansi.mjs'

/**
 * A row written all the way to the right-hand edge.
 *
 * Used where an erase cannot be trusted to have happened — see `render`. The reset
 * in front of the padding keeps a coloured line from dragging its background across
 * the rest of the row.
 */
function fill(line, cols) {
  const padding = cols - visibleLength(line)
  if (padding <= 0) return line
  return line ? `${line}${reset}${' '.repeat(padding)}` : ' '.repeat(padding)
}

/**
 * Turns a raw stdin chunk into a named key.
 *
 * Only the keys a menu-driven game needs. Anything else comes back as its own
 * character, which is enough for shortcuts and for typing a nickname.
 */
export function parseKey(chunk) {
  const sequence = chunk.toString('utf8')

  switch (sequence) {
    case '\x1b[A': case '\x1bOA': return { name: 'up' }
    case '\x1b[B': case '\x1bOB': return { name: 'down' }
    case '\x1b[C': case '\x1bOC': return { name: 'right' }
    case '\x1b[D': case '\x1bOD': return { name: 'left' }
    case '\x1b[5~': return { name: 'pageup' }
    case '\x1b[6~': return { name: 'pagedown' }
    case '\x1b[H': case '\x1bOH': return { name: 'home' }
    case '\x1b[F': case '\x1bOF': return { name: 'end' }
    case '\r': case '\n': return { name: 'enter' }
    case '\t': return { name: 'tab' }
    case ' ': return { name: 'space' }
    case '\x7f': case '\b': return { name: 'backspace' }
    case '\x1b': return { name: 'escape' }
    case '\x03': return { name: 'ctrl-c' }
    case '\x04': return { name: 'ctrl-d' }
    default:
      return { name: sequence, char: sequence }
  }
}

/**
 * Identifies an overlay across frames.
 *
 * `key` is how an animated overlay says it has changed without the renderer having
 * to compare payloads.
 */
function overlayKey(overlay) {
  return `${overlay.row},${overlay.col},${overlay.key ?? overlay.sequence.length}`
}

export function createScreen({ input = process.stdin, output = process.stdout } = {}) {
  let running = false
  let previousLines = []
  /** @type {{key: string, row: number, rows: number}[]} last frame's overlays. */
  let previousOverlays = []
  /**
   * Whether the next frame has to wipe every row it writes rather than trust an
   * erase. Set by a repaint, which is the one moment we no longer know what the
   * terminal is showing.
   */
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
    // Force a full repaint: the old diff is meaningless at a new width.
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

    // Blank the screen by writing over it rather than only erasing it, and only
    // then leave the alternate buffer. Anything left sitting in the shell you came
    // back to is the one mess that outlives the process.
    let blank = ''
    const { cols, rows } = size()
    for (let row = 1; row <= rows; row++) blank += cursor.to(row, 1) + reset + ' '.repeat(cols)

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

    // Whatever happens, hand the terminal back in a usable state. Leaving a
    // user in the alternate buffer with a hidden cursor is unforgivable.
    process.once('exit', restore)
    process.once('SIGINT', () => { restore(); process.exit(0) })
    process.once('SIGTERM', () => { restore(); process.exit(0) })
    process.once('uncaughtException', (error) => {
      restore()
      console.error(error)
      process.exit(1)
    })
  }

  /**
   * Paints a frame.
   *
   * @param {string[]} lines one entry per row, already styled.
   * @param {{row: number, col: number, sequence: string, rows?: number, key?: string}[]}
   *   overlays raw sequences written at absolute positions, drawn in order, so a
   *   later one lands on top of an earlier one. This is how anything drawn over a
   *   sprite gets there. `rows` is how many rows the sequence covers, and defaults
   *   to one.
   */
  function render(lines, overlays = []) {
    const { cols, rows } = size()
    const visible = lines.slice(0, rows - 1)
    const live = new Set(overlays.map(overlayKey))

    // A repaint has forgotten what was on the screen, so this frame cannot know
    // which rows need wiping and does all of them.
    const wipeAll = wipeNext
    wipeNext = false

    // Wherever an overlay is drawn, the terminal is not showing what
    // `previousLines` says it is. So a row whose overlay is not being drawn again
    // has to be repainted from the line underneath, or the overlay stays there
    // forever — this is what lets an overlay animate at all.
    const forced = new Set()
    for (const previous of previousOverlays) {
      if (live.has(previous.key)) continue
      for (let row = previous.row; row < previous.row + previous.rows; row++) forced.add(row - 1)
    }

    let out = ''
    const repainted = new Set()
    for (let row = 0; row < visible.length; row++) {
      // Only repaint rows that actually changed, which is what keeps a redraw
      // from visibly flickering.
      if (previousLines[row] === visible[row] && !forced.has(row)) continue

      // A row being taken back from an overlay is written to the edge rather than
      // erased. Its new contents are usually blank, so an erase would write nothing
      // at all and leave whatever the overlay put there still on the screen.
      if (wipeAll || forced.has(row)) out += cursor.to(row + 1, 1) + reset + fill(visible[row], cols)
      else out += cursor.to(row + 1, 1) + screenCodes.clearLine + visible[row]

      repainted.add(row)
    }

    // Wipe any rows the previous frame used and this one does not. That erases
    // anything drawn below, overlays included, so they have to go back out.
    if (previousLines.length > visible.length) {
      out += cursor.to(visible.length + 1, 1) + screenCodes.clearBelow
      // Nothing is going to be written into these rows, so they are wiped by hand
      // for the same reason the rows above are.
      for (let row = visible.length; row < previousLines.length; row++) {
        out += cursor.to(row + 1, 1) + reset + ' '.repeat(cols)
      }
      previousOverlays = []
    }

    // A repaint erased the screen without knowing what was on it, and the rows past
    // the end of this frame are the ones nothing above has written into. They are
    // also where a taller frame's sprite used to be, which is why the erase alone
    // cannot be trusted with them.
    if (wipeAll) {
      for (let row = Math.max(visible.length, previousLines.length); row < rows; row++) {
        out += cursor.to(row + 1, 1) + reset + ' '.repeat(cols)
      }
    }

    // An overlay only goes back out when it has changed, or when a line was just
    // repainted over the top of it.
    const known = new Set(previousOverlays.map((entry) => entry.key))
    const drawn = []

    for (const overlay of overlays) {
      const key = overlayKey(overlay)
      const height = overlay.rows ?? 1

      let disturbed = !known.has(key)
      for (let row = overlay.row; !disturbed && row < overlay.row + height; row++) {
        if (repainted.has(row - 1)) disturbed = true
      }
      if (disturbed) out += cursor.to(overlay.row, overlay.col) + overlay.sequence

      drawn.push({ key, row: overlay.row, rows: height })
    }
    previousOverlays = drawn

    if (out) output.write(out)
    previousLines = visible
  }

  /**
   * Throws away everything known about what the terminal is showing, so the next
   * frame is drawn from scratch. Called when the diff is meaningless: a new screen,
   * a new window size, a sprite that has changed how it is drawn.
   *
   * Also erases the screen for real, rather than only forgetting. The next frame
   * rewrites every row anyway, so the clear is not what makes the rows correct — it
   * is what deals with anything the rows cannot reach, such as the last row, which
   * is never drawn to.
   */
  function repaint() {
    previousLines = []
    previousOverlays = []
    wipeNext = true
    if (running) output.write(screenCodes.clear)
  }

  /**
   * The one thing that reaches someone looking at a different tab. Goes out
   * separately from a frame, since it is not part of what the screen looks like.
   */
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
