import { recordAchievements } from './achievements.mjs'
import { isWorking, readSessions, summariseActivity } from './activity.mjs'
import {
  BAG_MESSAGES,
  BAG_MODES,
  BATTLE_MESSAGES,
  BOX_MESSAGES,
  CARD_WRITTEN_PREFIX,
  DAYCARE_MESSAGES,
  DAYCARE_STEPS_PER_SAVE,
  EMPTY_WORKED,
  FRAMES_PER_DAYCARE_STEP,
  FRAMES_PER_SPIN,
  FRAMES_PER_STEP,
  GYM_MESSAGES,
  HOME_NOTICES,
  LEAGUE_MESSAGES,
  TRADE_MESSAGES,
  TRAINER_MESSAGES,
  MAX_LEVEL,
  MOVE_LIMIT,
  MOVE_ORDER_MESSAGES,
} from './constants.mjs'
import { move as moveData, species } from './data.mjs'
import { DEFAULT_DEX_FILTER } from './dexFilter.mjs'
import { createBattle } from './battle.mjs'
import {
  eggFromPair,
  eggIsReady,
  hatchEgg,
  leaveAtDaycare,
  raiseDaycare,
  takeBackFromDaycare,
  walkEgg,
} from './daycare.mjs'
import { encounterSpecies } from './encounter.mjs'
import {
  advanceExpedition,
  chooseBiomePath as chooseExpeditionPath,
} from './expedition.mjs'
import {
  advanceMessage,
  backOutOfBattleMenu,
  chooseBattleOption,
  createBattleFlow,
  queueMessages,
  tickBattle,
  toggleBattleMega,
} from './battleFlow.mjs'
import {
  encounterTtlMs,
  saveConfig,
  spriteScale,
  updateCheckMode,
} from './config.mjs'
import {
  advanceGymRun,
  createGymRun,
  currentOpponent,
  gymBattleSeed,
  gymById,
  gymIndex,
  gymOf,
  isGymCleared,
  rollbackGymRun,
} from './gym.mjs'
import {
  advanceLeague,
  currentLeagueOpponent,
  leagueBattleSeed,
  leagueUnlocked,
  rollbackLeagueRun,
  startLeague,
} from './league.mjs'
import { canSpare } from './helpers.mjs'
import { giveHeldItem, applyItem, takeHeldItem } from './itemUse.mjs'
import { nextMoveSlot, reorderMoveSlots } from './moveOrder.mjs'
import {
  completeMoveRecovery,
  moveRecoveryStatusText,
  relearnableMoves,
} from './moveRecovery.mjs'
import {
  describeStep,
  pendingMoveChoice,
  queueMoveChoices,
  resolveMoveChoice,
} from './progression.mjs'
import {
  createPokemon,
  displayName,
  levelOf,
  makeMoveSlot,
  pendingEvolution,
} from './pokemon.mjs'
import {
  clearEncounter,
  encounterExpiresAt,
  readEncounterResult,
} from './queue.mjs'
import { CARD_FILE } from './paths.mjs'
import { copyToClipboard } from './clipboard.mjs'
import { decodeTrade, giveAway, takeIn, writeTradeCode } from './trade.mjs'
import { makeRng, randomSeed } from './rng.mjs'
import { buy, itemInfo, itemsInBag, usableOnParty } from './shop.mjs'
import {
  awardProgressionHeldItems,
  canHoldItem,
  rollWildHeldItem,
} from './heldItems.mjs'
import { revealFile } from './reveal.mjs'
import { play, startMusic, stopMusic } from './sound.mjs'
import {
  activePokemon,
  addPokemon,
  awardBadge,
  createSave,
  depositPokemon,
  hasBadge,
  healParty,
  markFaced,
  markSeen,
  saveGame,
  setLead,
  withdrawPokemon,
} from './state.mjs'
import { sentOutLine, trainerClass, trainerLabel } from './trainer.mjs'
import { checkForUpdate, createUpdateRun, currentNotice } from './update.mjs'
import { readWorked } from './worked.mjs'

import { writeCard } from './ui/card.mjs'
import * as bagView from './ui/views/bag.mjs'
import * as battleView from './ui/views/battle.mjs'
import * as boxView from './ui/views/box.mjs'
import * as daycareView from './ui/views/daycare.mjs'
import * as dexView from './ui/views/dex.mjs'
import * as gymView from './ui/views/gym.mjs'
import * as gymsView from './ui/views/gyms.mjs'
import * as homeView from './ui/views/home.mjs'
import * as leagueView from './ui/views/league.mjs'
import * as optionsView from './ui/views/options.mjs'
import * as shopView from './ui/views/shop.mjs'
import * as starterView from './ui/views/starter.mjs'
import * as teamView from './ui/views/team.mjs'
import * as tradeView from './ui/views/trade.mjs'
import * as trainerView from './ui/views/trainer.mjs'
import * as updateView from './ui/views/update.mjs'
import { partyEntryAt, sortedPartyEntries } from './ui/views/helpers.mjs'

