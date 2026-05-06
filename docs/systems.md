# Tactical Systems

OpenVolleyScout currently has two related system concepts:

1. `DefenseSystem` - the current editable defense-system UI model.
2. `TacticalSystemDefinition` - a broader position-based tactical model for
   future zone responsibility workflows.

These concepts are related but not fully unified yet.

## Current Systems Page

Location:

- `src/features/systems/pages/SystemsPage.tsx`

The current page focuses on defense systems. It supports:

- listing saved defense systems
- creating a new defense system
- selecting the active defense system
- editing the system name
- dragging role markers on a court surface
- saving the edited layout

The editor component is:

- `src/features/systems/components/DefenseSystemEditor.tsx`

The feature store is:

- `src/features/systems/model/defense-system-store.ts`

## DefenseSystem Model

Defined in:

- `src/domain/systems/types.ts`

`DefenseSystem` contains:

- `id`
- `name`
- optional `teamId`
- `positions`

Each `DefensePosition` contains:

- `role`
- `zone`
- `x`
- `y`

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
Italian labels use `P`, `O`, `S1`, `S2`, `C1`, `C2`, and `L`. English labels
use `S`, `O`, `OH1`, `OH2`, `M1`, `M2`, and `L`.

The default defense system currently creates three markers:

- `OUTSIDE_HITTER_1` in zone `7`
- `MIDDLE_BLOCKER_1` in zone `6`
- `OUTSIDE_HITTER_2` in zone `9`

`getZoneFromCoordinates()` currently maps marker x-coordinates into simplified
zones `7`, `6`, and `9`. This is a simple editor foundation, not the full
scouting-court zone model.

## Defense-System Persistence

`useDefenseSystemStore` persists defense systems to `localStorage` under:

- `openvolleyscout.defenseSystems`

This persistence is browser-local and separate from match-project persistence.
Defense systems are not yet stored in IndexedDB and are not yet linked durably
to match projects.

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

The position-based model keeps systems reusable across rotations, substitutions,
libero changes, and teams.

## Tactical Runtime Model

Runtime tactical resolution lives in:

- `src/domain/tactical/`

The intended resolution chain is:

1. selected zone
2. tactical system responsibility lookup
3. court position resolution
4. active lineup lookup
5. player candidate output

This is partially implemented at the domain level, but it is not fully wired
into the live scouting UI yet.

## Existing localStorage System Storage

`src/infrastructure/storage/system-storage.ts` stores
`TacticalSystemDefinition[]` under:

- `openvolleyscout.systems`

`src/infrastructure/repositories/system-repository.ts` re-exports that helper as
`systemRepository`.

The current `SystemsPage` does not use this generic repository as its main
state path. It uses `useDefenseSystemStore` instead.

## Current Status

Implemented:

- defense-system route and page
- defense-system store
- default defense-system factory
- draggable defense markers
- localStorage persistence for defense systems
- generic tactical-system definition types
- tactical resolver foundation

In progress:

- unifying the defense-system editor model with the generic tactical-system
  definition model
- replacing simplified zone mapping with the same spatial/court model used by
  scouting
- IndexedDB-backed system persistence
- team and rotation association workflows
- live scouting player suggestion from systems

## Rules for Future Work

- Keep tactical systems separate from generic settings.
- Keep responsibility mappings position-based, not player-based.
- Reuse the existing spatial/court zone model when adding real zone editing.
- Put durable persistence under `src/infrastructure/`.
- Document whether a new systems change affects the editor model, the tactical
  runtime model, or both.
