# Live Trajectory System

OpenVolleyScout renders ball movement on the full scouting stage, not only on
the court rectangle. The stage includes the centered court, service space, free
zones, and outside-court recovery space.

## Canonical Coordinates

Ball direction uses normalized stage coordinates:

```ts
export interface StagePoint {
  x: number; // 0..100 within the scouting stage
  y: number; // 0..100 within the scouting stage
}

export interface BallDirection {
  start: StagePoint;
  end: StagePoint;
  isOutsideCourtStart?: boolean;
  isOutsideCourtEnd?: boolean;
  courtZoneStart?: string;
  courtZoneEnd?: string;
  
  // Multi-point trajectory (e.g., block deflection)
  via?: StagePoint[];
  
  // Deflection metadata
  deflectedBy?: {
    skill: 'block' | 'touch';
    playerId?: string;
  };
  
  // Subzone from cone-to-subzone mapping (DataVolley imports)
  subzoneEnd?: 'A' | 'B' | 'C' | 'D';
}
```

This is the canonical model for live rendering, pending touches, committed
touches, replay, and future heatmap inputs.

`clientPointToStagePoint(event, stageElement)` is the only pointer conversion
helper. It reads `stageElement.getBoundingClientRect()`, converts
`clientX/clientY` into `0..100` stage coordinates, and clamps to the scouting
stage bounds. It never clamps to the court rectangle.

`stagePointToSvgPoint(stagePoint)` is identity because the trajectory overlay
uses `viewBox="0 0 100 100"`.

## Stage Versus Court

Stage coordinates describe the full live scouting surface:

- `x: 0` is the far away-team free-zone edge.
- `x: 100` is the far home-team free-zone edge.
- `y: 0` and `y: 100` are the free-zone edges outside the sidelines.
- The court rectangle is currently inset at `x: 12..88` and `y: 12..88`.

Court coordinates and scouting zones still decide volleyball meaning: selected
zone, team side, origin zone, target zone, and DataVolley-style zone metadata.
Ball direction start/end stay in stage coordinates so wide serves, deep balls,
sideline releases, and outside-court saves remain renderable and analyzable.

## Multi-Point Trajectories (Block Deflection)

Attack trajectories can be deflected by the opposing block. The `via` array 
stores intermediate waypoints for these complex paths:

```
Attack: (10,10) → [block touch at (40,50)] → (60,80)
```

This is represented as:

```ts
BallDirection = {
  start: { x: 10, y: 10 },        // Attack origin
  via: [{ x: 40, y: 50 }],        // Block contact point
  end: { x: 60, y: 80 },          // Ball lands here
  deflectedBy: {
    skill: 'block',
    playerId: 'player-123'
  }
}
```

**Use Cases:**
- Blocking effectiveness analysis (where does blocked ball land?)
- Attack strategy vs. defense (comparison of successful vs. blocked trajectories)
- Recovery opportunity identification (where do teammates have to dig?)

**Rendering:**
- Heatmaps draw straight segments: start→via[0], via[0]→via[1], ..., via[n]→end
- Deflection points are marked with small circles to show block contact zones
- Color remains consistent across all segments (by original attack skill)

## Direction Lifecycle

1. On pointer down, the direction start is computed from the current rendered
   ball center in stage coordinates. The pointer position is not used as the
   start, so off-center touches do not shift the arrow.
2. The previous pending direction is replaced immediately with
   `start === end`.
3. Pointer move updates only `direction.end`.
4. Pointer up freezes `direction.end` and stores the direction on the pending
   touch and pending trajectory wrapper.
5. Skill, evaluation, and team changes update touch/trajectory metadata without
   changing `direction.start` or `direction.end`.
6. Committing the touch serializes `ballDirection` on `BallTouch`.
7. Rally close clears pending ball direction state with the rest of the pending
   live input.

## Rendering

`BallTrajectoryOverlay` covers the full scouting stage and has
`pointer-events: none`. It renders one straight dashed SVG line per direction
with `marker-end` for the arrowhead. The SVG uses the same `0..100` coordinate
space as `BallDirection`, so rendered arrows do not mix client pixels with
normalized stage points.

The visual court lines and player/ball markers remain separate layers. The
trajectory layer is for ball movement only; it does not change live scouting
interaction or stats/report logic.

## Replay And Compatibility

New touches preserve:

- `ballDirection`
- `skill`
- `teamSide`
- `playerId`
- zone metadata when available

Older touches without direction still load. If an old touch has the legacy
`trajectory.points` shape, replay and rendering convert the first and last
points into `BallDirection.start` and `BallDirection.end`. If direction data is
missing entirely, rendering can still infer a two-point direction from
`originZone` and `targetZone` when those fields exist.

## Heatmaps (Analytics)

Direction data stored on committed touches is consumed by the Performance Dashboard heatmap system.

**Available heatmap modes:**
- **Density Mode**: Gaussian-smoothed event density grid over the court
- **Zone Density Mode**: Volleyball-specific 6×6 zone grid with fine-grained subzones (A-D)
- **Direction Mode**: Full-court trajectory arrows colored by skill
- **Point Mode**: Event location circles (planned)

All modes consume the same `BallTouch.ballDirection` model with support for:
- Multi-point trajectories (`via` array) for block deflection analysis
- Deflection metadata (`deflectedBy` field)
- DataVolley zone-to-subzone mapping for imported matches
- All dashboard filters (team, set, player, role, skill, evaluation, rally phase, source)

See [heatmaps.md](heatmaps.md) for detailed rendering, filtering, and DataVolley compatibility.
