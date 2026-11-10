# Advanced DataVolley Details

OpenVolleyScout stores optional advanced details on each scouted touch through
`BallTouch.advancedDetails`. It is filled by DataVolley code input and import, and
is optional in the court-first live flow.

## Shape

`advancedDetails` can contain skill-specific detail objects:

- `serve`: serve type, start zone, target zone, direction
- `attack`: tempo, attack type, start zone, target zone, direction, combination
- `set`: set type, attack tempo, target player, target zone
- `block`: block type, touch flag, outcome
- `freeball`: target zone, quality
- `cover`: covered attack touch id, target zone, quality

All fields are optional. A legacy touch without `advancedDetails` is still valid,
and fast court scouting normally leaves the field undefined.

## Fast Flow And Detailed Entry

The court-first flow does not require or prompt for advanced details.

Any input path can store `advancedDetails`. The live
flow preserves the object through pending touch updates, committed touches,
session snapshots, and replay, so detailed entry never slows down the basic flow.

## Compatibility

Advanced details are embedded inside `touch_recorded` events with the rest of the
`BallTouch`, so normal project persistence and replay preserve them. Existing
sessions that do not include the field load with `advancedDetails` undefined.

Current statistics continue to aggregate by skill and evaluation. The advanced
payload is preserved on the source touch for future reports and exports, but it
does not change existing totals.

## Export Readiness

Allowed values are centralized in `src/domain/touch/advanced-details.ts`:

- `ADVANCED_SERVE_TYPES`
- `ADVANCED_ATTACK_TEMPOS`
- `ADVANCED_ATTACK_TYPES`
- `ADVANCED_SET_TYPES`
- `ADVANCED_BLOCK_TYPES`

The same module exposes validation helpers such as `isValidServeType`,
`isValidAttackTempo`, and `isValidBlockType`. These helpers validate future UI or
import/export inputs while keeping old data permissive: missing advanced details
are not treated as invalid.

The current DataVolley-like code builder can read advanced serve, attack, and set
details as fallback metadata. More complete DataVolley export mapping can be
added later once the Advanced UI defines the exact operator vocabulary.
