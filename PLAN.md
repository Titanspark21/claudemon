# Generation VII Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox syntax for tracking. Read `AGENTS.md`, `SPEC.md`, `PLAN.md`,
> `tree.txt`, and `CLAUDE.md` before starting.

**Goal:** Expand Claudemon into a complete offline Generation VII terminal
companion with comprehensive classified mechanics and autonomous biome travel.

**Architecture:** Preserve the local ESM/JSON/ANSI application and replace
Kanto constants with generated, pinned Generation VII data. Add a small ordered
battle-effect pipeline used by moves, abilities, held items, weather, terrain,
and transformations. Represent forms as additional numeric species records and
generate overlapping biome pools from reproducible evidence plus reviewed
overrides.

**Tech Stack:** Node.js 20.19+, ESM `.mjs`, Vitest, ESLint, Prettier, PokéAPI
REST v2, pinned `@pkmn/data`/`@pkmn/dex`, Pokémon Showdown mechanics and
install-time sprites.

**Spec:** `SPEC.md`

## Global Constraints

- Runtime remains fully local, offline, account-free, telemetry-free, and has
  no runtime dependencies.
- Base National Dex IDs are `1–809`; generated collectible and battle-only
  synthetic ID ranges are stable and non-overlapping.
- National completion counts 809 base species; forms are tracked separately.
- No EVs, doubles, Z-Moves, Z-Crystals, PvP, Discord, backend, or cloud state.
- Generated data is checked in, reproducible, provenance-pinned, and never
  hand-edited.
- Sprites are downloaded and validated during installation, not committed.
- Every imported move, ability, and item has an explicit coverage status and
  reason. Zero unclassified records is a release gate.
- Existing saves and trade codes must migrate or reject safely without loss.
- Follow the flat-module architecture and every rule in `CLAUDE.md`; tests are
  mandatory for each new module.
- Tick tasks and subtasks live. Delete a dated batch immediately when every
  checkbox in that batch is complete.

---

## Bugs

### 2026-08-13 — Generation VII expansion

### Task B1: Make simultaneous Claude sessions feed one world safely

**Problem:** GitHub issue #37 reports that concurrent sessions are read as one.
Biome time cannot be correct if overlapping work is double-counted or if one
session overwrites another.

**Files:**

- Create: `src/fileLock.mjs`
- Create: `src/fileLock.test.mjs`
- Modify: `src/activity.mjs`
- Modify: `src/worked.mjs`
- Modify: `src/app.mjs`
- Modify: `src/state.mjs`
- Modify: `src/status.mjs`
- Modify: `src/transformers.mjs`
- Modify: `scripts/on-activity.mjs`
- Test: `test/activity.test.mjs`
- Test: `src/worked.test.mjs`
- Test: `test/app.test.mjs`

**Interfaces:**

```js
summariseActivity(sessions, now) -> { state, tool, since, sessions, activeSince }
mergeWorkedIntervals(worked, intervals) -> worked
recordActiveWindow(worked, { session, from, to }) -> worked
```

- [ ] Add failing tests for two overlapping sessions, two non-overlapping
      sessions, a stale session, and events arriving out of order. Expected:
      overlapping intervals count once, distinct intervals both count, and the
      visible tool/state still follows activity priority.
- [ ] Run `npm test -- test/activity.test.mjs src/worked.test.mjs` and confirm
      the new overlap assertions fail without changing existing assertions.
- [ ] Normalize per-session active intervals at the file boundary and merge
      their union before increasing total worked time.
- [ ] Add one shared lock/merge/atomic-replace helper for activity, worked,
      expedition, inventory, and save writes; ensure an older hook or second UI
      process cannot replace newer state.
- [ ] Publish the active biome and visit revision through `status.json` so the
      separate `scripts/on-activity.mjs` process rolls from the correct biome
      without loading or racing the full save.
- [ ] Update the app tick path to consume merged active time rather than a
      single leader session.
- [ ] Run the focused tests and confirm they pass.
- [ ] Run `npm run coverage` and confirm issue #37 scenarios pass with coverage
      thresholds unchanged.
- [ ] Commit: `fix: count concurrent Claude work once`

### Task B2: Introduce idempotent save, config, biome, and trade migrations

**Problem:** New persistent fields are unsafe until old files can be upgraded
atomically and future versions can be rejected without overwriting originals.

**Files:**

- Create: `src/migrations.mjs`
- Create: `src/migrations.test.mjs`
- Modify: `src/state.mjs`
- Modify: `src/trade.mjs`
- Modify: `src/transformers.mjs`
- Modify: `src/constants.mjs`
- Test: `src/transformers.test.mjs`
- Test: `src/trade.test.mjs`

**Interfaces:**

```js
migrateSave(rawSave) -> currentSave
migratePokemon(mon, saveIdentity) -> currentPokemon
migrateTrade(rawTrade) -> currentTrade
stablePokemonRoll(mon, namespace) -> unsignedInteger
```

