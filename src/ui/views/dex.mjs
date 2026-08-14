import { STAT_NAMES } from '../../constants.mjs'
import { loadData, species } from '../../data.mjs'
import {
  DEFAULT_DEX_FILTER,
  dexCompletion,
  filterDex,
  nextDexFilter,
} from '../../dexFilter.mjs'
import { monSpriteFile } from '../../paths.mjs'
import { speciesGender, speciesName } from '../../pokemon.mjs'
import { timesFaced } from '../../state.mjs'
import { bold, brightYellow, dim, gray } from '../ansi.mjs'
import { fitCanvasCols, loadSprite } from '../sprite.mjs'
import { truncate } from '../text.mjs'
import {
  genderTag,
  hpBar,
  menuList,
  padRight,
  shinyTag,
  typeBadge,
  withFooter,
  wrap,
} from '../widgets.mjs'
import {
  BASE_STAT_MAX,
  COLUMN_DIVIDER,
  DEX_DETAIL_GAP,
  DEX_FILTER_HELP,
  DEX_HINTS,
  DEX_LIST_WIDTH,
  DEX_MESSAGES,
  DEX_PAGE_STEP,
  DEX_ROWS_RESERVED,
  DEX_SORT,
  DEX_SORT_LABELS,
  DEX_SPRITE_RESERVED_ROWS,
  DEX_TITLE,
  DEX_UNKNOWN_NAME,
  LIST_HEIGHT_FLOOR,
  STAT_GLYPHS,
} from './constants.mjs'
import {
  clampSelection,
  dexMark,
  dexSelectionAfterChange,
  evolutionWording,
  nextDexSort,
  sortedDex,
  zipColumns,
} from './helpers.mjs'

const GENERATIONS = [1, 2, 3, 4, 5, 6, 7]
const STATUSES = ['caught', 'seen', 'unseen']
const FORMS = ['base', 'forms']
const MAX_SEARCH_LENGTH = 40

let cachedBiomeSource = null
let cachedBiomeMembership = null

const currentFilter = (ctx) => ctx.dexFilter ?? DEFAULT_DEX_FILTER
const currentSort = (ctx) => ctx.dexSort ?? DEX_SORT.number

const arrayHas = (value, id) => Array.isArray(value) && value.includes(id)

const formCollectionHas = (save, field, id) => {
  return (
    arrayHas(save?.dex?.forms?.[field], id) ||
    arrayHas(save?.forms?.[field], id)
  )
}

const collected = (save, entry, field) => {
  const direct = arrayHas(save?.dex?.[field], entry.id)

  if (entry.formKey == null) return direct

  return direct || formCollectionHas(save, field, entry.id)
}

const collectionState = (save, entry) => {
  const caught = collected(save, entry, 'caught')
  const seen = caught || collected(save, entry, 'seen')

  return {
    caught,
    seen,
    shiny: collected(save, entry, 'shiny'),
  }
}

const biomeMembership = (data) => {
  if (cachedBiomeSource === data.biomes && cachedBiomeMembership)
    return cachedBiomeMembership

  const byId = new Map()

  for (const biome of data.biomes?.biomes ?? []) {
    for (const record of [
      ...(biome.ordinary ?? []),
      ...(biome.special ?? []),
    ]) {
      if (!byId.has(record.id)) byId.set(record.id, [])
      byId.get(record.id).push(biome.id)
    }
  }

  cachedBiomeSource = data.biomes
  cachedBiomeMembership = byId

  return byId
}

const decoratedDex = (ctx) => {
  const data = loadData()
  const memberships = biomeMembership(data)

  return data.pokedex.map((entry) => ({
    ...entry,
    ...collectionState(ctx.save, entry),
    biomes: memberships.get(entry.id) ?? [],
  }))
}

const dexEntries = (
  ctx,
  { filter = currentFilter(ctx), sort = currentSort(ctx) } = {},
) => sortedDex(filterDex(decoratedDex(ctx), filter), sort)

const typeOptions = () => {
  const types = loadData().types

  if (Array.isArray(types))
    return types
      .map((entry) =>
        typeof entry === 'string' ? entry : (entry.id ?? entry.name ?? null),
      )
      .filter(Boolean)
      .sort()

  return Object.keys(types ?? {}).sort()
}

const biomeOptions = () =>
  (loadData().biomes?.biomes ?? []).map((biome) => biome.id)

const biomeLabel = (id) => {
  const biome = (loadData().biomes?.biomes ?? []).find(
    (entry) => entry.id === id,
  )

  return biome?.name ?? id
}

