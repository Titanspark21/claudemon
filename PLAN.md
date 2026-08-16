# Claudemon Worklist

> **For agentic workers:** read `AGENTS.md`, `SPEC.md`, `PLAN.md`, `tree.txt`,
> and `CLAUDE.md` before starting. Steps use checkbox syntax; tick them live,
> and delete a dated batch the moment every box in it is ticked.

The Generation VII expansion has shipped: 968 species records (all 809 National
Dex entries plus 159 forms), 651 moves, 233 abilities, 339 items, nine biome
pools, and a full sprite manifest all validate. This file holds only what is
still missing or wrong.

## Standing constraints

- Fully local, offline, account-free, telemetry-free, no runtime dependencies.
- Generated data is reproducible and never hand-edited.
- Every move, ability and item keeps an explicit coverage status and reason;
  zero unclassified records is a release gate.
- Follow every rule in `CLAUDE.md`; tests are mandatory for each new module.

---

## Bugs

### 2026-08-17 — live install and runtime findings

### Task B1: Remove superseded plugin copies during installation

**Problem:** Installing 1.9.2 left 1.9.1 sitting beside it in
`~/.claude/plugins/cache/claudemon/claudemon/`. An old copy is not inert: its
hooks stay runnable, and the launcher's own fallback (`ls -td .../*/ | head -1`)
can resolve to it. On this machine the 1.9.1 hook pointed the launcher back at
itself on every prompt, so the player kept launching the old game after a
successful install. The shim now refuses to move a launcher onto an older
release, but the stale copy itself is still left behind.

**Files:**

- Modify: `tools/install.mjs`
- Test: `tools/install.test.mjs`

- [ ] Reproduce two plugin copies in the cache and assert that installing the
      newer one leaves both behind today.
- [ ] Remove every plugin copy older than the one just installed, reporting
      each removal by name; never touch a copy that is not under the cache.
- [ ] Prove a second install is a no-op rather than an error when only one
      copy remains.
- [ ] Commit: `fix: clear out superseded plugin copies`

### Task B2: Stop leaving temp files behind in the home directory

**Problem:** `~/.claudemon` currently holds 45 stray `worked.json.<pid>.tmp`
and `status.json.<pid>.tmp` files. The atomic write renames a temp file into
place; on Windows that rename loses to a concurrent reader often enough that
debris accumulates in the player's home directory. The current cleanup path
unlinks the temp only on a throw, and older releases used a different temp
name, so nothing sweeps what is already there.

**Files:**

- Modify: `src/fileLock.mjs`
- Test: `src/fileLock.test.mjs`

- [ ] Add a failing test that a rename losing to a locked target still leaves
      no temp file behind.
- [ ] Retry the rename briefly, then clean up whatever it wrote, and sweep
      stale temp files for the same target on the next successful write.
- [ ] Verify a real session of the game plus hooks leaves no `.tmp` in
      `~/.claudemon`, and remove the existing debris.
- [ ] Commit: `fix: stop leaving temp files in the home directory`

### Task B3: Keep a malformed payload from killing a hook

**Problem:** `claudemon.log` shows `JSON.parse` throwing inside
`scripts/on-activity.mjs`. A hook that throws is invisible in the terminal, and
the activity event that caused it is lost, so walking and encounters silently
stop counting for that turn.

**Files:**

- Modify: `scripts/on-activity.mjs`
- Modify: `scripts/on-prompt.mjs`
- Test: `test/activity.test.mjs`

- [ ] Add failing tests feeding each hook entry point an empty payload, a
      truncated JSON payload, and a payload missing its session id.
- [ ] Log and skip a malformed payload instead of throwing; a bad event must
      never abort the rest of the hook's work.
- [ ] Confirm the log records the skip with the offending source named.
- [ ] Commit: `fix: survive a malformed hook payload`

---

## Visual

### 2026-08-17 — narrow terminal findings

### Task V1: Keep footer and rule lines inside the frame

**Problem:** `SPEC.md` requires new panels to work at "the repository's
documented minimum terminal size", but no minimum is documented anywhere, and
several lines already overflow a 60-column terminal: `TEAM_HINTS` is 87
columns, `TEAM_KEY_HINTS` 97, `RELEARN_RULE` 71. They run off the edge rather
than wrapping or shortening.

**Files:**

- Modify: `SPEC.md`
- Modify: `README.md`
- Modify: `src/ui/views/constants.mjs`
- Modify: `src/ui/widgets.mjs`
- Test: `src/ui/widgets.test.mjs`

- [ ] Agree and document one minimum terminal size, in `SPEC.md` and the
      README.
- [ ] Add a failing test that every exported hint and rule string fits that
      width.
- [ ] Shorten or wrap the lines that do not fit, keeping the key mnemonics
      visible in preference to prose.
- [ ] Check the team, relearn, move order, bag and day care screens at the
      minimum size and at 100 columns.
- [ ] Commit: `visual: keep hints inside a narrow terminal`

---

## Other

### 2026-08-17 — Generation VII mechanics gap

