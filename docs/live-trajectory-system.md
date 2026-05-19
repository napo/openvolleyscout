# Live Trajectory System

OpenVolleyScout renders rally movement on a tactical viewport, not only on the
court rectangle. The court remains centered, while the playable ball area
extends into service space, free zones, and outside-court recovery space.

## Tactical Viewport

Live court coordinates use a normalized `0..100` tactical viewport:

- `x: 0` is the far away-team endline free zone edge.
- `x: 100` is the far home-team endline free zone edge.
- `y: 0` and `y: 100` are the free-zone edges outside the sidelines.
- The visual court rectangle is centered inside the viewport.
- The current court inset is `12%` on every side, so the in-court surface is
  `x: 12..88` and `y: 12..88`.

The same coordinate space is used by:

- ball token dragging
- tactical player markers
- serve-start zones
- touch destination points
- trajectory points
- replay rendering

Points outside `x: 12..88` or `y: 12..88` are outside the court but still valid
tactical points. This is how wide serves, deep balls, sideline recoveries, and
free-zone saves are represented.

## Trajectory Model

The reusable model lives in `src/domain/trajectory`:

```ts
export interface BallTrajectoryPoint {
  x: number;
  y: number;
  timestamp?: number;
}

export interface BallTrajectory {
  id: string;
  rallyTouchId?: string;
  teamSide?: TeamSide;
  skill?: SkillType;
  evaluation?: SkillEvaluation;
  points: BallTrajectoryPoint[];
  inferred?: boolean;
}
```

`BallTouch` has an optional `trajectory` field. Older touches without this field
remain valid.

## Lifecycle

1. The operator starts dragging the ball.
2. `useCourtBallDrag` captures the start point and simplified movement samples.
3. Points are clamped to the tactical viewport, not to the court rectangle.
4. On release, the nearest scouting zone still determines the volleyball touch,
   while the released point can remain outside the court.
5. The live flow builds a `BallTrajectory` for the pending touch.
6. Skill, evaluation, and team changes update trajectory metadata.
7. When the touch is committed, the trajectory is attached to the serialized
   `BallTouch` with `rallyTouchId`.

Point history is capped and simplified in `src/domain/trajectory/helpers.ts` to
avoid noisy drag datasets.

## Replay Compatibility

Replay preserves trajectories because `touch_recorded` events store the full
`BallTouch`.

For old sessions:

- missing `touch.trajectory` is tolerated
- replay does not require trajectory data
- rendering can reconstruct an inferred two-point trajectory from
  `originZone` and `targetZone` when those fields exist
- reconstructed trajectories are marked `inferred: true`

## Rendering Architecture

The court uses an SVG overlay:

- `BallTrajectoryOverlay` renders committed and pending trajectories.
- SVG paths use the same `0..100` viewport as the court.
- Paths are drawn before court lines and player/ball markers.
- Court lines remain visible above paths.
- The ball token remains above trajectories and keeps the existing drag
  interaction.

Skill-aware styling is intentionally subtle:

- serve: direct, light blue
- attack: thicker and warmer
- freeball: softer curved/dashed path
- set: lighter dashed path
- dig/cover/block: compact defensive styling

No external rendering library is used.

## Future Analytics Hooks

Trajectory helpers already expose reusable primitives for later work:

- outside-court point detection
- trajectory bounds
- touch trajectory reconstruction
- trajectory filtering
- simplified point histories

These are intended to support future heatmaps, attack direction analytics,
outside-court recovery summaries, exports, and PDF/report rendering without
changing the live scouting workflow.
