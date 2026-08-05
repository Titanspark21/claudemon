// The companion's state machine.
//
// Owns the save, the encounter queue and which screen is showing. Views are pure
// draw/onKey pairs; every decision that changes the game lives here.

import { isWorking, readSessions, summariseActivity } from './activity.mjs'
import { species } from './data.mjs'
import { createBattle, submitAction, switchIn } from './battle.mjs'
import { encounterTtlMs, saveConfig, spriteScale, updateCheckMode } from './config.mjs'
import { expFromDefeating } from './exp.mjs'
import { applyVictory, describeStep, learnEvolutionMoves, learnMove } from './progression.mjs'
import { createPokemon, displayName, isFainted, levelOf } from './pokemon.mjs'
import { clearEncounter, encounterExpiresAt, readEncounter } from './queue.mjs'
import { makeRng, randomSeed } from './rng.mjs'
import {
  ballsInBag, countOf, ITEMS, buy, itemsInBag, removeItem, useItem, usableOnParty,
} from './shop.mjs'
import { play, startMusic, stopMusic } from './sound.mjs'
import {
  activePokemon, addPokemon, createSave, depositPokemon, healParty, markCaught, markFaced,
  markSeen, publishStatus, saveGame, setLead, withdrawPokemon,
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

/**
 * Items worth offering mid-battle: balls, healing, status cures.
 *
 * Not the stones, the way the games have always had it: an evolution is not something
 * you do with a Pokemon halfway through a fight. They are used from the BAG screen,
 * on whoever you pick — which is the only place they can be used at all.
 */
const BATTLE_ITEM_KINDS = new Set(['heal', 'cure', 'revive'])

/**
 * Frames a full health bar takes to empty. The step is a fraction of maximum HP
 * rather than a fixed number, so a Snorlax does not take twenty times as long to
 * drain as a Caterpie.
 */
const HP_DRAIN_STEPS = 24

/**
 * Frames per step of the walk on the home screen. The frame timer runs at 60ms,
 * so this is about eight steps a second: fast enough to read as walking, and slow
 * enough that the band is not rebuilt on every frame to move nothing.
 */
const FRAMES_PER_STEP = 2

/**
 * Frames per turn of the spinner on the update screen. Slower than the walk on
 * purpose: this one is saying "still going", not animating anything.
 */
const FRAMES_PER_SPIN = 3

/**
 * @param {{makeUpdateRun?: Function, playSound?: Function, playMusic?: Function,
 *   endMusic?: Function}} options `makeUpdateRun` is the seam the tests drive the
 *   UPDATE screen through. It is the one thing in here that shells out, so nothing
 *   but a real session should ever be able to reach the real one. The three sound
 *   seams are the same idea: a test run should never fork a player, and one that did
 *   would be a test suite you can hear — and, with the music, one you can still hear
 *   after it has finished.
 */
export function createApp({
  screen, save, config, makeUpdateRun = createUpdateRun, playSound = play,
  playMusic = startMusic, endMusic = stopMusic,
}) {
  /** Frames since the update spinner last turned. */
  let spinFrames = 0
  /** Whether a check for a new version is already in flight. */
  let checking = false

  const ctx = {
    screen,
    save,
    config,
    spriteScale: spriteScale(config),
    rng: makeRng(randomSeed()),

    mode: save ? 'home' : 'starter',

    /**
     * The one wild Pokemon in the grass, or null. Never a list: miss its window
     * and it is gone, so there is never a second one behind it.
     *
     * Carries `expiresAt` on top of the queued entry, so the screen can count down
     * without working the deadline out again every frame.
     */
    encounter: null,

    /** What Claude Code is doing, refreshed from the session files on a timer. */
    activity: { state: 'unknown', tool: null, since: null, sessions: 0 },

    /**
     * How far through the grass you have walked, in steps.
     *
     * The one piece of state nothing else depends on: it only decides which frame
     * of the walk is drawn and where. It is not the step count the hooks roll
     * encounters on — that lives in the session files — but it moves for the same
     * reason, so watching it is watching Claude work.
     */
    scene: { step: 0, frames: 0 },

    homeSelection: 0,
    dexSelection: 0,
    teamSelection: 0,
    boxSelection: 0,

    /**
     * What just happened to a Pokemon going into or out of the box.
     *
     * One field for both screens on purpose: a swap is one action seen from two
     * sides, and the side you are not looking at is where its result landed.
     */
    boxMessage: null,

    /**
     * Which item the bag is open on, or null while it is shut.
     *
     * One field rather than two, because "shut" and "on no item" are the same state: the
     * bag opens over the team screen, so this is also what says whether the arrow keys
     * are moving through your items or through your Pokemon.
     */
    bagSelection: null,
    bagMessage: null,

    shopSelection: 0,
    shopMessage: null,
    optionsSelection: 0,
    optionsMessage: null,
    notice: null,

    /**
     * What the home screen should say about versions, or null when there is nothing
     * to say — which is almost always. See update.mjs for the two things it can be.
     */
    updateNotice: currentNotice(),

    /** An update in progress, while the UPDATE screen is up. */
    update: null,
    updateFrame: 0,

    setup: { step: 'name', name: '', selection: 1, blink: true },
    battle: null,
  }

  // --- plumbing --------------------------------------------------------------

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
    // Before the screen goes, because quitting mid-battle is quitting while a player
    // is running and it does not stop on its own.
    ctx.stopMusic()
    screen.stop()
    process.exit(0)
  }

  ctx.persist = () => {
    if (ctx.save) saveGame(ctx.save)
  }

  /**
   * Makes one of the noises in src/sound.mjs, if the user wants noises.
   *
   * The single check every sound in the game goes through, which is what makes SOUND
   * one switch rather than one per sound: a view asks for a name and never asks
   * whether it is allowed. Nothing waits on it and nothing can fail out of it.
   *
   * @param {string} name a key of `SOUNDS`.
   */
  ctx.playSound = (name) => {
    if (ctx.config?.sound === false) return
    playSound(name)
  }

  /**
   * Starts one of the tracks in src/sound.mjs under whatever is on screen.
   *
   * Behind the same switch as the blips, for the reason the setting gives: someone who
   * turned sound off wants a quiet terminal, not a quieter one.
   *
   * @param {string} name a key of `MUSIC`.
   */
  ctx.playMusic = (name) => {
    if (ctx.config?.sound === false) return
    playMusic(name)
  }

  /**
   * Stops it, whatever it was.
   *
   * Not behind the switch, on purpose. This is the call that has to work when the
   * setting has just been turned off, and asking for silence is never something to
   * refuse on the grounds that the user wanted silence.
   */
  ctx.stopMusic = () => {
    endMusic()
  }

  /**
   * Changes settings, writes them to disk, and puts the change on screen.
   *
   * Nothing is applied unless it saved: a setting about how the game looks is
   * worth very little if it goes away with the process, and a screen that shows the
   * new value while the file still holds the old one is a lie about what happened.
   *
   * @param {Record<string, unknown>} patch settings to change, by key.
   */
  ctx.applyConfig = (patch) => {
    try {
      ctx.config = saveConfig(patch)
      ctx.optionsMessage = null
    } catch (error) {
      ctx.optionsMessage = `Could not save: ${error.code ?? error.message}`
      return
    }

    ctx.spriteScale = spriteScale(ctx.config)
    // Turning SOUND off is the one setting with something already running behind it,
    // and a switch that leaves the music playing is a switch that did not work.
    if (ctx.config?.sound === false) ctx.stopMusic()
    // A sprite is about to change size, and the renderer's idea of what the terminal
    // is showing has not. Leaving the diff in place would leave the rows the old one
    // no longer reaches showing the old one.
    screen.repaint()
  }

  /**
   * Rereads the encounter slot. Called on a file change and on a timer.
   *
   * The file is the truth here rather than something to drain: leaving the entry
   * where it is until the battle starts is what lets the hook see that the grass is
   * already occupied, and it is why nothing can pile up while you work. It is also
   * where an encounter that ran out of time disappears.
   *
   * @returns {boolean} whether the screen would now read differently.
   */
  ctx.pump = () => {
    const ttlMs = encounterTtlMs(ctx.config)
    const next = readEncounter(ttlMs)

    if (!next) {
      if (!ctx.encounter) return false
      // Its window closed while you were busy: it wandered back into the grass.
      ctx.encounter = null
      // FIGHT has just left the menu, so the cursor follows the entry it was on
      // rather than pointing one row past the end of it.
      ctx.homeSelection = Math.max(0, ctx.homeSelection - 1)
      return true
    }

    if (isSameEncounter(next, ctx.encounter)) return false

    ctx.encounter = { ...next, expiresAt: encounterExpiresAt(next, ttlMs) }
    // FIGHT is now the first entry, and the one you opened the tab for.
    ctx.homeSelection = 0
    if (ctx.save) {
      markSeen(ctx.save, next.species)
      ctx.persist()
    }
    return true
  }

  /**
   * Rereads what Claude Code is doing.
   *
   * The interesting moment is the edge, not the state: working -> anything else
   * is Claude handing the keyboard back, and that is the one thing worth
   * interrupting someone mid-battle for.
   *
   * @returns {boolean} whether the row on screen would now read differently.
   */
  ctx.refreshActivity = () => {
    const previous = ctx.activity
    const next = summariseActivity(readSessions())
    ctx.activity = next

    if (previous.state === 'working' && (next.state === 'idle' || next.state === 'waiting')) {
      if (ctx.config.bell) screen.bell?.()
    }

    return next.state !== previous.state
      || next.tool !== previous.tool
      || next.sessions !== previous.sessions
  }

  /**
   * Rereads what is known about versions, from the disk alone.
   *
   * Cheap enough to sit on a timer: it is a directory listing and a small file. What
   * it catches is Claude Code updating the plugin underneath a tab that is already
   * open, which is the one way a new version arrives without anyone asking here.
   *
   * @returns {boolean} whether the row on screen would now read differently.
   */
  ctx.refreshUpdateNotice = () => {
    const previous = ctx.updateNotice
    ctx.updateNotice = currentNotice()

    if (previous?.kind === ctx.updateNotice?.kind && previous?.version === ctx.updateNotice?.version) {
      return false
    }
    // The row appearing or going away moves everything under it, and the renderer's
    // idea of the screen was formed without it.
    screen.repaint()
    return true
  }

  /**
   * Asks whether a new version is out, at most once a day and never twice at once.
   *
   * Nothing waits on this and nothing fails if it never answers: the check decides
   * for itself whether it is due, and a machine with no network gets a quiet no.
   *
   * @param {{atLaunch?: boolean}} options `atLaunch` is the one call made on the way
   *   up, and the only one UPDATE LAUNCH can turn into a check regardless of when the
   *   last one was. The timer that calls this every minute afterwards must not, or
   *   the setting would be a request a minute rather than one a launch.
   */
  ctx.checkForUpdates = async ({ atLaunch = false } = {}) => {
    if (checking) return false
    checking = true
    try {
      await checkForUpdate({
        config: ctx.config,
        force: atLaunch && updateCheckMode(ctx.config) === 'launch',
      })
    } catch {
      // Nothing is allowed to escape here. This is called from a timer, and an
      // unhandled rejection would take the whole tab down over a version number.
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

  // --- updating --------------------------------------------------------------

  /**
   * Starts an update and shows it happening.
   *
   * The run is put on ctx before the mode changes, because its first step reports
   * itself synchronously and would otherwise be drawn onto the home screen.
   */
  ctx.startUpdate = () => {
    if (ctx.update?.state === 'running') return

    const run = makeUpdateRun({
      onChange: () => {
        if (ctx.mode === 'update') ctx.paint()
      },
    })

    run.promise
      .then(() => {
        // A successful update leaves a newer copy on the disk than this process is
        // running, so the home screen now has something else to say.
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

  /**
   * Turns the spinner on the update screen.
   *
   * @returns {boolean} whether it moved, so a settled screen costs no redraw.
   */
  ctx.tickUpdate = () => {
    if (ctx.mode !== 'update' || ctx.update?.state !== 'running') return false

    spinFrames++
    if (spinFrames % FRAMES_PER_SPIN !== 0) return false

    ctx.updateFrame++
    return true
  }

  // --- first run -------------------------------------------------------------

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

  // --- home ------------------------------------------------------------------

  /** @param {string} id an entry id from the home view's menu, never its label. */
  ctx.openHomeSelection = (id) => {
    switch (id) {
      case 'fight': ctx.startNextBattle(); break
      case 'dex': ctx.setMode('dex'); break
      // The bag opens over the team screen, so it has to arrive shut: the one it was
      // last open for is not necessarily still in the party.
      case 'team': ctx.teamSelection = 0; ctx.clearTeamMessages(); ctx.closeBag(); ctx.setMode('team'); break
      case 'shop': ctx.shopSelection = 0; ctx.shopMessage = null; ctx.setMode('shop'); break
      case 'options': ctx.optionsSelection = 0; ctx.optionsMessage = null; ctx.setMode('options'); break
      case 'heal':
        // Healing is what you do in the gaps. The menu greys the entry out while
        // Claude works, but the rule belongs here too: nothing else guarantees the id
        // arrived from a screen that had drawn it grey, and the menu can go stale
        // between the keypress and this line.
        if (isWorking(ctx.activity)) {
          ctx.notice = 'Not while Claude is working — rest when it does.'
          break
        }
        healParty(ctx.save)
        ctx.persist()
        ctx.notice = 'Your team is back to full health.'
        break
      case 'quit': ctx.quit(); break
      default: break
    }
  }

  ctx.makeLead = (index) => {
    setLead(ctx.save, index)
    ctx.teamSelection = 0
    ctx.persist()
  }

  // --- the box ---------------------------------------------------------------

  ctx.openBox = () => {
    ctx.boxSelection = 0
    ctx.boxMessage = null
    ctx.setMode('box')
  }

  /** Sends the highlighted party member to the box, if it can be spared. */
  ctx.depositToBox = (index) => {
    const mon = ctx.save.party[index]
    if (!mon) return

    if (!depositPokemon(ctx.save, index)) {
      ctx.boxMessage = 'That is your last Pokémon — somebody has to fight.'
      return
    }

    // The team is a row shorter, and the cursor was pointing at the row that left.
    ctx.teamSelection = Math.min(index, ctx.save.party.length - 1)
    ctx.boxMessage = `${displayName(mon).toUpperCase()} went to the box.`
    ctx.persist()
  }

  /** Takes the highlighted boxed Pokemon into the team. */
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

  // --- the bag ---------------------------------------------------------------

  /** Clears whatever the team screen was saying, from either of the two things on it. */
  ctx.clearTeamMessages = () => {
    ctx.boxMessage = null
    ctx.bagMessage = null
  }

  /** Opens the bag over the team screen, on the Pokemon the cursor is on. */
  ctx.openBag = () => {
    if (itemsInBag(ctx.save).length === 0) {
      // Opening an empty bag would be a screen with nothing on it and no way to tell
      // why, so the answer comes without leaving the team.
      ctx.bagMessage = 'Your bag is empty — the shop sells balls, potions and stones.'
      return
    }
    ctx.bagSelection = 0
    ctx.bagMessage = null
  }

  ctx.closeBag = () => {
    ctx.bagSelection = null
    ctx.bagMessage = null
  }

  /**
   * Uses an item on one of your team.
   *
   * The half of using an item the game only had inside a battle, where the target is
   * decided for you. Here it is whoever the team screen is on, which is what a stone
   * needs — the one it fits is rarely the one leading — and what a potion between
   * fights wanted all along.
   */
  ctx.useFromBag = (key, index) => {
    const mon = ctx.save.party[index]
    if (!key || !mon) return

    if (!usableOnParty(key)) {
      ctx.bagMessage = `Save the ${ITEMS[key].name} for something in the grass.`
      return
    }

    const result = applyItem(ctx, key, mon)

    // A stone that taught something has to say so, in the battle's own words through the
    // same describeStep, because a move learned from the bag is not a different event.
    // As rows rather than one long line: WEEPINBELL becoming a VICTREEBEL that learns
    // POISON POWDER is eighty-six columns of sentence, and this screen has one row.
    const taught = (result.steps ?? []).flatMap(describeStep)
    // The one thing this screen cannot do is ask which of four moves to give up — that
    // menu only exists after a battle. So it keeps what it knows, and the bag closes the
    // question rather than leaving it hanging.
    if (result.steps?.some((step) => step.kind === 'learn-choice')) {
      taught.push('There was no room for it, so it kept the four it knows.')
    }
    ctx.bagMessage = taught.length > 0 ? [result.message, ...taught] : result.message
    // A refusal keeps the bag open on the item it refused: it is an answer about that
    // item, and what you want next is a different one. Anything that worked hands the
    // screen back to the team, where you choose who is next.
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

  // --- battle ----------------------------------------------------------------

  ctx.startNextBattle = () => {
    const encounter = ctx.encounter
    if (!encounter) return

    const lead = activePokemon(ctx.save)
    if (!lead) {
      ctx.notice = 'Your whole team has fainted. Heal before heading out.'
      return
    }

    // Facing it is what consumes it, and it frees the grass for whatever walks past
    // while the battle runs.
    ctx.encounter = null
    clearEncounter()

    const wild = createPokemon(encounter.species, encounter.level, makeRng(encounter.seed))
    // Seen as well, which matters for an encounter that turned up before there was a
    // save to write it into.
    markFaced(ctx.save, encounter.species)

    const state = createBattle({ playerMon: lead, wildMon: wild, seed: encounter.seed })

    ctx.battle = {
      state,
      menu: 'main',
      selection: 0,
      message: null,
      // The engine resolves a whole turn in one call and hands back everything
      // that happened. These are the parts of it not played out yet.
      events: [],
      // What the bars show, and where they are heading. Neither is the real HP:
      // the real HP is already at the end of the turn.
      hp: liveHp(state),
      hpTarget: liveHp(state),
      effect: null,
      /** A ball in the air: `{shakes, caught, frame, done}` while one is. */
      ball: null,
      postSteps: null,
      learnStep: null,
      bagItems: [],
      /** The item waiting for a target, while the party is up to choose one. */
      bagItem: null,
    }

    ctx.save.stats.battles++
    queueMessages(ctx, [`A wild ${displayName(wild).toUpperCase()} appeared!`])
    // With the first frame of the battle rather than after it: the music is what says
    // this is a fight, and it should be under the sprite as it arrives.
    ctx.playMusic('battle')
    ctx.setMode('battle')
  }

  ctx.advanceMessage = () => {
    const battle = ctx.battle
    if (!battle) return

    // A ball in the air outranks the keyboard: the throw is the only thing on
    // screen worth waiting for, and the message behind it already says what is
    // happening. One key ends it early, the next one reads the result — nothing
    // here waits on the frame timer to make progress.
    if (battle.ball && !battle.ball.done) {
      settleBall(battle)
      return
    }

    if (playNextBeat(ctx)) return

    // The turn is played out: either continue the post-battle sequence or hand
    // the menu back to the player.
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

  /**
   * Advances the hit effect and drains the health bars towards where the turn
   * left them. Driven by a frame timer, not by keypresses.
   *
   * @returns {boolean} whether anything moved, so a still frame costs no redraw.
   */
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
        // The throw held its message on screen while it played, so the verdict
        // follows on its own — waiting for a key here would read as a stall.
        ctx.advanceMessage()
        // Which can be the end of the battle, and a battle that is over has no
        // bars left to drain.
        if (!ctx.battle) return true
      }
      moved = true
    }

    if (battle.effect) {
      const next = battle.effect.frame + 1
      battle.effect = next < battleView.HIT_FRAMES.length ? { ...battle.effect, frame: next } : null
      moved = true
    }

    for (const side of ['player', 'foe']) {
      const shown = battle.hp[side]
      const target = battle.hpTarget[side]
      if (shown === target) continue

      // Scaled to the bar rather than to the damage, so a big hit takes longer to
      // drain than a scratch and every bar empties at the same speed.
      const step = Math.max(1, Math.ceil(battle.state[side].mon.stats.hp / HP_DRAIN_STEPS))
      battle.hp[side] = target > shown ? Math.min(target, shown + step) : Math.max(target, shown - step)
      moved = true
    }

    return moved
  }

  ctx.backOutOfBattleMenu = () => {
    const battle = ctx.battle
    if (!battle || battle.menu === 'learn') return

    // Choosing who to use an item on is a step inside the bag, so backing out of it
    // is backing out to the bag — and to the item you were holding, rather than to
    // the top of a list you have just scrolled through.
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
      case 'main': return chooseMainOption(ctx)
      case 'fight': return chooseMove(ctx)
      case 'bag': return chooseItem(ctx)
      case 'target': return chooseItemTarget(ctx)
      case 'party': return choosePartyMember(ctx)
      case 'learn': return resolveLearnChoice(ctx)
      default: return undefined
    }
  }

  // --- the grass ---------------------------------------------------------------

  /**
   * Moves the walk on, on the same frame timer the battle animates on.
   *
   * Only ever while Claude is working, which is the whole point of the scene:
   * someone standing still is how the screen says nothing is happening, and it
   * says it the same way the activity row above them does. Idle costs a couple of
   * comparisons per frame and no redraw at all.
   *
   * @returns {boolean} whether anything moved.
   */
  ctx.tickScene = () => {
    if (ctx.mode !== 'home' || ctx.activity.state !== 'working') return false

    ctx.scene.frames++
    if (ctx.scene.frames % FRAMES_PER_STEP !== 0) return false

    ctx.scene.step++
    return true
  }

  return ctx
}

// --- helpers -----------------------------------------------------------------

/**
 * Whether the slot still holds the encounter already on screen.
 *
 * The companion rereads the file rather than draining it, so it sees the same entry
 * over and over. The stamp and the seed together identify it: without this, every
 * tick would count as a fresh Pokemon and reset the cursor under your fingers.
 */
function isSameEncounter(entry, held) {
  return held != null && entry.at === held.at && entry.seed === held.seed
}

// --- battle helpers ----------------------------------------------------------

function liveHp(state) {
  return { player: state.player.mon.hp, foe: state.foe.mon.hp }
}

/**
 * Puts the bars back in step with the real state.
 *
 * The safety net for everything that changes health without going through the
 * engine — a potion, a switch, a whole new Pokemon sent out. Called whenever a
 * menu opens, so whatever the player is about to make a decision on is the truth.
 */
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
  queueEvents(ctx, texts.map((text) => ({ type: 'message', text })))
}

/**
 * Plays one beat: the next line of text, and the damage that line describes.
 *
 * This is what stops a turn landing all at once. The engine resolves both moves
 * before it returns, so by the time anything is drawn every Pokemon is already at
 * its end-of-turn health — reading it straight off the state drops both bars
 * together, in one frame, whichever order the moves actually happened in.
 *
 * So the bars follow the events instead. A beat is a message plus the state
 * changes that immediately follow it, which is exactly the damage that message
 * announced: "CHARMANDER used Ember!" and the foe's bar moving are the same beat,
 * and the wild Pokemon's reply is the next one.
 *
 * @returns {boolean} whether there was anything left to say.
 */
function playNextBeat(ctx) {
  const battle = ctx.battle

  // Whatever was still draining belongs to the beat just finished. Landing it
  // now keeps each beat starting from a settled bar, however fast keys arrive.
  battle.hp = { ...battle.hpTarget }

  // Anything before the next message was left over by a caller that queued state
  // changes of its own.
  applyPendingEvents(ctx)

  const next = battle.events.shift()
  battle.message = next ? next.text : null
  applyPendingEvents(ctx)

  return battle.message != null
}

/** Consumes state changes up to the next thing worth reading. */
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
      // Something landing is the one moment worth drawing over a sprite.
      if (event.type === 'damage' && event.amount > 0) {
        battle.effect = { side: event.side, frame: 0 }
      }
      break
    case 'catch':
      // The engine has already decided; the frames are the interface catching up.
      battle.ball = { shakes: event.shakes, caught: event.caught, frame: 0, done: false }
      break
    case 'end':
      // The end of the battle arrives glued to the line that announces it — "FOE
      // CATERPIE fainted!", "Gotcha!" — so this is the frame the music should turn
      // over on, and the reason it is here rather than in beginPostBattle: that runs
      // as soon as the engine returns, which is several messages before any of it is
      // on screen, and would cut the theme off mid-attack.
      //
      // Both ways a battle goes your way get the fanfare, which is what the games do:
      // weakening something and landing the ball is the harder of the two wins. It
      // plays over the spoils and stops at the home screen, where finishBattle stops
      // whatever was playing. Running is not a victory and losing is certainly not.
      if (event.outcome === 'win' || event.outcome === 'caught') ctx.playMusic('victory')
      break
    default:
      // Stat stages, ailments and the outcome all speak for themselves through
      // the message that follows them.
      break
  }
}

