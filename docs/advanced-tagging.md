# Advanced Scouting Metadata Tagging

## Overview

OVS supports optional metadata tagging on individual ball touches. These tags are only meaningful in **Advanced mode** and are never required for scouting flow correctness.

## Touch metadata fields

All fields live in `BallTouch` (see `src/domain/touch/types.ts`):

| Field | Type | Description |
|---|---|---|
| `serveType` | `ServeType` | Serve technique classification |
| `attackType` | `AttackType` | Attack type classification |
| `attackTempo` (via `advancedDetails`) | `AttackTempo` | Attack tempo / timing |
| `setType` | `SetType` | Set type classification |
| `advancedDetails` | `AdvancedTouchDetails` | Structured container for all extended tags |

## Serve types (`ADVANCED_SERVE_TYPES`)

| Value | English label | Italian label |
|---|---|---|
| `float` | Float | Float |
| `jump_float` | Jump float | Jump float |
| `jump_spin` | Spin jump | Jump spin (potenza) |
| `standing_float` | Standing float | Float da fermo |
| `short` | Short serve | Battuta corta |
| `tactical` | Tactical | Tattica |
| `other` | Other | Altro |

## Attack tempos (`ADVANCED_ATTACK_TEMPOS`)

| Value | English label | Italian label |
|---|---|---|
| `first_tempo` | First tempo (quick) | Primo tempo (veloce) |
| `second_tempo` | Second tempo | Secondo tempo |
| `third_tempo` | Third tempo (high) | Terzo tempo (alto) |
| `pipe` | Pipe (back row center) | Pipe (back center) |
| `back_row` | Back row | Palla alta da fondo |
| `high_ball` | High ball | Palla alta |
| `other` | Other | Altro |

## Attack types (`ADVANCED_ATTACK_TYPES`)

| Value | English label | Italian label |
|---|---|---|
| `power` | Power | Potenza |
| `tip` | Tip (Pallonetto) | Pallonetto |
| `roll_shot` | Roll shot | Roll shot |
| `line` | Line | Lungolinea |
| `cross` | Cross | Diagonale |
| `block_out` | Block-out | Block-out |
| `other` | Other | Altro |

## Set types (`ADVANCED_SET_TYPES`)

| Value | English label |
|---|---|
| `front` | Front set |
| `back` | Back set |
| `quick` | Quick (first tempo) |
| `pipe` | Pipe |
| `high_ball` | High ball |
| `second_ball` | Second ball |
| `other` | Other |

## Architecture

Tags are **optional** at every level:

```typescript
interface BallTouch {
  serveType?: string;          // top-level shorthand (legacy compat)
  attackType?: string;         // top-level shorthand
  setType?: string;            // top-level shorthand
  advancedDetails?: {          // structured container (preferred)
    serve?: { type?: ServeType; ... };
    attack?: { tempo?: AttackTempo; type?: AttackType; ... };
    set?: { type?: SetType; ... };
    block?: { type?: BlockType; ... };
    ...
  };
}
```

- Simple mode: metadata fields are never shown or required
- Advanced mode: metadata selectors appear as optional compact pickers after the main evaluation is confirmed
- DataVolley export: `attackType`, `serveType` map to existing DataVolley skill-type codes where equivalents exist

## Design guidance for UI

- Show metadata pickers **only in Advanced mode**
- Keep them non-blocking (optional, closable)
- Use compact chip-style selectors, not full dropdowns
- Group serve type with the serve evaluation confirmation
- Group attack tempo + type with the attack evaluation confirmation
- Never delay or block the scouting flow if metadata is skipped

## Relaxed libero mode (design analysis only — not implemented)

### Concept

Inspired by Click&Scout: the libero is logically "active" without requiring an explicit `libero_replacement_made` event. The system infers libero status from court position or player role.

### Possible implementation

1. Add `liberoAutoActive: boolean` flag to `StartingLineup`
2. If `liberoAutoActive`, mark libero as "active" for all back-row touches without emitting explicit replacement events
3. Stats and participation tracking work from the `isLibero` flag already on `ActiveLineupSlot`

### Risks / trade-offs

| Risk | Impact |
|---|---|
| Corrupts official stat line if libero touch counted as field player | High |
| Breaks `activeLiberoState` invariants in existing libero logic | High |
| Incompatible with DataVolley export (`LS`/`LE` row generation) | Medium |
| Confusing when replaying events for report generation | Medium |

### Decision

Do **not** implement yet. Requires a dedicated opt-in flag, a separate replay path, and export compatibility analysis before implementation. The existing explicit replacement model remains the default and the only officially supported path.
