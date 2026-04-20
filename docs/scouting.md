# Scouting Architecture

## Overview

The scouting feature is implemented under `src/features/scouting/` and is currently built as an event-oriented in-memory workflow on top of the active match project.

It combines:

- a local scouting session store (`useScoutingStore`)
- a visual court model
- a ball interaction layer
- a lightweight event draft panel
- an event log

The feature is functional as a foundation, but several pieces are still in progress rather than complete scouting logic.

## Event-Based Approach

The scouting store does not mutate a giant nested match-state object directly. Instead, it appends typed events that describe scouting actions.

Current store actions:

- `startSet`
- `endSet`
- `startRally`
- `recordTouch`
- `awardPoint`
- `endRally`
- `resetLiveMatch`

These actions append `MatchEvent` values to `liveMatch.eventLog` and also update the derived session fields used by the UI, such as score, rally counters, and set/rally activity flags.

This architecture makes the scouting flow easier to inspect and potentially replay later, even though persistence integration is not finished yet.

## Core Scouting Concepts

### Set

A set begins with `set_started`, including:

- `homeLineup`
- `awayLineup`
- `servingTeam`

The store also creates a fresh in-memory `LiveMatchState` at this point and seeds it with the chosen lineups and serving team.

### Rally

A rally is currently modeled through:

- `rally_started`
- repeated `touch_recorded`
- `point_awarded`
- `endRally()` advancing the rally counter

This is still a simplified flow. There is not yet a full rally state machine or inference layer.

### Touch

Touches are modeled by `BallTouch` in `src/domain/touch/types.ts`.

The touch structure already supports:

- team side
- optional player id
- skill
- evaluation
- zone references (`zone`, `originZone`, `targetZone`)

This is enough to support draft-level court interactions now, while leaving room for richer encoding later.

### Event Log

The event log rendered in `EventLog.tsx` is a presentation of the in-memory `liveMatch.eventLog` array.

At the moment, the scouting feature does not persist this log back into the `MatchProject.events` array in IndexedDB. That integration is still planned.

## Court Grid and Zone Selection

### Court grid

The court geometry comes from `src/domain/court/`.

Important characteristics:

- each side has 36 zones
- each side uses a 6x6 grid
- zones have stable ids (`home-r1c1`, `away-r6c6`, etc.)
- each zone has bounds and a center point in normalized court coordinates

The UI court component (`ScoutingCourt.tsx`) consumes this geometry rather than inventing ad hoc DOM-only coordinates.

### Zone selection

The current interaction layer does three things:

1. renders every zone as an interactive element
2. allows the ball token to be dragged
3. snaps the ball to the nearest zone center on release

The selected zone is stored in `ScoutingPage` state and displayed in `EventDraftPanel`.

This is an interaction foundation, not yet complete scouting logic.

### Ball movement concept

The ball token is a UI affordance representing the current selected court location.

Current behavior:

- pointer drag with mouse/touch
- nearest-zone snapping on release
- zone highlight after selection

Not implemented yet:

- multi-step trajectories
- origin/target editing workflow
- animated transitions between touches

## Zone -> Court Position -> Player Resolution

The intended scouting resolution pipeline is:

1. user selects a court zone
2. the zone maps to one or more court positions through a tactical system
3. the current active lineup maps court positions to player ids
4. the resolver returns a primary player and candidate list

This is already modeled at the domain level:

- `ActiveLineup` in `src/domain/lineup/types.ts`
- `TacticalSystem` in `src/domain/tactical/types.ts`
- `resolvePlayerForZone()` in `src/domain/tactical/resolver.ts`

## Why Zones Do Not Map Directly to `playerId`

Zones are tactical responsibility areas, not identity assignments.

If a system mapped directly to `playerId`, the mapping would break whenever:

- the rotation changes
- a libero replaces a player
- the same system is reused by another team
- the team changes its active lineup during a match

By mapping:

- `zoneId -> courtPosition`

and then separately:

- `courtPosition -> playerId`

the app keeps tactical knowledge reusable and lineup-aware.

## Current Status

### Implemented

- event-based scouting store
- set/rally/touch foundations
- visual court with 36 zones per side
- draggable ball token with snapping
- event draft panel foundation
- tactical resolution foundation in the domain layer

### In progress

- connecting selected zones to full touch creation flow
- integrating tactical resolution into the scouting UI
- persisting the in-progress scouting session back into match storage

### Planned

- automatic player suggestion
- richer rally inference
- DataVolley-compatible encoding
- phase-aware tactical selection from real match context
