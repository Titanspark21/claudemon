import { expect, test, vi } from 'vitest'

import { createBattle } from './battle.mjs'
import {
  advanceMessage,
  backOutOfBattleMenu,
  chooseBattleOption,
  createBattleFlow,
  toggleBattleMega,
} from './battleFlow.mjs'
import { BATTLE_MESSAGES } from './constants.mjs'
import { createPokemon, displayName } from './pokemon.mjs'
import { makeRng } from './rng.mjs'

test('Should swap the move the player picks when a level-up has nowhere to put it', () => {
  const mon = createPokemon(4, 30, makeRng(1))
  const battle = createBattleFlow(
    createBattle({
      playerMon: mon,
      wildMon: createPokemon(10, 5, makeRng(7)),
      seed: 7,
    }),
  )
  const persist = vi.fn()
  const ctx = { save: { party: [mon], moveChoices: [] }, battle, persist }

  battle.postSteps = [
    { kind: 'learn-choice', move: 'flamethrower', mon, name: displayName(mon) },
  ]

  advanceMessage(ctx)

  expect(battle.menu).toBe('learn')
  expect(battle.message).toBe(null)
  expect(battle.learnStep.move).toBe('flamethrower')
  expect(ctx.save.moveChoices).toEqual([
    { partyIndex: 0, move: 'flamethrower' },
  ])
  expect(persist).toHaveBeenCalledTimes(1)

  battle.selection = 1
  chooseBattleOption(ctx)

  expect(mon.moves.map((slot) => slot.move)).toEqual([
    'dragon-rage',
    'flamethrower',
    'fire-fang',
    'flame-burst',
  ])
  expect(battle.message).toBe(BATTLE_MESSAGES.forgetting)
  expect(battle.events.map((event) => event.text)).toEqual([
    'CHARMANDER forgot scary-face and learned a new move!',
  ])
  expect(battle.learnStep).toBe(null)
  expect(battle.menu).toBe(null)
  expect(ctx.save.moveChoices).toEqual([])
  expect(persist).toHaveBeenCalledTimes(2)
})

test('Should hold the learn menu until the player answers, and keep the four moves when the answer is no', () => {
  const mon = createPokemon(4, 30, makeRng(1))
  const known = mon.moves.map((slot) => slot.move)
  const battle = createBattleFlow(
    createBattle({
      playerMon: mon,
      wildMon: createPokemon(10, 5, makeRng(7)),
      seed: 7,
    }),
  )
  const persist = vi.fn()
  const ctx = { save: { party: [mon], moveChoices: [] }, battle, persist }

  battle.postSteps = [
    { kind: 'learn-choice', move: 'flamethrower', mon, name: displayName(mon) },
  ]

  advanceMessage(ctx)
  backOutOfBattleMenu(ctx)

  expect(battle.menu).toBe('learn')
  expect(battle.learnStep.move).toBe('flamethrower')
  expect(ctx.save.moveChoices).toEqual([
    { partyIndex: 0, move: 'flamethrower' },
  ])
  expect(persist).toHaveBeenCalledTimes(1)

  battle.selection = mon.moves.length
  chooseBattleOption(ctx)

  expect(mon.moves.map((slot) => slot.move)).toEqual(known)
  expect(battle.message).toBe('CHARMANDER did not learn the move.')
  expect(battle.learnStep).toBe(null)
  expect(ctx.save.moveChoices).toEqual([])
  expect(persist).toHaveBeenCalledTimes(2)
})

