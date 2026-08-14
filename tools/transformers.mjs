import { toID } from '@pkmn/dex'

const mapNamed = (named) => {
  if (!named) return null

  return { name: named.name }
}

const mapLinked = (linked) => {
  if (!linked) return null

  return { url: linked.url }
}

const slug = (value) => {
  if (!value) return null

  return String(value)
    .replace(/♀/g, '-f')
    .replace(/♂/g, '-m')
    .replace(/['’]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
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

export const transformResponseEncounterLocations = (entries) => {
  return (entries ?? []).map((entry) => ({
    locationArea: entry.location_area?.name ?? null,
    versions: (entry.version_details ?? [])
      .map((detail) => detail.version?.name)
      .filter(Boolean),
  }))
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
    is_baby: Boolean(entry.is_baby),
    egg_groups: (entry.egg_groups ?? []).map(mapNamed),
    habitat: mapNamed(entry.habitat),
    evolution_chain: mapLinked(entry.evolution_chain),
  }
}

const mapEvolutionDetail = (detail) => {
  return {
    trigger: mapNamed(detail.trigger),
    min_level: detail.min_level,
    item: mapNamed(detail.item),
    gender: detail.gender,
    held_item: mapNamed(detail.held_item),
    known_move: mapNamed(detail.known_move),
    known_move_type: mapNamed(detail.known_move_type),
    location: mapNamed(detail.location),
    min_affection: detail.min_affection,
    min_beauty: detail.min_beauty,
    min_happiness: detail.min_happiness,
    needs_overworld_rain: Boolean(detail.needs_overworld_rain),
    party_species: mapNamed(detail.party_species),
    party_type: mapNamed(detail.party_type),
    relative_physical_stats: detail.relative_physical_stats,
    time_of_day: detail.time_of_day || '',
    trade_species: mapNamed(detail.trade_species),
    turn_upside_down: Boolean(detail.turn_upside_down),
  }
}

const mapChainLink = (link) => {
  return {
    species: {
      name: link.species?.name ?? null,
      url: link.species?.url ?? null,
    },
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
    conditions: evolution.conditions ?? {},
    substitute: evolution.substitute ?? null,
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
    sourceKey: entry.sourceKey,
    dexNumber: entry.dexNumber,
    baseSpecies: entry.baseSpecies,
    formKey: entry.formKey,
    collectible: entry.collectible,
    battleOnly: entry.battleOnly,
    types: entry.types,
    stats: mapWriteStats(entry.stats),
    baseExp: entry.base_experience,
    captureRate: entry.capture_rate,
    growthRate: entry.growth_rate,
    genderRate: entry.gender_rate,
    eggGroups: entry.egg_groups,
    abilities: entry.abilities,
    habitat: entry.habitat,
    baby: entry.baby,
    stage: entry.stage,
    evolvesFrom: entry.evolvesFrom,
    evolutions: entry.evolutions.map(mapWriteEvolution),
    legendary: entry.legendary,
    mythical: entry.mythical,
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

const genderRateFromRecord = (record) => {
  if (record.gender === 'N') return -1
  if (record.gender === 'F') return 8
  if (record.gender === 'M') return 0

  const female = record.genderRatio?.F

  return Number.isFinite(female) ? Math.round(female * 8) : -1
}

const abilitySlots = (abilities = {}) => {
  const order = (slot) => {
    if (/^\d+$/.test(slot)) return Number(slot)
    if (slot === 'H') return 100

    return 200
  }

  return Object.entries(abilities)
    .sort(([a], [b]) => order(a) - order(b) || a.localeCompare(b))
    .map(([slot, ability]) => ({
      slot,
      ability: toID(ability),
      hidden: slot === 'H',
    }))
}

export const buildSpeciesRecord = (pkmnRecord, pokeApiRecord, identity) => {
  if (!pkmnRecord?.exists)
    throw new Error(`Missing battle source: ${identity?.sourceKey}`)
  if (!identity) throw new Error(`Missing species identity: ${pkmnRecord.id}`)

  const metadata = pokeApiRecord ?? {}
  const eggGroups = (metadata.egg_groups ?? []).map((entry) => entry.name)
  const learnset = (pkmnRecord.learnset ?? [])
    .map((entry) => ({ level: entry.level, move: entry.move }))
    .sort((a, b) => a.level - b.level || a.move.localeCompare(b.move))

  return {
    id: identity.id,
    name: pkmnRecord.name.replace(/-F$/, '-f').replace(/-M$/, '-m'),
    sourceKey: identity.sourceKey,
    dexNumber: identity.dexNumber,
    baseSpecies: identity.baseSpecies,
    formKey: identity.formKey,
    collectible: identity.collectible,
    battleOnly: identity.battleOnly,
    types: pkmnRecord.types.map((type) => type.toLowerCase()),
    stats: {
      hp: pkmnRecord.baseStats.hp,
      attack: pkmnRecord.baseStats.atk,
      defense: pkmnRecord.baseStats.def,
      spAttack: pkmnRecord.baseStats.spa,
      spDefense: pkmnRecord.baseStats.spd,
      speed: pkmnRecord.baseStats.spe,
    },
    base_experience: metadata.base_experience,
    capture_rate: metadata.capture_rate,
    growth_rate: metadata.growth_rate?.name ?? metadata.growth_rate,
    gender_rate: metadata.gender_rate ?? genderRateFromRecord(pkmnRecord),
    egg_groups:
      eggGroups.length > 0
        ? eggGroups
        : (pkmnRecord.eggGroups ?? []).map((group) => slug(group)),
    abilities: abilitySlots(pkmnRecord.abilities),
    habitat: metadata.habitat?.name ?? metadata.habitat ?? null,
    baby: Boolean(metadata.is_baby),
    stage: 0,
    evolvesFrom: null,
    evolutions: [],
    legendary: Boolean(metadata.is_legendary),
    mythical: Boolean(metadata.is_mythical),
    learnset,
  }
}

const fallbackLevel = (target) => target.evoLevel ?? 20

const evolutionSubstitute = (target, conditions) => {
  const details = []

  if (conditions.friendship) details.push('high friendship')
  if (conditions.heldItem)
    details.push(`holding ${conditions.heldItem.replace(/-/g, ' ')}`)
  if (conditions.move)
    details.push(`knowing ${conditions.move.replace(/-/g, ' ')}`)
  if (conditions.text) details.push(conditions.text)

  if (details.length === 0) return null

  return `Claudemon substitute: level up at ${fallbackLevel(target)}; Gen VII condition: ${details.join(', ')}`
}

const evolutionRuleFor = (target, to) => {
  const evoType = target.evoType ?? (target.evoItem ? 'useItem' : 'level')
  const conditions = {}

  if (evoType === 'levelFriendship') conditions.friendship = true
  if (evoType === 'levelHold' && target.evoItem)
    conditions.heldItem = slug(target.evoItem)
  if (evoType === 'levelMove' && target.evoMove)
    conditions.move = slug(target.evoMove)
  if (target.evoCondition) conditions.text = target.evoCondition

  if (evoType === 'useItem') {
    return {
      to,
      trigger: 'use-item',
      level: null,
      item: slug(target.evoItem),
      conditions,
      substitute: null,
    }
  }

  if (evoType === 'trade') {
    if (target.evoItem) conditions.heldItem = slug(target.evoItem)

    return {
      to,
      trigger: 'trade',
      level: null,
      item: target.evoItem ? slug(target.evoItem) : null,
      conditions,
      substitute: target.evoCondition
        ? `Claudemon trade evolution preserves the Gen VII condition: ${target.evoCondition}`
        : null,
    }
  }

  return {
    to,
    trigger: 'level-up',
    level: fallbackLevel(target),
    item: null,
    conditions,
    substitute: evolutionSubstitute(target, conditions),
  }
}

const idFromUrl = (url) => {
  const match = /\/(\d+)\/?$/.exec(url ?? '')

  return match ? Number(match[1]) : null
}

const chainEdges = (chain, out = new Set()) => {
  if (!chain?.species) return out

  const from = idFromUrl(chain.species.url)

  for (const next of chain.evolves_to ?? []) {
    const to = idFromUrl(next.species?.url)

    if (from && to) out.add(`${from}:${to}`)
    chainEdges(next, out)
  }

  return out
}

export const buildEvolutionRules = (chain, includedRecords) => {
  const bySource = new Map(
    includedRecords.map((entry) => [
      entry.identity?.sourceKey ?? entry.sourceKey,
      entry,
    ]),
  )
  const evidence = chain ? chainEdges(chain.chain ?? chain) : null
  const rules = []

  for (const targetEntry of includedRecords) {
    const target = targetEntry.pkmnRecord ?? targetEntry

    if (!target.prevo) continue

    const source = bySource.get(toID(target.prevo))

    if (!source) continue

    const sourceIdentity = source.identity ?? source
    const targetIdentity = targetEntry.identity ?? targetEntry
    const edge = `${sourceIdentity.dexNumber}:${targetIdentity.dexNumber}`
    const rule = evolutionRuleFor(target, targetIdentity.id)

    rules.push({
      from: sourceIdentity.id,
      ...rule,
      sourceConfirmed: evidence ? evidence.has(edge) : true,
    })
  }

  return rules.sort((a, b) => a.from - b.from || a.to - b.to)
}

export const validateSpeciesDataset = (dataset, references = {}) => {
  const errors = []
  const ids = new Set()
  const sourceKeys = new Set()
  const types = new Set(references.types ?? [])
  const moves = new Set(references.moves ?? [])
  const abilities = new Set(references.abilities ?? [])
  const items = new Set(references.items ?? [])
  const growth = new Set(references.growth ?? [])

  for (const record of dataset) {
    if (ids.has(record.id)) errors.push(`duplicate species id ${record.id}`)
    if (sourceKeys.has(record.sourceKey))
      errors.push(`duplicate source key ${record.sourceKey}`)

    ids.add(record.id)
    sourceKeys.add(record.sourceKey)
  }

  for (let id = 1; id <= 809; id++) {
    if (!ids.has(id)) errors.push(`missing National Dex species ${id}`)
  }

  const baseCount = dataset.filter(
    (record) => record.id >= 1 && record.id <= 809 && record.formKey === null,
  ).length

  if (baseCount !== 809)
    errors.push(`expected 809 base species, got ${baseCount}`)

  for (const record of dataset) {
    if (!ids.has(record.baseSpecies))
      errors.push(
        `${record.sourceKey} references missing base species ${record.baseSpecies}`,
      )
    if (growth.size > 0 && !growth.has(record.growthRate))
      errors.push(
        `${record.sourceKey} references missing growth curve ${record.growthRate}`,
      )

    for (const type of record.types) {
      if (types.size > 0 && !types.has(type))
        errors.push(`${record.sourceKey} references missing type ${type}`)
    }

    for (const slot of record.abilities ?? []) {
      if (abilities.size > 0 && !abilities.has(slot.ability))
        errors.push(
          `${record.sourceKey} references missing ability ${slot.ability}`,
        )
    }

    for (const entry of record.learnset ?? []) {
      if (moves.size > 0 && !moves.has(entry.move))
        errors.push(`${record.sourceKey} references missing move ${entry.move}`)
    }

    for (const evolution of record.evolutions ?? []) {
      if (!ids.has(evolution.to))
        errors.push(
          `${record.sourceKey} evolves to missing species ${evolution.to}`,
        )
      if (evolution.item && items.size > 0 && !items.has(toID(evolution.item)))
        errors.push(
          `${record.sourceKey} references missing item ${evolution.item}`,
        )
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    counts: {
      species: dataset.length,
      baseSpecies: baseCount,
      forms: dataset.length - baseCount,
      collectibleForms: dataset.filter(
        (record) => record.formKey !== null && record.collectible,
      ).length,
      battleOnlyForms: dataset.filter((record) => record.battleOnly).length,
      evolutionRules: dataset.reduce(
        (sum, record) => sum + (record.evolutions?.length ?? 0),
        0,
      ),
      evolutionSubstitutes: dataset.reduce(
        (sum, record) =>
          sum +
          (record.evolutions ?? []).filter((evolution) => evolution.substitute)
            .length,
        0,
      ),
    },
  }
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
