import { isWorking, readSessions, summariseActivity } from './activity.mjs'
import { species } from './data.mjs'
import { createBattle, submitAction, switchIn } from './battle.mjs'
import {
  encounterTtlMs,
  saveConfig,
  spriteScale,
  updateCheckMode,
} from './config.mjs'
import { expFromDefeating } from './exp.mjs'
import {
  applyVictory,
  describeStep,
  learnEvolutionMoves,
  learnMove,
} from './progression.mjs'
import { createPokemon, displayName, isFainted, levelOf } from './pokemon.mjs'
import { clearEncounter, encounterExpiresAt, readEncounter } from './queue.mjs'
import { makeRng, randomSeed } from './rng.mjs'
import {
  ballsInBag,
  countOf,
  ITEMS,
  buy,
  itemsInBag,
  removeItem,
  useItem,
  usableOnParty,
} from './shop.mjs'
import { play, startMusic, stopMusic } from './sound.mjs'
import {
  activePokemon,
  addPokemon,
  createSave,
  depositPokemon,
  healParty,
  markCaught,
  markFaced,
  markSeen,
  publishStatus,
  saveGame,
  setLead,
  withdrawPokemon,
} from './state.mjs'
import { checkForUpdate, createUpdateRun, currentNotice } from './update.mjs'
import { ballSteps } from './ui/ball.mjs'

import * as battleView from './ui/views/battle.mjs'
import * as boxView from './ui/views/box.mjs'
import * as dexView from './ui/views/dex.mjs'
import * as homeView from './ui/views/home.mjs'
import * as optionsView from './ui/views/options.mjs'
import * as shopView from './ui/views/shop.mjs'
import * as starterView from './ui/views/starter.mjs'
import * as teamView from './ui/views/team.mjs'
import * as updateView from './ui/views/update.mjs'

const VIEWS = {
  starter: starterView,
  home: homeView,
  battle: battleView,
  dex: dexView,
  team: teamView,
  box: boxView,
  shop: shopView,
  options: optionsView,
  update: updateView,
}

const BATTLE_ITEM_KINDS = new Set(['heal', 'cure', 'revive'])

const HP_DRAIN_STEPS = 24

const FRAMES_PER_STEP = 2

const FRAMES_PER_SPIN = 3

