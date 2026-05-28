# Undo System

Live scouting undo lets the scorer quickly correct mistakes during play without interrupting the workflow.

---

## Scope

The undo button in the live scouting toolbar reverts the **last committed scouting action**. A "scouting action" is a logical unit of operator input, which may span multiple internal events:

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
| `Ctrl+Z` | Undo last scouting action |
| `⌘Z` (macOS) | Undo last scouting action |

Shortcuts are active only during the `live_rally` stage. The shortcut is a no-op if there is nothing to undo.

---

## Undo Button

The **Undo** button is always visible in the live scouting toolbar. It is:

- **Enabled** when `getGroupedUndoAvailability` returns `canApply: true`
- **Disabled** when the undo stack is empty and no completed rally can be undone
- Labeled "Undo" (EN) / "Annulla" (IT)
- Has a tooltip showing the keyboard shortcut

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
