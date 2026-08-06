const ESC = '\x1b'
export const CSI = `${ESC}[`

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

export function fg(r, g, b) {
  return colorEnabled ? `${CSI}38;2;${r};${g};${b}m` : ''
}

export function bg(r, g, b) {
  return colorEnabled ? `${CSI}48;2;${r};${g};${b}m` : ''
}

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

export function stripAnsi(text) {
  return String(text).replace(
    // eslint-disable-next-line no-control-regex
    /\x1b\[[0-9;]*[A-Za-z]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g,
    '',
  )
}

function cellsFor(codePoint) {
  if (codePoint >= 0x1f300 && codePoint <= 0x1faff) return 2
  if (codePoint >= 0x2600 && codePoint <= 0x27bf) return 1
  return 1
}

export function visibleLength(text) {
  let width = 0
  for (const character of stripAnsi(text))
    width += cellsFor(character.codePointAt(0))
  return width
}

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