- [ ] Add fixtures for a current upstream save, a partially populated save,
      repeated migration, a future save, an old trade, and a future trade.
- [ ] Add migration fixtures that partition synthetic form IDs from National
      Dex state, never persist battle-only IDs, and preserve every already
      earned Kanto achievement ID/timestamp.
- [ ] Assert that repeated migration produces byte-equivalent normalized data,
      preserves every existing Pokémon field, and deterministically adds nature,
      ability, held item, and expedition state.
- [ ] Run `npm test -- src/migrations.test.mjs src/transformers.test.mjs src/trade.test.mjs`
      and confirm missing migration functions fail.
- [ ] Implement sequential version migrations with stable rolls derived from
      species and IVs; do not use runtime randomness during migration.
- [ ] Preserve the source file until validation and atomic rename succeed.
- [ ] Create a recoverable pre-migration backup before the first replacement;
      never overwrite that backup during an idempotence check.
- [ ] Reject future versions with a user-readable message and no write.
- [ ] Run the focused tests twice to prove no rerolls, then run coverage.
- [ ] Commit: `fix: migrate old saves without rerolling Pokemon`

---

## Visual

### 2026-08-13 — Generation VII expansion

### Task V1: Redesign Pokémon detail for nature, ability, held item, and IVs

**Files:**

- Modify: `src/ui/detail.mjs`
- Modify: `src/ui/views/team.mjs`
- Modify: `src/ui/views/box.mjs`
- Modify: `src/ui/views/daycare.mjs`
- Modify: `src/ui/views/constants.mjs`
- Test: `src/ui/detail.test.mjs`
- Test: `src/ui/views/helpers.test.mjs`

**Interfaces:**

```js
ivPercentage(ivs) -> number
natureLabel(nature) -> string
abilityLabel(mon) -> string
heldItemLabel(mon) -> string
monDetail(mon, options) -> string[]
```

- [ ] Add failing snapshot-style text assertions for 80-column, minimum-width,
      neutral nature, modified nature, hidden ability, held item, no held item,
      perfect IVs, and zero IVs.
- [ ] Run `npm test -- src/ui/detail.test.mjs` and confirm the new labels are
      absent.
- [ ] Add a compact Identity block showing form, nature with `+/-` stats,
      ability, and held item, followed by six numeric IVs and total percentage.
- [ ] Ensure narrow layouts page or stack content without truncating move names
      into the IV block; information must not rely only on color.
- [ ] Run focused UI tests, then launch `node bin/claudemon` at the documented
      minimum size and a wide terminal and capture both layouts.
- [ ] Commit: `visual: show Pokemon identity and IV details`

### Task V2: Add Pokédex search, scalable filters, and separate completion

**Files:**

- Create: `src/dexFilter.mjs`
- Create: `src/dexFilter.test.mjs`
- Modify: `src/ui/views/dex.mjs`
- Modify: `src/ui/views/helpers.mjs`
- Modify: `src/ui/views/constants.mjs`
- Modify: `src/app.mjs`
- Test: `test/app.test.mjs`

**Interfaces:**

```js
filterDex(entries, { query, generation, type, biome, status, shiny, form }) -> entries
dexCompletion(save, dataset) -> { nationalCaught, nationalTotal, formsCaught, formsTotal }
nextDexFilter(current, input) -> filter
```

- [ ] Add failing tests for combined filters, accent/case-insensitive name
      search, numeric search, synthetic forms, an empty result, stable cursor
      position, and National count excluding forms.
- [ ] Run `npm test -- src/dexFilter.test.mjs src/ui/views/helpers.test.mjs` and
      confirm failures.
- [ ] Implement pure filtering independently of terminal rendering.
- [ ] Add a compact filter bar and keyboard flow that keeps arrows for list
      navigation and exposes search/filter help without crowding narrow terminals.
- [ ] Show `x/809` National completion and a separate forms figure.
- [ ] Verify with generated 809-species fixture data and manually exercise each
      filter in the real app.
- [ ] Commit: `visual: make the expanded Pokedex searchable`

### Task V3: Draw biome travel and fork decisions on the home screen

**Files:**

- Create: `src/ui/views/biome.mjs`
- Create: `src/ui/views/biome.test.mjs`
- Modify: `src/ui/views/home.mjs`
- Modify: `src/ui/views/constants.mjs`
- Modify: `src/ui/grass.mjs`
- Modify: `src/app.mjs`

**Interfaces:**

```js
drawBiomeStatus(expedition, size) -> string[]
drawFork(expedition, selection, size) -> string[]
onBiomeKey(ctx, key) -> void
```

- [ ] Add failing rendering tests for all nine biome names, normal progress,
      optional fork with Stay selected, mandatory departure without Stay,
      automatic-choice warning, and narrow layout.
- [ ] Run `npm test -- src/ui/views/biome.test.mjs` and confirm failures.
- [ ] Add a small persistent biome label/progress row without displacing the
      encounter countdown or party panel.
