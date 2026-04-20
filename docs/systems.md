# Tactical Systems

## Purpose

The Systems feature exists to represent volleyball tactical schemes as first-class domain data, independent from generic application settings.

In the current codebase, this foundation is split between:

- editable system definitions in `src/domain/systems/`
- tactical resolution models in `src/domain/tactical/`
- the first UI foundation in `src/features/systems/`

## Reception vs Defense

The application currently supports two system kinds:

- `reception`
- `defense`

These are represented in `SystemKind` (`src/domain/systems/types.ts`) and also mirrored in the tactical phase model (`src/domain/tactical/types.ts`).

The distinction matters because the same zone can imply different responsibilities depending on the phase of play.

## Core Mapping Model

The editable systems definition uses `ZoneResponsibility`:

- `zoneId`
- `primaryCourtPosition`
- `fallbackCourtPositions`

This means the editable mapping is:

- `zoneId -> courtPosition`

with one primary responsible position and optional fallback positions.

This is intentionally not:

- `zoneId -> playerId`

## Primary Responsibility and Fallback Candidates

The current model explicitly separates:

- one primary court position
- zero or more fallback court positions

That gives the app a clear future path for:

- ambiguous coverage zones
- shared defensive responsibility
- fallback candidate lists in the scouting draft UI

The current tactical resolver layer (`src/domain/tactical/resolver.ts`) already returns:

- `primaryPlayerId`
- `candidatePlayerIds`
- `resolvedCourtPositions`

So the systems foundation and the resolver foundation are aligned conceptually, even though they are not fully integrated yet.

## Relation with Rotation

The systems models are already prepared for rotation-specific behavior.

Current optional fields:

- `rotationIndex` on `TacticalSystemDefinition`
- `rotationIndex` on `TacticalSystem`

This means a future implementation can support:

- one general system for all rotations
- different systems per rotation
- different reception and defense responsibilities for the same team based on rotation

At the moment, the Systems page only exposes this concept as metadata and does not yet provide a full rotation editor.

## Relation with Active Lineup

The systems layer and lineup layer serve different purposes.

### Systems layer

Describes tactical responsibility by court position.

### Active lineup layer

Describes which player currently occupies each court position.

That separation is what allows the app to resolve a selected zone into likely players without hard-coding identities into the tactical scheme.

The intended chain is:

1. selected zone
2. system responsibility lookup
3. resolved court positions
4. active lineup lookup
5. player candidates

## Current UI Foundation

The current Systems page supports:

- listing systems
- creating a new reception system
- creating a new defense system
- editing name
- editing kind
- showing placeholder metadata for team association, rotation association, and responsibility count

Current state: in progress.

Not yet implemented:

- persistence
- visual zone responsibility editor
- team selection
- rotation selection UI

## Future Extensibility Notes

The current foundation is intentionally small but extensible.

Likely next steps:

- persist systems in IndexedDB
- add a zone editor based on the same `CourtZoneId` model used by scouting
- connect systems to teams and optional rotations
- use selected systems during scouting to suggest likely players
- add libero-aware refinement on top of the current position-first model

The important architectural decision already made is that systems are tactical, reusable, and position-based. That keeps them stable as match state changes around them.
