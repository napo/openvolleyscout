# Advanced Analytics Engine

Comprehensive guide to the unified filter architecture and tactical analysis system.

## Overview

The Advanced Analytics Engine provides a centralized, reactive filter system that enables tactical analysis across all dashboard widgets. Built on Zustand with memoized selectors, it prevents re-render cascades while maintaining consistency.

**Key Features:**
- Unified filter state management
- Tactical situation filtering (side-out, break-point, counterattack, etc.)
- Score-state analytics (tied, leading, trailing, clutch moments)
- Automatic rotation tracking from court positions
- Player combination analysis
- Zero re-render cascades (selective subscriptions)

## Architecture

### Store Pattern

The filter engine uses **Zustand** for global state management with **memoized selectors** for selective subscriptions:

```typescript
// src/features/analytics/stores/filter-store.ts
const useFilterStore = create<FilterStoreState>(...)

// Selectors prevent re-renders when unrelated filters change
const useAdvancedFilters = () => useFilterStore(state => state.filters);
const useTacticalSituation = () => useFilterStore(state => state.filters.tacticalSituation);
```

**Why Zustand + Selectors?**
- Redux-style dispatch for predictable mutations
- Memoized selectors (React hook-based, lightweight)
- No Context provider re-renders (common cause of cascades)
- Extendable for future analytics layers

### Filter Hierarchy

Filters are organized into two independent layers:

#### 1. Basic Filters (Orthogonal)
Compose freely without mutual exclusivity:

```typescript
{
  team: 'home' | 'away' | 'both';
  player?: string;
  role?: 'middle' | 'opposite' | 'outside' | 'libero' | 'setter';
  set?: number;
  source?: 'live' | 'synced' | 'both';
  rallyPhase?: 'serve' | 'reception' | 'transition' | 'rally_end';
}
```

#### 2. Tactical Filters (Mutually Exclusive)
Only ONE tactical situation active at a time:

```typescript
type TacticalSituation = 
  | 'side_out'              // Team receives serve
  | 'break_point'           // Trailing by 1 point
  | 'counterattack'         // Transition after opponent attack
  | 'transition_attack'     // Attack after own dig
  | 'attack_after_receive'  // Attack after reception
  | 'attack_after_dig'      // Attack after dig
  | 'freeball'              // Freeball situation
  | 'none';                 // No tactical filter
```

**Why Mutually Exclusive?**
Tactical situations describe the *phase* of play. A rally cannot simultaneously be both a side-out AND a break-point. Enforcing mutual exclusivity prevents nonsensical filter combinations.

#### 3. Score-State Filters (Orthogonal to Tactical)
Independent layer describing match context:

```typescript
type ScoreState = 
  | 'tied'           // Score tied
  | 'leading'        // Team ahead
  | 'trailing'       // Team behind
  | 'clutch'         // Score difference ≤ 2 points
  | 'none';
```

Composable with tactical filters: "side-out attacks when trailing" is meaningful.

### Rotation Tracking

Automatic rotation calculation from court positions:

```typescript
// Rotation index: 1-6 based on serve position
// 1 = serves from back-right
// 6 = serves from back-left
// Front positions = middle (2,3), opposite (4), outside (1,5), setter (6)

const rotation = getRotationFromPosition(courtZone);
// courtZone '1' (back-right) → rotation = 1
```

**Rotation Changes:**
- After each successful side-out (team regains serve)
- Implicit rotation advance when opponent scores
- Reset on match restart

## Usage Guide

### Reading Filters

Use memoized selectors to avoid unnecessary re-renders:

```typescript
import { useAdvancedFilters, useTacticalSituation, useScoreState } from '@/features/analytics/stores/filter-selectors';

export function MyWidget() {
  // Only re-renders if tactical situation changes
  const situation = useTacticalSituation();
  
  // Only re-renders if score-state changes
  const scoreState = useScoreState();
  
  // Only re-renders if any filter changes
  const filters = useAdvancedFilters();
  
  return <div>Situation: {situation}</div>;
}
```

**Key Rule:** Use the most specific selector, not `useAdvancedFilters()` for everything.

### Modifying Filters

Dispatch actions via `useFilterActions()`:

```typescript
import { useFilterActions } from '@/features/analytics/stores/filter-selectors';

export function FilterBar() {
  const { updateFilter, resetFilters, setFilters } = useFilterActions();
  
  const handleTacticalChange = (situation: TacticalSituation) => {
    updateFilter('tacticalSituation', situation);
  };
  
  const handleReset = () => {
    resetFilters();
  };
  
  return (
    <select onChange={(e) => handleTacticalChange(e.target.value as TacticalSituation)}>
      {/* options */}
    </select>
  );
}
```

### Composing Filters

Combine filters for nuanced analysis:

```typescript
// Side-out attacks by the middle blocker when trailing
const filters = {
  tacticalSituation: 'side_out',
  role: 'middle',
  scoreState: 'trailing',
};

const relevantRallies = rallies.filter(r => 
  r.role === filters.role &&
  getTacticalSituation(r) === filters.tacticalSituation &&
  getScoreState(r) === filters.scoreState
);
```

## Implementation Details

### Filter Store API

```typescript
interface FilterStoreState {
  filters: AdvancedFilters;
  filterCount: number;
  setFilters: (filters: AdvancedFilters) => void;
  updateFilter: <K extends keyof AdvancedFilters>(
    key: K,
    value: AdvancedFilters[K]
  ) => void;
  resetFilters: () => void;
  batchUpdateFilters: (partial: Partial<AdvancedFilters>) => void;
}
```

### Selector Memoization

Zustand selectors are memoized by default. Return value stability is key:

```typescript
// ✅ Good: Returns stable scalar
const useTacticalSituation = () => 
  useFilterStore(state => state.filters.tacticalSituation);

// ✅ Good: Returns stable object (same reference if unchanged)
const useAdvancedFilters = () => 
  useFilterStore(state => state.filters);

// ❌ Bad: Creates new object on every render
const useAllFilters = () => 
  useFilterStore(state => ({ ...state.filters }));
```

## Rotation Calculator

Standalone utility for court-position-to-rotation conversion:

```typescript
import { getRotationFromPosition, RotationTracker } from '@/features/analytics/analytics/rotation-calculator';

// Single position → rotation
const rotation = getRotationFromPosition('1'); // → 1

// Track rotation through a match
const tracker = new RotationTracker();
tracker.recordServeEnd(true); // Team won point, rotation changes
tracker.reset(); // Reset on match restart
```

**Rotation Rules:**
- Initial rotation depends on serve order
- Advances clockwise after each side-out
- Resets on match restart
- Libero position (6) does not advance rotation

## Testing

Unit tests cover:
- Filter composition (all combinations valid?)
- Tactical mutual exclusivity (enforced?)
- Score-state calculations (correct thresholds?)
- Rotation edge cases (libero transitions, match restart)
- Selector memoization (no unnecessary re-computes?)

Run tests:
```bash
npm test -- filter-store.test.ts
npm test -- rotation-calculator.test.ts
```

## Performance Considerations

### Selector Subscription Pattern

Each widget subscribes only to filters it cares about:

```typescript
// PerformanceWidget cares only about tactical situations
const tacticalFilter = useTacticalSituation();

// EfficiencyWidget cares about role + team
const role = useBasicFilters().role;
const team = useBasicFilters().team;

// Only relevant widgets re-render when filters change
```

**Result:** Dashboard with 10+ widgets re-renders only 2-3 on filter change.

### Rotation Computation

Rotation is computed on-demand (not cached) because:
- Match events are immutable after recording
- Rotation is deterministic from court zone
- Storage cost (per-rally) exceeds computation cost

Cache rotation only if analyzing 10,000+ rallies frequently.

## Future Enhancements

### Phase 2 Candidates
1. **Player Combinations** - Filter by pairs (e.g., "when setter works with opposite")
2. **Serve Variants** - Track serve type (jump, float, top-spin, underhand)
3. **Court Heat Zones** - Group zones into regions (left wing, right wing, middle)
4. **Combo Sequences** - Multi-touch patterns (bump → set → attack)
5. **DataVolley Sync** - Validate rotation against DataVolley match state

### DataVolley Integration
Rotation alignment with DataVolley:
- Compare computed rotation vs. DataVolley serve order
- Emit warnings if mismatch (possible data corruption)
- Use DataVolley libero positions for rotation validation

## Troubleshooting

### Widget Not Reacting to Filter Changes
**Cause:** Using wrong selector or caching selector result

**Fix:**
```typescript
// ❌ Wrong: caches stale selector function
const situation = useTacticalSituation();
const prevSituation = useRef(situation);

// ✅ Right: re-evaluates on every render
const situation = useTacticalSituation();
```

### Re-render Cascade on Filter Change
**Cause:** Passing filters through Context without memoization

**Fix:** Use `FilterProvider` which wraps store already.

### Rotation Always Returns "1"
**Cause:** Court zone parsing incorrect (expected '1'-'6')

**Fix:** Validate zone format before `getRotationFromPosition()`:
```typescript
if (!['1','2','3','4','5','6'].includes(zone)) {
  console.warn('Invalid court zone:', zone);
  return null;
}
```

## References

- **Zustand Docs:** https://github.com/pmndrs/zustand
- **React Hooks Performance:** https://react.dev/reference/react/useMemo
- **Tactical Volleyball:** See `docs/volleyball-rules.md`
- **Canonical Coordinates:** See `docs/court-coordinates.md`