- [ ] Add an unobtrusive optional-fork panel with Stay and two destinations,
      plus a distinct mandatory-departure panel containing only two
      destinations and explaining that inactivity selects a path automatically.
- [ ] Give each biome a distinct but restrained grass/background palette or
      glyph treatment; preserve monochrome readability.
- [ ] Launch the app with fixture states for every biome and capture the normal
      and fork layouts at small and large sizes.
- [ ] Commit: `visual: show biome expeditions and travel forks`

### Task V4: Surface field effects, activations, held items, and Mega state

**Files:**

- Modify: `src/ui/views/battle.mjs`
- Modify: `src/ui/battleField.mjs`
- Modify: `src/ui/views/constants.mjs`
- Modify: `src/battleEvents.mjs`
- Test: `src/ui/battleField.test.mjs`
- Test: `src/battleEvents.test.mjs`

**Interfaces:**

```js
fieldStatusRows(field) -> string[]
megaPrompt(battle) -> string
effectAnnouncement(event) -> string
```

- [ ] Add failing tests for weather/terrain duration, ability reveal, item
      activation/consumption, Mega-ready toggle, Mega transformation, and no-field
      compact layout.
- [ ] Run the focused tests and confirm the missing event/UI cases fail.
- [ ] Render field effects above the move menu, not over sprites or HP bars.
- [ ] Render ability and item activations through battle messages and expose
      held items only when legitimately known.
- [ ] Add a clear `m` Mega toggle and confirmation marker before move
      resolution.
- [ ] Manually run one battle with simultaneous weather, terrain, item, ability,
      and Mega events and confirm messages remain readable and ordered.
- [ ] Commit: `visual: expose battle effects and Mega state`

### Task V5: Generalize sprite installation and rendering for synthetic forms

**Files:**

- Create: `tools/spriteManifest.mjs`
- Create: `tools/spriteManifest.test.mjs`
- Modify: `tools/fetch-sprites.mjs`
- Modify: `tools/check-data.mjs`
- Modify: `tools/install.mjs`
- Modify: `src/paths.mjs`
- Modify: `src/ui/sprite.mjs`
- Create: `src/ui/sprite.test.mjs`

**Interfaces:**

```js
spriteCandidates(record, side, shiny) -> URL[]
spriteStorageKey(record) -> string
buildSpriteManifest(speciesRecords) -> manifest
```

- [ ] Add failing tests for a base numeric species, Alolan slug, gendered form,
      Mega X/Y, battle-only form, shiny fallback, missing back sprite, and URL
      normalization.
- [ ] Run `npm test -- tools/spriteManifest.test.mjs src/ui/sprite.test.mjs`.
- [ ] Generate primary Showdown Gen-5-style and fallback PokéAPI URLs from
      record metadata rather than assuming every asset is `{nationalId}.png`.
- [ ] Keep stored filenames keyed by stable internal numeric ID so runtime
      rendering remains simple.
- [ ] Make installation retry candidates, validate PNG signatures, and report
      every unresolved record without committing artwork.
- [ ] Run a full manifest URL probe and require zero unresolved entries: every
      exact asset must validate or declare an approved alternate source or the
      unavailable-sprite placeholder before completing the batch.
- [ ] Commit: `visual: support sprites for every included form`

---

## Other

### 2026-08-13 — Generation VII expansion

### Task O3: Generate and validate complete Generation VII species data

**Files:**

- Modify: `tools/fetch-data.mjs`
- Modify: `tools/transformers.mjs`
- Modify: `tools/check-data.mjs`
- Modify: `data/pokedex.json`
- Modify: `data/growth.json`
- Modify: `data/types.json`
- Test: `tools/transformers.test.mjs`

**Interfaces:**

```js
buildSpeciesRecord(pkmnRecord, pokeApiRecord, identity) -> SpeciesRecord
buildEvolutionRules(chain, includedRecords) -> EvolutionRule[]
validateSpeciesDataset(dataset) -> ValidationResult
```

- [ ] Add failing transformer fixtures for Gen II, Fairy typing, hidden
      abilities, friendship/time/item/trade evolutions, branching forms, legendary,
      mythical, genderless, baby, and missing PokeAPI habitat.
- [ ] Run transformer tests and confirm the new fields are absent.
- [ ] Generate 809 contiguous base records plus the pinned included form set
      with Gen-VII stats, types, capture data, growth, egg groups, ability slots,
      learnsets, and evolution rules.
- [ ] Define simple Claudemon substitutes for unsupported evolution conditions
      in generated rule data and make each substitution visible in the Pokédex.
- [ ] Extend validation to confirm every referenced type, move, ability,
      species, item, evolution target, and growth curve exists.
- [ ] Run `node tools/fetch-data.mjs --force`, `node tools/check-data.mjs`, and
      the full tests; record exact counts in the generated audit.
- [ ] Commit: `data: expand the Pokedex through Generation VII`

### Task O4: Create mandatory mechanics coverage manifests