export function createApp({
  screen,
  save,
  config,
  makeUpdateRun = createUpdateRun,
  playSound = play,
  playMusic = startMusic,
  endMusic = stopMusic,
}) {
  let spinFrames = 0
  let checking = false

  const ctx = {
    screen,
    save,
    config,
    spriteScale: spriteScale(config),
    rng: makeRng(randomSeed()),

    mode: save ? 'home' : 'starter',

    encounter: null,

    activity: { state: 'unknown', tool: null, since: null, sessions: 0 },

    scene: { step: 0, frames: 0 },

    homeSelection: 0,
    dexSelection: 0,
    teamSelection: 0,
    boxSelection: 0,

    boxMessage: null,

    bagSelection: null,
    bagMessage: null,

    shopSelection: 0,
    shopMessage: null,
    optionsSelection: 0,
    optionsMessage: null,
    notice: null,

    updateNotice: currentNotice(),

    update: null,
    updateFrame: 0,

    setup: { step: 'name', name: '', selection: 1, blink: true },
    battle: null,
  }

  ctx.paint = () => {
    const view = VIEWS[ctx.mode]
    if (!view) return
    const { lines, overlays } = view.draw(ctx, screen.size())
    screen.render(lines, overlays)
  }

  ctx.setMode = (mode) => {
    ctx.mode = mode
    screen.repaint()
    ctx.paint()
  }

  ctx.quit = () => {
    if (ctx.save) saveGame(ctx.save)
    ctx.stopMusic()
    screen.stop()
    process.exit(0)
  }

  ctx.persist = () => {
    if (ctx.save) saveGame(ctx.save)
  }

  ctx.playSound = (name) => {
    if (ctx.config?.sound === false) return
    playSound(name)
  }

  ctx.playMusic = (name) => {
    if (ctx.config?.sound === false) return
    playMusic(name)
  }

  ctx.stopMusic = () => {
    endMusic()
  }

  ctx.applyConfig = (patch) => {
    try {
      ctx.config = saveConfig(patch)
      ctx.optionsMessage = null
    } catch (error) {
      ctx.optionsMessage = `Could not save: ${error.code ?? error.message}`
      return
    }

    ctx.spriteScale = spriteScale(ctx.config)
    if (ctx.config?.sound === false) ctx.stopMusic()
    screen.repaint()
  }

  ctx.pump = () => {
    const ttlMs = encounterTtlMs(ctx.config)
    const next = readEncounter(ttlMs)

    if (!next) {
      if (!ctx.encounter) return false
      ctx.encounter = null
      ctx.homeSelection = Math.max(0, ctx.homeSelection - 1)
      return true
    }

    if (isSameEncounter(next, ctx.encounter)) return false

    ctx.encounter = { ...next, expiresAt: encounterExpiresAt(next, ttlMs) }
    ctx.homeSelection = 0
    if (ctx.save) {
      markSeen(ctx.save, next.species)
      ctx.persist()
    }
    return true
  }

  ctx.refreshActivity = () => {
    const previous = ctx.activity
    const next = summariseActivity(readSessions())
    ctx.activity = next

    if (
      previous.state === 'working' &&
      (next.state === 'idle' || next.state === 'waiting')
    ) {
      if (ctx.config.bell) screen.bell?.()
    }

    return (
      next.state !== previous.state ||
      next.tool !== previous.tool ||
      next.sessions !== previous.sessions
    )
  }

  ctx.refreshUpdateNotice = () => {
    const previous = ctx.updateNotice
    ctx.updateNotice = currentNotice()

    if (
      previous?.kind === ctx.updateNotice?.kind &&
      previous?.version === ctx.updateNotice?.version
    ) {
      return false
    }
    screen.repaint()
    return true
  }

  ctx.checkForUpdates = async ({ atLaunch = false } = {}) => {
    if (checking) return false
    checking = true
    try {
      await checkForUpdate({
        config: ctx.config,
        force: atLaunch && updateCheckMode(ctx.config) === 'launch',
      })
    } catch {
    } finally {
      checking = false
    }
    return ctx.refreshUpdateNotice()
  }

  ctx.handleKey = (key) => {
    if (key.name === 'ctrl-c') {
      ctx.quit()
      return
    }
    VIEWS[ctx.mode]?.onKey(ctx, key)
    ctx.paint()
  }

  ctx.startUpdate = () => {
    if (ctx.update?.state === 'running') return

    const run = makeUpdateRun({
      onChange: () => {
        if (ctx.mode === 'update') ctx.paint()
      },
    })

    run.promise
      .then(() => {
        ctx.refreshUpdateNotice()
        if (ctx.mode === 'update') ctx.paint()
      })
      .catch(() => {})

    ctx.update = run
    ctx.updateFrame = 0
    spinFrames = 0
    ctx.setMode('update')
  }

  ctx.finishUpdate = () => {
    ctx.update = null
    ctx.homeSelection = 0
    ctx.setMode('home')
  }

  ctx.tickUpdate = () => {
    if (ctx.mode !== 'update' || ctx.update?.state !== 'running') return false

    spinFrames++
    if (spinFrames % FRAMES_PER_SPIN !== 0) return false

    ctx.updateFrame++
    return true
  }

  ctx.finishSetup = (starterId) => {
    ctx.save = createSave({
      trainer: ctx.setup.name.trim() || 'Trainer',
      starterId,
      rng: ctx.rng,
    })
    ctx.persist()
    ctx.notice = `${species(starterId).name} is yours. Good luck!`
    ctx.setMode('home')
  }

  ctx.openHomeSelection = (id) => {
    switch (id) {
      case 'fight':
        ctx.startNextBattle()
        break
      case 'dex':
        ctx.setMode('dex')
        break
      case 'team':
        ctx.teamSelection = 0
        ctx.clearTeamMessages()
        ctx.closeBag()
        ctx.setMode('team')
        break
      case 'shop':
        ctx.shopSelection = 0
        ctx.shopMessage = null
        ctx.setMode('shop')
        break
      case 'options':
        ctx.optionsSelection = 0
        ctx.optionsMessage = null
        ctx.setMode('options')
        break
      case 'heal':
        if (isWorking(ctx.activity)) {
          ctx.notice = 'Not while Claude is working — rest when it does.'
          break
        }
        healParty(ctx.save)
        ctx.persist()
        ctx.notice = 'Your team is back to full health.'
        break
      case 'quit':
        ctx.quit()
        break
      default:
        break
    }
  }

  ctx.makeLead = (index) => {
    setLead(ctx.save, index)
    ctx.teamSelection = 0
    ctx.persist()
  }

  ctx.openBox = () => {
    ctx.boxSelection = 0
    ctx.boxMessage = null
    ctx.setMode('box')
  }

  ctx.depositToBox = (index) => {
    const mon = ctx.save.party[index]
    if (!mon) return

    if (!depositPokemon(ctx.save, index)) {
      ctx.boxMessage = 'That is your last Pokémon — somebody has to fight.'
      return
    }

    ctx.teamSelection = Math.min(index, ctx.save.party.length - 1)
    ctx.boxMessage = `${displayName(mon).toUpperCase()} went to the box.`
    ctx.persist()
  }

  ctx.withdrawFromBox = (index) => {
    const mon = ctx.save.box[index]
    if (!mon) return

    if (!withdrawPokemon(ctx.save, index)) {
      ctx.boxMessage = 'Your team is full. Send one to the box first.'
      return
    }

    ctx.boxSelection = Math.min(index, Math.max(0, ctx.save.box.length - 1))
    ctx.boxMessage = `${displayName(mon).toUpperCase()} joined your team.`
    ctx.persist()
  }

  ctx.clearTeamMessages = () => {
    ctx.boxMessage = null
    ctx.bagMessage = null
  }

  ctx.openBag = () => {
    if (itemsInBag(ctx.save).length === 0) {
      ctx.bagMessage =
        'Your bag is empty — the shop sells balls, potions and stones.'
      return
    }
    ctx.bagSelection = 0
    ctx.bagMessage = null
  }

  ctx.closeBag = () => {
    ctx.bagSelection = null
    ctx.bagMessage = null
  }

  ctx.useFromBag = (key, index) => {
    const mon = ctx.save.party[index]
    if (!key || !mon) return

    if (!usableOnParty(key)) {
      ctx.bagMessage = `Save the ${ITEMS[key].name} for something in the grass.`
      return
    }

    const result = applyItem(ctx, key, mon)

    const taught = (result.steps ?? []).flatMap(describeStep)
    if (result.steps?.some((step) => step.kind === 'learn-choice')) {
      taught.push('There was no room for it, so it kept the four it knows.')
    }
    ctx.bagMessage =
      taught.length > 0 ? [result.message, ...taught] : result.message
    if (!result.ok) return

    ctx.persist()
    ctx.bagSelection = null
  }

  ctx.buyItem = (key, quantity) => {
    const result = buy(ctx.save, key, quantity)
    ctx.shopMessage = result.ok
      ? `Bought ${quantity} ${ITEMS[key].name}. Thank you!`
      : result.reason
    if (result.ok) ctx.persist()
  }

  ctx.startNextBattle = () => {
    const encounter = ctx.encounter
    if (!encounter) return

    const lead = activePokemon(ctx.save)
    if (!lead) {
      ctx.notice = 'Your whole team has fainted. Heal before heading out.'
      return
    }

    ctx.encounter = null
    clearEncounter()

    const wild = createPokemon(
      encounter.species,
      encounter.level,
      makeRng(encounter.seed),
    )
    markFaced(ctx.save, encounter.species)

    const state = createBattle({
      playerMon: lead,
      wildMon: wild,
      seed: encounter.seed,
    })

    ctx.battle = {
      state,
      menu: 'main',
      selection: 0,
      message: null,
      events: [],
      hp: liveHp(state),
      hpTarget: liveHp(state),
      effect: null,
      ball: null,
      postSteps: null,
      learnStep: null,
      bagItems: [],
      bagItem: null,
    }

    ctx.save.stats.battles++
    queueMessages(ctx, [`A wild ${displayName(wild).toUpperCase()} appeared!`])
    ctx.playMusic('battle')
    ctx.setMode('battle')
  }

  ctx.advanceMessage = () => {
    const battle = ctx.battle
    if (!battle) return

    if (battle.ball && !battle.ball.done) {
      settleBall(battle)
      return
    }

    if (playNextBeat(ctx)) return

    if (battle.postSteps) {
      processNextStep(ctx)
      return
    }

    if (battle.state.over) {
      finishBattle(ctx)
      return
    }

    openMenu(battle, 'main')
  }

  ctx.tickBattle = () => {
    const battle = ctx.battle
    if (!battle) return false

    let moved = false

    if (battle.ball && !battle.ball.done) {
      const next = battle.ball.frame + 1
      if (next < ballSteps(battle.ball).length) {
        battle.ball = { ...battle.ball, frame: next }
      } else {
        settleBall(battle)
        ctx.advanceMessage()
        if (!ctx.battle) return true
      }
      moved = true
    }

    if (battle.effect) {
      const next = battle.effect.frame + 1
      battle.effect =
        next < battleView.HIT_FRAMES.length
          ? { ...battle.effect, frame: next }
          : null
      moved = true
    }

    for (const side of ['player', 'foe']) {
      const shown = battle.hp[side]
      const target = battle.hpTarget[side]
      if (shown === target) continue

      const step = Math.max(
        1,
        Math.ceil(battle.state[side].mon.stats.hp / HP_DRAIN_STEPS),
      )
      battle.hp[side] =
        target > shown
          ? Math.min(target, shown + step)
          : Math.max(target, shown - step)
      moved = true
    }

    return moved
  }

  ctx.backOutOfBattleMenu = () => {
    const battle = ctx.battle
    if (!battle || battle.menu === 'learn') return

    if (battle.menu === 'target') {
      const index = battle.bagItems.indexOf(battle.bagItem)
      battle.bagItem = null
      openMenu(battle, 'bag')
      if (index >= 0) battle.selection = index
      return
    }

    openMenu(battle, 'main')
  }

  ctx.chooseBattleOption = () => {
    const battle = ctx.battle
    if (!battle) return

    switch (battle.menu) {
      case 'main':
        return chooseMainOption(ctx)
      case 'fight':
        return chooseMove(ctx)
      case 'bag':
        return chooseItem(ctx)
      case 'target':
        return chooseItemTarget(ctx)
      case 'party':
        return choosePartyMember(ctx)
      case 'learn':
        return resolveLearnChoice(ctx)
      default:
        return undefined
    }
  }

  ctx.tickScene = () => {
    if (ctx.mode !== 'home' || ctx.activity.state !== 'working') return false

    ctx.scene.frames++
    if (ctx.scene.frames % FRAMES_PER_STEP !== 0) return false

    ctx.scene.step++
    return true
  }

  return ctx
}

