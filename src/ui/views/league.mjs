import { opponentLevelRange } from '../../gym.mjs'
import {
  currentLeagueOpponent,
  leagueOpponents,
  leagueUnlocked,
} from '../../league.mjs'
import { displayName, genderOf, isFainted, levelOf } from '../../pokemon.mjs'
import { trainerLabel } from '../../trainer.mjs'
import { bold, brightGreen, brightYellow, dim, gray } from '../ansi.mjs'
import {
  genderTag,
  hpBar,
  padRight,
  panel,
  statusTag,
  withFooter,
  wrap,
} from '../widgets.mjs'
import {
  GYM_ROSTER_MARKS,
  GYM_ROSTER_NAME_WIDTH,
  HOME_TEAM_PANEL_TITLE,
  LEAD_MARK,
  LEAGUE_HINTS,
  LEAGUE_PREVIEW_HINTS,
  LEAGUE_ROSTER_PANEL_TITLE,
  LEAGUE_SCREEN_MESSAGES,
  LEAGUE_TITLE,
  MAX_GYM_WIDTH,
  MON_NAME_WIDTH,
} from './constants.mjs'
import { clampSelection, levelRangeLabel, noteRows } from './helpers.mjs'

const rosterMark = (run, index) => {
  if (!run) return gray(GYM_ROSTER_MARKS.pending)
  if (index < run.index) return brightGreen(GYM_ROSTER_MARKS.beaten)
  if (index === run.index) return brightYellow(GYM_ROSTER_MARKS.next)
  return gray(GYM_ROSTER_MARKS.pending)
}

const rosterRow = (opponent, run, index) => {
  const beaten = run && index < run.index
  const label = trainerLabel(opponent)
  const name = beaten ? gray(label) : label

  return ` ${rosterMark(run, index)} ${padRight(name, GYM_ROSTER_NAME_WIDTH)} ${dim(
    levelRangeLabel(opponentLevelRange(opponent)),
  )} ${dim(`×${opponent.team.length}`)}`
}

const partyRow = (mon, index, cursor) => {
  const chosen = index === cursor
  const raw = `${displayName(mon).toUpperCase()}${genderTag(genderOf(mon))}`
  const name = isFainted(mon) ? gray(raw) : raw
  const lead = index === 0 ? brightYellow(LEAD_MARK) : ' '
  const tag = statusTag(mon.status)

  return ` ${chosen ? '▶' : ' '}${lead} ${padRight(name, MON_NAME_WIDTH)} ${dim(
    `Lv${levelOf(mon)}`,
  )} ${hpBar(mon.hp, mon.stats.hp, 10)} ${dim(`${mon.hp}/${mon.stats.hp}`)}${
    tag ? ` ${tag}` : ''
  }`
}

const prompt = (ctx) => {
  if (ctx.leagueLeaving) return LEAGUE_SCREEN_MESSAGES.confirmLeave
  if (ctx.bagMessage) return ctx.bagMessage
  if (ctx.leagueMessage) return ctx.leagueMessage
  if (!ctx.league) {
    return leagueUnlocked(ctx.save)
      ? `${brightGreen('[enter]')} ${LEAGUE_SCREEN_MESSAGES.ready}`
      : LEAGUE_SCREEN_MESSAGES.locked
  }

  return `${brightGreen('[enter]')} challenge ${bold(
    trainerLabel(currentLeagueOpponent(ctx.league)),
  )}`
}

export const draw = (ctx, size) => {
  const width = Math.min(size.cols - 2, MAX_GYM_WIDTH)
  const opponents = leagueOpponents()
  const party = ctx.save.party
  const cursor = clampSelection(ctx.teamSelection, party.length)
  const championships = ctx.save.league?.championships ?? 0
  const head = [
    ` ${brightYellow('◓')} ${bold(LEAGUE_TITLE)}  ${dim(
      `${championships} championship${championships === 1 ? '' : 's'}`,
    )}`,
    '',
  ]
  const roster = opponents.map((opponent, index) =>
    rosterRow(opponent, ctx.league, index),
  )
  const body = [
    ...panel(roster, width, { title: LEAGUE_ROSTER_PANEL_TITLE }),
    '',
    ...panel(
      party.map((mon, index) => partyRow(mon, index, cursor)),
      width,
      { title: HOME_TEAM_PANEL_TITLE },
    ),
  ].map((row) => ` ${row}`)
  const tail = [
    '',
    ...noteRows(prompt(ctx)).map((row) => ` ${row}`),
    ` ${dim(LEAGUE_SCREEN_MESSAGES.rollback)}`,
  ]
  const budget = Math.max(0, size.rows - 2 - head.length - tail.length)

  return {
    lines: withFooter(
      [...head, ...body.slice(0, budget), ...tail],
      dim(ctx.league ? LEAGUE_HINTS : LEAGUE_PREVIEW_HINTS),
      size.rows,
    ),
    overlays: [],
  }
}

export const onKey = (ctx, key) => {
  if (!ctx.league) {
    if (key.name === 'escape') {
      ctx.homeSelection = 0
      ctx.setMode('home')
    } else if (key.name === 'enter' || key.name === 'space') {
      ctx.startLeagueRun()
    }
    return
  }

  const total = ctx.save.party.length

  if (key.name === 'escape') {
    ctx.confirmLeaveLeague()
    return
  }
  if (ctx.leagueLeaving) {
    ctx.cancelLeaveLeague()
    return
  }

  ctx.leagueMessage = null
  ctx.bagMessage = null

  if (key.name === 'up' || key.name === 'k')
    ctx.teamSelection = wrap(ctx.teamSelection - 1, total)
  else if (key.name === 'down' || key.name === 'j')
    ctx.teamSelection = wrap(ctx.teamSelection + 1, total)
  else if (key.name === 'enter' || key.name === 'space') ctx.startLeagueBattle()
  else if (key.name === 'i') ctx.openBag()
  else if (key.name === 'l') ctx.makeLead(ctx.teamSelection)
}