/**
 * Ends the throw, however it got there — the last frame or an impatient key.
 *
 * A ball that held is left on the last frame rather than cleared, because the
 * Pokemon is in it: clearing it would put the sprite it just swallowed back on the
 * field for the rest of the battle. `done` is what stops the frame timer from
 * animating a ball that has nothing left to do.
 */
function settleBall(battle) {
  battle.ball = battle.ball.caught
    ? { ...battle.ball, frame: ballSteps(battle.ball).length - 1, done: true }
    : null
}

/**
 * Opens a battle menu.
 *
 * The cursor always belongs to the menu it is in, so the two move together —
 * leaving a stale selection behind is how a highlight ends up on the wrong row.
 */
function openMenu(battle, name) {
  battle.menu = name
  battle.selection = 0
  // A menu is only ever open between turns, so this is the moment the bars have
  // to be caught up and honest.
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

/**
 * Uses an item, and settles what using it meant beyond the Pokemon it was used on.
 *
 * Both bags come through here — the battle's and the field's — because a stone is an
 * evolution, and an evolution is a Pokedex entry you earned by raising the thing
 * yourself rather than throwing a ball at it. Which screen you happened to be standing
 * on must not decide whether you are credited for it.
 *
 * An evolution is also a moveset. A stone is the only one that happens away from a
 * fight, and the rule it follows is the fight's: what the new form knows at the level
 * it is standing on, it knows now.
 */
function applyItem(ctx, key, mon) {
  const result = useItem(ctx.save, key, mon)
  if (!result.evolvedInto) return result

  markCaught(ctx.save, result.evolvedInto)
  return { ...result, steps: learnEvolutionMoves(mon) }
}

/** Balls plus anything that heals or cures, in a stable order. */
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
    // Thrown is spent, whether it holds or not. The engine only decides whether
    // the catch worked, so nothing else takes the ball out of the bag — without
    // this, one Master Ball catches the whole Pokedex.
    removeItem(ctx.save, key)
    takeAction(ctx, { type: 'ball', key })
    return
  }

  // Everything else is used on one of your own, and which one is the player's to
  // say: the one that needs a potion is often not the one on the field, and the one
  // that needs a Revive never is.
  battle.bagItem = key
  openMenu(battle, 'target')
}

