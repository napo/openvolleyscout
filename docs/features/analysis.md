# Analysis Feature

## Purpose

The Analysis feature is reserved for post-match statistics, summaries, and
reports.

## Current Scope

Current implementation is intentionally minimal.

Implemented route:

- `src/features/analysis/pages/AnalysisPage.tsx`

Current behavior:

- renders a page shell
- shows a translated "coming soon" placeholder

## Existing Analysis-Adjacent Logic

Although the Analysis page is not implemented, statistics logic already exists
inside the Scouting feature:

- `src/features/scouting/model/match-stats.ts`
- `src/features/scouting/model/match-stats.validation.ts`
- `scripts/validate-match-stats.mjs`

That logic can derive team, player, set, rally, side-out, break-point, and
rotation statistics from match events and touches.

Some of those summaries are currently surfaced in scouting completion stages,
not in the Analysis route.

## Planned Direction

Future analysis work can build on:

- persisted `MatchProject.events`
- persisted `MatchProject.scoutingSession`
- `buildMatchStats()`
- team and player models
- completed set summaries

## Constraints

- Do not document the Analysis route as complete.
- Do not duplicate statistics logic directly inside `AnalysisPage`.
- Start from model functions and typed inputs before adding report UI.
- Keep derived analysis read-only unless a future workflow explicitly needs
  saved report artifacts.