function isSameEncounter(entry, held) {
  return held != null && entry.at === held.at && entry.seed === held.seed
}

function liveHp(state) {
  return { player: state.player.mon.hp, foe: state.foe.mon.hp }
}

function syncBars(battle) {
  battle.hp = liveHp(battle.state)
  battle.hpTarget = { ...battle.hp }
}

function queueEvents(ctx, events) {
  const battle = ctx.battle
  battle.events.push(...events)
  if (!battle.message) playNextBeat(ctx)
}

function queueMessages(ctx, texts) {
  queueEvents(
    ctx,
    texts.map((text) => ({ type: 'message', text })),
  )
}

function playNextBeat(ctx) {
  const battle = ctx.battle

  battle.hp = { ...battle.hpTarget }

  applyPendingEvents(ctx)

  const next = battle.events.shift()
  battle.message = next ? next.text : null
  applyPendingEvents(ctx)

  return battle.message != null
}

function applyPendingEvents(ctx) {
  const battle = ctx.battle
  while (battle.events.length > 0 && battle.events[0].type !== 'message') {
    applyBattleEvent(ctx, battle.events.shift())
  }
}

function applyBattleEvent(ctx, event) {
  const battle = ctx.battle

  switch (event.type) {
    case 'damage':
    case 'heal':
      battle.hpTarget[event.side] = event.hpAfter
      if (event.type === 'damage' && event.amount > 0) {
        battle.effect = { side: event.side, frame: 0 }
      }
      break
    case 'catch':
      battle.ball = {
        shakes: event.shakes,
        caught: event.caught,
        frame: 0,
        done: false,
      }
      break
    case 'end':
      if (event.outcome === 'win' || event.outcome === 'caught')
        ctx.playMusic('victory')
      break
    default:
      break
  }
}

