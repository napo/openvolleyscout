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

`tactical-setter-release.ts` owns the under-net 2c setter release coordinate,
mirroring, and release-phase detection.

`tactical-rotation.ts` owns side-out rotation and serving-team continuity.
Rotations happen only when the receiving team wins the point.

`tactical-libero.ts` is the live scouting entry point for libero legality,
replacement proposals, automatic exits, and original-player restoration.

`tactical-zones.ts` owns live court zone availability and serve-start movement.

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

The existing `src/features/scouting/model/*` imports remain available where other
parts of the app already depend on them. New live scouting rules should use the
`live/` modules directly; model re-exports should be treated as compatibility
surface, not the home for new flow logic.
