import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { expect, test } from 'vitest'
import { encodePng } from '../png.mjs'
import { loadSprite } from './sprite.mjs'

const png = () =>
  encodePng({
    width: 1,
    height: 1,
    pixels: Uint8Array.from([255, 255, 255, 255]),
  })

test('a missing back sprite is treated as unavailable instead of throwing', () => {
  const root = mkdtempSync(join(tmpdir(), 'claudemon-sprite-'))

  expect(loadSprite(join(root, 'back', '20001.png'), { cols: 20 })).toBeNull()
})

test('a corrupt shiny sprite falls back to the ordinary sprite', () => {
  const root = mkdtempSync(join(tmpdir(), 'claudemon-sprite-'))
  const ordinary = join(root, 'front', '10001.png')
  const shiny = join(root, 'front', 'shiny', '10001.png')

  mkdirSync(dirname(shiny), { recursive: true })
  writeFileSync(ordinary, png())
  writeFileSync(shiny, 'not a png')

  expect(loadSprite(shiny, { cols: 20 })).toEqual(
    loadSprite(ordinary, { cols: 20 }),
  )
})
