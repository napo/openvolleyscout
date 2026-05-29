# Tactical Auto-Layout

## Overview

OVS can automatically assign tactical roles to a starting lineup based on the selected setter and a chosen formation pattern (PCS or PSC). This eliminates the need to manually assign each tactical role during set setup.

## Italian volleyball formation patterns

In Italian volleyball scouting, the **rotation reading direction is counterclockwise** starting from the setter's court position. The two common patterns differ in which role is placed adjacent to the setter:

| Pattern | Reading order (CCW from setter) |
|---|---|
| **PCS** | Palleggiatore → **C**entrale → **S**chiacciatore → Opposto → Centrale → Schiacciatore |
| **PSC** | Palleggiatore → **S**chiacciatore → **C**entrale → Opposto → Schiacciatore → Centrale |

### Court position mapping (setter at position 1)

| CCW index | Court pos | PCS role | PSC role |
|---|---|---|---|
| 0 | 1 | SETTER | SETTER |
| 1 | 6 | MIDDLE_BLOCKER_1 | OUTSIDE_HITTER_1 |
| 2 | 5 | OUTSIDE_HITTER_1 | MIDDLE_BLOCKER_1 |
| 3 | 4 | OPPOSITE | OPPOSITE |
| 4 | 3 | MIDDLE_BLOCKER_2 | OUTSIDE_HITTER_2 |
| 5 | 2 | OUTSIDE_HITTER_2 | MIDDLE_BLOCKER_2 |

The same algorithm applies when the setter starts at any other court position (2–6) — the counterclockwise traversal wraps around.

## API

```typescript
import {
  generateAutoTacticalLayout,
  detectSetterFromPlayers,
  detectSetterFromLineup,
  applyAutoLayoutToStartingLineup,
  validateTacticalLayout,
} from '@src/domain/lineup';

// Detect setter from a player list
const setterId = detectSetterFromPlayers(rosterPlayers);

// Generate role assignments
const result = generateAutoTacticalLayout({
  pattern: 'PCS',      // or 'PSC'
  setterPlayerId: setterId,
  slots: lineup.slots,
});
// result.slots now has tacticalRole set on each LineupSlot

// Validate the result
const validation = validateTacticalLayout(result.slots);
if (!validation.valid) {
  console.error(validation.errors);
}

// Shorthand: apply directly to a StartingLineup
const updatedLineup = applyAutoLayoutToStartingLineup(lineup, 'PCS');
```

## Setter detection priority

1. `lineup.setterPlayerId` if already set
2. `preferredSetterPlayerId` argument (explicit override)
3. First player in the lineup whose `role === 'setter'` (from roster data)
4. Returns `undefined` if none found — auto-layout cannot proceed without a setter

## Validation rules

`validateTacticalLayout(slots)` checks:

| Error key | Condition |
|---|---|
| `invalid_slot_count` | Fewer or more than 6 slots |
| `setter_role_missing` | No slot has `tacticalRole === SETTER` |
| `duplicate_tactical_roles` | Same role assigned to more than one slot |
| `libero_in_front_row` | LIBERO role assigned to positions 2, 3 or 4 |

## Manual override

Auto-layout never replaces manual editing. The scout can:
- Change any tactical role after auto-assignment
- Switch between PCS and PSC at any point before starting the set
- Manually set the setter before triggering auto-layout
- Ignore auto-layout entirely and assign roles by hand

## Non-goals

- Auto-layout does not place players in court positions (the scout still drags players)
- It does not validate rotation legality beyond front-row libero
- It does not adapt to 6-2 or other rotation systems automatically
