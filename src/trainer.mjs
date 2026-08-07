import {
  TRAINER_CLASSES,
  TRAINER_LEVEL_SPREAD,
  TRAINER_LEVELS_PER_MON,
  TRAINER_MESSAGES,
  TRAINER_NAMES,
} from './constants.mjs'
import { pickLevel } from './helpers.mjs'
import { displayName, isFainted, levelOf } from './pokemon.mjs'
import { pick, randInt, weightedPick } from './rng.mjs'

export const trainerClass = (name) => {
  return TRAINER_CLASSES.find((entry) => entry.name === name)
}

export const trainerLabel = (trainer) => {
  return `${trainer.class} ${trainer.name}`.toUpperCase()
}

export const sentOutLine = (trainer, mon) => {
  return `${trainerLabel(trainer)} ${TRAINER_MESSAGES.sentOut} ${displayName(mon)}!`
}

export const monsLeft = (trainer) => {
  return trainer.team.filter((mon) => !isFainted(mon)).length
}

export const trainerPrize = (trainer) => {
  const top = trainer.team.reduce((best, mon) => {
    return Math.max(best, levelOf(mon))
  }, 1)

  return trainer.prize * top
}

const teamSize = (rng, leadLevel, maxMons) => {
  if (!leadLevel) return 1

  const room = 1 + Math.floor(leadLevel / TRAINER_LEVELS_PER_MON)

  return randInt(rng, 1, Math.min(maxMons, room))
}

const rollMon = (rng, leadLevel, species) => {
  const chosen = weightedPick(rng, species, (entry) => entry.weight)

  return {
    species: chosen.id,
    name: chosen.name,
    level: pickLevel(rng, leadLevel, TRAINER_LEVEL_SPREAD),
  }
}

export const rollTrainer = ({ rng, leadLevel, species }) => {
  const chosen = pick(rng, TRAINER_CLASSES)
  const size = teamSize(rng, leadLevel, chosen.maxMons)
  const team = []

  for (let index = 0; index < size; index++) {
    team.push(rollMon(rng, leadLevel, species))
  }

  return {
    class: chosen.name,
    name: pick(rng, TRAINER_NAMES),
    sprite: pick(rng, chosen.sprites),
    team,
  }
}
