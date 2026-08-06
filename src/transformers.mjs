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

export const transformResponseSave = (save) => {
  if (!save) return null

  return {
    version: save.version,
    trainer: save.trainer,
    party: save.party ? save.party.map(mapPokemon) : [],
    box: save.box ? save.box.map(mapPokemon) : [],
    bag: save.bag ?? {},
    money: save.money ?? 0,
    dex: mapDex(save.dex),
    stats: mapStats(save.stats),
  }
}

export const transformRequestSaveGame = (save) => {
  return {
    version: save.version,
    trainer: save.trainer,
    party: save.party ? save.party.map(mapPokemon) : [],
    box: save.box ? save.box.map(mapPokemon) : [],
    bag: save.bag ?? {},
    money: save.money ?? 0,
    dex: mapDex(save.dex),
    stats: mapStats(save.stats),
  }
}

const mapStatusLead = (lead) => {
  if (!lead) return null

  return {
    name: lead.name,
    level: lead.level,
  }
}

export const transformResponseStatus = (status) => {
  if (!status) return null

  return {
    lead: mapStatusLead(status.lead),
    balls: status.balls,
    money: status.money,
    caught: status.caught,
    heartbeat: status.heartbeat,
  }
}

export const transformRequestWriteStatus = (status) => {
  return {
    lead: mapStatusLead(status.lead),
    balls: status.balls,
    money: status.money,
    caught: status.caught,
    heartbeat: status.heartbeat,
  }
}

export const transformResponseActivity = (entry) => {
  if (!entry) return null

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

export const transformRequestWriteActivity = (entry) => {
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

export const transformResponseConfig = (config) => {
  if (!config) return null

  return {
    encounterChance: config.encounterChance,
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

export const transformRequestWriteConfig = (config) => {
  return {
    encounterChance: config.encounterChance,
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

export const transformResponseEncounter = (entry) => {
  if (!entry) return null

  return {
    v: entry.v,
    species: entry.species,
    name: entry.name,
    level: entry.level,
    seed: entry.seed,
    session: entry.session,
    at: entry.at,
  }
}

export const transformRequestWriteEncounter = (entry) => {
  return {
    v: entry.v,
    species: entry.species,
    name: entry.name,
    level: entry.level,
    seed: entry.seed,
    session: entry.session,
    at: entry.at,
  }
}

export const transformResponseManifest = (manifest) => {
  if (!manifest) return null

  return {
    version: manifest.version,
  }
}

export const transformResponseUpdateState = (state) => {
  if (!state) return null

  return {
    checkedAt: state.checkedAt,
    latest: state.latest,
    error: state.error,
  }
}

export const transformRequestWriteUpdateState = (state) => {
  return {
    checkedAt: state.checkedAt,
    latest: state.latest,
    error: state.error,
  }
}
