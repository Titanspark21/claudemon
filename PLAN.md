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

### 2026-08-16 — live gameplay findings

### Task B3: Keep encounter hooks and the terminal on one runtime revision

**Problem:** The live terminal launcher points at this fork, but Claude's
installed hooks still run upstream plugin `1.9.1`. The old hook owns
`queue.jsonl` and generates Kanto-only encounters while the forked terminal
renders the same save with Generation VII data. `loadSpeciesTable` also hides
any generated-data failure by silently returning a 19-species Kanto fallback,
which makes a broken install look like valid gameplay.

**Files:**

- Modify: `tools/install.mjs`
- Modify: `src/shim.mjs`
- Modify: `src/status.mjs`
- Modify: `src/encounter.mjs`
- Modify: `src/transformers.mjs`
- Modify: `scripts/on-activity.mjs`
- Test: `test/update.test.mjs`
- Test: `test/status.test.mjs`
- Test: `test/encounter.test.mjs`
- Test: `test/activity.test.mjs`

- [x] Reproduce an already-installed same-name upstream plugin alongside a
      launcher targeting this fork; assert that the test hook and terminal
      report different roots/dataset fingerprints before the fix.
- [x] Make local setup add or refresh this repository's marketplace and plugin
      even when `claudemon@claudemon` is already installed from another
      marketplace; verify the installed hook root instead of accepting the
      plugin name alone.
- [x] Publish a build/dataset identity in status and encounter payloads so a
      terminal rejects stale or foreign hook output with an exact reinstall
      instruction rather than mixing two game versions.
- [x] Replace the silent Kanto fallback for invalid Generation VII data with a
      logged, player-visible failure naming the missing or invalid data file;
      retain a fallback only for an explicitly tested first-run state.
- [x] Run the real hook entry point against this checkout and prove a level-22
      City & Powerworks table includes post-Gen-I species and uses the same
      biome, revision, and dataset fingerprint as the open terminal.
- [ ] Commit: `fix: keep hooks and terminal on the same version`

### Task B4: Use the move-replacement prompt for every learning path

**Problem:** Post-battle level-up already pauses on a full four-move set and
asks which move to forget or whether to decline. Item and Link Cable evolution
instead flatten the same `learn-choice` step into bag text, append “no room for
another move,” and discard the choice, so evolution moves can never be accepted
when all four slots are occupied.

**Files:**

- Modify: `src/app.mjs`
- Modify: `src/itemUse.mjs`
- Modify: `src/progression.mjs`
- Modify: `src/battleFlow.mjs`
- Modify: `src/ui/views/bag.mjs`
- Test: `src/itemUse.test.mjs`
- Test: `src/battleFlow.test.mjs`
- Test: `test/app.test.mjs`

- [x] Add a player-driven failing test for a four-move Pokémon learning an
      evolution move through an item and through Link Cable evolution.
- [x] Route battle, item, and trade evolution learning through one persisted
      choice queue that shows the new move, all four current moves, and “Do not
      learn it”; Escape must not silently discard a pending choice.
- [x] Handle multiple moves learned by one evolution in order, persisting each
      accepted replacement or decline before continuing.
- [x] Keep Day Care recovery routed through Task B5's EXP-gated queue rather
      than treating a Day Care level as an immediate learning event.
- [ ] Commit: `fix: prompt before replacing an evolution move`

### Task B5: Preserve and recover every move skipped in Day Care

**Problem:** Day Care raises a Pokémon's level without running the normal move
learning flow. Because the current learnset lookup checks only the exact level
just reached, every move crossed in Day Care is permanently lost. Existing
saves have no record that distinguishes a Day Care-skipped move from an
intentionally forgotten move, so recovery must be derived safely from the
Pokémon's legal level-up learnset.

**Files:**

- Create: `src/moveRecovery.mjs`
- Create: `src/moveRecovery.test.mjs`
- Modify: `src/daycare.mjs`
- Modify: `src/progression.mjs`
- Modify: `src/battleFlow.mjs`
- Modify: `src/app.mjs`
- Modify: `src/migrations.mjs`
- Modify: `src/ui/views/team.mjs`
- Modify: `src/ui/views/daycare.mjs`
- Test: `src/daycare.test.mjs`
- Test: `src/ui/views/daycare.test.mjs`
- Test: `test/game.test.mjs`
- Test: `test/app.test.mjs`

**Interfaces:**

```js
queueMissedDaycareMoves(mon, fromLevel, toLevel) -> mon
applyMoveRecoveryExp(mon, awardedExp, { wonBattle }) -> RecoveryStep[]
relearnableMoves(mon) -> MoveRecovery[]
```

- [x] Add failing tests for one skipped move, several levels and moves crossed
      in one Day Care stay, duplicate learnset entries, a move already known,
      a full four-move set, declining an unlocked move, and save/reload during
      partial progress.
- [x] Record every legal level-up move crossed while the Pokémon is in Day
      Care. Keep the queue permanently on that Pokémon until each move is
      learned; never silently discard an entry because the Pokémon was
      withdrawn, deposited again, traded, evolved, or already has four moves.
- [x] Give each queued move an outside-training requirement equal to 25% of
      the EXP between the Pokémon's level when that move was skipped and its
      following level, rounded up to at least one EXP. Apply only EXP actually
      awarded to that Pokémon after a won battle outside Day Care, preserve
      excess progress, and process queued moves in learnset order.