**Files:**

- Create: `data/mechanics-coverage.json`
- Create: `tools/mechanicsCoverage.mjs`
- Create: `tools/mechanicsCoverage.test.mjs`
- Modify: `tools/check-data.mjs`
- Modify: `package.json`

**Interfaces:**

```js
coverageFor(kind, key) -> { status, handler, reason, source }
validateCoverage(dataset, coverage) -> ValidationResult
coverageReport(dataset, coverage) -> string
```

- [x] Add failing tests for an unclassified ability/item/move, a supported
      record without a handler, an exclusion without a reason, an unused stale
      entry, and a species referencing an unknown record.
- [ ] Run `npm test -- tools/mechanicsCoverage.test.mjs`.
- [x] Generate the complete imported key list and classify each record as
      `supported`, `no-effect-in-singles`, `blocked-by-excluded-system`, or
      `deferred-complex-one-off`.
- [x] Require `handler` for supported records and a concrete `reason` for every
      other status. Do not use arbitrary numeric implementation caps.
- [x] Add `npm run mechanics:coverage` that prints totals and exits nonzero for
      any gap; invoke it from data validation and CI.
- [x] Review every deferred one-off against the rule “shared hook or modest
      handler means implement it,” then commit the approved baseline.
- [ ] Commit: `data: make mechanics coverage explicit`

### Task O6: Build the ordered battle-effect pipeline

**Files:**

- Create: `src/effects.mjs`
- Create: `src/effects.test.mjs`
- Create: `src/battleField.mjs`
- Create: `src/battleField.test.mjs`
- Modify: `src/battle.mjs`
- Modify: `src/damage.mjs`
- Modify: `src/battleActor.mjs`
- Modify: `src/battleEvents.mjs`
- Test: `src/battleEvents.test.mjs`

**Interfaces:**

```js
runEffectPhase(battle, phase, context) -> EffectResult
registerEffect(registry, { sourceType, key, phase, priority, handler }) -> registry
effectSources(battle, side, phase) -> EffectSource[]
createBattleField() -> { weather, terrain }
```

Supported phase keys are `battleStart`, `switchOut`, `switchIn`,
`beforeAction`, `modifyPriority`, `modifySpeed`, `modifyAccuracy`,
`modifyMoveType`, `modifyPower`, `checkImmunity`, `tryStatus`, `modifyDamage`,
`afterHit`, `afterDamage`, `consumeItem`, `faint`, and `endTurn`.

- [ ] Add failing tests for stable source ordering, numeric priority, chained
      modifiers, cancellation, emitted messages, faint during a phase, consumed
      item removal, switch-in replacement, canonical Gen-VII damage/critical
      conformance vectors, and deterministic replay from a seed.
- [ ] Run `npm test -- src/effects.test.mjs src/battleEvents.test.mjs`.
- [ ] Implement a pure registry/dispatcher whose context contains explicit
      attacker, defender, move, field, source, events, and current value.
- [ ] Refactor existing accuracy, damage, ailment, recoil, end-turn, and switch
      logic through phases; preserve behavior except for explicit Gen-VII
      conformance corrections, whose seeded fixtures must be updated visibly.
- [ ] Split field state from the oversized battle module and preserve the
      existing UI event contract.
- [ ] Run every existing battle test, compare seeded event sequences, then run
      full coverage.
- [ ] Commit: `refactor: add an ordered battle effect pipeline`

### Task O7: Import modern moves and implement generic effect families

**Files:**

- Create: `src/moveEffects.mjs`
- Create: `src/moveEffects.test.mjs`
- Modify: `tools/fetch-data.mjs`
- Modify: `tools/transformers.mjs`
- Modify: `data/moves.json`
- Modify: `src/battle.mjs`
- Modify: `src/volatile.mjs`
- Modify: `src/constants.mjs`

**Interfaces:**

```js
moveEffectHandlers(move) -> EffectHandler[]
resolveMoveCoverage(moveKey) -> Coverage
```

- [ ] Add table-driven failing tests for ordinary damage, status, stat stages,
      priority, multi-hit distributions, recoil, drain, healing, fixed damage,
      OHKO, contact, sound, powder, weather/terrain-dependent power, and explicit
      unsupported failure.
- [ ] Run `npm test -- src/moveEffects.test.mjs src/battleActor.test.mjs
src/battleEvents.test.mjs src/battleFlow.test.mjs src/damage.test.mjs`.
- [ ] Import Gen-VII move flags and learnsets from the pinned battle source and
      keep PokéAPI effect metadata only where it is structured and useful.
- [ ] Route every generic family through shared handlers, then implement every
      modest one-off identified by coverage review.
- [ ] Replace the hand-maintained unsupported set with coverage lookups and
      visible failure reasons.
- [ ] Make foe AI filter out moves that cannot execute under their coverage
      status and current battle prerequisites before scoring its choices.
- [ ] Run mechanics coverage and require zero unclassified moves; run full
      battle coverage.