const filterChips = (filter) => {
  const chips = []

  if (filter.query) chips.push(`q:${filter.query}`)
  if (filter.generation) chips.push(`G:${filter.generation}`)
  if (filter.type) chips.push(`T:${filter.type}`)
  if (filter.biome) chips.push(`B:${biomeLabel(filter.biome)}`)
  if (filter.status) chips.push(`S:${filter.status}`)
  if (filter.shiny) chips.push('shiny')
  if (filter.form) chips.push(`F:${filter.form}`)

  return chips
}

const filterBar = (ctx, cols) => {
  const filter = currentFilter(ctx)
  const chips = filterChips(filter)
  const prefix = ctx.dexSearchActive ? `Search › ${filter.query}█` : 'Filters'
  const suffix = chips.length > 0 ? chips.join(' · ') : 'none'
  const label = ctx.dexSearchActive
    ? `${prefix}${chips.length > (filter.query ? 1 : 0) ? ` · ${chips.slice(filter.query ? 1 : 0).join(' · ')}` : ''}`
    : `${prefix}: ${suffix}`

  return ` ${dim(truncate(label, Math.max(8, cols - 2)))}`
}

const header = (ctx, dataset) => {
  const completion = dexCompletion(ctx.save, dataset)
  const sortLabel = DEX_SORT_LABELS[currentSort(ctx)]

  return ` ${brightYellow('◓')} ${bold(DEX_TITLE)}   ${dim(
    `National ${completion.nationalCaught}/${completion.nationalTotal} · Forms ${completion.formsCaught}/${completion.formsTotal} · sort ${sortLabel}`,
  )}`
}

const listEntry = (mon) => {
  const number = dim(String(mon.dexNumber ?? mon.id).padStart(3, '0'))
  const mark = dexMark(mon.caught, mon.seen)
  const name = mon.seen
    ? `${speciesName(mon.id)}${genderTag(speciesGender(mon.id))}${shinyTag(mon.shiny)}`
    : gray(DEX_UNKNOWN_NAME)

  return `${number} ${mark} ${name}`
}

