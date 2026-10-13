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

## Role Order, Presets and Team Assignment

`roleSequence` lists the roles by court position 1..6 with the setter in 1.
Two orders are recognised (`getRoleOrder` in `src/domain/systems/formations.ts`):

- **P-S-C**: outside hitter in 2, middle blocker in 3 (the base OVS system)
- **P-C-S**: middle blocker in 2, outside hitter in 3

New systems start from a preset (`src/config/systems/presets.ts`), after the
Click&Scout preconfigured reception schemes: three receivers, with or without
the opposite receiving (when the opposite receives, the front-row outside
hitter stays out), in both orders. The P-S-C base reception is the hand-drawn
default; the other formations come from `generateReceptionRotation`, which
only produces formations without positional faults. Defense presets put the
players in their post-switch spots (`generateDefenseRotation`). Any system can
be duplicated and redrawn freely.

The reception editor checks the overlap rule at serve time
(`getReceptionOverlapFaults`) for every rotation and lists the faults; the
back-row middle blocker's marker stands for the libero.

A system can be assigned to an archived team (`teamId`); a team has at most
one reception and one defense system. During live scouting each side uses its
team's systems, falling back to the active ones, and the set-start wizard
proposes the team's role order when the setter is chosen.

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
not stored in IndexedDB and are not linked to match projects.

## Export, Import and Backup

`src/features/systems/model/system-library-file.ts` defines the systems file
(`kind: "openvolleyscout-systems"`, JSON) used by the Systems page to export
all systems or the open one and to import them. The `.ovs` backup carries the
same data in a `systems.json` entry (manifest flag `includesSystems`; older
backups simply have none) whenever archives are included.

Importing never loses local work (`mergeImportedSystemBlocks`):

- a system already present unchanged is skipped
- a different system with the same id is added as a copy named "(imported)"
- an untouched built-in preset is overwritten by its imported version
- a local team assignment always wins over an imported one

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
- full live scouting player suggestion from saved systems

## Rules for Future Work

- Keep tactical systems separate from generic settings.
- Keep responsibility mappings position-based or role-based, not player-id
  based.
- Reuse the existing spatial/court zone model when adding real zone editing.
- Put durable persistence under `src/infrastructure/`.
- Document whether a new systems change affects editor blocks, runtime tactical
  resolution, or both.
