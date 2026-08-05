// ANSI escape sequences, in one place.
//
// Written out as \x1b rather than raw escape bytes so the source stays readable
// and diffable.

const ESC = '\x1b'
export const CSI = `${ESC}[`

/**
 * Honours NO_COLOR only. Deliberately not gated on isTTY: the status line writes
 * to a pipe that Claude Code renders itself, so an isTTY check would strip the
 * colour exactly where we need it most.
 */
export const colorEnabled = !process.env.NO_COLOR

function wrap(open, close) {
  return (text) => (colorEnabled ? `${open}${text}${close}` : String(text))
}

const style = (code) => wrap(`${CSI}${code}m`, `${CSI}0m`)

export const reset = `${CSI}0m`
export const bold = style(1)
export const dim = style(2)
export const italic = style(3)
export const underline = style(4)

export const red = style(31)
export const green = style(32)
export const yellow = style(33)
export const blue = style(34)
export const magenta = style(35)
export const cyan = style(36)
export const white = style(37)
export const gray = style(90)
export const brightRed = style(91)
export const brightGreen = style(92)
export const brightYellow = style(93)
export const brightCyan = style(96)

/**
 * Truecolor foreground. Sprites lean on this heavily.
 *
 * Returns nothing when colour is off, so NO_COLOR output stays free of escape
 * sequences instead of leaking raw codes into the text.
 */
export function fg(r, g, b) {
  return colorEnabled ? `${CSI}38;2;${r};${g};${b}m` : ''
}

export function bg(r, g, b) {
  return colorEnabled ? `${CSI}48;2;${r};${g};${b}m` : ''
}

/** A reset that disappears along with the colour, so widths stay honest. */
export const clear = colorEnabled ? reset : ''

export const cursor = {
  hide: `${CSI}?25l`,
  show: `${CSI}?25h`,
  home: `${CSI}H`,
  to: (row, col) => `${CSI}${row};${col}H`,
}

export const screen = {
  enterAlt: `${CSI}?1049h`,
  exitAlt: `${CSI}?1049l`,
  clear: `${CSI}2J`,
  clearLine: `${CSI}2K`,
  clearBelow: `${CSI}J`,
}

/** Strips escape sequences, so widths can be measured for padding and truncation. */
export function stripAnsi(text) {
  // eslint-disable-next-line no-control-regex
  return String(text).replace(/\x1b\[[0-9;]*[A-Za-z]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
}

/**
 * Code points that take two cells rather than one.
 *
 * Not a Unicode width table — only what this game actually draws, which is the
 * explosion emoji and nothing else. The block glyphs sprites are made of are
 * ordinary single-width characters, and counting one as two would make every
 * sprite row measure double its width.
 */
function cellsFor(codePoint) {
  // Emoji and pictographs, which terminals draw double width.
  if (codePoint >= 0x1f300 && codePoint <= 0x1faff) return 2
  if (codePoint >= 0x2600 && codePoint <= 0x27bf) return 1
  return 1
}

/**
 * How many cells a string occupies once the escape sequences are taken out.
 *
 * Counted per code point, not per UTF-16 unit: the explosion emoji is above the BMP,
 * so a string's `.length` overstates its width there and every measurement built on
 * it — padding, centring, the renderer's own full-width writes — would come out
 * wrong.
 */
export function visibleLength(text) {
  let width = 0
  for (const character of stripAnsi(text)) width += cellsFor(character.codePointAt(0))
  return width
}

/** Truncates to a visible width, keeping escape sequences intact. */
export function truncate(text, maxWidth) {
  if (visibleLength(text) <= maxWidth) return text

  let visible = 0
  let out = ''
  let index = 0
  const raw = String(text)

  while (index < raw.length && visible < maxWidth) {
    if (raw[index] === '\x1b') {
      // eslint-disable-next-line no-control-regex
      const match = /^\x1b\[[0-9;]*[A-Za-z]/.exec(raw.slice(index))
      if (match) {
        out += match[0]
        index += match[0].length
        continue
      }
    }
    // A whole code point at a time. Advancing by one UTF-16 unit would cut an
    // emoji in half and leave a lone surrogate on the row.
    const codePoint = raw.codePointAt(index)
    const character = String.fromCodePoint(codePoint)
    const width = visibleLength(character)
    if (visible + width > maxWidth) break

    out += character
    visible += width
    index += character.length
  }
  return `${out}${reset}…`
}