const selectedPartyMon = (ctx) => {
  return partyEntryAt(ctx.save.party, ctx.teamSelection, ctx.teamSort).mon
}

const VIEWS = {
  starter: starterView,
  home: homeView,
  battle: battleView,
  dex: dexView,
  team: teamView,
  bag: bagView,
  box: boxView,
  daycare: daycareView,
  shop: shopView,
  options: optionsView,
  update: updateView,
  gyms: gymsView,
  gym: gymView,
  league: leagueView,
  trade: tradeView,
  trainer: trainerView,
}

const activeView = (ctx) => {
  if (ctx.save?.moveChoices.length && !ctx.battle) return VIEWS.bag
  if (ctx.bagSelection !== null && BAG_MODES.has(ctx.mode)) return VIEWS.bag

  return VIEWS[ctx.mode]
}

export const createApp = ({
  screen,
  save,
  config,
  makeUpdateRun = createUpdateRun,
  playSound = play,
  revealCard = revealFile,
  saveCard = writeCard,
  copyCode = copyToClipboard,
  saveCode = writeTradeCode,
  playMusic = startMusic,
  endMusic = stopMusic,
}) => {
  let spinFrames = 0
  let daycareFrames = 0
  let daycareSteps = 0
  let checking = false

  const ctx = {
    screen,
    save,
    config,
    spriteScale: spriteScale(config),
    rng: makeRng(randomSeed()),

    mode: save ? 'home' : 'starter',

    encounter: null,

    activity: {
      state: 'unknown',
      tool: null,
      since: null,
      sessions: 0,
      activeSince: null,
    },

    scene: { step: 0, frames: 0 },

    homeSelection: 0,
    biomeSelection:
      save?.expedition?.optionalOffered && !save?.expedition?.pendingDeparture
        ? 1
        : 0,
    dexSelection: 0,
    dexSort: 'number',
    dexFilter: { ...DEFAULT_DEX_FILTER },
    dexSearchActive: false,
    dexFilterHelp: false,
    teamSelection: 0,
    teamSort: 'order',
    teamStep: 'list',
    relearnSelection: 0,
    relearnMessage: null,
    moveOrderSelection: 0,
    moveOrderHeld: false,
    moveOrderMessage: null,
    moveOrderSnapshot: null,
    boxSelection: 0,
    boxSort: 'order',

    boxMessage: null,

    daycareFrom: 'home',
    daycareStep: 'slots',
    daycareSelection: 0,
    daycarePickSelection: 0,
    daycareMessage: null,

    bagSelection: null,
    bagMessage: null,
    moveSelection: 0,

    shopSelection: 0,
    shopMessage: null,

    tradeFrom: 'team',
    tradeStep: 'confirm',
    tradeGiving: null,
    tradeInput: '',
    tradeMessage: null,
    tradeCode: null,
    tradeGone: null,
    tradeCopied: false,
    tradePath: null,

    gym: null,
    gymSelection: 0,
    gymMessage: null,
    gymLeaving: false,

    league: null,
    leagueMessage: null,
    leagueLeaving: false,

    optionsSelection: 0,
    optionsMessage: null,
    notice: null,

    trainerSelection: 0,
    worked: { ...EMPTY_WORKED },

    updateNotice: currentNotice(),

    update: null,
    updateFrame: 0,

    setup: { step: 'name', name: '', selection: 1, blink: true },
    battle: null,
  }

  ctx.paint = () => {
    const view = activeView(ctx)

    const { lines, overlays } = view.draw(ctx, screen.size())

    screen.render(lines, overlays)
  }

  ctx.setMode = (mode) => {
    ctx.mode = mode
    screen.repaint()
    ctx.paint()
  }

  ctx.quit = () => {
    if (!ctx.battle || ctx.battle.state.over) ctx.persist()

    ctx.stopMusic()
    screen.stop()
    process.exit(0)
  }

  ctx.syncExpedition = () => {
    if (!ctx.save?.expedition) {
      return { changed: false, departed: false, events: [] }
    }

    ctx.worked = readWorked()

    const before = JSON.stringify(ctx.save.expedition)
    const events = advanceExpedition(ctx.save.expedition, ctx.worked.totalMs)
    const departed = ctx.save.expedition.pendingDeparture != null

    if (events.some((event) => event.type === 'optional-fork'))
      ctx.biomeSelection = 1
    if (events.some((event) => event.type === 'forced-departure'))
      ctx.biomeSelection = 0

    return {
      changed: before !== JSON.stringify(ctx.save.expedition),
      departed,
      events,
    }
  }

  ctx.chooseBiomePath = (choice) => {
    const expedition = ctx.save?.expedition

    if (!expedition) return false

    const before = JSON.stringify(expedition)
    const biome = expedition.biome

    chooseExpeditionPath(expedition, choice)

    if (before === JSON.stringify(expedition)) return false

    if (expedition.biome !== biome) {
      clearEncounter()
      ctx.encounter = null
      ctx.homeSelection = Math.max(0, ctx.homeSelection - 1)
    }

    ctx.biomeSelection =
      expedition.optionalOffered && !expedition.pendingDeparture ? 1 : 0
    ctx.persist()

    return true
  }

  ctx.persist = () => {
    if (ctx.gym || ctx.league) return
    if (!ctx.save) return

    ctx.syncExpedition()
    recordAchievements(ctx.save, ctx.worked)
    ctx.save = saveGame(ctx.save)
  }

  ctx.playSound = (name) => {
    if (ctx.config.sound === false) return

    playSound(name)
  }

  ctx.playMusic = (name) => {
    if (ctx.config.sound === false) return

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

    if (ctx.config.sound === false) ctx.stopMusic()

    screen.repaint()
  }

  ctx.pump = () => {
    if (ctx.gym || ctx.league) return false

    const travel = ctx.syncExpedition()

    if (travel.departed) clearEncounter()

    if (travel.changed) {
      recordAchievements(ctx.save, ctx.worked)
      ctx.save = saveGame(ctx.save)
    }

    const ttlMs = encounterTtlMs(ctx.config)
    const result = readEncounterResult(ttlMs)
    let next = result.encounter

    if (result.error) {
      clearEncounter()
      ctx.encounter = null
      ctx.notice = result.error

      return true
    }

    if (next && !encounterMatchesExpedition(next, ctx.save?.expedition)) {
      clearEncounter()
      next = null
    }

    if (!next) {
      if (!ctx.encounter) return travel.changed

      ctx.encounter = null
      ctx.homeSelection = Math.max(0, ctx.homeSelection - 1)

      return true
    }

    if (isSameEncounter(next, ctx.encounter)) return travel.changed

    ctx.encounter = { ...next, expiresAt: encounterExpiresAt(next, ttlMs) }
    ctx.homeSelection = 0

    if (next.shiny) ctx.playSound('shiny')

    if (ctx.save) {
      markSeen(ctx.save, encounterSpecies(next))
      ctx.persist()
    }

    return true
  }

  ctx.refreshActivity = () => {
    const previous = ctx.activity
    const next = summariseActivity(readSessions())

    ctx.activity = next

    if (isWorking(previous) && !isWorking(next)) {
      if (ctx.config.bell) screen.bell?.()
    }

    return (
      next.state !== previous.state ||
      next.tool !== previous.tool ||
      next.sessions !== previous.sessions ||
      next.activeSince !== previous.activeSince
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

    ctx.notice = null

    activeView(ctx).onKey(ctx, key)
    ctx.paint()
  }

  const handleUpdateChange = () => {
    if (ctx.mode === 'update') ctx.paint()
  }

  const handleUpdateFinished = () => {
    ctx.refreshUpdateNotice()

    if (ctx.mode === 'update') ctx.paint()
  }

  const handleUpdateFailed = () => {}

  ctx.startUpdate = () => {
    if (ctx.update?.state === 'running') return

    const run = makeUpdateRun({ onChange: handleUpdateChange })

    run.promise.then(handleUpdateFinished).catch(handleUpdateFailed)

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
        ctx.teamStep = 'list'
        ctx.relearnSelection = 0
        ctx.clearTeamMessages()
        ctx.closeBag()
        ctx.setMode('team')
        break
      case 'daycare':
        ctx.openDaycare('home')
        break
      case 'gyms':
        ctx.gymSelection = 0
        ctx.gymMessage = null
        ctx.setMode('gyms')
        break
      case 'league':
        ctx.leagueMessage = null
        ctx.leagueLeaving = false
        ctx.teamSelection = 0
        ctx.closeBag()
        ctx.setMode('league')
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
          ctx.notice = HOME_NOTICES.working
          break
        }
        healParty(ctx.save)
        ctx.persist()
        ctx.notice = HOME_NOTICES.healed
        break
      case 'trainer':
        ctx.openTrainer()
        break
      case 'quit':
        ctx.quit()
        break
      default:
        break
    }
  }

  ctx.openTrainer = () => {
    ctx.trainerSelection = 0
    ctx.worked = readWorked()
    ctx.setMode('trainer')
  }

  ctx.exportCard = () => {
    try {
      const path = saveCard(ctx.save, CARD_FILE)

      revealCard(path)
      ctx.notice = `${CARD_WRITTEN_PREFIX}${path}`
    } catch {
      ctx.notice = HOME_NOTICES.cardFailed
    }
  }

  ctx.makeLead = (index) => {
    setLead(ctx.save, index)

    ctx.teamSelection = sortedPartyEntries(
      ctx.save.party,
      ctx.teamSort,
    ).findIndex((entry) => entry.index === 0)
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
      ctx.boxMessage = BOX_MESSAGES.lastOne
      return
    }

    ctx.teamSelection = Math.min(
      ctx.teamSelection,
      Math.max(0, ctx.save.party.length - 1),
    )
    ctx.boxMessage = `${displayName(mon).toUpperCase()} went to the box.`
    ctx.persist()
  }

  ctx.withdrawFromBox = (index) => {
    const mon = ctx.save.box[index]

    if (!mon) return

    if (!withdrawPokemon(ctx.save, index)) {
      ctx.boxMessage = BOX_MESSAGES.teamFull
      return
    }

    ctx.boxSelection = Math.min(
      ctx.boxSelection,
      Math.max(0, ctx.save.box.length - 1),
    )
    ctx.boxMessage = `${displayName(mon).toUpperCase()} joined your team.`
    ctx.persist()
  }

  ctx.openDaycare = (from = 'home') => {
    ctx.daycareFrom = from
    ctx.daycareStep = 'slots'
    ctx.daycareSelection = 0
    ctx.daycarePickSelection = 0
    ctx.setMode('daycare')
  }

  ctx.closeDaycare = () => {
    ctx.daycareMessage = null
    ctx.setMode(ctx.daycareFrom)
  }

  ctx.openDaycarePick = () => {
    ctx.daycareStep = 'pick'
    ctx.daycarePickSelection = 0
    ctx.daycareMessage = null
  }

  ctx.closeDaycarePick = () => {
    ctx.daycareStep = 'slots'
    ctx.daycareMessage = null
  }

  ctx.leaveAtDaycare = (source, index) => {
    const result = leaveAtDaycare(ctx.save, source, index)

    if (!result.ok) {
      ctx.daycareMessage = result.reason
      return
    }

    const laid = eggFromPair(ctx.save, ctx.rng)
    const left = `${displayName(result.mon).toUpperCase()} ${DAYCARE_MESSAGES.leftHere}`

    ctx.teamSelection = clampToList(ctx.teamSelection, ctx.save.party)
    ctx.boxSelection = clampToList(ctx.boxSelection, ctx.save.box)
    ctx.daycareStep = 'slots'
    ctx.daycareSelection = ctx.save.daycare.slots.length - 1
    ctx.daycarePickSelection = 0
    ctx.daycareMessage = laid ? [left, DAYCARE_MESSAGES.foundAnEgg] : left

    ctx.persist()
  }

  ctx.takeBackFromDaycare = (slot) => {
    const { mon, where } = takeBackFromDaycare(ctx.save, slot)
    const name = displayName(mon).toUpperCase()

    ctx.daycareSelection = slot
    ctx.daycareMessage = [
      `${name} ${DAYCARE_MESSAGES.cameBack}`,
      arrivalWording(where),
      ...daycareEvolutionLines(ctx.save, mon, name),
      ...daycareRecoveryLines(mon),
    ]

    ctx.persist()
  }

  ctx.tickDaycare = () => {
    if (ctx.gym || ctx.league) return false
    if (!ctx.save) return false

    const { slots, egg } = ctx.save.daycare

    if (slots.length === 0 && !egg) return false
    if (!isWorking(ctx.activity)) return false

    daycareFrames++

    if (daycareFrames % FRAMES_PER_DAYCARE_STEP !== 0) return false

    daycareSteps++

    raiseDaycare(ctx.save)

    if (!egg && layNextEgg(ctx)) return true
    if (egg && advanceEgg(ctx, egg)) return true

    if (daycareSteps % DAYCARE_STEPS_PER_SAVE === 0) ctx.persist()

    return ctx.mode === 'daycare'
  }

  ctx.clearTeamMessages = () => {
    ctx.boxMessage = null
    ctx.bagMessage = null
    ctx.relearnMessage = null
    ctx.moveOrderMessage = null
  }

  ctx.openMoveOrder = () => {
    ctx.teamStep = 'moves'
    ctx.moveOrderSelection = 0
    ctx.moveOrderHeld = false
    ctx.moveOrderSnapshot = null
    ctx.moveOrderMessage = null
  }

  ctx.cancelMoveOrder = () => {
    if (!ctx.moveOrderHeld) {
      ctx.teamStep = 'list'
      ctx.moveOrderMessage = null

      return
    }

    const mon = selectedPartyMon(ctx)

    mon.moves = ctx.moveOrderSnapshot.moves
    ctx.moveOrderSelection = ctx.moveOrderSnapshot.index
    ctx.moveOrderHeld = false
    ctx.moveOrderSnapshot = null
    ctx.moveOrderMessage = MOVE_ORDER_MESSAGES.putBack
  }

  ctx.stepMoveOrder = (delta) => {
    const mon = selectedPartyMon(ctx)
    const total = mon.moves.length

    if (total === 0) return

    const to = nextMoveSlot(ctx.moveOrderSelection, delta, total)

    if (ctx.moveOrderHeld)
      mon.moves = reorderMoveSlots(mon.moves, ctx.moveOrderSelection, to)

    ctx.moveOrderSelection = to
    ctx.moveOrderMessage = null
  }

  ctx.toggleMoveHold = () => {
    const mon = selectedPartyMon(ctx)

    if (mon.moves.length === 0) return

    if (!ctx.moveOrderHeld) {
      ctx.moveOrderSnapshot = {
        moves: mon.moves.slice(),
        index: ctx.moveOrderSelection,
      }
      ctx.moveOrderHeld = true
      ctx.moveOrderMessage = null

      return
    }

    const name = moveData(mon.moves[ctx.moveOrderSelection].move).name

    ctx.moveOrderHeld = false
    ctx.moveOrderSnapshot = null
    ctx.moveOrderMessage = `${name} ${MOVE_ORDER_MESSAGES.dropped} ${ctx.moveOrderSelection + 1}.`
    ctx.persist()
  }

  ctx.openRelearnMoves = () => {
    ctx.teamStep = 'relearn'
    ctx.relearnSelection = 0
    ctx.relearnMessage = null
  }

  ctx.closeRelearnMoves = () => {
    ctx.teamStep = 'list'
    ctx.relearnSelection = 0
    ctx.relearnMessage = null
  }

  ctx.relearnMove = (partyIndex, name) => {
    const mon = ctx.save.party[partyIndex]
    const recovery = relearnableMoves(mon ?? {}).find(
      (entry) => entry.move === name,
    )

    if (!mon || !recovery) return

    if (!recovery.unlocked) {
      ctx.relearnMessage = `${moveData(name).name}: ${moveRecoveryStatusText(mon, recovery)}.`
      return
    }

    if (mon.moves.length < MOVE_LIMIT) {
      mon.moves.push(makeMoveSlot(name))
      completeMoveRecovery(mon, name)
      ctx.relearnMessage = `${displayName(mon).toUpperCase()} relearned ${moveData(name).name}.`
      ctx.persist()
      return
    }

    queueMoveChoices(ctx.save, [
      {
        kind: 'learn-choice',
        move: name,
        mon,
        name: displayName(mon),
        source: 'recovery',
      },
    ])
    ctx.moveSelection = 0
    ctx.relearnMessage = null
    ctx.persist()
  }

  ctx.openBag = () => {
    if (
      itemsInBag(ctx.save).length === 0 &&
      !ctx.save.party.some((mon) => mon.heldItem)
    ) {
      ctx.bagMessage = BAG_MESSAGES.empty
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

    if (!mon) return

    if (canHoldItem(key)) {
      const result = giveHeldItem(ctx.save, key, mon)

      ctx.bagMessage = result.message
      if (!result.ok) return

      ctx.persist()
      ctx.bagSelection = null
      return
    }

    if (!usableOnParty(key)) {
      const info = itemInfo(key)

      ctx.bagMessage =
        info?.kind === 'ball'
          ? `Save the ${info.name} for something in the grass.`
          : `The ${info?.name ?? key} cannot be used on a party Pokémon.`
      return
    }

    const result = applyItem(ctx.save, key, mon)

    const taught = result.steps
      .filter((step) => step.kind !== 'learn-choice')
      .flatMap(describeStep)

    ctx.bagMessage =
      taught.length > 0 ? [result.message, ...taught] : result.message

    if (!result.ok) return

    ctx.persist()
    ctx.bagSelection = null
  }

  ctx.chooseMoveReplacement = () => {
    const choice = pendingMoveChoice(ctx.save)
    const slotIndex =
      ctx.moveSelection === choice.mon.moves.length ? null : ctx.moveSelection

    resolveMoveChoice(ctx.save, slotIndex)
    ctx.moveSelection = 0
    ctx.persist()
  }

  ctx.askToGiveAway = ({ from, source, index, mon }) => {
    if (!canSpare(ctx.save, source)) {
      ctx.boxMessage = TRADE_MESSAGES.lastOne
      return
    }

    ctx.tradeFrom = from
    ctx.tradeGiving = { mon, source, index }
    ctx.tradeStep = 'confirm'
    ctx.setMode('trade')
  }

  ctx.closeTrade = () => {
    ctx.tradeMessage = null
    ctx.setMode(ctx.tradeFrom)
  }

  ctx.giveSelectedAway = () => {
    const { source, index } = ctx.tradeGiving
    const given = giveAway(ctx.save, source, index)

    ctx.persist()

    ctx.teamSelection = clampToList(ctx.teamSelection, ctx.save.party)
    ctx.boxSelection = clampToList(ctx.boxSelection, ctx.save.box)

    ctx.tradeGone = given.mon
    ctx.tradeCode = given.code
    ctx.tradePath = storeTradeCode(saveCode, given.code)
    ctx.tradeCopied = copyCode(given.code)
    ctx.tradeMessage = null
    ctx.tradeStep = 'code'

    ctx.playSound('trade')
    ctx.setMode('trade')
  }

  ctx.openTradeReceive = (from) => {
    ctx.tradeFrom = from
    ctx.tradeStep = 'receive'
    ctx.tradeInput = ''
    ctx.tradeMessage = null
    ctx.setMode('trade')
  }

  ctx.takeInCode = () => {
    const read = decodeTrade(ctx.tradeInput)

    if (!read.ok) {
      ctx.tradeMessage = read.reason
      return
    }

    const taken = takeIn(ctx.save, read.trade)

    if (!taken.ok) {
      ctx.tradeMessage = taken.reason
      return
    }

    ctx.persist()

    ctx.tradeInput = ''
    ctx.boxMessage = arrivalMessage(taken, read.trade)

    ctx.playSound('trade')
    ctx.closeTrade()
  }

  ctx.takeHeldItem = (index) => {
    const mon = ctx.save.party[index]

    if (!mon) return

    const result = takeHeldItem(ctx.save, mon)

    ctx.bagMessage = result.message
    if (result.ok) ctx.persist()
  }

  ctx.buyItem = (key, quantity) => {
    const result = buy(ctx.save, key, quantity)

    ctx.shopMessage = result.ok
      ? `Bought ${quantity} ${itemInfo(key).name}. Thank you!`
      : result.reason

    if (result.ok) ctx.persist()
  }

  ctx.startNextBattle = () => {
    const encounter = ctx.encounter

    if (!encounter) return

    const lead = activePokemon(ctx.save)

    if (!lead) {
      ctx.notice = HOME_NOTICES.wipedOut
      return
    }

    ctx.encounter = null
    clearEncounter()

    const { state, intro } =
      encounter.kind === 'trainer'
        ? trainerBattle(
            ctx.save,
            encounterTrainer(encounter.trainer),
            encounter.seed,
            lead,
          )
        : wildBattle(ctx.save, encounter, lead)

    ctx.battle = createBattleFlow(state)

    ctx.save.stats.battles++
    queueMessages(ctx, intro)
    ctx.playMusic('battle')
    ctx.setMode('battle')
  }

  ctx.startGymRun = (id) => {
    if (!activePokemon(ctx.save)) {
      ctx.gymMessage = GYM_MESSAGES.wipedOut
      return
    }

    ctx.gym = createGymRun({
      gym: gymById(id),
      seed: randomSeed(),
      save: ctx.save,
    })

    ctx.gymMessage = null
    ctx.gymLeaving = false
    ctx.teamSelection = 0
    ctx.closeBag()
    ctx.setMode('gym')
  }

  ctx.startGymBattle = () => {
    const lead = activePokemon(ctx.save)

    if (!lead) {
      ctx.gymMessage = GYM_MESSAGES.downInside
      return
    }

    const { state, intro } = trainerBattle(
      ctx.save,
      currentOpponent(ctx.gym),
      gymBattleSeed(ctx.gym),
      lead,
    )

    ctx.battle = createBattleFlow(state)
    ctx.gymMessage = null
    ctx.gymLeaving = false

    ctx.save.stats.battles++
    queueMessages(ctx, intro)
    ctx.playMusic('battle')
    ctx.setMode('battle')
  }

  ctx.finishGymBattle = (outcome) => {
    if (outcome !== 'win') {
      ctx.leaveGym(GYM_MESSAGES.defeated)
      return
    }

    advanceGymRun(ctx.gym)

    if (!isGymCleared(ctx.gym)) {
      ctx.setMode('gym')
      return
    }

    const gym = gymOf(ctx.gym)
    const alreadyEarned = hasBadge(ctx.save, gym.id)
    const wording = alreadyEarned
      ? GYM_MESSAGES.stillYours
      : GYM_MESSAGES.earned
    const previousBadgeCount = ctx.save.badges.length

    awardBadge(ctx.save, gym.id)

    const rewards = alreadyEarned
      ? []
      : awardProgressionHeldItems(ctx.save, previousBadgeCount)
    const rewardText = rewards.length
      ? ` · Received ${rewards.map((key) => itemInfo(key).name).join(', ')}.`
      : ''

    leaveForGymList(ctx, gym.id, `${gym.badge} ${wording}${rewardText}`)
  }

  ctx.leaveGym = (message) => {
    const gym = gymOf(ctx.gym)

    ctx.save = rollbackGymRun(ctx.gym)
    leaveForGymList(ctx, gym.id, message)
  }

  ctx.confirmLeaveGym = () => {
    if (ctx.gymLeaving) {
      ctx.leaveGym(GYM_MESSAGES.forfeited)
      return
    }

    ctx.gymLeaving = true
  }

  ctx.cancelLeaveGym = () => {
    ctx.gymLeaving = false
  }

  ctx.startLeagueRun = () => {
    if (!leagueUnlocked(ctx.save)) {
      ctx.leagueMessage = LEAGUE_MESSAGES.locked
      return
    }
    if (!activePokemon(ctx.save)) {
      ctx.leagueMessage = LEAGUE_MESSAGES.wipedOut
      return
    }

    ctx.league = startLeague(ctx.save, randomSeed())
    ctx.leagueMessage = null
    ctx.leagueLeaving = false
    ctx.teamSelection = 0
    ctx.closeBag()
    ctx.setMode('league')
  }

  ctx.startLeagueBattle = () => {
    const lead = activePokemon(ctx.save)

    if (!lead) {
      ctx.leagueMessage = LEAGUE_MESSAGES.downInside
      return
    }

    const { state, intro } = trainerBattle(
      ctx.save,
      currentLeagueOpponent(ctx.league),
      leagueBattleSeed(ctx.league),
      lead,
    )

    ctx.battle = createBattleFlow(state)
    ctx.leagueMessage = null
    ctx.leagueLeaving = false
    ctx.save.stats.battles++
    queueMessages(ctx, intro)
    ctx.playMusic('battle')
    ctx.setMode('battle')
  }

  ctx.finishLeagueBattle = (outcome) => {
    if (outcome !== 'win') {
      ctx.leaveLeague(LEAGUE_MESSAGES.defeated)
      return
    }

    advanceLeague(ctx.league, outcome)

    if (!ctx.league.completed) {
      ctx.setMode('league')
      return
    }

    ctx.save.league ??= { championships: 0, firstWonAt: null }
    ctx.save.league.championships++
    ctx.save.league.firstWonAt ??= new Date().toISOString()
    ctx.league = null
    ctx.leagueLeaving = false
    ctx.leagueMessage = LEAGUE_MESSAGES.champion
    ctx.closeBag()
    ctx.persist()
    ctx.setMode('league')
  }

  ctx.leaveLeague = (message) => {
    ctx.save = rollbackLeagueRun(ctx.league)
    ctx.league = null
    ctx.leagueLeaving = false
    ctx.leagueMessage = message
    ctx.closeBag()
    ctx.persist()
    ctx.setMode('league')
  }

  ctx.confirmLeaveLeague = () => {
    if (ctx.leagueLeaving) {
      ctx.leaveLeague(LEAGUE_MESSAGES.forfeited)
      return
    }

    ctx.leagueLeaving = true
  }

  ctx.cancelLeaveLeague = () => {
    ctx.leagueLeaving = false
  }

  ctx.advanceMessage = () => advanceMessage(ctx)

  ctx.tickBattle = () => tickBattle(ctx)

  ctx.backOutOfBattleMenu = () => backOutOfBattleMenu(ctx)

  ctx.chooseBattleOption = () => chooseBattleOption(ctx)

  ctx.toggleBattleMega = () => toggleBattleMega(ctx)

  ctx.tickScene = () => {
    if (ctx.mode !== 'home' || !isWorking(ctx.activity)) return false

    ctx.scene.frames++

    if (ctx.scene.frames % FRAMES_PER_STEP !== 0) return false

    ctx.scene.step++

    return true
  }

  ctx.tickFrame = () => {
    const ticks = [
      ctx.tickBattle,
      ctx.tickScene,
      ctx.tickUpdate,
      ctx.tickDaycare,
    ]

    return ticks.map((tick) => tick()).some(Boolean)
  }

  return ctx
}