- [ ] Commit: `feature: support Generation VII move families`

### Task O8: Implement all applicable Generation VII abilities

**Files:**

- Create: `src/abilities.mjs`
- Create: `src/abilities.test.mjs`
- Create: `src/abilityEffects.mjs`
- Create: `src/abilityEffects.test.mjs`
- Modify: `data/abilities.json`
- Modify: `src/effects.mjs`
- Modify: `src/pokemon.mjs`
- Modify: `data/mechanics-coverage.json`

**Interfaces:**

```js
abilityHandlers(abilityKey) -> EffectHandler[]
abilityIsActive(battle, side) -> boolean
revealAbility(events, side, abilityKey, cause) -> void
```

- [ ] Generate table-driven failing cases grouped by archetype: switch-in
      stat/field, immunity, status immunity, power/damage/STAB modifier, speed and
      priority, contact reaction, end-turn recovery/damage, threshold activation,
      faint reaction, item interaction, move-property override, and form trigger.
- [ ] Add focused one-off fixtures for every ability not covered by an
      archetype and explicitly test each approved exclusion classification.
- [ ] Run `npm test -- src/abilities.test.mjs src/abilityEffects.test.mjs` and
      confirm missing handlers fail.
- [ ] Implement shared archetypes first, mapping equivalent abilities to the
      same handler factory.
- [ ] Implement every remaining singles-relevant ability that fits the
      existing phases or a modest handler; defer only transformations/copy/replay
      or multi-Pokémon state that crosses an excluded subsystem, with exact reason.
- [ ] Run `npm run mechanics:coverage` and require zero unclassified abilities
      and no supported ability without tests.
- [ ] Run interaction tests with weather, terrain, held items, switching,
      fainting, and Mega ability replacement.
- [ ] Commit: `feature: implement applicable Generation VII abilities`

### Task O9: Implement item inventory, equipping, acquisition, and effects

**Files:**

- Create: `src/heldItems.mjs`
- Create: `src/heldItems.test.mjs`
- Create: `src/itemEffects.mjs`
- Create: `src/itemEffects.test.mjs`
- Modify: `src/shop.mjs`
- Modify: `src/itemUse.mjs`
- Modify: `src/state.mjs`
- Modify: `src/app.mjs`
- Modify: `src/ui/views/bag.mjs`
- Modify: `data/items.json`
- Modify: `data/mechanics-coverage.json`

**Interfaces:**

```js
equipHeldItem(save, mon, itemKey) -> { ok, returnedItem, message }
unequipHeldItem(save, mon) -> { ok, item, message }
consumeHeldItem(battle, side, cause, events) -> boolean
itemHandlers(itemKey) -> EffectHandler[]
rollWildHeldItem(speciesId, versionGroup, rng) -> itemKey | null
```

- [ ] Add failing inventory tests for equip, safe swap, unequip, full/no item,
      trade/daycare preservation, battle rollback, exactly-once consumption, wild
      held rarity, shop badge gates, and Mega Stone uniqueness.
- [ ] Add table-driven effect tests for type boosters, plates, choice items,
      Leftovers, Life Orb, Focus Sash, Rocky Helmet, status or HP berries, weather
      rocks, terrain seeds, Eviolite, Expert Belt, orbs, herbs, and other shared
      Gen-VII families.
- [ ] Run focused tests and confirm failures.
- [ ] Generate item records and categories, then implement inventory operations
      before battle effects so no effect can create or lose an item accidentally.
- [ ] Implement all applicable shared families and modest one-offs; classify
      key/story/contest/mail/cosmetic, doubles-only, Z-Crystal, and blocked records
      with concrete reasons.
- [ ] Journal held-item consumption: commit once for resolved wild/trainer
      battles, restore on Gym/League rollback, and leave the last saved state
      untouched after a crash before resolution.
- [ ] Add badge-gated common stock, canonical wild-held rolls, and progression
      reward tables for rare items and Mega Stones.
- [ ] Require zero unclassified items and run seeded duplication/rollback tests.
- [ ] Commit: `feature: add comprehensive held item support`

### Task O10: Add weather, terrain, grounded rules, and field duration

**Files:**

- Create: `src/weather.mjs`
- Create: `src/weather.test.mjs`
- Create: `src/terrain.mjs`
- Create: `src/terrain.test.mjs`
- Modify: `src/battleField.mjs`
- Modify: `src/effects.mjs`
- Modify: `src/typechart.mjs`

**Interfaces:**

```js
startWeather(battle, weather, source, turns) -> events
startTerrain(battle, terrain, source, turns) -> events
isGrounded(battle, side) -> boolean
fieldHandlers(field) -> EffectHandler[]
```

- [x] Add failing tests for all four weather states, all four terrains,
      replacement, five/eight-turn duration, expiry, damage changes, sand/hail
      damage, Rock Special Defense, Grassy healing, status prevention, priority
      blocking, grounded Flying/Levitate/Air Balloon cases, and deterministic
      ordering with abilities/items.
