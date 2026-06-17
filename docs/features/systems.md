# Systems Feature

## Purpose

The Systems feature is the workspace for tactical reception and defense system
editing. It stores role-position libraries that can be reused by scouting and
future tactical automation.

## Current Scope

Implemented under `src/features/systems/`.

Current responsibilities:

- show a systems route
- switch between defense and reception libraries
- list saved system blocks from the feature stores
- create defense and reception system blocks
- select the active block
- edit the system name
- edit role marker positions by setter rotation
- edit defense positions separately for break-point and side-out contexts
- save system blocks to browser-local storage
- export system definitions from the editor UI

## Main Route

- `src/features/systems/pages/SystemsPage.tsx`

## Key Components and Stores

- `components/DefenseSystemEditor.tsx`
- `components/ReceptionSystemEditor.tsx`
- `components/SystemExportPanel.tsx`
- `model/defense-system-store.ts`
- `model/reception-system-store.ts`

The page uses `useDefenseSystemStore` and `useReceptionSystemStore`, not the
generic `systemRepository`, as its primary state path.

## Domain Model

Current editor models:

- `DefenseSystemBlock`
- `DefenseRotationSystem`
- `DefensePosition`
- `ReceptionSystemBlock`
- `ReceptionRotationSystem`
- `ReceptionPosition`
- `PlayerRole`

Broader tactical model:

- `TacticalSystemDefinition`
- `ZoneResponsibility`
- `SystemKind`

The broader model maps zones to court positions. It is intended for future
tactical responsibility editing and scouting integration.

System block data stores abstract `PlayerRole` values. The UI renders localized
role labels with `getRoleLabel(role, locale)`, so switching language changes
labels without changing saved system data.

## Persistence

Current editor persistence:

- `localStorage`
- defense key: `openvolleyscout.defenseSystemBlocks`
- reception key: `openvolleyscout.receptionSystemBlocks`

There is also a generic localStorage helper for `TacticalSystemDefinition[]`:

- `src/infrastructure/storage/system-storage.ts`
- key: `openvolleyscout.systems`

The Systems page does not yet use IndexedDB for tactical systems.

## Constraints

- Systems must stay separate from generic application settings.
- Tactical responsibilities should map to court positions or roles, not fixed
  player ids.
- Real zone editing should reuse the app spatial/court models.
- Future durable persistence should go through `src/infrastructure/`.

## Current Gaps

- editor block models and generic tactical definition model are not unified
- no IndexedDB-backed system persistence
- no full team/rotation association workflow in the UI
- no full live scouting player suggestion from saved systems
