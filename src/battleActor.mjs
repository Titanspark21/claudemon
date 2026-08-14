import { species } from './data.mjs'

const activeForm = (actor) => {
  if (!actor?.battleForm) return null
  if (actor.battleForm.mon && actor.battleForm.mon !== actor.mon) return null
  return actor.battleForm
}

export const battleSpecies = (actor) =>
  activeForm(actor)?.species ?? actor?.mon?.species ?? null

export const battleStats = (actor) =>
  activeForm(actor)?.stats ?? actor?.mon?.stats

export const battleTypes = (actor) => {
  if (actor?.mon?.battleTypes) return actor.mon.battleTypes
  if (activeForm(actor)?.types) return activeForm(actor).types

  const speciesId = battleSpecies(actor)
  return speciesId == null ? [] : species(speciesId).types
}

export const battleAbility = (actor) =>
  activeForm(actor)?.ability ?? actor?.mon?.ability ?? null

export const setBattleAbility = (actor, ability) => {
  const form = activeForm(actor)
  if (form) form.ability = ability
  else if (actor?.mon) actor.mon.ability = ability

  return ability
}

export const battleMaxHp = (actor) => battleStats(actor)?.hp ?? 1

export const stageMultiplier = (stage) => {
  return stage >= 0 ? (2 + stage) / 2 : 2 / (2 - stage)
}

export const effectiveSpeed = (actor) => {
  const base = battleStats(actor).speed * stageMultiplier(actor.stages.speed)

  return actor.mon.status === 'paralysis' ? base / 2 : base
}

export const moveSlotOf = (actor, index) => {
  const slot = actor.mon.moves[index]

  return slot?.pp > 0 ? slot : null
}