/**
 * Uses the item the bag is holding on whichever of your team you picked.
 *
 * The target matters beyond the Pokemon it heals: a Revive is for somebody already
 * down, so an item that could only ever reach the one still standing was an item
 * that could not be used at all.
 */
function chooseItemTarget(ctx) {
  const battle = ctx.battle
  const key = battle.bagItem
  const mon = ctx.save.party[battle.selection]
  if (!key || !mon) return

  const before = mon.hp
  const result = applyItem(ctx, key, mon)
  battle.bagItem = null

  if (!result.ok) {
    // Nothing spent and no turn taken — an item that would do nothing is a question
    // answered, not a move made. The menu comes back the way it does for a move with
    // no PP or a switch to somebody who has fainted.
    queueMessages(ctx, [result.message])
    return
  }

  // An item changes the save on the spot rather than through the engine, so the bar
  // is told about it the same way the engine would have — but only for the one on
  // the field, since a Pokemon on the bench has no bar to animate.
  const onField = mon === battle.state.player.mon
  queueEvents(ctx, [
    { type: 'message', text: `You used a ${ITEMS[key].name} on ${displayName(mon).toUpperCase()}.` },
    { type: 'message', text: result.message },
    ...(!onField || mon.hp === before
      ? []
      : [{ type: 'heal', side: 'player', amount: mon.hp - before, hpAfter: mon.hp }]),
  ])

  // Using an item costs the turn, so the foe still gets to act.
  takeAction(ctx, { type: 'item' }, { silentFirst: true })
}

