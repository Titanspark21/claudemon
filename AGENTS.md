# Claudemon Fork Agent Guide

## Purpose

This public fork expands Claudemon from a Kanto-only terminal companion into
an offline Generation VII collection and battle game. Claude Code activity
drives walking, encounters, biome travel, daycare progress, and play time. The
game remains a focused terminal companion rather than a conventional RPG or
online service.

Read these files before changing anything:

1. `AGENTS.md`
2. `SPEC.md`
3. `PLAN.md`
4. `tree.txt`, when present
5. `CLAUDE.md` for mandatory code style and architecture rules

`SPEC.md` is the product source of truth. `PLAN.md` contains only unfinished
work. Update both during every meaningful change, not at the end of a large
batch.

## Architecture

- Runtime: Node.js 20.19 or newer, plain ESM `.mjs` modules.
- UI: ANSI terminal rendering; one view per file under `src/ui/views/`.
- Storage: local JSON under `~/.claudemon`; no database or account.
- Activity input: Claude Code hooks write local session/activity files.
- Data: generated normalized JSON checked into `data/`.
- Sprites: downloaded during installation; never committed.
- Build: none.
- Runtime dependencies: none. Development-only generators may use pinned
  packages when the generated output is checked in and runtime stays clean.
- Tests: Vitest, with lint, format, tests, and coverage enforced by the
  pre-commit hook.

Keep the existing flat-module structure. New modules and their tests are
mandatory. `CLAUDE.md` is authoritative for naming, constants, transformers,
guards, handlers, comments, formatting, and module boundaries.

## Commands

```powershell
npm install
npm test
npm run lint
npm run format:check
npm run coverage
node bin/claudemon
```

For a local data rebuild, use the generator commands documented by the task
being implemented. Generated source data must be reproducible and validated
before it is committed.

## Git and releases

- `origin`: `https://github.com/Titanspark21/claudemon.git`
- `upstream`: `https://github.com/zamarrowski/claudemon.git`
- The fork is public.
- Commit and push every meaningful, verified change with a plain-English
  message.
- Tag user-facing milestones `v1`, `v2`, and so on.
- Never force-push, rewrite shared history, delete files, or discard user work
  without explicit approval.
- The pre-commit hook regenerates and stages `tree.txt` using `git ls-files`.

## Product constraints

- No backend, online feature, account, telemetry, PvP, Discord integration,
  cloud save, or leaderboard.
- Do not make a feature silently approximate canonical behavior. Either
  implement it, classify it with an explicit reason, or fail visibly.
- Preserve existing saves through versioned migrations.
- Preserve upstream behavior unless `SPEC.md` explicitly changes it.
- Never scrape fan wikis or arbitrary ROM-hack repositories for generated
  game data.

## Verification

For code changes, run the focused failing test first, then the focused passing
test, then the full verification once:

```powershell
npm run lint
npm run format:check
npm run coverage
```

For visual changes, launch the real terminal app at supported small and large
terminal sizes and capture a screenshot. End every handoff with exact test
steps a non-developer can follow.

## Recent activity

- Agreed that Day Care-skipped moves must never be permanently lost: each is
  retained behind a 25%-of-next-level outside battle EXP gate, with one won
  battle per move at level 100, and recorded the full recovery flow in
  `PLAN.md`.
- Diagnosed the live fork/upstream split, the false-positive move coverage,
  four-move replacement flow, and Day Care evolution timing; recorded the
  required fixes and player-facing clarity work in `PLAN.md`.
- Reassessed AI-assisted difficulty and agreed on complete Generation VII,
  forms, Megas, natures, visible IVs, held items, abilities, weather, and
  terrain with explicit coverage rather than arbitrary feature caps.
