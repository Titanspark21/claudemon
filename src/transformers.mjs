const mapMoveSlot = (slot) => {
  return {
    move: slot.move,
    pp: slot.pp,
    maxPp: slot.maxPp,
  }
}

const mapPokemon = (mon) => {
  return {
    species: mon.species,
    nickname: mon.nickname,
    exp: mon.exp,
    ivs: mon.ivs,
    stats: mon.stats,
    hp: mon.hp,
    moves: mon.moves ? mon.moves.map(mapMoveSlot) : [],
    status: mon.status,
    statusTurns: mon.statusTurns,
  }
}

const mapDex = (dex) => {
  return {
    seen: dex?.seen ?? [],
    caught: dex?.caught ?? [],
    faced: dex?.faced ?? {},
  }
}

const mapStats = (stats) => {
  return {
    battles: stats?.battles ?? 0,
    wins: stats?.wins ?? 0,
    losses: stats?.losses ?? 0,
    caught: stats?.caught ?? 0,
    runs: stats?.runs ?? 0,
  }
}

const mapSave = (save) => {
  return {
    version: save.version,
    trainer: save.trainer,
    party: save.party ? save.party.map(mapPokemon) : [],
    box: save.box ? save.box.map(mapPokemon) : [],
    bag: save.bag ?? {},
    money: save.money ?? 0,
    badges: save.badges ?? [],
    dex: mapDex(save.dex),
    stats: mapStats(save.stats),
  }
}

export const transformResponseSave = (save) => {
  if (!save) return null

  return mapSave(save)
}

export const transformRequestSaveGame = (save) => mapSave(save)

const mapStatusLead = (lead) => {
  if (!lead) return null

  return {
    name: lead.name,
    level: lead.level,
  }
}

const mapStatus = (status) => {
  return {
    lead: mapStatusLead(status.lead),
    balls: status.balls,
    money: status.money,
    caught: status.caught,
    heartbeat: status.heartbeat,
  }
}

export const transformResponseStatus = (status) => {
  if (!status) return null

  return mapStatus(status)
}

export const transformRequestWriteStatus = (status) => mapStatus(status)

const mapActivity = (entry) => {
  return {
    v: entry.v,
    session: entry.session,
    cwd: entry.cwd,
    at: entry.at,
    state: entry.state,
    tool: entry.tool,
    since: entry.since,
    lastStepAt: entry.lastStepAt,
    pendingSteps: entry.pendingSteps,
    message: entry.message,
  }
}

export const transformResponseActivity = (entry) => {
  if (!entry) return null

  return mapActivity(entry)
}

export const transformRequestWriteActivity = (entry) => mapActivity(entry)

const mapConfig = (config) => {
  return {
    encounterChance: config.encounterChance,
    trainerChance: config.trainerChance,
    charsPerStep: config.charsPerStep,
    maxSteps: config.maxSteps,
    workStepSeconds: config.workStepSeconds,
    sound: config.sound,
    bell: config.bell,
    updateCheck: config.updateCheck,
    encounterTtlSeconds: config.encounterTtlSeconds,
    spriteScale: config.spriteScale,
    wrappedStatusLine: config.wrappedStatusLine,
    probeRows: config.probeRows,
  }
}

export const transformResponseConfig = (config) => {
  if (!config) return null

  return mapConfig(config)
}

export const transformRequestWriteConfig = (config) => mapConfig(config)

const mapTrainerMon = (mon) => {
  return {
    species: mon.species,
    name: mon.name,
    level: mon.level,
  }
}

const mapTrainer = (trainer) => {
  if (!trainer) return { class: null, name: null, sprite: null, team: [] }

  return {
    class: trainer.class,
    name: trainer.name,
    sprite: trainer.sprite,
    team: trainer.team ? trainer.team.map(mapTrainerMon) : [],
  }
}

const mapTrainerEncounter = (entry) => {
  return {
    v: entry.v,
    kind: 'trainer',
    trainer: mapTrainer(entry.trainer),
    seed: entry.seed,
    session: entry.session,
    at: entry.at,
  }
}

const mapWildEncounter = (entry) => {
  return {
    v: entry.v,
    kind: 'wild',
    species: entry.species,
    name: entry.name,
    level: entry.level,
    seed: entry.seed,
    session: entry.session,
    at: entry.at,
  }
}

const mapEncounter = (entry) => {
  if (entry.kind === 'trainer') return mapTrainerEncounter(entry)

  return mapWildEncounter(entry)
}

export const transformResponseEncounter = (entry) => {
  if (!entry) return null

  return mapEncounter(entry)
}

export const transformRequestWriteEncounter = (entry) => mapEncounter(entry)

export const transformResponseManifest = (manifest) => {
  if (!manifest) return null

  return {
    version: manifest.version,
  }
}

const mapUpdateState = (state) => {
  return {
    checkedAt: state.checkedAt,
    latest: state.latest,
    error: state.error,
  }
}

export const transformResponseUpdateState = (state) => {
  if (!state) return null

  return mapUpdateState(state)
}

export const transformRequestWriteUpdateState = (state) => mapUpdateState(state)