function choosePartyMember(ctx) {
  const battle = ctx.battle
  const index = battle.selection
  const chosen = ctx.save.party[index]
  if (!chosen) return

  if (isFainted(chosen)) {
    queueMessages(ctx, [`${displayName(chosen).toUpperCase()} is in no shape to fight!`])
    return
  }
  if (chosen === battle.state.player.mon) {
    queueMessages(ctx, [`${displayName(chosen).toUpperCase()} is already out!`])
    return
  }

  setLead(ctx.save, index)
  switchIn(battle.state, chosen)
  // A different Pokemon is a different bar; there is nothing to animate from.
  syncBars(battle)

  queueMessages(ctx, [`Go, ${displayName(chosen).toUpperCase()}!`])
  takeAction(ctx, { type: 'switch' }, { silentFirst: true })
}

/**
 * Sends an action to the engine and turns its events into messages.
 *
 * @param {{silentFirst?: boolean}} options when the caller has already queued its
 *   own lead-in message, so the menu should not flash back up first.
 */
function takeAction(ctx, action, options = {}) {
  const battle = ctx.battle
  battle.menu = null
  queueEvents(ctx, submitAction(battle.state, action))

  if (battle.state.over) beginPostBattle(ctx)
  else if (!battle.message && !options.silentFirst) openMenu(battle, 'main')
}

