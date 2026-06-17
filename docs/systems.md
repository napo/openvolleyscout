# Tactical Systems

OpenVolleyScout currently has two related system concepts:

1. editor block libraries for reception and defense systems
2. `TacticalSystemDefinition`, a broader position-based tactical model for
   future zone responsibility workflows

These concepts are related but not fully unified yet.

## Current Systems Page

Location:

- `src/features/systems/pages/SystemsPage.tsx`

The current page supports two libraries:

- defense systems
- reception systems

The user can create blocks, select the active block, edit names, move role
markers on the court, save changes, delete blocks, and export definitions.

Editors:

- `src/features/systems/components/DefenseSystemEditor.tsx`
- `src/features/systems/components/ReceptionSystemEditor.tsx`
- `src/features/systems/components/SystemExportPanel.tsx`

Feature stores:

- `src/features/systems/model/defense-system-store.ts`
- `src/features/systems/model/reception-system-store.ts`

## Editor Block Models

Defined in:

- `src/domain/systems/types.ts`

### Reception

`ReceptionSystemBlock` contains:

- `id`
- `name`
- optional `teamId`
- optional `playingSystemId`
- `roleSequence`
- `rotations`

Each `ReceptionRotationSystem` contains:

- setter `rotation`
- `positions`

Each `ReceptionPosition` contains:

- `role`
- `dataVolleyZone`
- `x`
- `y`

### Defense

`DefenseSystemBlock` contains:

- `id`
- `name`
- optional `teamId`
- optional `playingSystemId`
- `roleSequence`
- `contexts`

Defense contexts are:

- `break_point`
- `side_out`

Each context contains one `DefenseRotationSystem` per setter rotation. Each
`DefensePosition` contains:

- `role`
- `dataVolleyZone`
- `x`
- `y`

## Roles and Labels

`role` is a `PlayerRole` enum value, not a UI label.

Current roles are:

- `SETTER`
- `OPPOSITE`
- `OUTSIDE_HITTER_1`
- `OUTSIDE_HITTER_2`
- `MIDDLE_BLOCKER_1`
- `MIDDLE_BLOCKER_2`
- `LIBERO`

Role labels are resolved at render time with `getRoleLabel(role, locale)`.
Saved system data is therefore locale-independent.

## Editor Persistence

The current editors persist browser-local system blocks to `localStorage`:

- defense: `openvolleyscout.defenseSystemBlocks`
- reception: `openvolleyscout.receptionSystemBlocks`

This persistence is separate from match-project persistence. System blocks are
not yet stored in IndexedDB and are not durably linked to match projects.

## TacticalSystemDefinition Model

Also defined in:

- `src/domain/systems/types.ts`

`TacticalSystemDefinition` contains:

- `id`
- `name`
- `kind`
- optional `teamId`
- optional `rotationIndex`
- `responsibilities`

Each `ZoneResponsibility` maps:

- `zoneId`
- `primaryCourtPosition`
- `fallbackCourtPositions`

This model is position-based:

- `zoneId -> courtPosition`

It deliberately does not map:

- `zoneId -> playerId`

The position-based model keeps systems reusable across rotations,
substitutions, libero changes, and teams.

## Existing Generic System Storage

`src/infrastructure/storage/system-storage.ts` stores
`TacticalSystemDefinition[]` under:

- `openvolleyscout.systems`

`src/infrastructure/repositories/system-repository.ts` re-exports that helper as
`systemRepository`.

The current `SystemsPage` does not use this generic repository as its main
state path. It uses the reception and defense feature stores instead.

## Runtime Tactical Model

Runtime tactical resolution lives in:

- `src/domain/tactical/`
- `src/features/scouting/live/tactical/`

The intended resolution chain is:

1. selected zone or live tactical phase
2. system responsibility or role-position lookup
3. court position resolution
4. active lineup lookup
5. player candidate output

The live scouting UI already uses tactical helpers for court layout,
setter/rotation information, libero state, and role mapping. Full player
suggestion from saved system blocks is still evolving.

## Current Status

Implemented:

- systems route and page
- defense and reception library tabs
- defense and reception stores
- default system presets
- role markers by setter rotation
- separate defense contexts for break point and side out
- localStorage persistence for editor blocks
- system export UI
- generic tactical-system definition types
- tactical resolver foundation

Still evolving:

- unifying editor block models with the generic tactical definition model
- IndexedDB-backed system persistence
- durable team and rotation association workflows
- full live scouting player suggestion from saved systems

## Rules for Future Work

- Keep tactical systems separate from generic settings.
- Keep responsibility mappings position-based or role-based, not player-id
  based.
- Reuse the existing spatial/court zone model when adding real zone editing.
- Put durable persistence under `src/infrastructure/`.
- Document whether a new systems change affects editor blocks, runtime tactical
  resolution, or both.
