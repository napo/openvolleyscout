# Data Model

OpenVolleyScout uses a mix of persisted aggregates, browser-local editor state,
and derived runtime state.

The important rule is that match data should be reconstructable from the
persisted `MatchProject` aggregate and its event log.

## Persisted Aggregates

### `MatchProject`

Defined in `src/domain/match/types.ts`.

`MatchProject` is the top-level persisted match aggregate. It contains:

- `metadata` - competition, date, venue, match number, format, and schema
  version.
- `homeSelection` and `awaySelection` - canonical match-specific team data.
- `homeTeam` and `awayTeam` - derived read models for UI consumers.
- `phase` - current lifecycle state such as `startup`, `scouting`, `analysis`,
  or `closed`.
- `events` - ordered `MatchEvent` records.
- `scoutingConfig` - set target points, tie-break target, max sets to win, and
  golden-set flags.
- `scoutingSession` - the latest persisted scouting session snapshot.
- linked tactical metadata arrays reserved for future integrations.
- `videoAnalysis` - optional video source reference, synchronization points,
  and clip-padding preferences. The video file itself is never stored in the
  project.
- timestamps.

The canonical team data lives in the side selections. The derived `homeTeam`
and `awayTeam` snapshots are rebuilt by `normalizeMatchProject()`.

### Archived Teams and Rosters

Defined in `src/domain/team/types.ts`.

`ArchivedTeam` stores team identity, staff, team code, roster references, and
timestamps.

`ArchivedRoster` stores the actual archived player list for a team. The current
UI mostly edits the latest roster, but the model supports historical roster
records.

### Competition Archive

Defined in `src/domain/archive/types.ts`.

Competition archive entries store reusable competition names for match setup
suggestions.

### Reception and Defense Systems

The current Systems page edits:

- `DefenseSystemBlock`
- `ReceptionSystemBlock`

Both are defined in `src/domain/systems/types.ts` and persisted as editor
libraries in `localStorage`.

This is separate from the more generic `TacticalSystemDefinition` model, which
is prepared for position-based zone responsibility editing but is not the main
editor state used by the current Systems page.

### Video Analysis Metadata

Defined in `src/domain/video/types.ts`.

`MatchVideoAnalysis` stores:

- `source` - either a local file reference or a YouTube URL/video id.
- `syncPoints` - anchors that map event-clock seconds to video seconds.
- `paddingBeforeSeconds` and `paddingAfterSeconds` - review/export window
  padding.
- `updatedAt`.

The model intentionally stores references only. Local browser file handles are
stored outside the match project in a separate IndexedDB database because they
cannot go through normal JSON serialization.

## Runtime State

### Active Project

`useAppStore` stores the currently loaded or newly created `MatchProject`.
Setting an active project clones and normalizes it.

### Live Match State

`LiveMatchState` extends `ScoutingSession` with an `eventLog`.

It is managed by `useScoutingStore` and derived by replaying match events. The
store does not treat nested session fields as the source of truth. Events are
the primary source, and session fields are replay results used by the UI.

### UI Draft State

Several pages also keep short-lived form or interaction state:

- match setup wizard form data
- team editor form state
- selected live-court zone
- score-correction dialog state
- system editor draft positions
- analysis/video filters and selected action state

Draft state should be saved through repositories or feature stores before it is
treated as durable.

## Events

Defined in `src/domain/events/types.ts`.

Current event variants:

- `match_created`
- `set_started`
- `rally_started`
- `touch_recorded`
- `point_awarded`
- `substitution_made`
- `timeout_called`
- `libero_replacement_made`
- `red_card_point`
- `replay_action`
- `video_check_correction`
- `sanction_recorded`
- `dead_ball_event_recorded`
- `setter_assigned`
- `set_ended`
- `rally_ended`

The active replay logic currently supports:

- `set_started`
- `rally_started`
- `touch_recorded`
- `point_awarded`
- `libero_replacement_made`
- `red_card_point`
- `replay_action`
- `video_check_correction`
- `sanction_recorded`
- `dead_ball_event_recorded`
- `setter_assigned`
- `set_ended`
- `rally_ended`

## Touches

Defined in `src/domain/touch/types.ts`.

`BallTouch` records:

- set and rally number
- sequence number
- team side
- optional player id
- skill and evaluation
- zone, origin-zone, and target-zone references
- timestamp

Touches are embedded in `touch_recorded` events and are used by the statistics
builder and DataVolley-like code generation.

## Scouting Configuration and Session

Defined in `src/domain/scouting/types.ts`.

`ScoutingMatchConfig` controls match progression:

- match format
- max sets to win
- regular set target points
- tie-break target points
- golden-set flags

`ScoutingSession` stores the latest replayed session snapshot:

- active project id
- current set and rally numbers
- score
- serving team
- active lineups
- rally activity flags
- current rally touches
- completed sets
- timestamps

`useScoutingPersistence` writes this snapshot back to the active project after
live scouting changes.

## Derived Statistics

The statistics builder lives in `src/features/scouting/model/match-stats.ts`.

It can derive:

- team skill totals
- player skill totals
- quick stats for serve, reception, attack, and block
- rally summaries
- set summaries
- side-out and break-point stats
- rotation stats
- DataVolley-like rally codes

These statistics are rendered by scouting summary stages, `AnalysisPage`, and
`TeamAnalysisPage`. They are validated by `scripts/validate-match-stats.mjs`
and by the broader `npm test` suite.

### Aggregated Team Statistics

`src/features/teams/model/aggregated-stats.ts` adapts several `MatchStats`
objects into one aggregate `MatchStats` for team-level study.

The selected team is normalized to `home`; all opponents are normalized to
`away`. This lets team performance, player performance, side-out, heatmap, and
video workflows reuse the same dashboard contracts. Aggregated set stats are
synthetic buckets by set number rather than real match sets.

## Normalization

`normalizeMatchProject()` is the key compatibility boundary. It:

- upgrades legacy schema versions to at least schema version 3
- normalizes side selections
- rebuilds derived team snapshots
- normalizes scouting config fields
- creates a default `scoutingSession` when missing
- preserves optional `videoAnalysis` metadata
- ensures linked tactical arrays exist

New persistence or import paths should pass match projects through this
normalization boundary.
