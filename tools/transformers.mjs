const mapNamed = (named) => {
  if (!named) return null

  return { name: named.name }
}

const mapLinked = (linked) => {
  if (!linked) return null

  return { url: linked.url }
}

const mapStat = (item) => {
  return {
    stat: mapNamed(item.stat),
    base_stat: item.base_stat,
  }
}

const mapPokemonType = (item) => {
  return {
    slot: item.slot,
    type: mapNamed(item.type),
  }
}

const mapLearnsetDetail = (detail) => {
  return {
    level_learned_at: detail.level_learned_at,
    version_group: mapNamed(detail.version_group),
    move_learn_method: mapNamed(detail.move_learn_method),
  }
}

const mapMoveEntry = (item) => {
  return {
    move: mapNamed(item.move),
    version_group_details: item.version_group_details.map(mapLearnsetDetail),
  }
}

export const transformResponsePokemon = (entry) => {
  if (!entry) return null

  return {
    id: entry.id,
    types: entry.types.map(mapPokemonType),
    stats: entry.stats.map(mapStat),
    base_experience: entry.base_experience,
    moves: entry.moves.map(mapMoveEntry),
  }
}

export const transformResponseSpecies = (entry) => {
  if (!entry) return null

  return {
    name: entry.name,
    capture_rate: entry.capture_rate,
    growth_rate: mapNamed(entry.growth_rate),
    gender_rate: entry.gender_rate,
    is_legendary: entry.is_legendary,
    is_mythical: entry.is_mythical,
    evolution_chain: mapLinked(entry.evolution_chain),
  }
}

const mapEvolutionDetail = (detail) => {
  return {
    trigger: mapNamed(detail.trigger),
    min_level: detail.min_level,
    item: mapNamed(detail.item),
  }
}

const mapChainLink = (link) => {
  return {
    species: mapLinked(link.species),
    evolution_details: link.evolution_details.map(mapEvolutionDetail),
    evolves_to: link.evolves_to.map(mapChainLink),
  }
}

export const transformResponseEvolutionChain = (chain) => {
  if (!chain) return null

  return {
    chain: mapChainLink(chain.chain),
  }
}

const mapLocalizedName = (localized) => {
  return {
    name: localized.name,
    language: mapNamed(localized.language),
  }
}

const mapStatChange = (change) => {
  return {
    stat: mapNamed(change.stat),
    change: change.change,
  }
}

const mapMoveMeta = (meta) => {
  if (!meta) return null

  return {
    ailment: mapNamed(meta.ailment),
    ailment_chance: meta.ailment_chance,
    stat_chance: meta.stat_chance,
    min_hits: meta.min_hits,
    max_hits: meta.max_hits,
    drain: meta.drain,
    healing: meta.healing,
    flinch_chance: meta.flinch_chance,
    crit_rate: meta.crit_rate,
  }
}

export const transformResponseMove = (move) => {
  if (!move) return null

  return {
    name: move.name,
    names: move.names.map(mapLocalizedName),
    type: mapNamed(move.type),
    power: move.power,
    accuracy: move.accuracy,
    pp: move.pp,
    priority: move.priority,
    damage_class: mapNamed(move.damage_class),
    meta: mapMoveMeta(move.meta),
    stat_changes: move.stat_changes.map(mapStatChange),
    target: mapNamed(move.target),
  }
}

const mapDamageRelations = (relations) => {
  return {
    double_damage_to: relations.double_damage_to.map(mapNamed),
    half_damage_to: relations.half_damage_to.map(mapNamed),
    no_damage_to: relations.no_damage_to.map(mapNamed),
  }
}

export const transformResponseType = (type) => {
  if (!type) return null

  return {
    name: type.name,
    damage_relations: mapDamageRelations(type.damage_relations),
  }
}

const mapGrowthLevel = (step) => {
  return {
    level: step.level,
    experience: step.experience,
  }
}

export const transformResponseGrowthRate = (curve) => {
  if (!curve) return null

  return {
    name: curve.name,
    levels: curve.levels.map(mapGrowthLevel),
  }
}

const mapWriteStats = (stats) => {
  return {
    hp: stats.hp,
    attack: stats.attack,
    defense: stats.defense,
    spAttack: stats.spAttack,
    spDefense: stats.spDefense,
    speed: stats.speed,
  }
}

const mapWriteEvolution = (evolution) => {
  return {
    to: evolution.to,
    trigger: evolution.trigger,
    level: evolution.level,
    item: evolution.item,
  }
}

const mapWriteLearnsetEntry = (entry) => {
  return {
    level: entry.level,
    move: entry.move,
  }
}

const mapWriteSpecies = (entry) => {
  return {
    id: entry.id,
    name: entry.name,
    types: entry.types,
    stats: mapWriteStats(entry.stats),
    baseExp: entry.base_experience,
    captureRate: entry.capture_rate,
    growthRate: entry.growth_rate,
    genderRate: entry.gender_rate,
    stage: entry.stage,
    evolvesFrom: entry.evolvesFrom,
    evolutions: entry.evolutions.map(mapWriteEvolution),
    legendary: entry.legendary,
    learnset: entry.learnset.map(mapWriteLearnsetEntry),
  }
}

export const transformRequestWritePokedex = (entries) => {
  return entries.map(mapWriteSpecies)
}

const mapWriteStatChange = (change) => {
  return {
    stat: change.stat,
    change: change.change,
  }
}

const mapWriteMove = (move) => {
  return {
    name: move.name,
    type: move.type,
    power: move.power,
    accuracy: move.accuracy,
    pp: move.pp,
    priority: move.priority,
    damageClass: move.damage_class,
    ailment: move.ailment,
    ailmentChance: move.ailment_chance,
    statChance: move.stat_chance,
    statChanges: move.stat_changes.map(mapWriteStatChange),
    target: move.target,
    minHits: move.min_hits,
    maxHits: move.max_hits,
    drain: move.drain,
    healing: move.healing,
    flinchChance: move.flinch_chance,
    critRate: move.crit_rate,
  }
}

export const transformRequestWriteMoves = (moves) => {
  return Object.fromEntries(
    Object.entries(moves).map(([key, move]) => [key, mapWriteMove(move)]),
  )
}

const mapWriteTypeRelations = (relations) => {
  return {
    double: relations.double_damage_to,
    half: relations.half_damage_to,
    zero: relations.no_damage_to,
  }
}

export const transformRequestWriteTypes = (types) => {
  return Object.fromEntries(
    Object.entries(types).map(([name, relations]) => [
      name,
      mapWriteTypeRelations(relations),
    ]),
  )
}

export const transformRequestWriteGrowth = (growth) => {
  return Object.fromEntries(
    Object.entries(growth).map(([name, table]) => [name, table]),
  )
}

const mapStatusLine = (statusLine) => {
  if (!statusLine) return null

  return {
    type: statusLine.type,
    command: statusLine.command,
  }
}

export const transformResponseSettings = (settings) => {
  if (!settings) return null

  return {
    statusLine: mapStatusLine(settings.statusLine),
  }
}

export const transformRequestWriteSettings = (settings) => {
  return {
    statusLine: mapStatusLine(settings.statusLine),
  }
}