function settleBall(battle) {
  battle.ball = battle.ball.caught
    ? { ...battle.ball, frame: ballSteps(battle.ball).length - 1, done: true }
    : null
}

function openMenu(battle, name) {
  battle.menu = name
  battle.selection = 0
  syncBars(battle)
}

function chooseMainOption(ctx) {
  const battle = ctx.battle

  switch (battle.selection) {
    case 0:
      openMenu(battle, 'fight')
      break
    case 1:
      battle.bagItems = usableBattleItems(ctx.save)
      openMenu(battle, 'bag')
      break
    case 2:
      openMenu(battle, 'party')
      break
    case 3:
      takeAction(ctx, { type: 'run' })
      break
    default:
      break
  }
}

function applyItem(ctx, key, mon) {
  const result = useItem(ctx.save, key, mon)
  if (!result.evolvedInto) return result

  markCaught(ctx.save, result.evolvedInto)
  return { ...result, steps: learnEvolutionMoves(mon) }
}

function usableBattleItems(save) {
  const balls = ballsInBag(save)
  const others = Object.keys(ITEMS).filter(
    (key) => BATTLE_ITEM_KINDS.has(ITEMS[key].kind) && countOf(save, key) > 0,
  )
  return [...balls, ...others]
}

function chooseMove(ctx) {
  const battle = ctx.battle
  const slot = battle.state.player.mon.moves[battle.selection]
  if (!slot) return

  if (slot.pp <= 0) {
    queueMessages(ctx, ['There is no PP left for that move!'])
    return
  }
  takeAction(ctx, { type: 'move', index: battle.selection })
}

