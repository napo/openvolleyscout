# Undo System

Live scouting undo lets the scorer quickly correct mistakes during play without interrupting the workflow.

OVS implements a **dual undo model** with two distinct operations:

| Operation | Scope | Trigger |
|---|---|---|
| **Undo Action** | Entire last committed action (all touches + point events) | `Ctrl+Z` / `⌘Z` or Undo button |
| **Undo Last Touch** | Only the most recent `touch_recorded` in the current rally | `Backspace` or "⌫ Touch" button |

---

## Undo Action (grouped undo)

### Scope

The Undo button in the live scouting toolbar reverts the **last committed scouting action**. A "scouting action" is a logical unit of operator input, which may span multiple internal events:

| Scenario | What is undone |
|---|---|
| Single touch (attack, set, dig…) | The touch + any auto-created rally_started |
| Reception-driven serve+receive pair | Both touches committed together |
| Attack + inferred block | Both touches |
| Manual point (+1) | The awarded point and any auto-started rally |
| Last completed rally (fallback) | All touches, point_awarded, rally_ended, rotation/side-out |

### Also reverted automatically

- **Score changes**: point_awarded is removed → scores recalculate on replay
- **Rally state**: rally_ended is removed → rally reopens
- **Side-out / rotation**: rotation is derived from point_awarded + serving team → reverting point_awarded also reverts rotation
- **Server change**: serving team is set per rally → reverted with point_awarded
- **Trajectory / ball direction**: stored on the BallTouch object → removed with the touch
- **Inferred touches**: explicit and inferred touches from the same operator action are committed together → undo removes all

---

## Grouped Undo Semantics

Each time the scorer commits a group of touches (via `onTouchesCommitted`), the system:

1. Records `eventCountBefore` — the event log size **before** the action
2. Pushes a `LiveUndoEntry` onto the in-memory undo stack

When undo is triggered, the system truncates the event log to `eventCountBefore` and rebuilds the live match state by replaying all remaining events from scratch. This also removes any `point_awarded`, `rally_ended`, or `set_ended` events that were added as a result of the same action.

### Fallback

If the undo stack is empty or the top entry is stale (e.g. after using the corrections panel), the undo falls back to `undoLastPoint`, which removes the last complete rally (from `rally_started` to `rally_ended`).

---

## Inferred Touch Rollback

Inferred touches (serve created from receive, block created from attack) are committed in the same `handleTouchesCommitted` call as their triggering explicit touch. Since `eventCountBefore` is captured before both touches are recorded, undoing removes them together.

No orphan inferred touches are left behind because:
- The event log is the source of truth
- State is fully rebuilt by replay after any truncation

---

## Score / Rotation / Side-out Rollback

Score, rotation, serving team, and side-out are derived state — they are computed by replaying the event log. When undo removes the relevant `point_awarded` event, the replay produces the previous score and serving team automatically. No explicit rollback of these derived values is needed.

---

## Trajectory / Direction Rollback

`BallDirection` and `BallTrajectory` are stored as fields on each `BallTouch`. When undo removes the `touch_recorded` event, the trajectory data is removed with it. The court arrow display reflects the current rally's touches, so the arrow disappears automatically.

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+Z` | Undo last scouting action (grouped) |
| `⌘Z` (macOS) | Undo last scouting action (grouped) |
| `Backspace` | Remove only the last touch from the active rally |

Shortcuts are active only during the `live_rally` stage. `Backspace` is ignored when the cursor is in a text input. Both shortcuts are no-ops if the corresponding action is unavailable.

---

## Undo Last Touch

**Remove Last Touch** removes only the most recent `touch_recorded` event from the **currently active rally**, without reverting any earlier touches in that rally.

### Use case

```
serve → receive → attack  ← mistake
           ↑ keep this    ↑ remove only this
```

The scout can remove the attack without undoing the receive and serve.

### Availability

`removeLastTouchFromCurrentRally` is available when:
- A rally is active (`isRallyActive === true`)
- At least one touch has been recorded in the current rally
- The last event in the log is `touch_recorded`

If a point has already been awarded in the rally, use **Clear Point** first, then remove the touch.

### Distinction from Undo Action

| Feature | Undo Action | Undo Last Touch |
|---|---|---|
| Scope | Entire action group (may span multiple touches) | Single last touch only |
| Works after rally ends | Yes (via fallback) | No — rally must be active |
| Reverts score/rotation | Yes (if applicable) | No |
| Reverts inferred touches | Yes | No (only the explicit last event) |

---

## Undo Buttons

The live scouting toolbar shows:

- **Undo** — always visible; enabled when grouped undo is available
- **⌫ Touch** — shown only when an active rally has at least one touch to remove

---

---

## Diagnostics

The following conditions are logged (dev mode only) via `console.info` / `console.warn`:

| Condition | Level | Location |
|---|---|---|
| Undo performed via stack entry | info | `scouting-store.ts` |
| Stale stack entry detected; fell back to undoLastPoint | warn | `scouting-store.ts` |
| No undo result available (stack empty + no point) | warn | `scouting-store.ts` |

Production builds do not emit undo diagnostics.

---

## V1 Limitations

- **In-memory only**: The undo stack is not persisted across page reloads or tab switches. After reload, only the `undoLastPoint` fallback (last complete rally) is available.
- **Single path**: After using the corrections panel (RallyFlow), the undo stack may be stale. Undo falls back to `undoLastPoint` in that case.
- **No multi-level browser UI**: There is no history timeline. Undo is a single operation per button press, with no "redo."
- **Collaborative undo not implemented**: In a multi-device scenario, undo affects only the local in-memory state.

---

## Architecture Reference

| File | Role |
|---|---|
| `model/live-undo-stack.ts` | Types, `createUndoEntry`, `buildGroupedUndoResult`, `getGroupedUndoAvailability` |
| `model/scouting-store.ts` | `undoStack`, `pushUndoEntry`, `clearUndoStack`, `performGroupedUndo` |
| `pages/ScoutingPage.tsx` | Pushes undo entries on `handleTouchesCommitted` and `handleManualPoint`; calls `handleGroupedUndo` |
| `components/LiveRallyStage.tsx` | Keyboard shortcut listener (`Ctrl+Z` / `⌘Z`) |
| `components/LiveScoutingToolbar.tsx` | Undo button with `canUndo` / `onUndo` props |
| `model/live-undo-stack.test.ts` | Unit tests for undo stack logic |
