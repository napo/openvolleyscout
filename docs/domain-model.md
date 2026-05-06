# Domain Model

The domain layer lives under `src/domain/`. It defines volleyball business
concepts and pure helper functions independently from React pages and
IndexedDB/Dexie APIs.

## Domain Areas

- `archive` - competition archive entries.
- `common` - shared enums such as team side, match phase, match format, skill,
  and evaluation.
- `court` - legacy/full-court zone geometry helpers.
- `events` - match event union.
- `lineup` - starting and active lineup models.
- `match` - match projects, match selections, normalization, and factories.
- `roster` - runtime team/player/staff models.
- `scouting` - scouting config/session helpers and set/match progression
  helpers.
- `spatial` - scouting cells, zone ids, grid coordinates, and points.
- `systems` - editable tactical/defense system models and factories.
- `tactical` - runtime tactical responsibility and player resolution.
- `team` - archived team, roster, and player models.
- `touch` - ball touch model.

## Match Project

`MatchProject` is defined in `src/domain/match/types.ts`.

It is the central persisted match aggregate. Important fields:

- `metadata`
- `homeSelection`
- `awaySelection`
- `homeTeam`
- `awayTeam`
- `phase`
- `events`
- `scoutingConfig`
- `scoutingSession`
- linked tactical metadata arrays
- timestamps

The canonical match team data lives in `homeSelection` and `awaySelection`.
`homeTeam` and `awayTeam` are derived snapshots for UI consumers.

`normalizeMatchProject()` keeps this boundary intact and should be used when
loading, saving, or activating projects.

## Teams and Rosters

There are two main team contexts.

### Runtime Match Team

Defined in `src/domain/roster/types.ts`.

`Team` is embedded in match snapshots and contains:

- `id`
- `code`
- `name`
- `players`
- `staff`

`Player` contains jersey number, name, short name, player code, role, captain
flag, and libero flag.

### Archived Team

Defined in `src/domain/team/types.ts`.

`ArchivedTeam` is the long-lived archive record. It contains team metadata,
staff, a generated `teamCode`, roster references, and timestamps.

`ArchivedRoster` owns archived players for a team. The UI currently edits the
latest roster, but historical rosters are represented by the model.

`MatchRosterPlayer` and `MatchRosterSelectionPlayer` bridge archived players
into match-specific roster selection.

## Match Setup Boundary

Match setup transforms archive data into match-specific data.

The flow is:

1. Select or create archived teams.
2. Load archived roster players.
3. Select the match roster for each side.
4. Build `homeSelection` and `awaySelection`.
5. Save a normalized `MatchProject`.

This keeps the archive reusable while allowing each match to own its own roster
snapshot.

## Events

`MatchEvent` is defined in `src/domain/events/types.ts`.

Current variants:

- `match_created`
- `set_started`
- `rally_started`
- `touch_recorded`
- `point_awarded`
- `substitution_made`
- `timeout_called`
- `set_ended`
- `rally_ended`

The event union is broader than the current replay implementation. Replay
supports the active set/rally/touch/point/set-ending path and rejects unsupported
or invalid sequences.

## Scouting Session

`ScoutingSession` is defined in `src/domain/scouting/types.ts`.

It stores a replay snapshot:

- active project id
- set and rally counters
- score
- serving team
- active lineups
- current rally state
- completed sets
- timestamps

`LiveMatchState` in `src/features/scouting/model/index.ts` extends this with an
`eventLog`.

## Court and Spatial Models

There are two related geometry areas:

- `domain/court` - full court-zone geometry with stable side/grid zones.
- `domain/spatial` - scouting-cell geometry used by the current live scouting
  UI.

New scouting interaction work should prefer existing spatial/court helpers over
ad hoc DOM geometry.

## Lineups and Rotations

`StartingLineup` maps court positions to player ids before a set starts.

`ActiveLineup` represents runtime lineup state used by replay and side-out
rotation logic.

Scouting replay rotates active lineups when a side-out point is awarded, unless
the point event explicitly skips rotation.

## Tactical Systems

There are two related tactical layers.

### Editable Systems

`TacticalSystemDefinition` maps zones to court positions through
`ZoneResponsibility`.

`DefenseSystem` is the current Systems-page editor model for draggable role
positions.

### Runtime Tactical Resolution

`src/domain/tactical/` models the runtime responsibility lookup:

- tactical phase
- zone assignments
- primary and candidate player ids
- resolved court positions

The guiding rule is:

- systems map zones to court positions
- active lineups map court positions to players

Systems should not map zones directly to player ids.

## Scouting Configuration

`ScoutingMatchConfig` controls set and match progression:

- match format
- max sets to win
- regular set target
- tie-break target
- golden-set options

Helpers in `src/domain/scouting/helpers.ts` determine set targets, set winners,
completed-set counts, and match completion.

## Status Summary

Implemented:

- match project normalization
- archived team and roster models
- match-specific roster selection models
- event model
- scouting config/session model
- live replay support for the main scouting event path
- lineups and side-out rotation foundation
- statistics-oriented touch model
- tactical resolver foundation
- defense-system editor model

Still evolving:

- full use of substitution and timeout events
- unified system editor and tactical-system definition persistence
- full tactical player suggestion in live scouting
- richer analysis-domain models
