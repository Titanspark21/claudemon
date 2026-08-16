# Claudemon Generation VII Expansion

## Product

Claudemon is a local terminal Pokémon companion driven by Claude Code
activity. Prompts and time spent working move the player through the world,
produce encounters, raise Pokémon, and advance expeditions. The player glances
at and occasionally interacts with a dedicated terminal tab while continuing
their real work.

This fork expands the original Kanto game into a broad Generation VII
collection and battle experience without turning it into a tile-map RPG or an
online service.

## Audience and experience

The player uses Claude Code and wants a rewarding passive companion rather
than another application demanding constant attention. Normal play must remain
legible from across a desk, require few keys, preserve progress locally, and
never block Claude Code.

The intended rhythm is:

1. Claude works and the trainer advances through the current biome.
2. Large biome-specific encounter pools produce varied wild Pokémon and
   trainers.
3. The player briefly switches to Claudemon to battle, catch, manage a team,
   equip items, or make a travel choice.
4. Long-term goals are Pokédex completion, form and shiny collection, team
   building, badges, the League, breeding, and achievements.

## Non-goals

- No accounts, backend, networked gameplay, telemetry, advertisements, cloud
  saves, leaderboards, PvP, matchmaking, Discord integration, or live service.
- No tile-map overworld or manual step-by-step movement.
- No EV training system.
- No doubles or multi battles.
- No Z-Move or Z-Crystal subsystem.
- No separate collectible for every purely cosmetic Unown letter, Vivillon
  pattern, Pikachu cap, Furfrou trim, or equivalent appearance.
- No promise of cartridge-perfect behavior for an effect explicitly marked as
  deferred. Supported effects must nevertheless be internally consistent and
  must not silently lie.

## Pokémon content

The National Pokédex contains all 809 base species through the end of
Generation VII. National completion counts these 809 base species.

The game also contains:

- all 18 Alolan regional forms;
- every other Gen I–VII form that changes battle-relevant stats, types,
  abilities, or learnsets and can be represented coherently by the supported
  mechanics;
- all Mega Evolutions released before Generation VIII;
- Primal forms and other battle transformations when their triggering
  mechanic is supported;
- a representative base record for purely cosmetic form families.

Form completion is tracked separately from the 809-species National count.
Wild encounters never produce battle-only transformations such as Megas.

## Pokémon identity

Every data record has a unique numeric `id`. Base species retain National Dex
IDs `1` through `809`. Collectible alternate forms use generated synthetic
numeric IDs and also store:

- `dexNumber`: the base National Dex number;
- `baseSpecies`: the base record ID;
- `formKey`: a stable normalized form name;
- `collectible`: whether the form can permanently exist in a save;
- `battleOnly`: whether the record may exist only inside battle state.

Using separate numeric records is intentional. It keeps the existing species
lookup, sprite lookup, evolution, encounter, and stat machinery simple while
allowing the UI to display the correct National number.

Synthetic IDs are generated from a pinned manifest and never reassigned.
Collectible and battle-only ranges do not overlap. A generated validation file
detects collisions and accidental renumbering.

Megas and other temporary transformations replace the active battle record but
never replace the saved Pokémon's permanent species ID.

## Data and sources

Generated JSON is checked into `data/` and the game remains fully offline at
runtime.

Primary sources are:

