import { SGR_CODES } from './constants.mjs'

const ESC = '\x1b'
export const CSI = `${ESC}[`

export const COLOR_ENABLED = !process.env.NO_COLOR

const wrap = (open, close) => {
  return (text) => (COLOR_ENABLED ? `${open}${text}${close}` : String(text))
}

const style = (code) => wrap(`${CSI}${code}m`, `${CSI}0m`)

export const RESET = `${CSI}0m`
export const bold = style(SGR_CODES.bold)
export const dim = style(SGR_CODES.dim)
export const italic = style(SGR_CODES.italic)
export const underline = style(SGR_CODES.underline)

export const red = style(SGR_CODES.red)
export const green = style(SGR_CODES.green)
export const yellow = style(SGR_CODES.yellow)
export const blue = style(SGR_CODES.blue)
export const magenta = style(SGR_CODES.magenta)
export const cyan = style(SGR_CODES.cyan)
export const white = style(SGR_CODES.white)
export const gray = style(SGR_CODES.gray)
export const brightRed = style(SGR_CODES.brightRed)
export const brightGreen = style(SGR_CODES.brightGreen)
export const brightYellow = style(SGR_CODES.brightYellow)
export const brightCyan = style(SGR_CODES.brightCyan)

export const fg = (r, g, b) => {
  return COLOR_ENABLED ? `${CSI}38;2;${r};${g};${b}m` : ''
}

export const bg = (r, g, b) => {
  return COLOR_ENABLED ? `${CSI}48;2;${r};${g};${b}m` : ''
}

export const CLEAR = COLOR_ENABLED ? RESET : ''

export const CURSOR = {
  hide: `${CSI}?25l`,
  show: `${CSI}?25h`,
  home: `${CSI}H`,
  to: (row, col) => `${CSI}${row};${col}H`,
}

export const SCREEN_CODES = {
  enterAlt: `${CSI}?1049h`,
  exitAlt: `${CSI}?1049l`,
  clear: `${CSI}2J`,
  clearLine: `${CSI}2K`,
  clearBelow: `${CSI}J`,
}
