# Ball Direction Heatmaps

Added in Dashboard v3 (2026-05-28). Renders a volleyball court SVG with directional data from `BallTouch` records, using only the canonical `BallDirection` / `StagePoint` model.

## Architecture

```
src/features/analytics/heatmaps/
├── index.ts                              Public exports
├── aggregation/
│   └── heatmap-aggregation.ts            Event extraction + density grid
├── filters/
│   └── heatmap-filters.ts               Skill filter, mode, endpoint types
├── selectors/
│   └── heatmap-selectors.ts             Extract touch events from filtered rallies
├── validation/
│   └── heatmap-validation.ts            Bounds + diagnostics helpers
├── rendering/
│   └── HeatmapCourtSvg.tsx              SVG court + density/point/direction overlays
└── widgets/
    ├── HeatmapWidget.tsx                 Main container (toolbar + court + diagnostics)
    └── heatmap.css                       Widget styles
```

## Data Model

### HeatmapEvent

One extracted direction event per `BallTouch`:

```typescript
interface HeatmapEvent {
  touchId: string;
  teamSide: TeamSide;
  skill: SkillType;
  evaluation?: SkillEvaluation;
  playerId?: string;
  setNumber: number;
  rallyNumber: number;
  start: StagePoint;   // where ball came from (stage 0-100)
  end: StagePoint;     // where ball went (stage 0-100)
  isInferred: boolean; // reconstructed from zone references, not explicit coords
}
```

### HeatmapDensityGrid

Grid of cells covering the court (`x∈[12,88]`, `y∈[12,88]`). Default: 12×12 cells.

```typescript
interface HeatmapGridCell {
  col: number; row: number;   // 0-based indices
  x: number; y: number;       // stage center of cell
  cellX: number; cellY: number; cellWidth: number; cellHeight: number;
  count: number;              // touch count in this cell
  density: number;            // count / maxCount (0..1)
}
```

## Direction Extraction

`extractHeatmapEvents(touches)` processes each touch in order:

1. Try `getBallDirectionForTouch(touch)` — reads `touch.ballDirection` or `touch.trajectory.direction`.
2. Fall back to `reconstructBallTrajectoryForTouch(touch, prev)` — infers from `originZone`/`targetZone`/`zone` references.
3. Skip the touch if neither yields a direction (marks `isInferred` accordingly).

The previous touch in the array is passed to the fallback to allow inference from the preceding zone.

## Coordinate System

Uses the canonical OVS stage coordinate system:

| Constant | Value | Meaning |
|---|---|---|
| `SCOUTING_SURFACE_INSET_X/Y` | 12 | Court inset from stage edge |
| `SCOUTING_SURFACE_WIDTH/HEIGHT` | 76 | Court width/height in stage units |
| Net | y = 50 | Center of stage |
| Away half | y ∈ [12, 50] | Top |
| Home half | y ∈ [50, 88] | Bottom |
| Away attack line | y ≈ 37.3 | 1/3 of half-court from net |
| Home attack line | y ≈ 62.7 | 1/3 of half-court from net |

**Never uses client pixels or SVG raw coordinates.**

## Court Layout Modes

The SVG rendering adapts to the selected mode:

### Density / Point mode — Half-court view

- **When team = All**: two half-courts rendered side by side (split layout).
  - Left: home team half-court
  - Right: away team half-court
- **When team = Home or Away**: one half-court for that team.

Each half-court:
- Net is at the **top** of the panel (net at `y = HC_INSET_Y`).
- Attack line is at 1/3 from the top.
- Back line is at the bottom.
- Team label is centered in the lower zone.

viewBox: `"0 0 50 80"` (portrait, per half-court). CSS class: `heatmap-court-wrap--split` or `heatmap-court-wrap--single`.

#### Home half-court coordinate transform

```
displayX = HC_INSET_X + HC_W × (stageX − 12) / 76
displayY = HC_INSET_Y + HC_H × (stageY − 50) / 38
```

Stage y=50 (net) → displayY = HC_INSET_Y (top/net). Stage y=88 (back) → displayY = HC_INSET_Y + HC_H (bottom).

#### Away half-court coordinate transform

```
displayX = HC_INSET_X + HC_W × (stageX − 12) / 76
displayY = HC_INSET_Y + HC_H × (50 − stageY) / 38
```

Stage y=50 (net) → displayY = HC_INSET_Y (top/net). Stage y=12 (back) → displayY = HC_INSET_Y + HC_H (bottom).

### Direction mode — Full horizontal court

Shows ball trajectories over the full court, oriented horizontally:
- **Home team** is on the **left** (home back line at far left).
- **Away team** is on the **right** (away back line at far right).
- Net is the **vertical center line**.
- Home attack line at 1/3 from left; away attack line at 2/3 from left.

