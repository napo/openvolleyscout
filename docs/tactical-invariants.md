# Tactical Invariants

This document describes the hard invariants that the live scouting engine enforces
during a match. Any code path that modifies lineup, rotation, or tactical state must
preserve these invariants.

## 1. Six-Player Invariant

Each team must always have exactly six players on court. The `ActiveLineup.slots` array
must contain exactly six entries with distinct `courtPosition` values covering
positions 1–6.

Violations are detected and logged by `validateRotatedLineup` in
`src/features/scouting/live/tactical/tactical-rotation.ts`. If the invariant is
violated, `console.error` is emitted and the offending state is described.

The tactical position resolver (`tactical-position-resolver.ts`) enforces this at
render time via `getLegalLineupMarkers`, which fills missing positions with
fallback players and caps the output to `EXPECTED_COURT_MARKER_COUNT = 6`.

## 2. Libero Front-Row Prohibition

The libero **must never** occupy positions 2, 3, or 4 (front row) during live play.

### Enforcement layers

**State layer** — `updateLiberoFrontRowStatus` in `libero-state.ts` is called after
every side-out rotation and after every `rally_ended` event. When it detects the
libero's slot is in a front-row position it:

1. Sets `personnelState.activeLiberoState.mustExitBeforeFrontRow = true`.
2. Emits a `console.warn` diagnostic including the libero player ID, position,
   and team side.

**Proposal layer** — `getAutomaticLiberoReplacementProposal` in `libero-automation.ts`
generates a `front_row_exit` proposal whenever `mustExitBeforeFrontRow` is true.
`ScoutingPage` applies the exit **immediately and automatically** via
`applyLiberoExitAutomatically` — no dialog is shown. A transient notification
confirms the substitution. Only entry proposals open the confirmation dialog.

**Visual layer** — `isActiveLiberoForcedOutOfFrontRow` in `tactical-libero-layout.ts`
returns `true` when either `mustExitBeforeFrontRow` is set or the libero's slot is
front-row at render time. When true, `resolveSlotDisplayPlayer` returns the replaced
regular player instead of the libero. `restoreFrontRowLiberoMarker` in
`tactical-position-resolver.ts` provides a second independent guard that restores
the replaced player unconditionally for any marker rendered in a front-row position
that is still flagged `isLibero`.

### When all three layers are active simultaneously

- The libero player physically occupies a front-row slot in the `ActiveLineup`.
- The state flag `mustExitBeforeFrontRow` prevents automatic re-entry.
- The visual layer renders the regular player at that position.
- The replacement dialog prompts the scout to confirm the libero exit.
- Once confirmed, a `libero_replacement_made` event with `action: 'regular_returns'`
  is recorded, which restores the regular player to the slot and clears
  `activeLiberoState`.

## 3. Rotation Order

Side-out rotation is applied only when the **receiving team** wins a rally. The
serving team does not rotate on a break point.

The canonical rotation map is `SIDEOUT_ROTATION_MAP` in `tactical-rotation.ts`:

```text
1 → 6 → 5 → 4 → 3 → 2 → 1  (one cycle = six rallies won from receiving)
```

Player at position 2 rotates to position 1 (becomes the new server) after each
side-out. Applying the rotation six times from any starting position returns every
player to their original position.

`rotateLineupForSideOut` applies the rotation and immediately calls
`validateRotatedLineup` (logs errors for duplicate or missing positions) and
`updateLiberoFrontRowStatus` (sets exit flag if libero entered front row).

## 4. Serving Team Assignment

The serving team after each rally is always the **point winner**. This is enforced
in `applyReplayEvent` for `point_awarded` and `red_card_point` events, and in
`getNextServingTeamAfterPoint`.

## 5. No Duplicate Tactical Markers

The tactical position resolver deduplicates markers by team-scoped player key via
`dedupeTacticalCourtPlayers`. Each player (or their libero replacement) may appear
at most once on the tactical court. Duplicates are removed and logged via
`warnTacticalMarkerInvariant`.

## 6. State Persistence Guard

`syncWithProject` in the scouting store must not overwrite in-flight live match
events with older persisted project data. A guard checks whether the incoming
project's events are a prefix of the current live match event log:

```text
project.events.length ≤ liveMatch.eventLog.length
AND liveMatch.eventLog[project.events.length - 1]?.id === project.events.at(-1)?.id
```

When true, the store skips the full rebuild and only updates `activeConfig`.
In dev mode a `console.info` diagnostic is emitted. This prevents the persistence
write-back cycle from causing event loss or scouting-mode resets.

## 7. Scouting Mode Persistence

The scouting mode (`'simple'` | `'advanced'`) is stored in both `LiveMatchState.scoutingMode`
and `MatchProject.scoutingSession.scoutingMode`. It must not be silently reset.

`setScoutingMode` in the scouting store directly updates `liveMatch.scoutingMode`.
`useScoutingPersistence` detects the change (via `isProjectSyncedWithLiveMatch`)
and queues a save. After the save, `createLiveMatchStateFromProject` restores the
mode from `session.scoutingMode` if the full rebuild path is taken.

The persistence guard (§ 6) ensures that a persistence write-back for a
mode-only change does not trigger a full liveMatch rebuild that would reset state.

## Browser Consistency

All critical invariants are maintained in the event log, which is the canonical
source of truth. Cross-browser consistency is guaranteed by deterministic replay:

- `replayLiveMatchFromEvents` rebuilds identical state from identical events on
  any browser.
- Display sides are stored in the `set_started` event's `homeLineup.displaySide` and
  `awayLineup.displaySide` fields. They are read on every render, not inferred from
  team side.
- LocalStorage/IndexedDB writes are serialized through `matchRepository.update`.

If a hydration mismatch is suspected, check whether the `set_started` event in
the project's event log has the correct `displaySide` values.
