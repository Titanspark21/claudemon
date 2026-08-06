export const stageMultiplier = (stage) => {
  return stage >= 0 ? (2 + stage) / 2 : 2 / (2 - stage)
}

export const effectiveSpeed = (actor) => {
  const base = actor.mon.stats.speed * stageMultiplier(actor.stages.speed)

  return actor.mon.status === 'paralysis' ? base / 2 : base
}

export const moveSlotOf = (actor, index) => {
  const slot = actor.mon.moves[index]

  return slot?.pp > 0 ? slot : null
}
