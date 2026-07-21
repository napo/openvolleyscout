# Heatmaps and Spatial Analysis

Enhanced spatial analytics system with multiple rendering modes including zone-granularity heatmaps, density visualization with Gaussian smoothing, and multi-point trajectory support for block deflection tracking. Updated 2026-05-31 for Issues #24 & #25.

## Architecture

```
src/features/analytics/heatmaps/
├── index.ts                                 Public exports
├── aggregation/
│   └── heatmap-aggregation.ts              Event extraction + density grid
├── filters/
│   └── heatmap-filters.ts                  Skill filter, mode, endpoint types
├── selectors/
│   └── heatmap-selectors.ts                Extract touch events from filtered rallies
├── validation/
│   └── heatmap-validation.ts               Bounds + diagnostics helpers
├── modes/
│   ├── DensityMode.tsx                     Half-court density grid (blue→yellow→red)
│   ├── PointMode.tsx                       Half-court point cloud (skill-colored circles)
│   ├── DirectionMode.tsx                   Full-court arrows with orientation toggle
│   └── useHeatmapMode.ts                   Factory hook for mode selection
├── rendering/
│   └── HeatmapCourtSvg.tsx                 SVG court (delegates to mode factory)
└── widgets/
    ├── HeatmapWidget.tsx                   Main container (toolbar + court + diagnostics)
    └── heatmap.css                         Widget styles
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
  start: StagePoint;           // where ball came from (stage 0-100)
  end: StagePoint;             // where ball went (stage 0-100)
  direction: BallDirection;    // includes via[] + deflectedBy metadata
  isInferred: boolean;         // reconstructed from zone references, not explicit coords
}
```

### BallDirection (Extended for Block Deflection)

Represents ball trajectory with optional deflection points:

```typescript
interface BallDirection {
  start: StagePoint;
  end: StagePoint;
  // ... existing zone fields ...
  
  // Multi-point trajectories (e.g., block deflection)
  via?: StagePoint[];
  
  // Deflection metadata (when ball touches another player before ending)
  deflectedBy?: {
    skill: 'block' | 'touch';
    playerId?: string;
  };
}
```

**Example - Block Deflection:**
- Start: Attack origin (zone 4)
- Via[0]: Block contact point (zone 3, net area)
- End: Final landing (zone 2)

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

### Zone Density Mode (`ZoneDensityMode.tsx`)

Fine-grained volleyball-specific heatmap showing density within court zones and subzones.

**Grid Layout**: 6×6 cell grid mapping directly to DataVolley zones 1-9 and subzones A-D:

```
4C 4B | 3C 3B | 2C 2B
4D 4A | 3D 3A | 2D 2A
------+-------+------
7C 7B | 8C 8B | 9C 9B
7D 7A | 8D 8A | 9D 9A
------+-------+------
5C 5B | 6C 6B | 1C 1B
5D 5A | 6D 6A | 1D 1A
```

Each zone (1-9) occupies a 2×2 sub-grid. Each subzone (A-D) occupies a single cell:
- **C** (top-left): col % 2 = 0, row % 2 = 0
- **B** (top-right): col % 2 = 1, row % 2 = 0  
- **D** (bottom-left): col % 2 = 0, row % 2 = 1
- **A** (bottom-right): col % 2 = 1, row % 2 = 1

**Features:**
- Color gradient: green (low density) → yellow → orange → red (high density)
- Gaussian smoothing for continuous density visualization
- Support for attack/receive skills with optional cone-to-subzone mapping
- Filters: player, skill, evaluation (partial support for set, role, rallyPhase, source)

**Use Cases:**
- Zone-specific attack strategy analysis
- Reception concentration by subzone
- DataVolley import visualization (zone-based input)

### Density Mode (`DensityMode.tsx`)

Fills grid cells with a color based on `density` (count / maxCount):

- **Color Gradient**: Blue (low) → Yellow (medium) → Red (high)
- **Cell Opacity**: 0.75–0.80 alpha for semi-transparency
- **Grid Resolution**: Default 12×12 cells (configurable)
- **Display**: Half-court (single team or split for 'both')
- **Legend**: Color gradient with "low" / "high" labels

**Use Cases:**
- Identify high-traffic court zones
- Analyze serve reception concentration
- Spot defensive patterns

**Component Props:**
```typescript
interface DensityModeProps {
  grid?: HeatmapDensityGrid;
  teamSide: 'home' | 'away';
  teamLabel: string;
  hoveredCell?: HeatmapDensityGrid['cells'][number] | null;
  onCellHover?: (cell: HeatmapDensityGrid['cells'][number] | null) => void;
}
```