/** Works out what the end of the battle owes the player. */
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

    // Catching awards experience just as beating it would, minus the prize money.
    // Without this, playing the way the game encourages — weaken it, throw a ball —
    // leaves your team stuck at its starting level forever.
    const rewards = { exp: expFromDefeating(caught.species, levelOf(caught)), money: 0 }
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

  // A fainted Pokemon is only a loss if there is nobody left to send out.
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
    const where = step.destination === 'party'
      ? 'It joined your team!'
      : 'Your team was full, so it went to the box.'
    queueMessages(ctx, [`${step.name.toUpperCase()} was added to the Pokédex.`, where])
    return
  }

  if (step.kind === 'send-out') {
    // Carry on against the same foe, at whatever health it has left.
    const foe = battle.state.foe.mon
    battle.state = createBattle({
      playerMon: step.mon,
      wildMon: foe,
      seed: (battle.state.seed + battle.state.turn + 1) >>> 0,
      // The fight carries on, so what it owes carries on with it.
      participants: battle.state.participants,
    })
    battle.postSteps = null
    syncBars(battle)
    queueMessages(ctx, [`Go, ${displayName(step.mon).toUpperCase()}!`])
    return
  }

  if (step.kind === 'blackout') {
    const messages = ['You have no Pokémon able to fight!', 'You scurried back to safety...']

    // A blackout is healing, so it waits for Claude the same way HEAL does. Left
    // alone it is the cheapest heal in the game and the way around the rule: lose a
    // battle on purpose, wake up at full health, carry on catching inside the same
    // prompt. Losing everything now costs you the rest of the walk instead.
    if (isWorking(ctx.activity)) {
      messages.push('There is no rest while Claude works — your team stays down.')
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
  // Whoever the move is for, which is not always the one on the field.
  const mon = step.mon
  const declineIndex = mon.moves.length

  if (battle.selection === declineIndex) {
    queueMessages(ctx, [`${displayName(mon).toUpperCase()} did not learn the move.`])
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
  // Every way a battle can end comes through here — won, lost, caught, ran — which is
  // why the music is stopped in one place and not four.
  ctx.stopMusic()
  ctx.battle = null
  ctx.persist()
  publishStatus(ctx.save)
  // Anything that turned up during the battle may already have timed out, so the
  // home screen is told the truth before it is drawn.
  ctx.pump()
  ctx.homeSelection = 0
  ctx.setMode('home')
}