function chooseItem(ctx) {
  const battle = ctx.battle
  const key = battle.bagItems[battle.selection]
  if (!key) return

  if (ITEMS[key].kind === 'ball') {
    removeItem(ctx.save, key)
    takeAction(ctx, { type: 'ball', key })
    return
  }

  battle.bagItem = key
  openMenu(battle, 'target')
}

function chooseItemTarget(ctx) {
  const battle = ctx.battle
  const key = battle.bagItem
  const mon = ctx.save.party[battle.selection]
  if (!key || !mon) return

  const before = mon.hp
  const result = applyItem(ctx, key, mon)
  battle.bagItem = null

  if (!result.ok) {
    queueMessages(ctx, [result.message])
    return
  }

  const onField = mon === battle.state.player.mon
  queueEvents(ctx, [
    {
      type: 'message',
      text: `You used a ${ITEMS[key].name} on ${displayName(mon).toUpperCase()}.`,
    },
    { type: 'message', text: result.message },
    ...(!onField || mon.hp === before
      ? []
      : [
          {
            type: 'heal',
            side: 'player',
            amount: mon.hp - before,
            hpAfter: mon.hp,
          },
        ]),
  ])

  takeAction(ctx, { type: 'item' }, { silentFirst: true })
}

function choosePartyMember(ctx) {
  const battle = ctx.battle
  const index = battle.selection
  const chosen = ctx.save.party[index]
  if (!chosen) return

  if (isFainted(chosen)) {
    queueMessages(ctx, [
      `${displayName(chosen).toUpperCase()} is in no shape to fight!`,
    ])
    return
  }
  if (chosen === battle.state.player.mon) {
    queueMessages(ctx, [`${displayName(chosen).toUpperCase()} is already out!`])
    return
  }

  setLead(ctx.save, index)
  switchIn(battle.state, chosen)
  syncBars(battle)

  queueMessages(ctx, [`Go, ${displayName(chosen).toUpperCase()}!`])
  takeAction(ctx, { type: 'switch' }, { silentFirst: true })
}

