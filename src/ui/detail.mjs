import { move as moveData, species } from '../data.mjs'
import { expProgress } from '../exp.mjs'
import {
  canEvolveByStone,
  displayName,
  genderOf,
  levelOf,
  levelUpEvolution,
} from '../pokemon.mjs'
import { bold, brightYellow, dim } from './ansi.mjs'
import {
  expBar,
  genderTag,
  hpBar,
  padRight,
  statusTag,
  typeBadge,
} from './widgets.mjs'
import { EVOLVES_MARK, LEVEL_EVO_PREFIX } from './views/constants.mjs'

const evolutionLine = (mon) => {
  const stone = canEvolveByStone(mon)
  const levelEvo = levelUpEvolution(mon)

  if (!stone && !levelEvo) return null

  const star = brightYellow(EVOLVES_MARK)

  if (stone && !levelEvo) return `${star} evolves with a stone`

  const label = `${LEVEL_EVO_PREFIX}${levelEvo.level}`
  const ready = levelOf(mon) >= levelEvo.level
  const levelPart = ready ? brightYellow(label) : dim(label)

  if (stone) return `${star} stone · evolves ${levelPart}`

  return `evolves ${levelPart}`
}

export const monDetail = (mon) => {
  const lines = []

  lines.push(
    `${bold(displayName(mon).toUpperCase())}${genderTag(genderOf(mon))} ${dim(
      `Lv${levelOf(mon)}`,
    )} ${statusTag(mon.status)}`,
  )
  lines.push(species(mon.species).types.map(typeBadge).join(' '))

  const evo = evolutionLine(mon)

  if (evo) lines.push(evo)

  lines.push('')
  lines.push(
    `HP  ${hpBar(mon.hp, mon.stats.hp, 22)} ${dim(`${mon.hp}/${mon.stats.hp}`)}`,
  )

  const progress = expProgress(mon.species, mon.exp)
  lines.push(
    `EXP ${expBar(progress.fraction, 22)} ${dim(
      progress.needed > 0 ? `${progress.into}/${progress.needed}` : 'max',
    )}`,
  )
  lines.push('')

  lines.push(dim('Stats'))
  lines.push(
    `  Atk ${String(mon.stats.attack).padStart(3)}   Def ${String(mon.stats.defense).padStart(3)}   Spd ${String(mon.stats.speed).padStart(3)}`,
  )
  lines.push(
    `  SpA ${String(mon.stats.spAttack).padStart(3)}   SpD ${String(mon.stats.spDefense).padStart(3)}`,
  )
  lines.push('')

  lines.push(dim('Moves'))

  for (const slot of mon.moves) {
    const data = moveData(slot.move)
    const power = data.power ? `${data.power}` : '—'

    lines.push(
      `  ${padRight(data.name, 15)} ${typeBadge(data.type)} ${dim(`pow ${padRight(power, 4)} pp ${slot.pp}/${slot.maxPp}`)}`,
    )
  }

  return lines
}
