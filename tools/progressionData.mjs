import { Generations } from '@pkmn/data'
import { Dex } from '@pkmn/dex'
import { GYMS } from '../src/constants.mjs'

const LEAGUE = {
  eliteFour: [
    {
      class: 'Elite Four',
      name: 'Lorelei',
      sprite: 'acetrainerf',
      prize: 220,
      team: [
        { species: 87, level: 60 },
        { species: 91, level: 61 },
        { species: 80, level: 61 },
        { species: 124, level: 62 },
        { species: 131, level: 63 },
      ],
    },
    {
      class: 'Elite Four',
      name: 'Bruno',
      sprite: 'blackbelt',
      prize: 225,
      team: [
        { species: 95, level: 60 },
        { species: 76, level: 61 },
        { species: 106, level: 62 },
        { species: 107, level: 62 },
        { species: 68, level: 64 },
      ],
    },
    {
      class: 'Elite Four',
      name: 'Agatha',
      sprite: 'channeler-gen1',
      prize: 230,
      team: [
        { species: 42, level: 61 },
        { species: 89, level: 61 },
        { species: 24, level: 62 },
        { species: 110, level: 62 },
        { species: 94, level: 65 },
      ],
    },
    {
      class: 'Elite Four',
      name: 'Lance',
      sprite: 'acetrainer',
      prize: 240,
      team: [
        { species: 130, level: 62 },
        { species: 142, level: 62 },
        { species: 230, level: 63 },
        { species: 6, level: 63 },
        { species: 149, level: 66 },
      ],
    },
  ],
  champion: {
    class: 'Champion',
    name: 'Blue',
    sprite: 'acetrainer',
    prize: 300,
    team: [
      { species: 18, level: 65 },
      { species: 65, level: 65 },
      { species: 112, level: 66 },
      { species: 103, level: 66 },
      { species: 130, level: 67 },
      { species: 6, level: 68, heldItem: 'charizardite-x', mega: true },
    ],
  },
}

const legalMoves = (record, level) => {
  const latestByMove = new Map()

  for (const entry of record.learnset ?? []) {
    if (entry.level <= level) latestByMove.set(entry.move, entry.level)
  }

  return [...latestByMove.entries()]
    .sort(
      (left, right) => left[1] - right[1] || left[0].localeCompare(right[0]),
    )
    .slice(-4)
    .map(([move]) => move)
}

const normalAbility = (record) => {
  return (
    record.abilities?.find((slot) => !slot.hidden)?.ability ??
    record.abilities?.[0]?.ability ??
    null
  )
}

const enrichMon = (entry, byId, heldItem = entry.heldItem ?? null) => {
  const record = byId.get(entry.species)
  if (!record)
    throw new Error(
      `progression team references missing species ${entry.species}`,
    )

  const moves = legalMoves(record, entry.level)
  if (moves.length === 0)
    throw new Error(
      `${record.name} has no legal level-up move at level ${entry.level}`,
    )

  return {
    species: entry.species,
    level: entry.level,
    ability: normalAbility(record),
    moves,
    ...(heldItem ? { heldItem } : {}),
    ...(entry.mega ? { mega: true } : {}),
  }
}

const enrichTrainer = (trainer, byId, { itemOnAce = null } = {}) => {
  return {
    ...trainer,
    team: trainer.team.map((entry, index) =>
      enrichMon(
        entry,
        byId,
        entry.heldItem ??
          (index === trainer.team.length - 1 ? itemOnAce : null),
      ),
    ),
  }
}

export const buildProgressionData = (pokedex) => {
  const byId = new Map(pokedex.map((record) => [record.id, record]))
  const nationalDexTotal = pokedex.filter(
    (record) => record.formKey === null,
  ).length
  const generationOne = new Generations(Dex).get(1)
  const generationOneNumbers = new Set(
    [...generationOne.species]
      .map((record) => record.num)
      .filter((number) => number > 0),
  )
  const kantoSpeciesIds = pokedex
    .filter(
      (record) =>
        record.formKey === null && generationOneNumbers.has(record.dexNumber),
    )
    .map((record) => record.id)
  const kantoDexTotal = kantoSpeciesIds.length
  const formTotal = pokedex.filter(
    (record) =>
      record.formKey !== null && record.collectible && !record.battleOnly,
  ).length

  const gyms = GYMS.map((gym) => ({
    ...gym,
    trainers: gym.trainers.map((trainer) => enrichTrainer(trainer, byId)),
    leader: enrichTrainer(gym.leader, byId, { itemOnAce: 'leftovers' }),
  }))
  const eliteFour = LEAGUE.eliteFour.map((trainer) =>
    enrichTrainer(trainer, byId, { itemOnAce: 'leftovers' }),
  )
  const champion = enrichTrainer(LEAGUE.champion, byId)

  return {
    metadata: { nationalDexTotal, kantoDexTotal, kantoSpeciesIds, formTotal },
    gyms,
    league: { eliteFour, champion },
  }
}