- [x] Run `npm test -- src/weather.test.mjs src/terrain.test.mjs`.
- [x] Implement field conditions only through effect phases and keep duration
      decrement in one end-turn owner.
- [x] Make grounded checks a shared helper consumed by terrain, Ground moves,
      abilities, and items.
- [ ] Add cross-tests for weather setter abilities, duration rocks, terrain
      setter abilities, seeds, and field replacement on switch-in.
- [ ] Run focused tests and full battle coverage.
- [ ] Commit: `feature: add weather and terrain battles`

### Task O11: Add collectible forms and battle transformations

**Files:**

- Create: `src/forms.mjs`
- Create: `src/forms.test.mjs`
- Create: `src/mega.mjs`
- Create: `src/mega.test.mjs`
- Modify: `src/pokemon.mjs`
- Modify: `src/battle.mjs`
- Modify: `src/damage.mjs`
- Modify: `src/trainer.mjs`
- Modify: `src/transformers.mjs`

**Interfaces:**

```js
changeBattleForm(battle, side, targetId, cause) -> events
revertBattleForm(battle, side) -> events
canMegaEvolve(battle, side) -> { stone, targetId } | null
megaEvolve(battle, side) -> events
```

- [ ] Add failing tests for Alolan species as permanent records, normal versus
      Alolan evolution choice, Link Cable trade evolutions, Everstone regional
      breeding, explicit family roots, Mega
      Stone matching, one Mega per side, explicit toggle, pre-order timing,
      Charizard/Mewtwo X/Y, HP proportion, new ability activation, trainer Mega,
      battle end reversion, save/trade rejection of battle-only IDs, and closing
      mid-battle.
- [ ] Run `npm test -- src/forms.test.mjs src/mega.test.mjs`.
- [ ] Implement form lookups using data relationships, never numeric-range
      arithmetic in callers.
- [ ] Implement Mega as battle-local replacement with original record retained
      on the actor; never assign a battle-only synthetic ID to the live party
      Pokémon referenced by the current battle engine.
- [ ] Add every applicable ability-driven battle form only after its ability
      handler exists; classify excluded disproportionate one-offs explicitly in
      the coverage manifest with a concrete reason.
- [ ] Run migration, battle, sprite, daycare, trade, and save tests together.
- [ ] Commit: `feature: add regional forms and Mega Evolution`

### Task O12: Generate nine broad, validated biome pools

**Files:**

- Create: `tools/biomes.mjs`
- Create: `tools/biomes.test.mjs`
- Create: `tools/biomeOverrides.mjs`
- Create: `data/biomes.json`
- Create: `data/biome-report.md`
- Modify: `tools/fetch-data.mjs`
- Modify: `tools/transformers.mjs`
- Modify: `tools/check-data.mjs`

**Interfaces:**

```js
biomeEvidence(record, sources) -> Evidence[]
assignBiomes(record, evidence, overrides) -> BiomeAssignment[]
scoreFamilyCoherence(records, assignments) -> CoherenceReport
validateBiomePools(records, assignments) -> ValidationResult
```

- [ ] Add failing fixtures for each biome, dual Water evidence, urban Electric
      and Steel species, supernatural species, an evolution family, Alolan form,
      legendary override, missing habitat, conflicting evidence, and an unassigned
      record.
- [ ] Run `npm test -- tools/biomes.test.mjs`.
- [ ] Aggregate location encounter evidence through Gen VII, then apply the
      exact priority: override, locations, habitat, types, egg groups, family.
- [ ] Assign ecological specialists to one biome, most ordinary records to two,
      and genuine generalists to three across Meadow, Forest, Wetlands, Coast,
      Highlands, Badlands, Frostlands, City & Powerworks, and Mystic Ruins;
      target `2.0` memberships per ordinary eligible record.
- [ ] Generate a report listing counts, overlap distribution, evidence source,
      manual overrides, unassigned records, family splits, and rarity bands.
- [ ] Calculate `expectedPoolSize = totalOrdinaryMemberships / 9` after
      generation and require every ordinary pool to remain within 15% of it;
      require one-to-three assignments per eligible record, keep special and
      legendary overlays out of the balance calculation, and flag every
      legendary/common weighting anomaly.
- [ ] Manually review the complete override list and generated anomalies, then
      rerun until validation reports zero errors.
- [ ] Commit: `data: generate broad biome encounter pools`

### Task O13: Implement persistent active-work biome expeditions

**Files:**

- Create: `src/expedition.mjs`
- Create: `src/expedition.test.mjs`
- Modify: `src/state.mjs`
- Modify: `src/app.mjs`
- Modify: `src/transformers.mjs`
- Modify: `src/rng.mjs`
- Modify: `src/constants.mjs`

**Interfaces:**