const clampToList = (selection, list) => {
  return Math.min(selection, Math.max(0, list.length - 1))
}

const timeOfDay = () => {
  const hour = new Date().getHours()

  return hour >= 6 && hour < 18 ? 'day' : 'night'
}

const daycareEvolutionLines = (save, mon, name) => {
  const evolution = pendingEvolution(mon, {
    trigger: 'level-up',
    level: levelOf(mon),
    timeOfDay: timeOfDay(),
    biome: save.expedition?.biome ?? null,
    party: save.party,
  })

  if (!evolution) return []

  const target = species(evolution.to).name.toUpperCase()

  if (levelOf(mon) >= MAX_LEVEL) {
    return [
      `${name} is eligible to evolve into ${target}.`,
      'At Lv100 it cannot trigger another level-up evolution.',
    ]
  }

  return [
    `${name} is eligible to evolve into ${target}.`,
    'It will evolve the next time it levels up outside Day Care.',
  ]
}

const daycareRecoveryLines = (mon) => {
  const entries = relearnableMoves(mon)

  if (entries.length === 0) return []

  return [
    'Day Care moves wait under Team > Relearn Moves.',
    'Won-battle EXP outside Day Care unlocks each one:',
    ...entries.map(
      (entry) =>
        `${moveData(entry.move).name} — ${moveRecoveryStatusText(mon, entry)}.`,
    ),
  ]
}

