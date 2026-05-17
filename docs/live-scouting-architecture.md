# Live Scouting Architecture

Live scouting is split into rendering, rally flow, tactical flow, popup placement,
animation helpers, and match event state. New rules should land in the narrowest
module that owns the rule, then be passed into the UI as computed state.

## Rendering

`src/features/scouting/components/ScoutingCourt.tsx` is presentational. It renders
the court, zones, player markers, ball token, rally message, and touch popup. It
receives tactical marker positions, allowed zones, selected player state, popup
state, and dispatch callbacks from `LiveRallyStage`.

`LiveRallyStage.tsx` is the live court container. It derives the active tactical
players, resolves serve-start positions, connects the touch-flow controller, and
passes render-ready props into `ScoutingCourt`.

## Tactical Flow

Tactical rules live under `src/features/scouting/live/tactical/`.

`tactical-transition.ts` owns team phase transitions:
- serve to break-point defense
- reception to setter release
- setter release to side-out or break-point defense
- ball crossing the net
- ace victim receptions that should not advance tactical phase

`tactical-rotation.ts` owns side-out rotation and serving-team continuity.
Rotations happen only when the receiving team wins the point.

`tactical-libero.ts` is the live scouting entry point for libero legality,
replacement proposals, automatic exits, and original-player restoration.

`tactical-zones.ts` owns live court zone availability and serve-start movement.

### Tactical Positioning Pipeline

Rendered player markers are resolved through
`live/tactical/positioning/tactical-position-resolver.ts`. This is the tactical
entry point for UI code. It consumes the team, active lineup, team tactical
phase, configured defense and reception systems, libero state, and optional
serve-start zone. It returns render-ready `TacticalCourtPlayer` markers with
live-court coordinates, role metadata, setter/libero flags, and replacement
metadata.

The resolver flow is:

1. Select the active system block from the tactical phase: reception phases use
   the reception system, all defense and serve phases use the defense system.
2. Resolve the setter rotation and map the configured role sequence to players
   with `tactical-role-mapping.ts`.
3. Resolve libero display state with `tactical-libero-layout.ts`, including
   visual replacement, hidden replaced players, and forced regular-player
   display when the libero must exit before the front row.
4. Read configured half-court positions from `tactical-reception-layout.ts` or
   `tactical-defense-layout.ts`.
5. Convert half-court positions to live-court coordinates through
   `court-coordinates.ts` and `tactical-mirroring.ts`.
6. Apply serve-start movement for the server in `serving_prepare`.
7. Apply setter release coordinates in setter-release phases.

`resolveTacticalCourtPlayers` from `tactical-position-resolver.ts` is the
canonical tactical positioning API. The old model-level names remain only as
deprecated compatibility exports for callers that still import from the scouting
model barrel.

### Positioning Modules

The focused positioning modules are:

- `datavolley-zones.ts` - DataVolley zone labels and zone-coordinate lookup.
- `court-coordinates.ts` - percentage normalization, half-court to live-court
  conversion, court-position fallback coordinates, and serve-start coordinates.
- `tactical-mirroring.ts` - home/away mirroring helpers.
- `tactical-role-mapping.ts` - role-sequence mapping for setter, outsides,
  middles, and opposite using stable `PlayerRole` identifiers.
- `tactical-formation.ts` - fallback slots, role sequence fallback, and generic
  marker formation helpers.
- `tactical-defense-layout.ts` - break-point and side-out defense positions from
  configured defense system blocks.
- `tactical-reception-layout.ts` - reception positions from configured reception
  system blocks.
- `tactical-setter-layout.ts` - setter release, release phase detection, and
  return-to-defense targets.
- `tactical-libero-layout.ts` - libero visual replacement and front-row display
  constraints.
- `tactical-position-resolver.ts` - final orchestration and rendered markers.

### Coordinate Systems

System editors store tactical positions as half-court percentages. In that
coordinate space, `x` is the lateral lane from zone 4 toward zone 2 and `y` is
depth from the net toward the end line. `court-coordinates.ts` maps those
half-court values onto the live full-court surface:

- away-team depth projects left from the net at `x = 50`;
- home-team depth is mirrored to the right of the net;
- lateral lanes are mirrored so home and away show the same volleyball shape
  from opposite sides of the court.

Fallback court-position coordinates and half-court conversion results are
module-level derived data, so stable tactical coordinates are not rebuilt during
render. `LiveRallyStage` still memoizes resolved tactical markers before passing
them to `ScoutingCourt`.

### DataVolley Mapping

DataVolley-like zones such as `1a`, `2c`, `3b`, `6b`, and `9a` are lookup labels
for half-court tactical coordinates. The DataVolley module does not decide
tactical phase, player role, mirroring, or libero behavior. Layout modules may
use a zone as a fallback coordinate when a saved system position does not have
finite `x` and `y` values.

### Where To Add Tactical Rules

Add new tactical positioning rules in the narrow module that owns the concept:

- phase changes belong in `tactical-transition.ts`;
- court conversion and home/away orientation belong in `positioning/court-coordinates.ts`;
- side mirroring belongs in `positioning/tactical-mirroring.ts`;
- lineup-to-role mapping belongs in `positioning/tactical-role-mapping.ts`;
- defense system placement belongs in `positioning/tactical-defense-layout.ts`;
- reception system placement belongs in `positioning/tactical-reception-layout.ts`;
- setter release and return targets belong in `positioning/tactical-setter-layout.ts`;
- libero visual constraints belong in `positioning/tactical-libero-layout.ts`;
- final marker orchestration belongs in `positioning/tactical-position-resolver.ts`.

Do not add new positioning logic to `src/features/scouting/model/tactical-positioning.ts`.
That file is a compatibility surface only.

## Rally Flow

Rally rules live under `src/features/scouting/live/rally/`.

`rally-flow.ts` owns pending touch creation, evaluation handling, serve ace victim
selection, popup avoidance points, and player option derivation.

`rally-validation.ts` owns overwrite validation for replacing a matching pending
touch in the current rally.

`rally-events.ts` exposes rally event builders used by the scouting store.

## Touch Flow Store

`src/features/scouting/live/stores/live-touch-flow-store.ts` contains the touch
flow state machine and the React controller used by `LiveRallyStage`. The legacy
`model/live-touch-flow-store.ts` file re-exports it for compatibility.

## Popup And Animation

`live/popup/popup-positioning.ts` is a pure popup layout module. React popup
measurement stays in `BallTouchPopup`, but collision and placement rules are
testable without React.

`live/animation/marker-animation.ts` centralizes marker and ball position style
helpers so movement state stays separate from tactical rules.

## Compatibility Layer

The existing `src/features/scouting/model/*` tactical imports remain available
where older callers depend on them. `getPlayerTacticalPositions` and
`model/system-role-mapping.ts` are deprecated compatibility names. New live
scouting code should use `resolveTacticalCourtPlayers` and the focused
`live/tactical/positioning/*` modules directly.
