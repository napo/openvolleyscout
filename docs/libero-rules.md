# Libero Rules

OpenVolleyScout centralizes live libero behavior in `src/features/scouting/live/libero/`. The engine owns legality checks, replacement proposals, replacement event creation, lineup state updates, touch validation, and official-stat exclusion for illegal libero actions.

## FIVB Rules Modeled

- The libero may play only in back-row zones 1, 5, and 6.
- The libero may not play in front-row zones 2, 3, or 4.
- The libero may not serve unless a future competition setting explicitly enables libero serving.
- The libero may not block or attempt to block.
- The libero may not complete an attack above net height. OpenVolleyScout does not currently collect attack-height data, so live validation treats libero attack attempts as illegal and warns the scout.
- Libero replacements do not count as normal substitutions.
- Only one libero may be on court at a time.
- If a libero replaced player X, the libero may leave only for player X or be replaced by another registered libero.
- At least one completed rally must pass between libero replacement actions.

## Automation Philosophy

Automation proposes legal libero actions; the Events panel remains the canonical confirmation UI for live replacement events.

- Auto-middle replacement proposes libero entry when an eligible middle blocker is in the back row and auto-middle replacement is enabled.
- Auto-exit proposes the original player returning when the active libero would rotate into the front row.
- Service-exit proposes the original player returning when the active libero would become the server.
- Post-side-out auto-entry proposes libero entry after a middle blocker who served loses serve and becomes eligible for replacement.

Set-start lineup construction still preserves the existing deterministic initial receiving-side libero state when legal. All in-rally and dead-ball automation uses confirmation before recording a libero replacement event.

## Automatic Exits vs Confirmed Entries

**Exits are automatic and require no scout action.**
When the libero rotates into the front row (`front_row_exit`) or would become the
server (`service_exit`), the `libero_replacement_made` event is recorded immediately
with no dialog. A transient court notification confirms the substitution. If a
follow-up entry is then proposed (e.g. the same libero re-entering for the middle
blocker now in back row), the entry dialog opens after the automatic exit.

**Entries require scout confirmation.**
When the libero is eligible to replace a back-row middle blocker (`middle_back_row`)
or a manual swap is requested, the Events panel opens for confirmation before the
event is recorded.

This matches the FIVB rule that mandatory libero exits happen at the scoresheet
level without interrupting play, while entries are discretionary and scout-confirmed.

## Confirmation Workflow (Entry only)

The Events panel displays:

- the current libero on court,
- the replaced player,
- the second registered libero when available,
- eligible libero replacement proposals,
- a clear confirmation action.

Confirmed replacements are recorded as `libero_replacement_made` events. Replaying the event log rebuilds the same active libero state.

## Second Libero Handling

Teams may register two liberos. When libero A is active for replaced player X, libero B may enter for libero A after the required rally gap.

The replacement relation is preserved:

- active libero becomes libero B,
- `replacedPlayerId` remains X,
- when the libero exits, X must return.

## Tactical Rendering

Court rendering consumes active libero state from the engine:

- the libero is visible in the replaced player's tactical slot,
- the replaced player is hidden while the libero is active,
- the libero marker keeps the black libero outline,
- setter and last-touched marker rings are preserved,
- the libero and replaced player are never intentionally rendered at the same time.

If a libero reaches a front-row position before confirmation, rendering forces the regular player display while the Events panel proposes the required exit.

## Statistics

Legal libero touches count normally for skills such as receive, dig, and set.

Illegal libero touches are excluded from official stats and logged as warnings:

- serve touches,
- block touches,
- attack touches under the current simplified attack-height model.

This prevents illegal libero actions from creating legal serve, ace, block, or attack production in match reports.

## Diagnostics

`updateLiberoFrontRowStatus` in `libero-state.ts` emits `console.warn` whenever the
active libero's slot is a front-row position after a rotation. The warning includes the
libero player ID, court position, and team side, and is always active (not dev-only)
to aid debugging in production incidents.

`warnIllegalLiberoFrontRowMarker` in `tactical-position-resolver.ts` emits `console.warn`
when a libero-flagged slot reaches the rendering pipeline at a front-row position. The
restoration is applied immediately after the warning.

`validateRotatedLineup` in `tactical-rotation.ts` emits `console.error` when the
six-player or unique-position invariant is broken after a side-out rotation.

See `docs/tactical-invariants.md` for the full multi-layer enforcement description.

## Known Simplifications

- Attack height is not captured yet, so all libero attack attempts are blocked rather than distinguishing attacks above and below net height.
- Libero serving is disabled globally; the engine has an explicit allowance hook for a future competition setting, but no UI setting is wired yet.
- Deterministic legal initial receiving-side libero setup is preserved for current workflow compatibility, while live automation proposals are confirmed through Events.