- [x] At level 100, where EXP cannot advance, unlock one queued move for each
      won battle in which that Pokémon participated.
- [x] When a requirement is met, route the move through the same persisted
      replace-or-decline prompt as normal learning. Choosing “Not now” must
      leave the move unlocked in Team > Relearn Moves so declining never makes
      it permanently unavailable.
- [x] Add Team > Relearn Moves for unlocked entries, showing locked entries'
      remaining EXP or level-100 battle wins without allowing the player to
      bypass the gate.
- [x] Migrate existing Pokémon by deriving every currently legal, unlearned
      level-up move at or below their level into the same EXP-gated recovery
      queue. This intentionally also recovers moves forgotten before the game
      tracked Day Care history rather than leaving existing saves permanently
      damaged.
- [x] Show the recovery rule and current progress in Day Care withdrawal and
      Team screens, including the level-100 one-win rule.
- [x] Run the focused recovery, Day Care, progression, battle-flow, migration,
      and UI tests, then run full coverage.
- [ ] Commit: `fix: let Pokemon recover Day Care moves`

---

## Visual

### 2026-08-13 — Generation VII expansion

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

### 2026-08-16 — live gameplay findings

### Task V6: Explain Day Care evolution and move recovery in the UI

**Problem:** Day Care raises levels without immediately teaching moves or
evolving Pokémon, but the terminal does not explain either delayed outcome. A
Pokémon taken out above its evolution level looks stuck, while skipped moves
appear permanently lost even though Task B5 will retain them behind an
outside-training requirement.

**Files:**

- Modify: `src/ui/views/daycare.mjs`
- Modify: `src/ui/views/constants.mjs`
- Modify: `src/app.mjs`
- Test: `src/ui/views/daycare.test.mjs`
- Test: `test/app.test.mjs`

- [x] Show a persistent Day Care note that levels gained there do not
      immediately teach moves or trigger evolution, and that skipped moves are
      retained for EXP-gated recovery.
- [x] On withdrawal, identify a Pokémon already eligible for level evolution
      and say that it will evolve the next time it levels up outside Day Care.
- [x] On withdrawal, list newly queued moves and explain that each unlocks
      after its displayed outside-battle EXP requirement; show one won battle
      instead for a level-100 Pokémon.
- [x] Verify the note and withdrawal message in narrow and wide terminal
      layouts without duplicating the Team recovery controls.
- [ ] Commit: `visual: explain Day Care evolution timing`

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
- [x] Replace string-only handler validation with a runtime registry check: a
      `supported` move must resolve to executable code and focused tests. The
      current manifest falsely marks 147 moves supported even though their
      handlers do not exist.
- [x] Generate a checked report listing every move by executable, intentionally
      unavailable, or deferred status, its exact player-facing reason, and its
      focused test; fail CI when code, coverage, and the report disagree.
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

**Problem:** The imported list is complete, but coverage and execution are not.
Of 651 moves, 147 are currently labelled `supported` while
`moveExecutionFailure` reports that their runtime handler is absent. Another
22 are intentionally unavailable (six singles-only and 16 complex deferred
moves). Generic `move:damage` classification must also be checked against
Generation VII semantics so special damage moves are not accepted as ordinary
attacks merely because they have power and accuracy.

**Files:**

- Create: `src/moveEffects.mjs`
- Create: `src/moveEffects.test.mjs`
- Modify: `tools/fetch-data.mjs`
- Modify: `tools/transformers.mjs`
- Modify: `data/moves.json`
- Modify: `src/battle.mjs`
- Modify: `src/battleFlow.mjs`
- Modify: `src/foeAi.mjs`
- Modify: `src/volatile.mjs`
- Modify: `src/constants.mjs`
- Modify: `src/ui/views/battle.mjs`
- Modify: `data/mechanics-coverage.json`
- Create: `data/move-coverage-report.md`
- Modify: `tools/mechanicsCoverage.mjs`

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
- [ ] Audit all 651 imported moves against the pinned Generation VII battle
      source, including special-power, conditional-priority, switching,
      protection, delayed, field, trapping, forced-switch, move-copy, item,
      ability, and party-dependent semantics; no powered move may inherit the
      ordinary damage handler without evidence that this is complete behavior.
- [ ] Implement Electro Ball from the attacker/defender effective Speed ratio
      and Teleport with Generation VII wild/trainer battle behavior, with
      focused player and foe tests.
- [ ] Work through the current 147 false-supported moves by reusable family,
      then modest one-off. Reclassify only genuinely disproportionate mechanics
      as `deferred-complex-one-off`, each with a move-specific reason rather
      than the current shared generic reason.
- [x] Replace the hand-maintained unsupported set with coverage lookups and
      visible failure reasons.
- [x] Mark unavailable moves directly in the fight menu with their reason and
      refuse them before PP, turn order, or the opponent advances. Moves with a
      legitimate Claudemon field function but no battle function must say so
      before confirmation instead of consuming a turn.
- [x] Make foe AI filter out moves that cannot execute under their coverage
      status and current battle prerequisites before scoring its choices.
- [x] Run mechanics coverage and require zero unclassified moves, zero
      false-supported handlers, and zero executable moves without focused
      tests; run full battle coverage.
- [ ] Commit: `feature: support Generation VII move families`

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
