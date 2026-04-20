# Systems Feature

## Purpose

The Systems feature is a volleyball-domain workspace for tactical schemes, specifically reception and defense systems. It is intentionally separate from generic application settings.

## Current Scope

Implemented under `src/features/systems/`.

Current responsibilities:

- provide a dedicated route for systems
- list in-memory tactical systems
- create new reception and defense systems
- edit system name
- edit system kind
- show placeholder metadata for team association, rotation association, and zone responsibility count

## In Progress

- the Systems page is currently in-memory only
- zone responsibility editing is still a placeholder
- team association and rotation association exist as model fields, but not as complete editing workflows

## Planned

- systems persistence
- visual zone responsibility editor
- team selection and filtering
- rotation-specific editing workflows
- deeper integration with Scouting player-resolution flows

## Domain Model

Main domain models:

- `TacticalSystemDefinition` in `src/domain/systems/types.ts`
- `ZoneResponsibility` in `src/domain/systems/types.ts`
- `SystemKind` in `src/domain/systems/types.ts`

Related tactical runtime models:

- `TacticalSystem` in `src/domain/tactical/types.ts`
- `PlayerResolutionResult` in `src/domain/tactical/types.ts`

Important rule:

- systems map `zoneId` to `courtPosition`
- systems do not map directly to `playerId`

This keeps tactical data reusable across rotations, teams, and lineup changes.

## UI Structure

Main route:

- `src/features/systems/pages/SystemsPage.tsx`

The current page structure includes:

- a sidebar listing systems
- create buttons for reception and defense systems
- a simple metadata editor
- a placeholder block for future zone responsibility editing

There are no dedicated subcomponents yet; the page is currently self-contained.

## Persistence

Current state: planned.

There is no `systemRepository` or systems storage module yet.

Systems currently live only in local React state on the page.

This means:

- systems are not persisted across reloads
- systems are not available to Scouting as durable data yet

## Constraints

- Systems must remain separate from generic app settings
- zone responsibilities must stay position-based rather than player-based
- future system editing should reuse the court zone model instead of inventing a second zone abstraction

## Notes for Codex

- keep systems work in `features/systems` and `domain/systems`
- if you add persistence, do it in `src/infrastructure/` rather than embedding storage into the page
- if you integrate with Scouting, keep the boundary clear:
  - `systems` defines editable tactical schemes
  - `tactical` resolves runtime zone responsibility
