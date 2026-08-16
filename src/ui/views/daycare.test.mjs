import { expect, test } from 'vitest'
import { mkdirSync, mkdtempSync, symlinkSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

const DATA_FILES = ['pokedex.json', 'moves.json', 'types.json', 'growth.json']

const realDataDir = () => {
  return join(
    process.env.CLAUDEMON_HOME || join(homedir(), '.claudemon'),
    'data',
  )
}

const homeWithoutSprites = () => {
  const real = realDataDir()
  const sandbox = mkdtempSync(join(tmpdir(), 'claudemon-no-sprites-'))

  mkdirSync(join(sandbox, 'data'), { recursive: true })

  for (const name of DATA_FILES) {
    symlinkSync(join(real, name), join(sandbox, 'data', name))
  }

  process.env.CLAUDEMON_HOME = sandbox
}

homeWithoutSprites()

const { draw } = await import('./daycare.mjs')
const { createPokemon } = await import('../../pokemon.mjs')
const { makeRng } = await import('../../rng.mjs')
const { stripAnsi } = await import('../text.mjs')
const { EGG_STEPS } = await import('../../constants.mjs')

const aCtx = (egg) => {
  return {
    save: {
      party: [createPokemon(1, 5, makeRng(1))],
      box: [],
      daycare: {
        slots: [
          createPokemon(132, 9, makeRng(2)),
          createPokemon(25, 9, makeRng(3)),
        ],
        egg,
      },
    },
    spriteScale: 1,
    daycareStep: 'slots',
    daycareSelection: 0,
    daycarePickSelection: 0,
    daycareMessage: null,
  }
}

const textOf = (ctx, size) => {
  return draw(ctx, size).lines.map(stripAnsi).join('\n')
}

test('Should fall back to a bordered panel when the egg sprite is not installed yet', () => {
  const text = textOf(aCtx({ species: 25, steps: 120, shiny: false }), {
    cols: 100,
    rows: 34,
  })

  expect(text, 'the box is drawn instead of the sprite').toContain('┌─ Egg')
  expect(text).toContain('└')
  expect(text).toContain('Something is moving inside.')
  expect(text).toContain(`120/${EGG_STEPS} steps`)
})

test('Should show move recovery progress for the selected Pokemon left at Day Care', () => {
  const ctx = aCtx(null)
  const mon = ctx.save.daycare.slots[0]

  mon.moveRecovery = [
    {
      move: 'ember',
      level: 7,
      requiredExp: 20,
      progressExp: 5,
      unlocked: false,
    },
  ]

  const text = textOf(ctx, { cols: 100, rows: 34 })

  expect(text).toContain('Move recovery')
  expect(text).toContain('Ember')
  expect(text).toContain('15 EXP left')
  expect(text).toContain('won battle EXP unlocks them to relearn')
})

test('Should keep the fallback panel square at every width it can be drawn at', () => {
  for (const cols of [40, 50, 64, 100]) {
    const lines = draw(aCtx({ species: 25, steps: 120, shiny: false }), {
      cols,
      rows: 34,
    }).lines.map(stripAnsi)

    const top = lines.findIndex((line) => line.includes('┌─ Egg'))
    const bottom = lines.findIndex((line) => line.includes('└'))

    expect(top, `no panel was drawn at ${cols} columns`).toBeGreaterThan(-1)

    const widths = new Set(
      lines.slice(top, bottom + 1).map((line) => line.length),
    )

    expect(widths, `the panel broke at ${cols} columns`).toHaveProperty(
      'size',
      1,
    )
  }
})