### Point Mode — NOT YET FULLY IMPLEMENTED

Point Mode design calls for drawing circles at event endpoints colored by skill, but is not yet complete.  
When needed, can be implemented following the same pattern as Density Mode:
1. Extract endpoints from HeatmapEvent
2. Render skill-colored circles with opacity/hover effects
3. Share half-court coordinate transforms with Density Mode

### Zone Direction Mode (`ZoneDensityMode.tsx` - arrows)

Displays attack and reception direction arrows on the 6×6 zone grid. Shows which zones balls are attacked to/from.

**Features:**
- Arrows from startZoneCode to endZoneCode
- Aggregated counts per direction (frequency-weighted)
- Color-coded by skill (attack red, receive blue)
- Support for cone-to-subzone mapping to show fine-grained attack directions

**Use Cases:**
- Attack distribution by zone
- Reception pattern analysis
- Quick visual of where balls go from each court zone

### Direction Mode (`DensityDirectionMode.tsx`)

Draws arrow trajectories from `start` to `end` over the full horizontal court. Supports multi-point paths for deflections.

**Features:**
- **Full-Court View**: Horizontal layout (160×60 viewBox)
- **Team Orientation**: Home left, away right (flipped on toggle)
- **Arrow Rendering**: Colored by skill with SVG markers
- **Multi-Segment Support**: Draws intermediate segments for `via` points
- **Deflection Markers**: Small circles at deflection points
- **Orientation Toggle**: ⇄ Flip button to swap home/away sides
- **Filtering**: Skips trajectories < 0.5 display units (noise)
- **Legend**: Skill colors with arrow indicators

**Coordinate Transforms:**
```typescript
// Standard: home back (left), away back (right)
fcX = FC_INSET_X + FC_W * (88 - stageY) / STAGE_SIZE;

// Flipped: home back (right), away back (left)
fcXFlipped = FC_INSET_X + FC_W - (FC_W * (88 - stageY) / STAGE_SIZE);
```

**Block Deflection Rendering:**
When `BallDirection.via` contains deflection points:
```
Start Point → Via[0] (block contact) → Via[n] → End Point
                ↓
          Colored circle marker
```

**Use Cases:**
- Attack strategy visualization
- Deflection pattern analysis
- Full-court overview of ball movement

**Component Props:**
```typescript
interface DirectionModeProps {
  events: HeatmapEvent[];
  homeLabel: string;
  awayLabel: string;
  hoveredEvent?: HeatmapEvent | null;
  onEventHover?: (event: HeatmapEvent | null) => void;
}
```

## Factory Hook: `useHeatmapMode`

Central selector for rendering the correct mode component:

```typescript
import { useHeatmapMode } from '@/features/analytics/heatmaps/modes/useHeatmapMode';

export function HeatmapWidget() {
  const { renderPanel, renderLegend, mode } = useHeatmapMode({
    mode: 'direction',
    events,
    homeLabel: 'Home',
    awayLabel: 'Away',
  });
  
  return (
    <>
      {renderPanel}
      {renderLegend}
    </>
  );
}
```

**Config Properties:**
- `mode`: 'density' | 'point' | 'direction'
- `events`: HeatmapEvent[]
- `endpoint`: 'start' | 'end' (point mode only)
- `grid`: HeatmapDensityGrid (density mode only)
- `teamSide`: 'home' | 'away' (density/point modes)
- `teamLabel`: string (widget title)
- `homeLabel`, `awayLabel`: string (direction mode only)
- `hoveredEvent`: Optional for hover effects
- `onEventHover`: Callback for interaction

**Why Factory Pattern?**
Each mode has distinct:
- Data requirements (grid vs. events vs. trajectories)
- Rendering pipeline (SVG cells vs. circles vs. arrows)
- Coordinate transforms (half-court vs. full-court)
- Hover semantics (cells vs. events vs. trajectories)

Factory pattern prevents unmaintainable conditional logic in a monolithic component.

## Filters

### Dashboard filters

| Filter | Density Mode | Zone Density Mode | Direction Mode |
|---|---|---|---|
| Team | ✅ | ✅ | ✅ |
| Set | ✅ | ❌ | ✅ |
| Player | ✅ | ✅ | ✅ |
| Role | ✅ | ❌ | ✅ |
| Source | ✅ | ❌ | ✅ |
| Rally phase (touch-level `TouchPhase`) | ✅ | ✅ (local control) | ✅ |
| Attack context (`receive` / `dig`, attacks only) | ❌ | ✅ (local control) | ❌ |
| Skill | ✅ | ✅ | ✅ |
| Evaluations | ✅ | ✅ | ✅ |