- [PokéAPI REST v2](https://pokeapi.co/docs/v2) for capture rates, growth
  curves, evolution chains, gender, egg groups, habitats, held-by-species
  rarity, and encounter-location evidence;
- [@pkmn/data and @pkmn/dex](https://github.com/pkmn/ps) pinned to a recorded
  revision for Generation VII battle data, including species, forms, stats,
  types, abilities, items, moves, and learnsets;
- [Pokémon Showdown](https://github.com/smogon/pokemon-showdown) as the
  MIT-licensed mechanics reference for effect semantics and ordering;
- Pokémon Showdown's `gen5`, `gen5-back`, `gen5-shiny`, and
  `gen5-back-shiny` sprite directories as the primary install-time sprite
  source, with the [PokéAPI sprite repository](https://github.com/PokeAPI/sprites)
  as fallback.

Generators pin source revisions, cache responses, normalize only consumed
fields, record provenance, rate-limit PokéAPI requests with retry/backoff, and
produce deterministic output. Bulbapedia, Fandom, Serebii, ROM-hack packs,
and other fan pages are not scraped.

Sprite artwork is not redistributed. Installation downloads sprites, checks
every required front/back/shiny variant, reports exact omissions, and retains
source attribution. Every manifest entry must resolve to either its exact
variant, an approved alternate source, or the existing unavailable-sprite
placeholder; a missing optional back/shiny variant must not make installation
unusable.

## Save and trade compatibility

Save and trade payloads are versioned. Migrations are forward-only,
idempotent, and preserve the original file until an atomic replacement is
successfully written.

Existing Pokémon keep their species, nickname, experience, IVs, moves, HP,
status, shiny state, and catch order. New nature and ability fields for old
saves are derived deterministically from stable existing values such as the
species ID and IV tuple. Loading the same old save repeatedly cannot reroll
them.

National Dex state and form collection state are partitioned. Existing
`dex.seen`, `dex.caught`, `dex.shiny`, and `dex.faced` track base National
numbers `1–809`; a nested form collection tracks synthetic collectible IDs.
Seeing or catching a collectible form updates both its base National entry and
its form entry. Battle-only transformations never enter either collection.
Earned Kanto achievements retain their IDs and earned timestamps when broader
Gen-VII achievements are introduced.

All state writers use one shared lock/merge/atomic-replace boundary. Multiple
Claude hook processes and an open Claudemon UI cannot overwrite newer worked,
expedition, inventory, or save state with a stale copy.

Unknown newer fields are rejected or normalized at the storage boundary rather
than crashing during rendering. Trade codes declare their format version and
reject unsupported future records clearly.

## IVs and natures

Every Pokémon retains six IVs from `0` to `31`. Pokémon detail shows each value
and the total IV percentage. No IV is hidden after capture.

All 25 natures are supported. Twenty modify one non-HP stat by `1.1` and
another by `0.9`; five are neutral. Nature modifiers are applied in stat
calculation and remain stable through levelling, evolution, forms, trading,
daycare, and migration. The UI names the raised and lowered stats.

There is no EV system.

## Abilities

Every Pokémon stores and displays one ability. Wild Pokémon roll evenly from
their normal ability slots; an eligible hidden ability has a 5% chance before
the normal-slot roll.
Breeding, evolution, forms, and trading preserve or legally remap abilities.

All main-series abilities available in Generation VII are imported and given
one machine-readable coverage status:

- `supported`: implemented and tested;
- `no-effect-in-singles`: legitimately irrelevant to Claudemon's battle mode;
- `blocked-by-excluded-system`: depends only on an explicit non-goal such as
  doubles or Z-Moves;
- `deferred-complex-one-off`: requires a disproportionate isolated subsystem,
  with a concrete reason.

Shared behavior is implemented through reusable effect handlers. There is no
arbitrary target such as “50 abilities.” Every ability that fits an existing
hook or a modest one-off handler is implemented. Data validation fails when an
ability used by an included Pokémon lacks a coverage classification.

## Items

The data set imports every item available through Generation VII and classifies
it. Claudemon implements every item meaningful to its supported collection,
capture, evolution, breeding, field, consumable, and singles-battle systems
when the effect can use a shared handler or modest one-off implementation.

The following are excluded rather than treated as missing gameplay:

- key and story items with no Claudemon function;
- contest, mail, and purely cosmetic items;
- effects useful only in doubles;
- Z-Crystals;
- effects whose sole purpose depends on an explicitly deferred move or system.

Each excluded item has a machine-readable status and reason. Validation fails
on unclassified items.

Pokémon hold at most one item. Detail screens allow safe equip, swap, and
unequip operations. Replacing an item returns the prior item to the bag.
Consumed held items leave the inventory exactly once. Closing or losing a
battle cannot duplicate an item.

Wild and ordinary trainer battles journal held-item consumption and commit it
once when the battle resolves, including a loss or flee. A crash before battle
resolution reloads the last saved state. Gym and League gauntlets retain their
existing whole-run rollback rule, so withdrawal or loss restores the complete
pre-run inventory snapshot.

Common held items enter badge-gated shop stock. Canonical species-held items
may appear on caught wild Pokémon using source rarity. Mega Stones and other
special items are progression rewards. The UI identifies an item's actual
effect and whether it is consumed.

## Moves

Generation VII level-up learnsets and move data are imported. Ordinary damage,
status, stat-stage, multi-hit, priority, drain, recoil, healing, fixed-damage,
critical, flinch, and ailment effects use generic handlers.

Every imported move has the same coverage discipline as abilities and items.
Modest one-off moves are implemented. Genuinely complex moves are classified
with a reason. Selecting an unsupported move produces a clear failure message;
it never performs a generic but incorrect attack.

Opponent AI only selects moves whose coverage is executable in the current
battle. A deferred move remains visible in data but cannot waste an opponent's
turn.

Evolution and move learning use the included form's legal Gen-VII data. When a
canonical evolution condition has no meaningful Claudemon equivalent, the
normalized data declares a simple documented substitute rather than leaving
the evolution impossible.

Move slot order belongs to the player. Team > Move Order lists a Pokémon's
four slots; `[enter]` picks a move up, the arrow keys slide it through the
slots and wrap at either end, `[enter]` drops it, and `[esc]` puts it back
exactly where it was. A dropped move is saved immediately; an abandoned
reorder writes nothing. Slot order is the order the Fight menu shows.

Trade evolutions use a reusable Link Cable item; trade evolutions that also
require a held item require that item plus the Link Cable. When one trigger can
produce both a normal and Alolan result, the evolution screen asks the player
which legal form to choose. Breeding uses explicit family-root and egg-group
data rather than recursive synthetic-ID assumptions; a regional child requires
the regional parent to hold an Everstone, otherwise the family hatches in its
base form.

## Battle effect engine

Abilities, held items, moves, weather, terrain, and transformations run through
a lightweight ordered effect pipeline. The pipeline supports these phases:

1. battle start;
2. switch out and switch in;
3. before action and action prevention;
4. priority, speed, accuracy, move type, power, and damage modification;
5. immunity and status attempts;
6. after hit and after damage;
7. item activation and consumption;
8. faint handling;
9. end of turn.

Effects return explicit modifications or events; they do not mutate unrelated
state invisibly. Ordering between move, field, ability, and item effects is
deterministic and tested. The engine remains singles-only and continues to emit
the event stream consumed by the existing terminal animation layer.

## Weather and terrain

The supported weather states are rain, harsh sunlight, sandstorm, and hail.
The supported terrains are Electric, Grassy, Psychic, and Misty Terrain.

Battle field state stores the active condition, source, and remaining turns.
Starting a new condition replaces the previous condition of that category.
Weather and terrain affect damage, speed, status, grounded checks, healing,
end-of-turn damage, abilities, and held items where applicable. Duration items
extend conditions through the same effect system.

The battle UI always shows the active weather and terrain with remaining
turns. Any deliberate simplification is documented in the coverage data and
tested; it is not hidden.

## Mega Evolution

A Pokémon holding its matching Mega Stone can Mega Evolve once per side per
battle. The player explicitly toggles Mega Evolution before choosing or
confirming a move. Transformation occurs before move order is resolved.

Mega Evolution changes the active sprite, battle species record, stats, types,
and ability. Current HP preserves its proportion of maximum HP. The Pokémon
reverts when battle ends, and its permanent collection identity never changes.
Charizard and Mewtwo stones select the correct X or Y record. Trainer teams may
be configured to Mega Evolve under the same one-per-side rule.

## Biomes

The world contains nine ecosystems:

1. Meadow
2. Forest
3. Wetlands
4. Coast
5. Highlands
6. Badlands
7. Frostlands
8. City & Powerworks
9. Mystic Ruins

Nine is intentional. Water is split between Wetlands and Coast; industrial and
urban species retain a distinct home; supernatural and ancient species are not
forced into ordinary natural terrain; and harsh hot and cold environments stay
recognizable. Fewer biomes would collapse these identities, while more would
make pools unnecessarily narrow.

Biome memberships deliberately overlap; the sum of all biome pool sizes is
therefore larger than the number of unique Pokémon. Ecological specialists
belong to one biome, most records belong to two, and genuine generalists may
belong to three. The generator targets an average of `2.0` memberships per
ordinary encounter-eligible record and uses this evidence order:

1. curated overrides;
2. aggregated PokéAPI location encounters through Generation VII;
3. PokéAPI habitat where present;
4. primary and secondary types;
5. egg groups;
6. evolution-family inheritance.

The generator writes `data/biomes.json` and a human-readable coverage report.
After generation, it calculates `expectedPoolSize = totalOrdinaryMemberships /
9`; every biome must be within 15% of that derived average. This replaces an
arbitrary fixed range. With the expected eligible dataset, pools should land
at roughly 145–205 ordinary records, but the generated calculation is the
release gate. Validation also requires every eligible record to be assigned
to one through three biomes. Family coherence is a scored preference, not a
rule that may break those limits. Manual overrides handle legendaries, unusual
forms, and obvious lore mismatches. Legendary and special encounters use
gated overlays and do not distort ordinary-pool balancing.

Encounter weight uses capture rate, evolution stage, legendary status, current
lead level, and biome affinity. Large pools remain varied without making rare
or legendary Pokémon common. Day/night encounter weighting and seasons are
not implemented.

## Expedition travel

A biome visit has a deterministic triangular active-work duration with a
30-minute minimum, 40-minute mode, and 65-minute maximum. Its exact expected
duration is `(30 + 40 + 65) / 3 = 45` minutes. Wall-clock time while Claude is
idle does not advance it. New and migrated saves begin in Meadow with a newly
seeded visit.

When the forced-change target is reached, the expedition leaves the current
biome. Staying is not available. If Claudemon is open, the player chooses
between two neighboring destinations. If no choice is made, or Claudemon is
closed, the next activity tick deterministically chooses one of those paths
before another encounter is rolled. The player therefore spends no additional
encounter time in the expired biome.

Independently, 40% of visits receive one optional fork after a deterministic
15–30 minutes of active work. It offers Stay plus two neighboring biomes.
Choosing a destination starts a fresh visit there. Choosing Stay dismisses the
offer without resetting the original forced-change target. Ignoring the offer
also keeps the current biome and original timer; the offer remains available
until dismissed, accepted, or superseded by the forced change.

Biome, visit seed, elapsed active work, forced target, optional-fork roll,
optional-fork target, offered paths, and pending departure state persist across
restarts. There is no initial all-species roaming mode because it would erase
the purpose of biomes.

## Pokédex and collection UI

The Pokédex supports name and number search plus filters for generation, type,
biome, caught/seen/unseen, shiny, and form. It shows National completion out of
809 and form completion separately. Lists remain usable in narrow terminals
through paging and compact filters rather than rendering hundreds of rows.

Pokémon detail shows nature, ability, held item, all IVs, total IV percentage,
types, stats, experience, moves, status, evolution, form, and shiny state.

Battle screens show ability/item activations, weather, terrain, Mega readiness,
and field duration without obscuring the existing battle menu or sprites.

## Existing systems and progression

Gyms, trainer battles, catching, shinies, levelling, move learning, evolution,
team, box, daycare, breeding, trade codes, shop, trainer records, achievements,
audio, and update behavior remain supported and become data-size independent.

After eight badges, the Pokémon League unlocks. It reuses the gym gauntlet
transaction model for the Elite Four and Champion, including rollback on loss
or withdrawal.

All systems that count `151` use generated dataset totals. Achievements clearly
distinguish National completion from optional form and shiny goals.

Multiple simultaneous Claude sessions contribute to one world without being
misread as one session, double-counting active time, or racing save writes.
This must be correct before biome timing depends on shared activity.

## Error behavior

- Missing or invalid generated data stops startup with the exact generator or
  repair command.
- Missing sprites show the existing unavailable placeholder and an install
  report identifies the precise source URL that failed.
- Unsupported mechanics fail visibly and retain their coverage reason.
- Atomic writes protect saves, activity, biome state, and generated manifests.
- Invalid future save or trade versions are rejected without overwriting the
  original data.
- An interrupted battle cannot leave a permanent Mega form or duplicate a
  consumed held item.

## Terminal and accessibility constraints

The UI remains keyboard-only with arrows, Enter, Escape, and short mnemonic
keys. It supports Windows Terminal, iTerm2, Kitty, and other terminals already
supported upstream. New panels must work at the repository's documented
minimum terminal size and scale cleanly at larger sizes.

Information is never conveyed only by color. Weather, terrain, rarity, shiny,
nature modifiers, coverage warnings, and selections have textual or glyph
labels. Motion remains quick and can reuse existing sound and sprite settings.

## Acceptance criteria

- All 809 base species and included forms pass generated data validation.
- Required front/back/shiny sprite URLs validate or have declared fallbacks.
- Every included species has legal stats, types, learnset, evolution data,
  biome assignments, ability choices, and a stable display identity.
- Every imported ability, item, and move has a coverage classification; CI
  reports zero unclassified records.
- Every `supported` mechanic has focused tests plus cross-system interaction
  tests for ordering, switching, fainting, weather, terrain, items, abilities,
  transformations, saving, and migration.
- Old saves and trade codes migrate or reject safely without data loss.
- Biome simulations demonstrate the required pool breadth and bounded travel
  duration.
- Full lint, formatting, tests, and coverage pass.
- Manual terminal verification covers a fresh game, an old migrated save,
  biome transition, wild encounter, held-item activation, ability activation,
  weather/terrain, Mega Evolution, Pokédex filtering, and League unlock.