const detailRows = (ctx, selected) => {
  if (!selected) return []
  if (!selected.seen) return [gray(DEX_MESSAGES.noData)]

  const detail = [
    `${bold(speciesName(selected.id).toUpperCase())}${genderTag(
      speciesGender(selected.id),
    )}${shinyTag(selected.shiny)}  ${dim(
      `#${String(selected.dexNumber ?? selected.id).padStart(3, '0')}`,
    )}`,
    selected.types.map(typeBadge).join(' '),
  ]
  const faced = timesFaced(ctx.save, selected.dexNumber ?? selected.id)

  if (faced > 0)
    detail.push(dim(`Faced ${faced === 1 ? 'once' : `${faced} times`}`))
  if (selected.shiny) detail.push(dim(DEX_MESSAGES.shinyCaught))

  detail.push('')

  if (!selected.caught) {
    detail.push(dim(DEX_MESSAGES.notCaught))
    detail.push(dim(DEX_MESSAGES.fillItIn))

    return detail
  }

  detail.push(dim(DEX_MESSAGES.baseStats))

  for (const key of STAT_NAMES) {
    detail.push(
      `${STAT_GLYPHS[key]} ${hpBar(selected.stats[key], BASE_STAT_MAX, 18)} ${String(selected.stats[key]).padStart(3)}`,
    )
  }

  detail.push('')
  detail.push(
    dim(`Catch rate ${selected.captureRate} · Base exp ${selected.baseExp}`),
  )

  const evolves = (selected.evolutions ?? []).map((evolution) => {
    return `${species(evolution.to).name} ${evolutionWording(evolution)}`
  })

  if (evolves.length > 0)
    detail.push(dim(`${DEX_MESSAGES.evolvesInto} ${evolves.join(', ')}`))

  return detail
}

export const draw = (ctx, size) => {
  const { cols, rows } = size
  const data = loadData()
  const dex = dexEntries(ctx)
  const selection = clampSelection(ctx.dexSelection ?? 0, dex.length)
  const selected = dex[selection]
  const lines = [header(ctx, data.pokedex), filterBar(ctx, cols)]
  const overlays = []

  if (ctx.dexFilterHelp)
    lines.push(
      ` ${dim(truncate(DEX_FILTER_HELP.trim(), Math.max(8, cols - 2)))}`,
    )

  lines.push('')

  const entries = dex.map(listEntry)
  const listHeight = Math.max(
    LIST_HEIGHT_FLOOR,
    rows - DEX_ROWS_RESERVED - (ctx.dexFilterHelp ? 1 : 0),
  )
  const list =
    entries.length > 0
      ? menuList(entries, selection, {
          height: listHeight,
          width: DEX_LIST_WIDTH,
        })
      : [gray(DEX_MESSAGES.noMatches)]
  const detail = detailRows(ctx, selected)
  const detailLeft = DEX_LIST_WIDTH + DEX_DETAIL_GAP
  const sprite =
    selected?.seen && cols > detailLeft + 4
      ? loadSprite(monSpriteFile('front', selected.id, selected.shiny), {
          cols: Math.min(
            fitCanvasCols(size, DEX_SPRITE_RESERVED_ROWS, ctx.spriteScale),
            Math.max(4, (cols - detailLeft - 4) * 2),
          ),
        })
      : null
  const rightColumn = [...detail, '', ...(sprite ? sprite.rows : [])]

  for (const [listRow, detailRow] of zipColumns(list, rightColumn)) {
    const left = padRight(listRow, DEX_LIST_WIDTH)

    lines.push(` ${left}  ${dim(COLUMN_DIVIDER)}  ${detailRow}`)
  }

  const footer = ctx.dexSearchActive
    ? ' type to search · [backspace] erase · [enter/esc] done'
    : DEX_HINTS

  return {
    lines: withFooter(lines, dim(footer), rows),
    overlays,
  }
}

const applyFilter = (ctx, input) => {
  const before = dexEntries(ctx)
  const filter = nextDexFilter(currentFilter(ctx), input)
  const after = dexEntries(ctx, { filter })

  ctx.dexSelection = dexSelectionAfterChange(
    before,
    after,
    ctx.dexSelection ?? 0,
  )
  ctx.dexFilter = filter
}

const onSearchKey = (ctx, key) => {
  if (key.name === 'enter' || key.name === 'escape') {
    ctx.dexSearchActive = false
    return
  }

  if (key.name === 'backspace') {
    applyFilter(ctx, {
      field: 'query',
      value: currentFilter(ctx).query.slice(0, -1),
    })
    return
  }

  const char = key.name === 'space' ? ' ' : key.char

  if (
    char &&
    char.length === 1 &&
    char >= ' ' &&
    currentFilter(ctx).query.length < MAX_SEARCH_LENGTH
  ) {
    applyFilter(ctx, {
      field: 'query',
      value: `${currentFilter(ctx).query}${char}`,
    })
  }
}

export const onKey = (ctx, key) => {
  if (ctx.dexSearchActive) {
    onSearchKey(ctx, key)
    return
  }

  const dex = dexEntries(ctx)
  const total = dex.length
  const step =
    key.name === 'pageup' || key.name === 'pagedown' ? DEX_PAGE_STEP : 1

  if (key.name === 'up' || key.name === 'k')
    ctx.dexSelection = wrap((ctx.dexSelection ?? 0) - 1, total)
  else if (key.name === 'down' || key.name === 'j')
    ctx.dexSelection = wrap((ctx.dexSelection ?? 0) + 1, total)
  else if (key.name === 'pageup')
    ctx.dexSelection = Math.max(0, (ctx.dexSelection ?? 0) - step)
  else if (key.name === 'pagedown')
    ctx.dexSelection = Math.max(
      0,
      Math.min(total - 1, (ctx.dexSelection ?? 0) + step),
    )
  else if (key.name === 's') {
    const before = dex
    const nextSort = nextDexSort(currentSort(ctx))
    const after = dexEntries(ctx, { sort: nextSort })

    ctx.dexSelection = dexSelectionAfterChange(
      before,
      after,
      ctx.dexSelection ?? 0,
    )
    ctx.dexSort = nextSort
  } else if (key.name === '/') {
    ctx.dexSearchActive = true
    ctx.dexFilterHelp = false
  } else if (key.name === 'g')
    applyFilter(ctx, { field: 'generation', values: GENERATIONS })
  else if (key.name === 't')
    applyFilter(ctx, { field: 'type', values: typeOptions() })
  else if (key.name === 'b')
    applyFilter(ctx, { field: 'biome', values: biomeOptions() })
  else if (key.name === 'c')
    applyFilter(ctx, { field: 'status', values: STATUSES })
  else if (key.name === 'y') applyFilter(ctx, { field: 'shiny' })
  else if (key.name === 'f') applyFilter(ctx, { field: 'form', values: FORMS })
  else if (key.name === 'x') applyFilter(ctx, { reset: true })
  else if (key.name === '?') ctx.dexFilterHelp = !ctx.dexFilterHelp
  else if (key.name === 'escape' || key.name === 'q') ctx.setMode('home')
}