**Density Mode** and **Direction Mode** apply all dashboard filters via `getHeatmapTouches()`.

**Zone Density Mode** applies team, player, skill, evaluations, plus two **local-only** controls not driven by the shared dashboard filter bar: the touch-level rally-phase filter (`classifyRallyTouchPhases`, seeded from `filters.rallyPhase` but overridable per widget instance) and the attack-context filter (`classifyAttackPrecedingContext` from `rally-phase-classifier.ts`) — a `'all' | 'receive' | 'dig'` select that, when active, restricts to `attack` touches whose immediate same-team build-up was a reception (first-ball) or a dig (transition); attacks with no resolvable receive/dig (e.g. after a freeball) and all non-attack touches are excluded once this filter is active. The filters set, role, and source remain **not yet implemented** for zone-based heatmaps.

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

## Gaussian Smoothing

Density heatmaps apply **Gaussian kernel smoothing** (bandwidth = 3.5) to create continuous density cloud visualization rather than discrete cell counts.

**Process:**
1. Count raw touch events in each grid cell
2. For each cell, apply 5×5 Gaussian kernel to neighboring cells
3. Interpolate weighted average density
4. Normalize by max smoothed density
5. Render cells with density >= 0.001 (skip noise)

**Benefits:**
- Continuous visual flow instead of blocky grid
- Neighboring zones influence each other realistically
- Empty cells with low probability still render if near high-density area

## Diagnostics Footer

Below the court:

- **Coverage**: `N / M touches have direction data` — how many touches yielded events.
- **Inferred count**: shown when any events were reconstructed from zones.
- **Low coverage warning**: shown when < 50% of touches have direction data (typical for DataVolley imports without trajectory export).

## DataVolley Compatibility

DataVolley `.dvw` files contain zone-based spatial information (1-9, with optional subcodes like `'2a'`, `'4b'`).  
OpenVolleyScout converts these zones to canonical stage coordinates for heatmap use.

### Zone-to-Stage Conversion

Module: `src/features/import/mapping/datavolley-zone-to-stage.ts`

**Process:**
1. Zone code (e.g., `'4'`, `'6b'`) → half-court reference point
2. Skill-aware direction logic:
   - **Cross-net skills** (serve, attack, freeball): start = own court, end = opponent court
   - **Receive**: start = opponent court (origin), end = own court (target)
   - **Own-court skills** (dig, block, set, cover): both start and end on own court
3. Cone-to-subzone mapping (optional): Convert attack cone number (1-9) + attacking position (1-6) to subzone letter (A-D) for fine-grained placement

**Cone-to-Subzone Mapping Example:**
- Attack from position 4, cone 6 → zone 2, subzone C (zone 2C)
- Attack from position 2, cone 3 → zone 6, subzone D (zone 6D)
- Fallback: Generic cone mapping for touchdowns without position info

**Result**: `BallDirection` with canonical `StagePoint` coordinates, plus:
- `courtZoneStart` / `courtZoneEnd`: Original DataVolley zone codes (for diagnostics)
- `subzoneEnd`: Converted cone number (if applicable)
- `diagnostic`: "synthetic_from_zones" (indicates data origin)

### Native path (preferred)

DataVolley imports generate a synthetic `BallTouch.ballDirection` for every touch with zone codes.  
The heatmap extractor's `getBallDirectionForTouch()` picks this up directly.

### Fallback path

If `ballDirection` is absent but the touch carries `originZone` / `targetZone` / `zone` 
references with valid `point` fields, `reconstructBallTrajectoryForTouch()` in 
`heatmap-aggregation.ts` constructs the direction from those zone centers.  

The `isInferred` flag is set for any touch where `ballDirection` was absent (zone-based 
reconstruction is considered approximate), and the count is surfaced in the diagnostics footer.

### Limitations

- Synthetic coordinates are approximate (zone center, not exact touch point)
- Cone numbers require attacking position to be fully accurate; fallback generic mapping is used if position is missing
- No support yet for block deflection cones (future enhancement)
- DataVolley extended zones (7, 8, 9) supported; rare zone subtypes may show warnings

## Non-Goals

- Court heatmaps do not replace live scouting trajectory rendering.
- No animated trajectories or video playback integration.
- No 3D projection or camera overlay.

See [performance-dashboard.md](performance-dashboard.md) for how the widget is integrated into the dashboard.