Coverage classifies every record, but classification is not implementation. Of
651 moves, 462 execute, 6 are ally-only and meaningless in singles, and **183
cannot be used in battle** — they are visible in the Fight menu, labelled with
their reason, and refuse before costing a turn. That is honest but it is not
finished. The 183 break down as 145 carrying only the generic "no runtime
implementation exists" reason, 20 self-targeting stat changes, 16
state-copying moves, plus Rapid Spin and Flying Press.

### Task O1: Implement the self-targeting stat-change family

**Problem:** Twenty moves are deferred for the same reason: the attacker
changes its own stats as part of the move. Close Combat, Overheat, Leaf Storm,
Superpower, Hammer Arm, Ice Hammer, Fleur Cannon, Psycho Boost, Hyperspace
Fury and Diamond Storm apply it always; Flame Charge, Power-Up Punch, Charge
Beam, Metal Claw, Meteor Mash, Steel Wing, Fiery Dance, Ancient Power, Silver
Wind and Ominous Wind apply it on a chance. This is one shared handler, not
twenty one-offs, and `CLAUDE.md`'s own rule says a shared hook means implement
it.

**Files:**

- Modify: `src/moveEffects.mjs`
- Modify: `data/mechanics-coverage.json`
- Test: `src/moveEffects.test.mjs`

- [ ] Add failing tests for an always-applied self drop, a chance-based self
      boost, a self change on a move that missed, and a self change at the
      stat-stage cap.
- [ ] Route all twenty through one handler driven by the imported stat-change
      data rather than per-move branches.
- [ ] Reclassify all twenty as supported with a real handler, and confirm the
      coverage gate still reports zero false-supported records.
- [ ] Commit: `feature: apply self stat changes from moves`

### Task O2: Work through the 145 unimplemented moves by family

**Problem:** 145 moves carry only the generic reason. Many are ordinary and
modest — Attract, Belly Drum, Counter, Encore, Endure, Detect, Focus Energy,
Curse, Grass Knot, Flail, Aqua Ring, Defog. They are deferred because nobody
has written them, not because they are disproportionate.

**Files:**

- Modify: `src/moveEffects.mjs`
- Modify: `src/volatile.mjs`
- Modify: `src/battleFlow.mjs`
- Modify: `data/mechanics-coverage.json`
- Modify: `data/move-coverage-report.md`
- Test: `src/moveEffects.test.mjs`

- [ ] Group all 145 into families — protection, trapping, healing over time,
      damage-counter, weight/HP/speed-derived power, stat swaps, type changes,
      status inducers, hazard control — and record the grouping in the report.
- [ ] Implement each family behind a shared handler, largest family first,
      with focused tests per family and per member.
- [ ] After each family, rerun `npm run mechanics:coverage` and require zero
      false-supported records.
- [ ] Give every move still deferred at the end a move-specific reason naming
      what is disproportionate about it; the generic sentence must be gone.
- [ ] Commit per family: `feature: support the <family> moves`

### Task O3: Implement Rapid Spin and Flying Press

**Problem:** Both are single moves with specific Generation VII semantics that
the generic damage handler would get wrong: Rapid Spin must clear binding and
entry hazards from its own side, and Flying Press checks type effectiveness as
both Fighting and Flying.

**Files:**

- Modify: `src/moveEffects.mjs`
- Modify: `src/damage.mjs`
- Test: `src/moveEffects.test.mjs`
- Test: `src/damage.test.mjs`

- [ ] Add failing tests for Rapid Spin against a bound user and against
      hazards, and for Flying Press into a dual-type defender where the two
      types disagree.
- [ ] Implement both and mark them supported.
- [ ] Commit: `feature: support Rapid Spin and Flying Press`

### Task O4: Close the deferred ability and item gaps

**Problem:** 16 abilities and 9 items are deferred, each with a specific
reason. They should be re-reviewed against the same "shared hook or modest
handler means implement it" rule now that the effect pipeline exists. The 35
items blocked by excluded systems and the 12 abilities with no effect in
singles are correct as they are and stay out of scope.

**Files:**

- Modify: `src/abilities.mjs`
- Modify: `src/itemUse.mjs`
- Modify: `data/mechanics-coverage.json`
- Test: `src/abilities.test.mjs`
- Test: `src/itemUse.test.mjs`

- [ ] List all 25 with their reasons and mark each one implement or keep
      deferred, with the decision recorded in the coverage manifest.
- [ ] Implement everything marked implement, with focused tests.
- [ ] Rerun the coverage gate and require zero gaps.
- [ ] Commit: `feature: support the remaining abilities and items`

### Task O5: Re-audit the plan against the running product

**Problem:** Before this rewrite, `PLAN.md` listed nine tasks as entirely
unstarted whose code, data and tests had in fact shipped. The bookkeeping, not
the product, was wrong. That must not build up again.

**Files:**

- Modify: `PLAN.md`
- Modify: `SPEC.md`

- [ ] At the end of every session, tick what was finished and delete any batch
      that is now complete.
- [ ] Re-read `SPEC.md` against the running product and fix drift in place.