const storeTradeCode = (write, code) => {
  try {
    return write(code)
  } catch {
    return null
  }
}

const arrivalWording = (where) => {
  if (where === 'box') return BATTLE_MESSAGES.wentToBox

  return BATTLE_MESSAGES.joinedTeam
}

const arrivalMessage = (taken, trade) => {
  const name = displayName(taken.mon).toUpperCase()
  const from = trade.from.name.toUpperCase()

  return `${name} ${TRADE_MESSAGES.arrivedFrom} ${from}. ${arrivalWording(taken.where)}`
}

const hatchLines = (mon, where) => {
  const opening = `${displayName(mon).toUpperCase()} ${DAYCARE_MESSAGES.hatched}`

  if (!mon.shiny) return [opening, arrivalWording(where)]

  return [`${opening} ${BATTLE_MESSAGES.shiny}`, arrivalWording(where)]
}

const hatchIntoParty = (ctx, egg) => {
  const hatched = hatchEgg(egg, ctx.rng)

  ctx.save.daycare.egg = null

  const where = addPokemon(ctx.save, hatched)
  const [headline, arrival] = hatchLines(hatched, where)

  ctx.persist()

  ctx.notice = headline
  ctx.daycareMessage = [headline, arrival]

  ctx.playSound(hatched.shiny ? 'shiny' : 'hatch')
}

