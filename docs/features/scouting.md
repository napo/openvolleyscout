# Scouting Feature

## Purpose

The Scouting feature is the runtime interaction layer for an active volleyball match. It provides the in-memory scouting session, court UI, ball/zone interaction, event drafting foundation, and event log.

## Current Scope

Implemented under `src/features/scouting/`.

Current responsibilities:

- create and manage an in-memory `liveMatch` session through `useScoutingStore`
- start sets and rallies
- record draft-level touches and points
- render a 36-zone-per-side court
- render player markers and a draggable ball token
- snap the ball token to the nearest zone
- show a lightweight event draft panel
- show the scouting event log

## In Progress

- touch creation is still draft-level and uses mock interaction paths in places
- selected zones are not yet fully integrated into complete scouting event authoring
- tactical resolution exists at the domain level but is not yet wired into the Scouting UI
- the in-memory scouting session is not yet persisted back into `MatchProject.events`

## Planned

- automatic player suggestion from zone + lineup + tactical system
- richer touch authoring UI
- phase-aware tactical selection
- stronger persistence of scouting session state
- fuller DataVolley-compatible event encoding

## Domain Model

Main domain models involved:

- `MatchEvent` in `src/domain/events/types.ts`
- `BallTouch` in `src/domain/touch/types.ts`
- `CourtZone` in `src/domain/court/types.ts`
- `StartingLineup` and `ActiveLineup` in `src/domain/lineup/types.ts`
- tactical resolution models in `src/domain/tactical/`

Feature-local runtime model:

- `LiveMatchState` in `src/features/scouting/model/index.ts`

Important separation:

- persisted match project data is not the same as the active scouting session
- the Scouting feature currently uses its own in-memory `liveMatch` state

## UI Structure

Main route:

- `src/features/scouting/pages/ScoutingPage.tsx`

Key components:

- `SetStartFlow.tsx`
- `RallyFlow.tsx`
- `ScoutingCourt.tsx`
- `BallToken.tsx`
- `PlayerMarker.tsx`
- `EventDraftPanel.tsx`
- `EventLog.tsx`

Supporting interaction hook:

- `useCourtBallDrag.ts`

Current structure:

- top status/header area
- central court-focused stage
- support area for controls, draft info, and event log

## Persistence

Current state: in progress.

What is persisted today:

- the active match project can be loaded from IndexedDB through `useAppStore`

What is not yet persisted as part of Scouting:

- the live scouting session managed by `useScoutingStore`
- the interactive draft state on the court

This is the biggest architectural gap between Match creation and full Scouting persistence.

## Constraints

- landscape-first layout is enforced by `OrientationGuard`
- court geometry should come from `src/domain/court/`, not ad hoc DOM math
- drag logic should stay isolated in hooks
- tactical logic should stay position-based and domain-driven

## Notes for Codex

- prefer extending domain models first, then connect them into Scouting UI
- keep `ScoutingPage.tsx` as a composition layer; push interaction specifics into components/hooks
- do not short-circuit tactical responsibility by mapping zones directly to `playerId`
- if you add persistence, keep the relationship between `useScoutingStore` and `MatchProject.events` explicit and well documented
