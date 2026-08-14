import { refreshAbilityEffects } from './abilities.mjs'
import { hasItem, item, species, speciesIdentity } from './data.mjs'
import { runEffectPhase } from './effects.mjs'
import {
  changeBattleForm,
  normalizeFormName,
  speciesIdFromFormName,
} from './forms.mjs'

export { changeBattleForm, revertBattleForm } from './forms.mjs'

const sideState = (battle, side) => {
  battle.megaUsed ??= { player: false, foe: false }
  if (battle.megaUsed[side] == null) battle.megaUsed[side] = false
  return battle[side]
}

const megaTargetForStone = (mon, stone) => {
  if (!hasItem(stone)) return null

  const record = item(stone)
  if (!record.megaStone) return null

  const currentName = normalizeFormName(species(mon.species).name)
  const match = Object.entries(record.megaStone).find(
    ([name]) => normalizeFormName(name) === currentName,
  )
  if (!match) return null

  const targetId = speciesIdFromFormName(match[1])
  return speciesIdentity(targetId).battleOnly ? targetId : null
}

export const canMegaEvolve = (battle, side) => {
  const actor = sideState(battle, side)
  if (!actor?.mon || actor.mon.hp <= 0 || battle.over) return null
  if (battle.megaUsed[side] || actor.battleForm) return null

  const stone = actor.mon.heldItem
  if (!stone) return null

  const targetId = megaTargetForStone(actor.mon, stone)
  if (targetId == null) return null

  return { stone, targetId }
}

export const megaEvolve = (battle, side) => {
  const ready = canMegaEvolve(battle, side)
  if (!ready) return []

  battle.megaUsed[side] = true
  const events = changeBattleForm(battle, side, ready.targetId, 'mega')

  refreshAbilityEffects(battle)
  runEffectPhase(battle, 'switchIn', { side, events, cause: 'mega' })
  refreshAbilityEffects(battle)

  events.unshift({
    type: 'mega',
    side,
    stone: ready.stone,
    targetId: ready.targetId,
  })

  return events
}

export const trainerWantsMega = (battle) => {
  if (!battle?.trainer || battle.megaUsed?.foe) return false

  return Boolean(
    battle.foe?.mon?.trainerMega === true ||
    battle.trainer.mega === true ||
    battle.trainer.mega === battle.foe?.mon?.species,
  )
}
