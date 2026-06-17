# Scouting Architecture

The scouting feature is implemented under `src/features/scouting/`.

It is an event-oriented workflow that records set, rally, touch, point,
correction, and completion events, then derives live session state by replaying
those events.

## Main Files

- `pages/ScoutingPage.tsx` - route-level orchestration and stage rendering.
- `model/scouting-store.ts` - Zustand store for live scouting state.
- `model/session.ts` - session creation, event construction, project sync.
- `model/replay.ts` - event replay and replay validation.
- `model/use-scouting-persistence.ts` - live project persistence.
- `model/stages.ts` - stage selection from project/session state.
- `model/progression.ts` - set and match progression rules.
- `model/rally.ts` - rally and touch event builders.
- `model/score-corrections.ts` - manual point and correction event-log rewrites.
- `model/match-stats.ts` - derived statistics.
- `model/datavolley-code.ts` and `model/datavolley-flow.ts` - DataVolley-like
  encoding and touch-flow helpers.

## Scouting Stages

`getScoutingStageSummary()` resolves the active stage:

- `pre_match_config`
- `set_setup`
- `live_rally`
- `set_end`
- `match_end`

The stage is based on:

- scouting config validity
- current project phase
- replayed live-match state
- completed sets
- match completion rules

## Event-Sourced Live State

`useScoutingStore` owns:

- `liveMatch`
- `activeConfig`

The store actions append or rewrite `MatchEvent` records and then rebuild
`liveMatch` through replay.

Important actions:

- `syncWithProject`
- `startSet`
- `endSet`
- `startRally`
- `recordTouch`
- `awardPoint`
- `awardManualPoint`
- `endRally`
- `undoLastAction`
- `undoLastPoint`
- `removeLastTouchFromCurrentRally`
- `clearCurrentRallyPoint`
- `reopenCurrentRally`
- `replaceLiveMatchEvents`
- `resetLiveMatch`

The event log is the durable source. Session fields such as score, current
rally, active lineups, and current touches are replayed read models.

## Replay

Replay is implemented in `model/replay.ts`.

Replay currently supports these event variants:

- `set_started`
- `rally_started`
- `touch_recorded`
- `point_awarded`
- `set_ended`
- `rally_ended`

Replay rejects unsupported events or invalid sequences. For example:

- a rally cannot start while another rally is active
- a touch cannot be recorded after a rally point has already been awarded
- a point cannot be awarded twice for the same active rally
- a set-ending event must match the replayed score

This gives corrections and undo behavior a consistent rebuild path.

## Persistence

Scouting is persisted through `useScoutingPersistence()`.

The hook compares the active project with `liveMatch`. When they differ, it
calls `syncProjectWithLiveMatch()` and saves the result with
`matchRepository.update()`.

Persisted project fields include:

- `events`
- `scoutingSession`
- `phase`
- `updatedAt`

This lets the app reload a saved project, replay the event log, and resume the
latest scouting session.

## Match Progression

Scouting progression depends on `ScoutingMatchConfig`.

`createDefaultScoutingMatchConfig()` creates defaults:

- max sets to win: `3`
- regular set target: `25`
- tie-break target: `15`
- golden set disabled by default

`createPointProgressionEvents()` awards a point and adds `set_ended` when the
new score completes the set.

Set completion requires:

- target score reached
- at least two points difference

Match completion uses completed set winner counts and `maxSetsToWin`.

## Live Court Flow

The current live-court flow uses spatial cells from `src/domain/spatial`.

`ScoutingPage` keeps short-lived UI state for:

- selected zone
- live-court phase
- transient court status messages
- touch origin zone

When a valid zone is selected, `datavolley-flow` and `live-court` helpers build
pending touches. Confirmed touches become `touch_recorded` events.

The court flow is functional, but tactical player suggestion from editable
systems is not yet fully integrated.

## Score Corrections and Undo

The scouting model supports correction flows by rewriting the event log and
replaying it.

Current correction paths include:

- manual point award
- undo last point
- replay correction
- video-check correction
- rotation-fault correction
- red-card correction
- current rally correction helpers

The implementation keeps corrections event-log based instead of mutating scores
directly.

## DataVolley-Like Output

`buildDataVolleyRallyCode()` builds a DataVolley-like rally string from current
touches. This is used in the live scouting screen when a rally is active and
touches have been recorded.

The project includes DataVolley export, but does not yet claim full
compatibility with every vendor-specific edge case.

## Statistics

`buildMatchStats()` derives statistics from teams, events, completed sets, and
current rally touches.

It can produce:

- team stats
- player stats
- quick stats
- set stats
- rally stats
- side-out stats
- break-point stats
- rotation stats

The current validation entry point is:

```bash
npm run validate:match-stats
```

## Current Status

Implemented:

- event replay for the active scouting event set
- live persistence into match projects
- set and match progression rules
- manual scoring and undo
- score-correction event-log rewrites
- live court touch entry
- DataVolley-like live rally strings
- quick and advanced stat builders
- match-analysis dashboards that reuse the scouting statistics model

In progress:

- full tactical-system integration into player suggestion
- complete DataVolley edge-case compatibility
- broader automated test coverage
