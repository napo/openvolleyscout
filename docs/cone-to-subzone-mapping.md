# Cone-to-Subzone Mapping: Fine-Grained Direction Encoding

## Overview

DataVolley supports two **mutually exclusive** systems for encoding ball direction:

1. **Zones (Sottozone)**: Fine-grained subdivisions (A/B/C/D) within 9 court zones (1-9)
   - Highest granularity (4 × 9 = 36 possible targets)
   - Commonly used in live scouting

2. **Cones (Coni)**: Angular sectors from attacking position
   - Varies by position: 4-7 cones from lateral positions, 5-9 from others
   - Based on attacker's perspective and court geometry

**Problem**: DataVolley files imported into OVS often contain only **cone data**, not subzone data. This results in simple heatmaps lacking fine-grained distribution.

**Solution**: Convert cone encoding to equivalent subzone encoding using geometric lookup tables based on DataVolley manual diagrams (pages 56-58).

---

## Architecture

### Core Files

#### 1. **Mapping Table** — `src/domain/trajectory/cone-to-subzone-mapping.ts`

Provides deterministic mapping from (attacking_position, cone_number) → (zone, subzone):

```typescript
import { coneToSubzone } from '@src/domain/trajectory/cone-to-subzone-mapping';

// Precise mapping with attacking position
const mapped = coneToSubzone('4', '1');  // position 4, cone 1
// → { zoneId: '5', subzone: 'A' }

// Fallback without position (uses heuristic)
const fallback = coneToSubzone('1');     // cone 1 only
// → { zoneId: '5', subzone: 'A' }
```

**Exported Functions**:
- `coneToSubzone(position, cone)` — precise mapping with attacking position
- `coneToSubzone(cone)` — fallback heuristic mapping
- `isValidAttackingPosition(pos)` — validation
- `isValidConeNumber(pos, cone)` — validation

#### 2. **BallDirection Extension** — `src/domain/trajectory/types.ts`

Extended `BallDirection` interface to store subzone data:

```typescript
interface BallDirection {
  start: StagePoint;
  end: StagePoint;
  courtZoneStart?: string;
  courtZoneEnd?: string;
  subzoneStart?: 'A' | 'B' | 'C' | 'D';  // ← NEW
  subzoneEnd?: 'A' | 'B' | 'C' | 'D';    // ← NEW
}
```

#### 3. **Conversion Pipeline** — `src/features/import/mapping/datavolley-zone-to-stage.ts`

Inlined cone-to-subzone mapping (ts-node compatible):

- Accepts optional `endCone` and `attackingPosition` parameters
- Converts cones to subzones during `dvZonesToBallDirection()` call
- Falls back to heuristic mapping if position unavailable
- Stores result in `BallDirection.subzoneEnd`

#### 4. **DataVolley Parser Integration** — `src/features/import/mapping/datavolley-to-ovs.ts`

Extracts cone from parsed action and passes to conversion pipeline:

```typescript
// Detect if endSubzone is a cone (digit 0-9) vs. subzone letter (a-d)
const endCone = action?.endSubzone && /^[0-9]$/.test(action.endSubzone)
  ? action.endSubzone
  : undefined;

const dvDirection = dvZonesToBallDirection({
  skill: input.draft.skill,
  startZone: action?.startZone,
  endZone: combinedEndZone,
  selfDisplaySide: getDvDisplaySide(input.draft.teamSide),
  oppositeDisplaySide: getOppositeDvDisplaySide(input.draft.teamSide),
  endCone,           // ← Pass extracted cone
  attackingPosition, // ← Optional court position for precise mapping
});
```

---

## Mapping Tables

### Position 4/5 (Left Sector)

Attacking from left side (positions 4 or 5).

| Cone | Zone | Subzone | Court Region |
|------|------|---------|--------------|
| 1 | 5 | A | Deep left (back line) |
| 2 | 5 | D | Deep left (lateral) |
| 3 | 6 | A | Center back |
| 4 | 8 | B | Center deep |
| 5 | 9 | D | Right back |
| 6 | 2 | C | Net right |
| 7 | 2 | A | Net right (left corner) |

**Visual**: Cones distributed angularly from left attacker position, covering 120°+ arc.

### Position 2/1 (Right Sector)

Attacking from right side (positions 2 or 1). Symmetric inverse of left sector.

| Cone | Zone | Subzone | Court Region |
|------|------|---------|--------------|
| 1 | 1 | D | Deep right (back line) |
| 2 | 1 | A | Deep right (lateral) |
| 3 | 6 | D | Center back |
| 4 | 8 | B | Center deep |
| 5 | 9 | A | Left back |
| 6 | 4 | C | Net left |
| 7 | 4 | A | Net left (left corner) |
| 8 | 7 | D | Deep left lower |
| 9 | 5 | C | Left back lower |
| 0 | 6 | C | Center back (special) |

### Position 3/6 (Center)

Attacking from center (positions 3 or 6). Special encoding with named regions.

| Cone | Zone | Subzone | Court Region | Alternative Name |
|------|------|---------|--------------|------------------|
| 1 | 2 | B | Right net | Front 3 |
| 2 | 8 | B | Center deep | Front 8 |
| 3 | 3 | B | Center net | Center |
| 4 | 4 | B | Left net | Pipe |
| 5 | 9 | B | Right back | Back 3 |
| 6 | 8 | D | Center deep lower | Back 8 |
| 7 | 7 | B | Left back | Back area |
| 8 | 9 | C | Right back corner | Back right |
| 9 | 6 | C | Center back | Setter |

---

## Usage Examples

### Example 1: Import DataVolley File with Cones

When importing a `.dvw` file where ball directions use cone encoding:

```
*2p4aAc6318       ← Serve by player 4
*2p1s1b615        ← Receive by player 1, startZone=6, endZone=1, endSubzone=5 (CONE)
*2p4a1!!!1215     ← Attack by player 4, startZone=2, endZone=1, endSubzone=5 (CONE)
```

The parser:
1. Detects that `endSubzone` is a digit (5)
2. Extracts it as `endCone = '5'`
3. Converts via mapping table to `subzoneEnd = 'A'` (assuming position context)
4. Stores in `BallDirection.subzoneEnd`

Result: Heatmap now shows fine-grained distribution (zones × subzones) instead of just zone centers.

### Example 2: Programmatic Conversion

```typescript
import { coneToSubzone } from '@src/domain/trajectory/cone-to-subzone-mapping';

// With known attacking position
const result = coneToSubzone('4', '1');  // left position, cone 1
console.log(result);  // { zoneId: '5', subzone: 'A' }

// Fallback when position unknown (e.g., from older DataVolley exports)
const fallback = coneToSubzone('1');     // cone 1 only
console.log(fallback);  // { zoneId: '5', subzone: 'A' } (heuristic)
```

### Example 3: Heatmap Aggregation

After cone-to-subzone conversion, heatmap visualization becomes granular:

```typescript
// Before: only zone-level heat (9 positions)
const zoneHeat = new Map<string, number>();
zoneHeat.set('1', 15);  // all cone attacks → zone 1

// After: subzone-level heat (36 positions)
const subzoneHeat = new Map<string, number>();
subzoneHeat.set('1A', 5);   // cone distribution within zone 1
subzoneHeat.set('1C', 7);
subzoneHeat.set('1D', 3);
```

---

## Geometric Foundation

The mapping is based on **DataVolley Manual, Pages 56-58**, which shows three attack diagrams:

### Diagram: Attack from Position 4/5 (Left)

```
        NET
    ┌───────┐
    │ Zon 3 │ Front (zone 3: setter/opposite)
    └───┬───┘
    ┌─┬─┴─┬─┐
    │ │ 4 │ │ Cones 4: center line
    └─┼───┼─┘
    ┌─┴────┴─┐
    │ 1  5  2│ Cones 1,2: left sector
    │ 7 6   3│ Cones 5,3: right sectors
    └────────┘
        BACK
```

- **Cone 1-2**: Left sector (zones 5, 4)
- **Cone 3**: Center-left (zone 6)
- **Cone 4**: Center line (zone 8)
- **Cone 5**: Center-right (zone 9)
- **Cone 6-7**: Right sector (zone 2)

### Diagram: Attack from Position 2/1 (Right)

Symmetric to left sector (cones 1-2 now go right, 6-7 go left).

### Diagram: Attack from Center (3/6)

Center has special named zones:
- **Front 3, Front 8**: Zones 2, 8 (net area)
- **Center, Pipe**: Zones 3, 4 (center)
- **Back 3, Back 8**: Zones 9, 7 (back area)
- **Setter**: Zone 6 (back center)

---

## Implementation Notes

### Why Inlined Mapping in `datavolley-zone-to-stage.ts`?

The DataVolley mapper must run under **ts-node/esm** without path alias resolution (e.g., `@src/`) to support:
- DataVolley file validation scripts
- Test suites that import the mapper directly

Therefore, the cone-to-subzone mapping function is **inlined** in the mapper file rather than imported from a separate module.

The standalone `cone-to-subzone-mapping.ts` exists for:
- Reference documentation
- Live scouting use cases (where ts-node is not used)
- Type safety and testing

### Court Position Resolution

Precise cone-to-subzone mapping requires the **attacking player's court position** (1-6). Currently:

- ✅ **Fallback heuristic** works without position (reasonable approximation)
- ⏳ **Future enhancement**: Pass lineup information through import pipeline for exact position

### Zone Numbering

OVS uses standard volleyball zone layout:

```
     NET
   4 3 2
   5 8 1
   6 9 7
     BACK
```

Each zone subdivides into A, B, C, D (typically top-left to bottom-right).

---

## Testing

Unit tests in `src/domain/trajectory/cone-to-subzone-mapping.test.ts`:

```bash
npm test -- cone-to-subzone-mapping.test
```

Tests verify:
- ✅ Precise mappings for all three attacking positions
- ✅ Fallback heuristic mappings
- ✅ Error handling for invalid cones/positions
- ✅ Type coercion (string/number inputs)

**Current Status**: 42/42 tests passing

---

## Related Issues

- **Issue #23** (Quick libero access, undo UI) — Merged
- **Dashboard v2/v3** — Rally-phase classifier + heatmap visualization
- **Live scouting undo system** — In-memory stack, Ctrl+Z shortcut

---

## Future Enhancements

1. **Court position resolution**: Pass lineup snapshots through import pipeline
   - Enables precise position-based mapping instead of heuristic fallback
   - ~2-3 hour implementation

2. **Cone import diagnostics**: Track which attacks use cone vs. subzone encoding
   - Helps identify data quality issues in DataVolley exports
   - Useful for import validation UI

3. **Reverse mapping**: Subzone → closest cone (for export)
   - Support exporting OVS data back to DataVolley format
   - Use distance metrics to find nearest cone per subzone

4. **Historical cone variants**: Support legacy DataVolley versions
   - Some older exports use different cone numbering
   - May require version detection in parser

---

## References

- **DataVolley Manual**: Pages 56-58 (cone diagrams)
- **OVS Zone System**: `src/domain/systems/datavolley-zones.ts`
- **BallDirection Type**: `src/domain/trajectory/types.ts`
- **Heatmap Aggregation**: `src/features/analytics/heatmaps/aggregation/`

---

**Last Updated**: 2026-05-30  
**Status**: Implementation Complete ✅  
**Tests**: All Passing ✅  
**Build**: Passing ✅