function takeAction(ctx, action, options = {}) {
  const battle = ctx.battle
  battle.menu = null
  queueEvents(ctx, submitAction(battle.state, action))

  if (battle.state.over) beginPostBattle(ctx)
  else if (!battle.message && !options.silentFirst) openMenu(battle, 'main')
}

function beginPostBattle(ctx) {
  const battle = ctx.battle
  const state = battle.state
  const save = ctx.save

  if (state.outcome === 'win') {
    save.stats.wins++
    battle.postSteps = applyVictory(save, state.participants, state.rewards)
    return
  }

  if (state.outcome === 'caught') {
    const caught = state.foe.mon
    caught.hp = Math.max(1, caught.hp)
    const destination = addPokemon(save, caught)

    const rewards = {
      exp: expFromDefeating(caught.species, levelOf(caught)),
      money: 0,
    }
    battle.postSteps = [
      { kind: 'caught', name: displayName(caught), destination },
      ...applyVictory(save, state.participants, rewards),
    ]
    return
  }

  if (state.outcome === 'fled') {
    save.stats.runs++
    battle.postSteps = []
    return
  }

  const next = activePokemon(save)
  if (state.outcome === 'loss' && next) {
    battle.postSteps = [{ kind: 'send-out', mon: next }]
    return
  }

  save.stats.losses++
  battle.postSteps = [{ kind: 'blackout' }]
}

function processNextStep(ctx) {
  const battle = ctx.battle
  const steps = battle.postSteps

  if (!steps || steps.length === 0) {
    finishBattle(ctx)
    return
  }

  const step = steps.shift()

  if (step.kind === 'learn-choice') {
    battle.learnStep = step
    openMenu(battle, 'learn')
    battle.message = null
    return
  }

  if (step.kind === 'caught') {
    const where =
      step.destination === 'party'
        ? 'It joined your team!'
        : 'Your team was full, so it went to the box.'
    queueMessages(ctx, [
      `${step.name.toUpperCase()} was added to the Pokédex.`,
      where,
    ])
    return
  }

  if (step.kind === 'send-out') {
    const foe = battle.state.foe.mon
    battle.state = createBattle({
      playerMon: step.mon,
      wildMon: foe,
      seed: (battle.state.seed + battle.state.turn + 1) >>> 0,
      participants: battle.state.participants,
    })
    battle.postSteps = null
    syncBars(battle)
    queueMessages(ctx, [`Go, ${displayName(step.mon).toUpperCase()}!`])
    return
  }

  if (step.kind === 'blackout') {
    const messages = [
      'You have no Pokémon able to fight!',
      'You scurried back to safety...',
    ]

    if (isWorking(ctx.activity)) {
      messages.push(
        'There is no rest while Claude works — your team stays down.',
      )
    } else {
      healParty(ctx.save)
    }

    queueMessages(ctx, messages)
    syncBars(battle)
    return
  }

  queueMessages(ctx, describeStep(step))
}

function resolveLearnChoice(ctx) {
  const battle = ctx.battle
  const step = battle.learnStep
  const mon = step.mon
  const declineIndex = mon.moves.length

  if (battle.selection === declineIndex) {
    queueMessages(ctx, [
      `${displayName(mon).toUpperCase()} did not learn the move.`,
    ])
  } else {
    const result = learnMove(mon, step.move, battle.selection)
    queueMessages(ctx, [
      '1, 2 and... poof!',
      `${displayName(mon).toUpperCase()} forgot ${result.forgot} and learned a new move!`,
    ])
  }

  battle.learnStep = null
  battle.menu = null
}

function finishBattle(ctx) {
  ctx.stopMusic()
  ctx.battle = null
  ctx.persist()
  publishStatus(ctx.save)
  ctx.pump()
  ctx.homeSelection = 0
  ctx.setMode('home')
}
