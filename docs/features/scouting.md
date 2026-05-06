# Scouting Feature

## Purpose

The Scouting feature is the runtime workflow for an active volleyball match. It
handles match-level scouting configuration, set setup, live rally entry,
scoring, corrections, set completion, match completion, quick reports, and
event persistence.

## Current Scope

Implemented under `src/features/scouting/`.

Current responsibilities:

- synchronize with the active `MatchProject`
- configure scouting rules before the first set
- create set-start events from selected lineups and serving team
- replay event logs into live match state
- record rallies, touches, points, set endings, and rally endings
- support manual point entry and point undo
- support score corrections by rewriting event logs
- persist live scouting progress back into the active project
- derive quick match/set/rally statistics
- render live rally court interaction
- render DataVolley-like rally code while a rally is active

## Main Route

- `src/features/scouting/pages/ScoutingPage.tsx`

`ScoutingPage` is a large orchestration component. It wires together active
project state, live scouting state, stage selection, court state, score
correction dialogs, persistence, and stage components.

## Key Components

- `PreMatchConfigStage.tsx`
- `SetSetupStage.tsx`
- `LiveRallyStage.tsx`
- `SetEndStage.tsx`
- `MatchEndStage.tsx`
- `MatchStatsReport.tsx`
- `MatchStatsQuickReport.tsx`
- `ScoutingCourt.tsx`
- `BallTouchPopup.tsx`
- `HalfCourtLineup.tsx`

## Model Modules

Important modules under `src/features/scouting/model/`:

- `scouting-store.ts` - live Zustand store.
- `session.ts` - session snapshots and project sync.
- `replay.ts` - replay engine.
- `stages.ts` - stage resolution.
- `progression.ts` - set/match progression.
- `rally.ts` - rally/touch event builders.
- `score-corrections.ts` - score correction workflows.
- `datavolley-flow.ts` - pending touch flow.
- `datavolley-code.ts` - DataVolley-like code strings.
- `match-stats.ts` - statistics builder.
- `use-scouting-persistence.ts` - active project persistence hook.

## Persistence

Scouting progress is persisted.

`useScoutingPersistence(activeProject)` compares the active project with the
current `liveMatch`, then saves a synchronized project through
`matchRepository.update()`.

Persisted data includes:

- `MatchProject.events`
- `MatchProject.scoutingSession`
- `MatchProject.phase`
- `MatchProject.updatedAt`

## Domain Inputs

Scouting depends on:

- `MatchProject`
- `MatchEvent`
- `BallTouch`
- `ScoutingMatchConfig`
- `ScoutingSession`
- `StartingLineup`
- `ActiveLineup`
- spatial scouting zones/cells

## Constraints

- Do not mutate score/session fields directly outside the replay model.
- Keep corrections event-log based.
- Keep match progression rules in helpers.
- Use existing spatial/court models for zone work.
- Keep tactical player suggestion position-based when integrating systems.
- Keep route-level UI from becoming the home for new domain logic.

## Current Gaps

- Full tactical-system player suggestion is not wired into live scouting yet.
- Full DataVolley export compatibility is not implemented.
- Analysis remains mostly outside the Scouting route.
- Automated coverage is limited to the match-statistics validation fixture.
