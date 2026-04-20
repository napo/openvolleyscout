# Domain Model

## Overview

The domain layer lives under `src/domain/` and defines the application’s core volleyball concepts independently from React components and IndexedDB APIs.

The current domain is centered around:

- teams and rosters
- match projects
- scouting events and touches
- court zones
- lineups and tactical resolution
- systems definitions for reception and defense

## Core Concepts

### Team

Two team representations are currently relevant:

- `Team` in `src/domain/roster/types.ts`
- `ArchivedTeam` in `src/domain/team/types.ts`

`Team` is the match-facing structure used inside `MatchProject`:

- `id`
- `code`
- `name`
- `players`
- `staff`

`ArchivedTeam` is the persisted archive-facing structure:

- `id`
- `name`
- `staff`
- `rosterIds`
- timestamps

This separation allows the app to keep an archive/history model without forcing the runtime match model to mirror database concerns exactly.

### Player

Current player-related models:

- `Player`: match/runtime player model
- `ArchivedPlayer`: archive player model
- `MatchPlayer`: archive player plus match-selection state

Important fields used across the app:

- `id`
- `jerseyNumber`
- `firstName`
- `lastName`
- `playerCode`
- libero/captain flags

`MatchPlayer` adds match-setup state such as `isSelectedForMatch`.

### Match

The top-level persisted match aggregate is `MatchProject` in `src/domain/match/types.ts`.

It contains:

- `metadata`
- `homeTeam`
- `awayTeam`
- `phase`
- `events`
- timestamps

`MatchMetadata` holds competition, venue, date, format, and schema information.

`createEmptyMatchProject()` in `src/domain/match/factories.ts` initializes a new project with:

- generated IDs
- empty home/away teams
- phase `startup`
- an initial `match_created` event

### Match Roster vs Archived Roster

This distinction is important in the current architecture.

#### Archived roster

`ArchivedRoster` is a long-lived historical team roster stored in IndexedDB.

- tied to `teamId`
- contains all known players for that archived team version

#### Match roster

`MatchRoster` / `MatchPlayer[]` represent the subset of players selected for a specific match setup flow.

This is the bridge between:

- persistent archive data
- a concrete match report

The Match Setup feature converts archived players into match players and adds selection flags and short names.

### Scouting Session

The persisted match aggregate and the in-progress scouting session are not the same object today.

The in-memory scouting session is represented by `LiveMatchState` in `src/features/scouting/model/index.ts`.

It tracks:

- set and rally counters
- current score
- serving team
- active lineups
- event log
- set/rally activity flags

This is currently managed in a dedicated Zustand store (`useScoutingStore`).

### Event Log

The event log is modeled through `MatchEvent` in `src/domain/events/types.ts`.

Currently defined event variants include:

- `match_created`
- `set_started`
- `touch_recorded`
- `point_awarded`
- `substitution_made`
- `timeout_called`
- `set_ended`

The scouting UI currently renders and appends events through the in-memory `liveMatch.eventLog` array. The broader `MatchEvent` union is ahead of the currently implemented scouting UI and already includes variants that are not yet emitted by the active workflow.

### Court Zones

Court geometry is defined in `src/domain/court/`.

Key model:

- `CourtZone`

Each zone includes:

- `id`
- `teamSide`
- `index`
- `gridPosition`
- `bounds`
- `center`

The current court model uses:

- 2 sides: `home`, `away`
- 36 zones per side
- a 6x6 grid per side
- stable identifiers such as `home-r2c3`

This gives the app a shared geometry model for rendering, snapping, and later resolution logic.

### Tactical Systems

There are now two related tactical concepts:

#### Tactical resolution model

Under `src/domain/tactical/`:

- `TacticalSystem`
- `TacticalPhase`
- `TacticalZoneAssignment`
- `PlayerResolutionResult`

This layer exists to answer the question:

“Given a selected zone and an active lineup, which player is most likely responsible?”

#### Systems feature definitions

Under `src/domain/systems/`:

- `TacticalSystemDefinition`
- `ZoneResponsibility`
- `SystemKind`

This layer exists to define editable volleyball systems as domain data for the Systems feature.

## Key TypeScript Models

Important domain models currently used across features:

- `Team`, `Player`, `TeamStaff`
- `ArchivedTeam`, `ArchivedRoster`, `ArchivedPlayer`, `MatchPlayer`
- `MatchProject`, `MatchMetadata`
- `StartingLineup`, `ActiveLineup`, `RotationState`
- `MatchEvent`
- `BallTouch`
- `CourtZone`, `CourtZoneId`, `CourtGridPosition`
- `TacticalSystem`, `PlayerResolutionResult`
- `TacticalSystemDefinition`, `ZoneResponsibility`

## Relationships Between Entities

### Team and roster relationships

- one `ArchivedTeam` can reference multiple historical `ArchivedRoster` ids
- one `ArchivedRoster` belongs to one archived team
- one `MatchProject` embeds two runtime `Team` objects

### Match and event relationships

- one `MatchProject` owns an `events` array
- one in-progress scouting session also maintains an `eventLog`
- `touch_recorded` events embed `BallTouch`

Today those are still separate flows. The persisted `MatchProject.events` array is initialized and stored, while the active scouting session writes to `liveMatch.eventLog` in memory.

### Lineup and tactical relationships

- `StartingLineup` maps `courtPosition -> playerId`
- `ActiveLineup` extends that idea for on-court runtime resolution
- tactical systems map `zoneId -> courtPosition(s)`
- the tactical resolver maps `zone -> court position -> current player id`

This indirection is deliberate. Tactics are about responsibility by position, not identity by player.

## Current Status Notes

- Court zones: implemented
- Ball touch zone references: implemented
- Active lineup model: implemented foundation
- Tactical resolver: implemented foundation
- Systems definitions: implemented foundation
- Systems persistence: planned
- Full scouting session persistence back into `MatchProject.events`: planned