```js
createExpedition(seed, workedMs, startingBiome) -> Expedition
advanceExpedition(expedition, workedMs) -> ExpeditionEvent[]
forcedVisitTarget(seed) -> activeMs // triangular 30/40/65, mean 45
optionalForkTarget(seed) -> activeMs | null // 40% of visits, 15–30
offerOptionalFork(expedition) -> { stay, paths: [biome, biome] }
forceDeparture(expedition) -> { paths: [biome, biome] }
chooseBiomePath(expedition, choice) -> Expedition
autoChooseDeparture(expedition) -> Expedition
```

- [ ] Add failing tests for triangular 30-minute minimum, 40-minute mode,
      65-minute maximum and exact 45-minute expected value; only active-work
      advancement; new/migrated saves starting in Meadow; restart persistence;
      a 40% optional-fork rate with targets from 15–30 minutes; optional Stay
      preserving the original forced target; exactly two neighboring departure
      choices; no encounter after expiry in the old biome; deterministic
      automatic departure; corrupt-state normalization; and concurrent input.
- [ ] Run `npm test -- src/expedition.test.mjs src/worked.test.mjs`.
- [ ] Define and validate a connected travel graph where every biome has enough
      neighbors to produce two distinct paths.
- [ ] Store all random decisions as seeds/targets so repainting or restarting
      cannot reroll visit duration, optional-fork eligibility, optional-fork
      timing, offered paths, or automatic destination.
- [ ] When the forced target is reached, leave the old biome immediately. Show
      two destination choices if the UI can accept input; otherwise choose one
      deterministically on the next activity tick before rolling an encounter.
- [ ] Keep an ignored optional offer available until it is dismissed, accepted,
      or superseded by forced departure; ignoring or choosing Stay must not
      reset elapsed work or the forced target.
- [ ] Advance expeditions only from the merged worked-time total completed in
      Task B1.
- [ ] Run a seeded simulation of 10,000 visits and assert bounds, graph reach,
      a mean within 0.25 minutes of 45, optional-fork frequency within one
      percentage point of 40%, no stuck biome, and stable replay.
- [ ] Commit: `feature: travel through biomes while Claude works`

### Task O14: Make encounters biome-aware without shrinking variety

**Files:**

- Modify: `src/encounter.mjs`
- Modify: `src/trainer.mjs`
- Modify: `src/app.mjs`
- Modify: `src/constants.mjs`
- Test: `test/encounter.test.mjs`
- Test: `src/trainer.test.mjs`

**Interfaces:**

```js
speciesTableFromDex(dex, { leadLevel, biome }) -> WeightedSpecies[]
encounterWeight(record, assignment, context) -> number
```

- [ ] Add failing seeded distribution tests for all nine biomes, overlapping
      species, affinity weights, stage gates, legendary overlays, forms,
      fallback on invalid data, and no empty pool at any lead level.
- [ ] Run `npm test -- test/encounter.test.mjs src/trainer.test.mjs`.
- [ ] Filter by biome assignment before applying existing lead-level/stage
      gates, then combine capture rate, stage, legendary status, and affinity into
      documented weights.
- [ ] Keep trainer teams biome-flavored without forcing mono-type teams or
      making trainers draw illegal forms.
- [ ] Simulate at least one million seeded encounters and publish per-biome
      unique species, rarity percentiles, legendary rate, and family distribution
      in the generated report.
- [ ] Require every biome to remain within the `SPEC.md` breadth targets.
- [ ] Commit: `feature: tie encounters to broad biomes`

### Task O15: Update evolution, daycare, breeding, and move learning

**Files:**

- Modify: `src/pokemon.mjs`
- Modify: `src/progression.mjs`
- Modify: `src/daycare.mjs`
- Modify: `src/learnset.mjs`
- Modify: `src/itemUse.mjs`
- Modify: `src/ui/views/dex.mjs`
- Test: `src/daycare.test.mjs`
- Test: `src/learnset.test.mjs`
- Test: `src/itemUse.test.mjs`

**Interfaces:**

```js
pendingEvolution(mon, context) -> EvolutionRule | null
applyEvolution(save, mon, rule) -> EvolutionResult
eggSpeciesForPair(first, second, context) -> speciesId | null
```

- [ ] Add failing tests for level, item, trade substitute, friendship
      substitute, day/night, held-item, gender, location/biome, Link Cable,
      normal-versus-Alolan choice, regional Everstone inheritance, branched
      evolution, baby/incense rule, Ditto, legendary/no-egg, nature, ability
      slot, and held-item preservation.
- [ ] Run focused tests and confirm unsupported rule types fail explicitly.
- [ ] Evaluate normalized evolution rules from data rather than hardcoding only
      level and stones.
- [ ] Keep evolution-family and regional-form identity correct in breeding and
      prevent battle-only forms from entering daycare.
- [ ] Use Gen-VII level-up learnsets and preserve the four-move choice flow.
- [ ] Run every daycare/progression/item/evolution test plus generated chain
      validation for all included records.
- [ ] Commit: `feature: support Generation VII growth and breeding`

### Task O16: Generalize progression, gyms, achievements, and add the League

**Files:**

