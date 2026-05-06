# Systems Feature

## Purpose

The Systems feature is the workspace for tactical system editing. In the current
implementation, it focuses on a simple defense-system editor.

## Current Scope

Implemented under `src/features/systems/`.

Current responsibilities:

- show a systems route
- list defense systems from the feature store
- create defense systems
- select the active defense system
- edit the system name
- drag role markers on a court surface
- save systems to browser-local storage

## Main Route

- `src/features/systems/pages/SystemsPage.tsx`

## Key Components and Store

- `components/DefenseSystemEditor.tsx`
- `model/defense-system-store.ts`

The page uses `useDefenseSystemStore`, not the generic
`systemRepository`, as its primary state path.

## Domain Model

Current editor model:

- `DefenseSystem`
- `DefensePosition`
- `PlayerRole`

Broader tactical model:

- `TacticalSystemDefinition`
- `ZoneResponsibility`
- `SystemKind`

The broader model maps zones to court positions. It is intended for future
tactical responsibility editing and scouting integration.

Defense-system data stores abstract `PlayerRole` values. The UI renders
localized role labels with `getRoleLabel(role, locale)`, so switching language
changes labels without changing saved system data.

## Persistence

Current editor persistence:

- `localStorage`
- key: `openvolleyscout.defenseSystems`

There is also a generic localStorage helper for `TacticalSystemDefinition[]`:

- `src/infrastructure/storage/system-storage.ts`
- key: `openvolleyscout.systems`

The Systems page does not yet use IndexedDB for tactical systems.

## Constraints

- Systems must stay separate from generic application settings.
- Tactical responsibilities should map to court positions, not player ids.
- Real zone editing should reuse the app spatial/court models.
- Future durable persistence should go through `src/infrastructure/`.

## Current Gaps

- defense editor model and generic tactical definition model are not unified
- no IndexedDB-backed system persistence
- no team/rotation association workflow in the UI
- no live scouting player suggestion from saved systems
- simplified zone labels in the defense editor