const layNextEgg = (ctx) => {
  if (!eggFromPair(ctx.save, ctx.rng)) return false

  ctx.persist()

  return true
}

const advanceEgg = (ctx, egg) => {
  walkEgg(egg)

  if (!eggIsReady(egg)) return false

  hatchIntoParty(ctx, egg)

  return true
}

const leaveForGymList = (ctx, gymId, message) => {
  ctx.gym = null
  ctx.gymLeaving = false
  ctx.gymMessage = message
  ctx.gymSelection = gymIndex(gymId)

  ctx.closeBag()
  ctx.persist()
  ctx.setMode('gyms')
}

const isSameEncounter = (entry, held) => {
  return held != null && entry.at === held.at && entry.seed === held.seed
}

const encounterMatchesExpedition = (encounter, expedition) => {
  const biome = expedition?.pendingDeparture
    ? null
    : (expedition?.biome ?? null)
  const visitRevision = expedition?.visitRevision ?? 0

  return encounter.biome === biome && encounter.visitRevision === visitRevision
}

const wildIntro = (wild) => {
  const appeared = `A wild ${displayName(wild).toUpperCase()} appeared!`

  if (!wild.shiny) return [appeared]

  return [appeared, BATTLE_MESSAGES.shiny]
}

const wildBattle = (save, encounter, lead) => {
  const wild = createPokemon(
    encounter.species,
    encounter.level,
    makeRng(encounter.seed),
    encounter.shiny,
  )
  wild.heldItem = rollWildHeldItem(
    encounter.species,
    'ultra-sun-ultra-moon',
    makeRng((encounter.seed ^ 0x48454c44) >>> 0),
  )

  markFaced(save, encounter.species)

  return {
    state: createBattle({
      playerMon: lead,
      wildMon: wild,
      seed: encounter.seed,
    }),
    intro: wildIntro(wild),
  }
}

const encounterTrainer = (trainer) => {
  return {
    class: trainer.class,
    name: trainer.name,
    sprite: trainer.sprite,
    prize: trainerClass(trainer.class).prize,
    team: trainer.team,
  }
}

const trainerBattle = (save, opponent, seed, lead) => {
  const team = opponent.team.map((entry, index) => {
    const mon = createPokemon(
      entry.species,
      entry.level,
      makeRng((seed + index) >>> 0),
    )

    if (entry.ability) mon.ability = entry.ability
    if (entry.moves?.length) mon.moves = entry.moves.map(makeMoveSlot)
    if (entry.heldItem && canHoldItem(entry.heldItem))
      mon.heldItem = entry.heldItem
    if (entry.mega) mon.trainerMega = true

    return mon
  })

  markFaced(save, team[0].species)

  const trainer = {
    class: opponent.class,
    name: opponent.name,
    sprite: opponent.sprite,
    prize: opponent.prize,
    team,
  }

  return {
    state: createBattle({
      playerMon: lead,
      wildMon: team[0],
      seed,
      trainer,
    }),
    intro: [
      `${trainerLabel(trainer)} ${TRAINER_MESSAGES.wantsToBattle}`,
      sentOutLine(trainer, team[0]),
    ],
  }
}