test('Should persist several move choices in order before continuing', () => {
  const mon = createPokemon(4, 30, makeRng(1))
  const battle = createBattleFlow(
    createBattle({
      playerMon: mon,
      wildMon: createPokemon(10, 5, makeRng(7)),
      seed: 7,
    }),
  )
  const persist = vi.fn()
  const ctx = { save: { party: [mon], moveChoices: [] }, battle, persist }

  battle.postSteps = [
    { kind: 'learn-choice', move: 'flamethrower', mon, name: displayName(mon) },
    { kind: 'learn-choice', move: 'slash', mon, name: displayName(mon) },
  ]

  advanceMessage(ctx)

  expect(ctx.save.moveChoices).toEqual([
    { partyIndex: 0, move: 'flamethrower' },
  ])

  battle.selection = 0
  chooseBattleOption(ctx)
  advanceMessage(ctx)
  advanceMessage(ctx)

  expect(ctx.save.moveChoices).toEqual([{ partyIndex: 0, move: 'slash' }])
  expect(battle.learnStep.move).toBe('slash')

  battle.selection = mon.moves.length
  chooseBattleOption(ctx)

  expect(ctx.save.moveChoices).toEqual([])
  expect(persist).toHaveBeenCalledTimes(4)
})

test('Should say there is no PP left rather than spending the turn on an empty move', () => {
  const mon = createPokemon(4, 30, makeRng(1))
  const state = createBattle({
    playerMon: mon,
    wildMon: createPokemon(10, 5, makeRng(7)),
    seed: 7,
  })
  const battle = createBattleFlow(state)
  const ctx = { save: { party: [mon] }, battle }

  mon.moves[0].pp = 0

  chooseBattleOption(ctx)

  expect(battle.menu).toBe('fight')

  chooseBattleOption(ctx)

  expect(battle.message).toBe(BATTLE_MESSAGES.noPp)
  expect(battle.menu).toBe('fight')
  expect(state.turn).toBe(0)
})

test('Should toggle Mega readiness from the fight menu without spending the turn', () => {
  const mon = createPokemon(6, 50, makeRng(10))
  mon.heldItem = 'charizardite-x'
  const state = createBattle({
    playerMon: mon,
    wildMon: createPokemon(242, 50, makeRng(11)),
    seed: 12,
  })
  const battle = createBattleFlow(state)
  const ctx = { save: { party: [mon] }, battle }

  battle.menu = 'fight'

  expect(toggleBattleMega(ctx)).toBe(true)
  expect(state.megaSelected).toBe(true)
  expect(state.turn).toBe(0)
  expect(battle.menu).toBe('fight')

  expect(toggleBattleMega(ctx)).toBe(true)
  expect(state.megaSelected).toBe(false)
  expect(state.turn).toBe(0)
})

test('Should leave an empty battle bag alone instead of using nothing', () => {
  const mon = createPokemon(4, 30, makeRng(1))
  const state = createBattle({
    playerMon: mon,
    wildMon: createPokemon(10, 5, makeRng(7)),
    seed: 7,
  })
  const battle = createBattleFlow(state)
  const ctx = { save: { party: [mon], bag: {} }, battle }

  battle.selection = 1
  chooseBattleOption(ctx)

  expect(battle.menu).toBe('bag')
  expect(battle.bagItems).toEqual([])

  chooseBattleOption(ctx)

  expect(battle.menu).toBe('bag')
  expect(battle.message).toBe(null)
  expect(state.turn).toBe(0)
})

test('Should refuse to send out a fainted team-mate or the one already out, and keep the turn', () => {
  const lead = createPokemon(4, 30, makeRng(1))
  const fallen = createPokemon(25, 9, makeRng(1))

  fallen.hp = 0

  const state = createBattle({
    playerMon: lead,
    wildMon: createPokemon(10, 5, makeRng(7)),
    seed: 7,
  })
  const battle = createBattleFlow(state)
  const ctx = { save: { party: [lead, fallen] }, battle }

  battle.selection = 2
  chooseBattleOption(ctx)

  expect(battle.menu).toBe('party')

  battle.selection = 1
  chooseBattleOption(ctx)

  expect(battle.message).toBe('PIKACHU is in no shape to fight!')
  expect(state.player.mon).toBe(lead)

  advanceMessage(ctx)

  expect(battle.menu).toBe('main')

  battle.selection = 2
  chooseBattleOption(ctx)
  battle.selection = 0
  chooseBattleOption(ctx)

  expect(battle.message).toBe('CHARMANDER is already out!')
  expect(ctx.save.party[0]).toBe(lead)
  expect(state.turn).toBe(0)
})