viewBox: `"0 0 160 60"` (landscape). CSS class: `heatmap-court-wrap--horizontal`.

#### Horizontal court coordinate transform

```
displayX = FC_INSET_X + FC_W × (88 − stageY) / 76   // Y axis becomes X
displayY = FC_INSET_Y + FC_H × (stageX − 12) / 76   // X axis becomes Y
```

Stage y=88 (home back) → displayX = FC_INSET_X (far left). Stage y=12 (away back) → displayX = FC_INSET_X + FC_W (far right). Stage y=50 (net) → displayX = center.

## Rendering Modes

### Density mode

Fills grid cells with a color based on `density` (count / maxCount):

- Low (0.0–0.5): blue → yellow interpolation
- High (0.5–1.0): yellow → red interpolation
- All cells semi-transparent (0.75–0.80 alpha)
- A color legend is rendered below the court
- One density grid per team (built from per-team filtered events)

### Point mode

Draws circles at `end` (or `start`) points. Color is per-skill:

| Skill | Color |
|---|---|
| serve | `#3b82f6` (blue) |
| receive | `#22c55e` (green) |
| attack | `#dc2626` (red) |
| block | `#f97316` (orange) |
| dig | `#a855f7` (purple) |
| freeball | `#14b8a6` (teal) |

Shown on half-court(s). Each half-court panel filters events by team side.

### Direction mode

Draws lines with arrowheads from `start` to `end` over the full horizontal court. Lines are colored by skill (same palette as point mode). Zero-length lines (< 0.5 display units) are skipped.

## Filters

### Dashboard filters (all applied to heatmap)

| Filter | Effect |
|---|---|
| Team | Restricts to that team's touches; also controls half-court split (one vs. two panels) |
| Set | Restricts to one set |
| Player | Restricts to touches by that specific player |
| Role | Restricts to touches by players with that role |
| Source | Restricts to explicit or inferred touches |
| Rally phase | Restricts to rallies matching the phase filter |

All six global dashboard filters are applied in `getHeatmapTouches()`. The previous partial `Pick<DashboardFilters, 'team' | 'set' | 'rallyPhase'>` type has been replaced by the full `DashboardFilters`.

### Widget-local filters (HeatmapWidgetFilters)

| Filter | Values | Default |
|---|---|---|
| `skill` | `all` / `serve` / `receive` / `attack` / `block` / `dig` / `freeball` | `attack` |
| `mode` | `density` / `point` / `direction` | `density` |
| `endpoint` | `end` / `start` | `end` (hidden in direction mode) |

All labels are i18n-localized (`heatmapModeDensity`, `heatmapModePoints`, `heatmapModeDirection`, `heatmapEndpointLanding`, `heatmapEndpointOrigin`, `heatmapSkillAll`).

## Interaction

- **Density mode**: hovering a grid cell shows a tooltip with the touch count.
- **Point / direction mode**: hovering a mark shows skill, evaluation, and player ID.
- Tooltips are rendered inside the SVG to stay within the court bounds.

## Diagnostics Footer

Below the court:

- **Coverage**: `N / M touches have direction data` — how many touches yielded events.
- **Inferred count**: shown when any events were reconstructed from zones.
- **Low coverage warning**: shown when < 50% of touches have direction data (typical for DataVolley imports without trajectory export).

## DataVolley Compatibility

**Native path (preferred)**: DataVolley imports now generate a synthetic `BallTouch.ballDirection`
for every touch that carries zone codes (`startZone` / `endZone` in the action line).  The
direction is built by `src/features/import/mapping/datavolley-zone-to-stage.ts` using the
same half-court → stage coordinate math as the live scouting court.  The heatmap extractor's
primary `ballDirection` branch picks this up directly, so no special-case code is needed.

`BallDirection.courtZoneStart` / `courtZoneEnd` store the original DataVolley zone codes
(e.g. `'6'`, `'9'`) for diagnostics.

**Fallback path**: If `ballDirection` is absent but the touch carries `originZone` /
`targetZone` / `zone` references with valid `point` fields, `extractDirection` in
`heatmap-aggregation.ts` constructs the direction from those zone centers.  This path is
retained for backward compatibility and for touches recorded before synthetic direction
generation was added.

The `isInferred` flag is set for any touch where `ballDirection` was absent (zone-based
reconstruction is considered approximate), and the count is surfaced in the diagnostics
footer.

## Non-Goals

- Court heatmaps do not replace live scouting trajectory rendering.
- No animated trajectories or video playback integration.
- No 3D projection or camera overlay.

See [performance-dashboard.md](performance-dashboard.md) for how the widget is integrated into the dashboard.
