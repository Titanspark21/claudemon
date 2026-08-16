import {
  AILMENT_IMMUNE_TYPES,
  EVOLUTION_CONDITION_KEYS,
  EVOLUTION_LOCATION_BIOMES,
  EVOLUTION_TRIGGERS,
  LINK_CABLE_KEY,
  SHINY_ODDS,
} from './constants.mjs'
import {
  loadPokedex,
  move as moveData,
  species,
  speciesForms,
  speciesIdentity,
} from './data.mjs'
import { expForLevel, levelFromExp } from './exp.mjs'
import { movesAtLevel } from './learnset.mjs'
import { rollNature } from './natures.mjs'
import { chance, makeRng, pick } from './rng.mjs'
import { rollIvs, statsAtLevel } from './stats.mjs'

export const makeMoveSlot = (name) => {
  const data = moveData(name)

  return { move: name, pp: data.pp, maxPp: data.pp }
}

export const rollShiny = (rng) => chance(rng, SHINY_ODDS)

export const rollAbility = (speciesId, rng, hiddenChance = 0.05) => {
  const slots = species(speciesId).abilities ?? []
  const hidden = slots.filter((slot) => slot.hidden)
  const normal = slots.filter((slot) => !slot.hidden)

  if (hidden.length > 0 && chance(rng, hiddenChance))
    return pick(rng, hidden).ability
  if (normal.length > 0) return pick(rng, normal).ability
  if (hidden.length > 0) return pick(rng, hidden).ability

  return null
}

export const legalAbilityAfterEvolution = (mon, targetSpecies) => {
  const targetSlots = species(targetSpecies).abilities ?? []

  if (targetSlots.length === 0) return null

  const alreadyLegal = targetSlots.find((slot) => slot.ability === mon.ability)

  if (alreadyLegal) return alreadyLegal.ability

  const sourceSlot = (species(mon.species).abilities ?? []).find(
    (slot) => slot.ability === mon.ability,
  )
  const matchingSlot = sourceSlot
    ? targetSlots.find((slot) => slot.slot === sourceSlot.slot)
    : null

  if (matchingSlot) return matchingSlot.ability

  return (targetSlots.find((slot) => !slot.hidden) ?? targetSlots[0]).ability
}

const identityRngFor = (speciesId, ivs) => {
  let seed = speciesId >>> 0

  for (const value of [
    ivs.hp,
    ivs.attack,
    ivs.defense,
    ivs.spAttack,
    ivs.spDefense,
    ivs.speed,
  ]) {
    seed = Math.imul(seed ^ value, 0x01000193) >>> 0
  }

  return makeRng(seed)
}

export const createPokemon = (speciesId, level, rng, shiny = false) => {
  const ivs = rollIvs(rng)
  const identityRng = identityRngFor(speciesId, ivs)
  const nature = rollNature(identityRng)
  const ability = rollAbility(speciesId, identityRng)
  const stats = statsAtLevel(speciesId, level, ivs, nature)

  return {
    species: speciesId,
    nickname: null,
    exp: expForLevel(speciesId, level),
    ivs,
    nature,
    ability,
    heldItem: null,
    stats,
    hp: stats.hp,
    moves: movesAtLevel(speciesId, level).map(makeMoveSlot),
    moveRecovery: [],
    status: null,
    statusTurns: 0,
    shiny,
  }
}

export const speciesName = (id) => species(id).name.replace(/-[fm]$/, '')

export const displayName = (mon) => mon.nickname ?? speciesName(mon.species)

export const genderOf = (mon) => {
  const rate = species(mon.species).genderRate

  if (!Number.isInteger(rate) || rate < 0) return null
  if (!Number.isInteger(mon.ivs?.attack)) return null

  return mon.ivs.attack < rate * 4 ? 'female' : 'male'
}

export const speciesGender = (id) => {
  const rate = species(id).genderRate

  if (rate === 0) return 'male'
  if (rate === 8) return 'female'

  return null
}

export const levelOf = (mon) => levelFromExp(mon.species, mon.exp)

export const isFainted = (mon) => mon.hp <= 0

