import { isWorking, readSessions, summariseActivity } from './activity.mjs'
import {
  BAG_MESSAGES,
  BAG_MODES,
  BATTLE_MESSAGES,
  BOX_MESSAGES,
  CARD_WRITTEN_PREFIX,
  FRAMES_PER_SPIN,
  FRAMES_PER_STEP,
  GYM_MESSAGES,
  HOME_NOTICES,
  ITEMS,
  TRAINER_MESSAGES,
} from './constants.mjs'
import { species } from './data.mjs'
import { createBattle } from './battle.mjs'
import { encounterSpecies } from './encounter.mjs'
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
import { applyItem } from './itemUse.mjs'
import { describeStep } from './progression.mjs'
import { createPokemon, displayName } from './pokemon.mjs'
import { clearEncounter, encounterExpiresAt, readEncounter } from './queue.mjs'
import { CARD_FILE } from './paths.mjs'
import { makeRng, randomSeed } from './rng.mjs'
import { buy, itemsInBag, usableOnParty } from './shop.mjs'
import { revealFile } from './reveal.mjs'
import { play, startMusic, stopMusic } from './sound.mjs'
import {
  activePokemon,
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

import { writeCard } from './ui/card.mjs'
import * as bagView from './ui/views/bag.mjs'
import * as battleView from './ui/views/battle.mjs'
import * as boxView from './ui/views/box.mjs'
import * as dexView from './ui/views/dex.mjs'
import * as gymView from './ui/views/gym.mjs'
import * as gymsView from './ui/views/gyms.mjs'
import * as homeView from './ui/views/home.mjs'
import * as optionsView from './ui/views/options.mjs'
import * as shopView from './ui/views/shop.mjs'
import * as starterView from './ui/views/starter.mjs'
import * as teamView from './ui/views/team.mjs'
import * as updateView from './ui/views/update.mjs'
import { sortedPartyEntries } from './ui/views/helpers.mjs'

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
  gyms: gymsView,
  gym: gymView,
}

const activeView = (ctx) => {
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
    dexSort: 'number',
    teamSelection: 0,
    teamSort: 'order',
    boxSelection: 0,
    boxSort: 'order',

    boxMessage: null,

    bagSelection: null,
    bagMessage: null,

    shopSelection: 0,
    shopMessage: null,

    gym: null,
    gymSelection: 0,
    gymMessage: null,
    gymLeaving: false,

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
    ctx.persist()

    ctx.stopMusic()
    screen.stop()
    process.exit(0)
  }

  ctx.persist = () => {
    if (ctx.gym) return
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
    if (ctx.gym) return false

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
        ctx.clearTeamMessages()
        ctx.closeBag()
        ctx.setMode('team')
        break
      case 'gyms':
        ctx.gymSelection = 0
        ctx.gymMessage = null
        ctx.setMode('gyms')
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
      case 'card':
        ctx.exportCard()
        break
      case 'quit':
        ctx.quit()
        break
      default:
        break
    }
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

    const taught = result.steps.flatMap(describeStep)

    if (result.steps.some((step) => step.kind === 'learn-choice')) {
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
    const wording = hasBadge(ctx.save, gym.id)
      ? GYM_MESSAGES.stillYours
      : GYM_MESSAGES.earned

    awardBadge(ctx.save, gym.id)
    leaveForGymList(ctx, gym.id, `${gym.badge} ${wording}`)
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
    return createPokemon(
      entry.species,
      entry.level,
      makeRng((seed + index) >>> 0),
    )
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
