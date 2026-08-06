import { isWorking, readSessions, summariseActivity } from './activity.mjs'
import {
  BAG_MESSAGES,
  BOX_MESSAGES,
  FRAMES_PER_SPIN,
  FRAMES_PER_STEP,
  HOME_NOTICES,
  ITEMS,
} from './constants.mjs'
import { species } from './data.mjs'
import { createBattle } from './battle.mjs'
import {
  advanceMessage,
  backOutOfBattleMenu,
  chooseBattleOption,
  createBattleFlow,
  queueMessages,
  tickBattle,
} from './battleFlow.mjs'
import {
  encounterTtlMs,
  saveConfig,
  spriteScale,
  updateCheckMode,
} from './config.mjs'
import { applyItem } from './itemUse.mjs'
import { describeStep } from './progression.mjs'
import { createPokemon, displayName } from './pokemon.mjs'
import { clearEncounter, encounterExpiresAt, readEncounter } from './queue.mjs'
import { makeRng, randomSeed } from './rng.mjs'
import { buy, itemsInBag, usableOnParty } from './shop.mjs'
import { play, startMusic, stopMusic } from './sound.mjs'
import {
  activePokemon,
  createSave,
  depositPokemon,
  healParty,
  markFaced,
  markSeen,
  saveGame,
  setLead,
  withdrawPokemon,
} from './state.mjs'
import { checkForUpdate, createUpdateRun, currentNotice } from './update.mjs'

import * as bagView from './ui/views/bag.mjs'
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
  bag: bagView,
  box: boxView,
  shop: shopView,
  options: optionsView,
  update: updateView,
}

const activeView = (ctx) => {
  if (ctx.mode === 'team' && ctx.bagSelection !== null) return VIEWS.bag

  return VIEWS[ctx.mode]
}

export const createApp = ({
  screen,
  save,
  config,
  makeUpdateRun = createUpdateRun,
  playSound = play,
  playMusic = startMusic,
  endMusic = stopMusic,
}) => {
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
    if (ctx.save) saveGame(ctx.save)

    ctx.stopMusic()
    screen.stop()
    process.exit(0)
  }

  ctx.persist = () => {
    if (ctx.save) saveGame(ctx.save)
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
          ctx.notice = HOME_NOTICES.working
          break
        }
        healParty(ctx.save)
        ctx.persist()
        ctx.notice = HOME_NOTICES.healed
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
      ctx.boxMessage = BOX_MESSAGES.lastOne
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
      ctx.boxMessage = BOX_MESSAGES.teamFull
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

    if (!usableOnParty(key)) {
      ctx.bagMessage = `Save the ${ITEMS[key].name} for something in the grass.`
      return
    }

    const result = applyItem(ctx.save, key, mon)

    const taught = (result.steps ?? []).flatMap(describeStep)

    if (result.steps?.some((step) => step.kind === 'learn-choice')) {
      taught.push(BAG_MESSAGES.noRoomForMove)
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
      ctx.notice = HOME_NOTICES.wipedOut
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

    ctx.battle = createBattleFlow(state)

    ctx.save.stats.battles++
    queueMessages(ctx, [`A wild ${displayName(wild).toUpperCase()} appeared!`])
    ctx.playMusic('battle')
    ctx.setMode('battle')
  }

  ctx.advanceMessage = () => advanceMessage(ctx)

  ctx.tickBattle = () => tickBattle(ctx)

  ctx.backOutOfBattleMenu = () => backOutOfBattleMenu(ctx)

  ctx.chooseBattleOption = () => chooseBattleOption(ctx)

  ctx.tickScene = () => {
    if (ctx.mode !== 'home' || ctx.activity.state !== 'working') return false

    ctx.scene.frames++

    if (ctx.scene.frames % FRAMES_PER_STEP !== 0) return false

    ctx.scene.step++

    return true
  }

  return ctx
}

const isSameEncounter = (entry, held) => {
  return held != null && entry.at === held.at && entry.seed === held.seed
}