export const hpFraction = (mon, denominator, maxHp = mon.stats.hp) => {
  return Math.max(1, Math.floor(maxHp / denominator))
}

export const isImmuneToAilment = (
  mon,
  ailment,
  types = species(mon.species).types,
) => {
  const immune = AILMENT_IMMUNE_TYPES[ailment]

  if (!immune) return false

  return types.some((type) => immune.includes(type))
}

export const refreshStats = (mon) => {
  const previousMax = mon.stats.hp

  mon.stats = statsAtLevel(mon.species, levelOf(mon), mon.ivs, mon.nature)

  const gained = mon.stats.hp - previousMax

  if (gained > 0 && mon.hp > 0) mon.hp = Math.min(mon.stats.hp, mon.hp + gained)

  return mon
}

export const healFully = (mon) => {
  mon.hp = mon.stats.hp
  mon.status = null
  mon.statusTurns = 0

  for (const slot of mon.moves) slot.pp = slot.maxPp

  return mon
}

const normalizedItemKey = (key) => {
  return String(key ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

export const evolutionItemMatches = (left, right) => {
  return normalizedItemKey(left) === normalizedItemKey(right)
}

export const isEvolutionItem = (key) => {
  return loadPokedex().some((entry) => {
    return entry.evolutions.some((rule) => {
      return rule.trigger === 'use-item' && evolutionItemMatches(rule.item, key)
    })
  })
}

export const isEvolutionHeldItem = (key) => {
  return loadPokedex().some((entry) => {
    return entry.evolutions.some((rule) => {
      const held = rule.conditions.heldItem

      return held != null && evolutionItemMatches(held, key)
    })
  })
}

const textConditionResult = (mon, rule, context) => {
  const text = rule.conditions.text

  if (!text) return { matches: true, score: 0 }
  if (text === 'during the day') {
    return { matches: context.timeOfDay === 'day', score: 1 }
  }
  if (text === 'at night') {
    return { matches: context.timeOfDay === 'night', score: 1 }
  }

  const biomes = EVOLUTION_LOCATION_BIOMES[text]

  if (biomes) return { matches: biomes.includes(context.biome), score: 1 }

  if (text === 'with an Atk stat > its Def stat') {
    return { matches: mon.stats.attack > mon.stats.defense, score: 1 }
  }
  if (text === 'with an Atk stat < its Def stat') {
    return { matches: mon.stats.attack < mon.stats.defense, score: 1 }
  }
  if (text === 'with an Atk stat equal to its Def stat') {
    return { matches: mon.stats.attack === mon.stats.defense, score: 1 }
  }
  if (text === 'with a Dark-type in the party') {
    const matches = context.party?.some((candidate) => {
      return species(candidate.species).types.includes('dark')
    })

    return { matches: matches === true, score: 1 }
  }
  if (text === 'with a Remoraid in party') {
    const matches = context.party?.some(
      (candidate) => candidate.species === 223,
    )

    return { matches: matches === true, score: 1 }
  }
  if (text === 'with a Fairy-type move and two levels of Affection') {
    const matches = mon.moves.some(
      (slot) => moveData(slot.move).type === 'fairy',
    )

    return { matches, score: 1 }
  }
  if (text === 'during rain' && context.weather) {
    return { matches: context.weather === 'rain', score: 1 }
  }
  if (rule.substitute) return { matches: true, score: 0 }

  throw new Error(`unsupported evolution condition: ${text}`)
}

const conditionResult = (mon, rule, context) => {
  for (const key of Object.keys(rule.conditions)) {
    if (!EVOLUTION_CONDITION_KEYS.has(key)) {
      throw new Error(`unsupported evolution condition: ${key}`)
    }
  }

  let score = 0
  const held = rule.conditions.heldItem

  if (held && !evolutionItemMatches(mon.heldItem, held)) {
    return { matches: false, score: 0 }
  }
  if (held) score++

  if (
    rule.conditions.move &&
    !mon.moves.some((slot) => slot.move === rule.conditions.move)
  ) {
    return { matches: false, score: 0 }
  }
  if (rule.conditions.move) score++

  if (rule.conditions.friendship) {
    if (context.friendship === true) score++
    else if (!rule.substitute) return { matches: false, score: 0 }
  }

  const text = textConditionResult(mon, rule, context)

  if (!text.matches) return text
  score += text.score

  const identity = speciesIdentity(rule.to)
  const formGender =
    identity.formKey === 'f'
      ? 'female'
      : identity.formKey === 'm'
        ? 'male'
        : null
  const hasFemaleForm = speciesForms(identity.baseSpecies).some(
    (form) => form.formKey === 'f',
  )
  const targetGender =
    formGender ??
    speciesGender(rule.to) ??
    (identity.formKey === null && hasFemaleForm ? 'male' : null)

  if (targetGender && genderOf(mon) !== targetGender) {
    return { matches: false, score: 0 }
  }
  if (targetGender) score++

  return { matches: true, score }
}

const triggerMatches = (rule, context) => {
  if (rule.trigger !== context.trigger) return false
  if (rule.trigger === 'level-up') {
    return rule.level === null || context.level >= rule.level
  }
  if (rule.trigger === 'use-item') {
    return evolutionItemMatches(rule.item, context.item)
  }

  return context.item === LINK_CABLE_KEY
}

const targetMatchesContext = (rule, context) => {
  if (context.targetId != null && rule.to !== context.targetId) return false
  if (context.formKey == null) return true

  const wanted = context.formKey === 'base' ? null : context.formKey

  return speciesIdentity(rule.to).formKey === wanted
}

const chooseEvolutionRule = (candidates, context) => {
  if (candidates.length === 0) return null
  if (candidates.length === 1) return candidates[0].rule
  if (context.targetId != null || context.formKey != null)
    return candidates[0].rule

  const hasForm = candidates.some((entry) => {
    return speciesIdentity(entry.rule.to).formKey !== null
  })
  const base = candidates.find((entry) => {
    return speciesIdentity(entry.rule.to).formKey === null
  })

  if (hasForm && base) return base.rule

  const highest = Math.max(...candidates.map((entry) => entry.score))
  const best = candidates.filter((entry) => entry.score === highest)

  return best.length === 1 ? best[0].rule : candidates[0].rule
}

export const pendingEvolution = (mon, context) => {
  if (!EVOLUTION_TRIGGERS.has(context.trigger)) {
    throw new Error(`unsupported evolution trigger: ${context.trigger}`)
  }

  const candidates = []

  for (const rule of species(mon.species).evolutions) {
    if (!triggerMatches(rule, context)) continue
    if (!targetMatchesContext(rule, context)) continue

    const result = conditionResult(mon, rule, context)

    if (result.matches) candidates.push({ rule, score: result.score })
  }

  return chooseEvolutionRule(candidates, context)
}

export const stoneEvolution = (mon, item, formKey = null) => {
  const rule = pendingEvolution(mon, {
    trigger: 'use-item',
    item,
    formKey,
  })

  return rule?.to ?? null
}

export const linkCableEvolution = (mon, formKey = null) => {
  const rule = pendingEvolution(mon, {
    trigger: 'trade',
    item: LINK_CABLE_KEY,
    formKey,
  })

  return rule?.to ?? null
}

export const canEvolveByStone = (mon) => {
  return species(mon.species).evolutions.some(
    (evolution) => evolution.trigger === 'use-item',
  )
}

export const levelUpEvolution = (mon) => {
  const evolution = species(mon.species).evolutions.find(
    (candidate) => candidate.trigger === 'level-up' && candidate.level != null,
  )

  return evolution ?? null
}

export const evolveInto = (mon, speciesId) => {
  const previousMax = mon.stats?.hp ?? 0
  const wasFainted = mon.hp <= 0
  const fraction = previousMax > 0 ? mon.hp / previousMax : 1
  const ability = legalAbilityAfterEvolution(mon, speciesId)

  mon.species = speciesId
  mon.ability = ability
  mon.stats = statsAtLevel(speciesId, levelOf(mon), mon.ivs, mon.nature)
  mon.hp = wasFainted
    ? 0
    : Math.max(1, Math.min(mon.stats.hp, Math.round(mon.stats.hp * fraction)))

  return mon
}