- Create: `src/league.mjs`
- Create: `src/league.test.mjs`
- Create: `src/ui/views/league.mjs`
- Create: `src/ui/views/league.test.mjs`
- Create: `data/league.json`
- Modify: `src/gym.mjs`
- Modify: `src/achievements.mjs`
- Modify: `src/ui/views/gyms.mjs`
- Modify: `src/ui/views/trainer.mjs`
- Modify: `src/ui/card.mjs`
- Modify: `src/constants.mjs`
- Modify: `tools/fetch-data.mjs`
- Modify: `tools/check-data.mjs`

**Interfaces:**

```js
leagueUnlocked(save) -> boolean
startLeague(save, seed) -> LeagueRun
advanceLeague(run, battleResult) -> LeagueRun
nationalCompletion(save) -> { caught, total: 809 }
formCompletion(save, dataset) -> { caught, total }
```

- [ ] Add failing tests that remove every hardcoded `151`, unlock the League
      only after eight badges, run Elite Four plus Champion in order, configure
      legal teams/items/abilities/Megas, roll back on loss/exit, award completion,
      and separate National/form achievements.
- [ ] Run `npm test -- src/league.test.mjs src/achievements.test.mjs src/ui/card.test.mjs`.
- [ ] Replace Kanto totals with generated dataset metadata in home, trainer,
      card, Pokédex, and achievements.
- [ ] Preserve earned Kanto milestone IDs/timestamps and add new National/form
      milestones rather than retroactively revoking old achievements.
- [ ] Generate and validate eight Gym, four Elite Four, and one Champion team
      with legal Gen-VII species, moves, items, abilities, levels, and approved
      Mega use; keep team tuning in data rather than UI code.
- [ ] Reuse the gym transaction/rollback contract for the League rather than
      creating a second reward system.
- [ ] Add League screens and terminal navigation only after engine tests pass.
- [ ] Manually complete a seeded League run and verify loss rollback and win
      persistence.
- [ ] Commit: `feature: add the Elite Four and Champion`

### Task O17: Preserve trade, trainer cards, update flow, and all old systems

**Files:**

- Modify: `src/trade.mjs`
- Modify: `src/transformers.mjs`
- Modify: `src/ui/card.mjs`
- Modify: `src/update.mjs`
- Modify: `tools/install.mjs`
- Modify: `README.md`
- Test: `src/trade.test.mjs`
- Test: `src/ui/card.test.mjs`
- Test: `test/update.test.mjs`

**Interfaces:**

```js
validateTradePokemon(mon, dataset, coverage) -> ValidationResult
datasetCompatibility(local, incoming) -> Compatibility
```

- [ ] Add failing end-to-end tests for base/form trades, nature/ability/item
      preservation, consumed item absence, battle-only rejection, old code
      migration, future code rejection, duplicate protection including attached
      Mega Stones, and dataset mismatch.
- [ ] Add card fixtures containing long modern names, forms, 809 completion,
      nature/ability/item labels, and missing sprite fallback.
- [ ] Run focused trade/card/update tests.
- [ ] Version trade payloads and dataset compatibility without making codes
      depend on any server.
- [ ] Update install/update checks for generated data and complete sprite
      manifests while retaining the offline/no-socket option.
- [ ] Update README only after behavior exists, including source credits,
      install size expectations, controls, migrations, biomes, and explicit
      unsupported mechanics.
- [ ] Commit: `docs: explain the Generation VII expansion`

### Task O18: Release audit, simulation, visual verification, and v1 tag

**Files:**

- Modify: `SPEC.md` only if implementation differs from the agreed behavior
- Modify: `PLAN.md` by removing every completed batch
- Generated: `tree.txt` through the pre-commit hook

- [ ] Run `node tools/check-data.mjs` and require exact expected base/form,
      move, ability, item, biome, evolution, and sprite-manifest counts with zero
      dangling references.
- [ ] Run `npm run mechanics:coverage` and require zero unclassified records,
      zero supported records without handlers, and zero supported records without
      tests.
- [ ] Run the full deterministic biome/encounter simulation and review its
      generated anomalies and distribution thresholds.
- [ ] Run migration fixtures against copies of every historical save/trade
      version and compare all preserved fields.
- [ ] Run `npm run lint`, `npm run format:check`, and `npm run coverage` once;
      require all to pass at configured thresholds.
- [ ] Launch a fresh game and a migrated save in the real terminal. Verify
      starter, old team, IV/nature/ability/item detail, all nine biome labels,
      optional fork, mandatory departure, auto travel, wild battle, weather,
      terrain, held item, Mega Evolution, catching a form, daycare, trade code,
      gym, League, Pokédex filters, trainer card, restart persistence, and
      narrow/wide layouts.
- [ ] Re-read `SPEC.md` against the running product and correct drift in place.
- [ ] Remove all completed dated batches from `PLAN.md`, commit the verified
      release as `release: complete Generation VII expansion`, push, and tag `v1`.
