# Live Scouting Workflow

## Input Levels

The per-match `scoutingMode` (Simple/Advanced/Quick/Expert) was retired with
match schema version 4; a stray `scoutingMode` field in older projects is
dropped on load. What the scout chooses today is an **input level**, a device
preference stored in the app store (`inputMode` + `simpleInput`,
`src/app/store/app-store.ts`), not match data. The same event model is written
at every level.

| Level | What is entered | What stays empty |
|---|---|---|
| Basic | serve and point winner only, rally by rally | player statistics |
| Tags | buttons only: player → evaluation; one team or both (`tagRecordTeams`) | zones, ball directions, heatmaps, side-out study |
| Court | the ball drawn on the court, large buttons | — |
| Detailed | court plus ball types, blockers, calls and DataVolley code entry | — |

The first time live scouting opens, `InputLevelChooser` asks for the level and
marks one as recommended: Court on touch-only devices (`pointer: coarse` and
no fine pointer, see `isTouchOnlyDevice`), Detailed otherwise. The level can
be changed at any time from the scouting header.

Portrait phones are supported when the court is vertical or the level is
Tags/Basic; otherwise `PortraitGuard` asks to rotate the device.

### One team only

A team whose match roster is empty is scouted as a team, not player by
player (`src/features/scouting/model/unscouted-team.ts`). This is the same
data a team-only DataVolley import produces:

- set start skips its lineup step;
- on the court it shows one team marker (the first letters of its name)
  instead of six empty positions;
- whenever the flow needs a player of that team (reception, attack, block,
  ace victim, any awaited touch) the marker is picked automatically, so the
  scout only enters the outcome;
- its touches are stored with no `playerId` (exported as `$$`, or `00` for a
  serve); the double-contact rule and the six-markers check do not apply.

The Tags level has its own one-team switch (`tagRecordTeams`).

On an upright phone the vertical court sits on the left; the step hint and
the rally timeline (`PhoneRallyTimeline`) use the column on its right.

On the court levels the primary live touches are `serve`, `receive`,
`attack` and `block`; `set`, `dig`, `freeball` and `cover` are optional
detail, recorded when chosen or inferred where the context is deterministic.

## Court-First Rally Input

Normal rally scouting keeps the court as the primary surface. During rally input, the operator can select a player, move the ball, choose the skill, and choose the evaluation while the court, player markers, ball, and trajectory context remain visible.

The live input state is explicit:

- `selectedPlayerId`
- `selectedTeamSide`
- `pendingBallPosition`
- `selectedSkill`
- `selectedEvaluation`
- `pendingTouch`
- `requiredExplicitInput`
- `inferredCandidate`
- `pendingInference`
- `currentInputPhase`

The normal phase sequence is:

1. `select_player`
2. `move_ball`
3. `choose_skill`
4. `choose_evaluation`
5. `completed_touch`

The serve ace `#` path uses `ace_victim_selection` so the serve is not committed or tactically advanced until the receiving player is selected.

Touch metadata distinguishes operator-entered touches from deterministic inference. Explicit touches carry `source: "explicit"`. Inferred touches carry `source: "inferred"` plus `inferenceReason`, and may carry `inferredFromTouchId` when the source touch is known.

Allowed inference reasons are:

- `setter_after_receive`
- `setter_after_dig`
- `dig_after_positive_attack`
- `freeball_after_negative_attack`
- `cover_after_recovered_block`

The engine does not use probability scores and does not guess player ownership.

## Fixed Live Toolbar

Normal rally skill and evaluation entry is handled by the fixed live toolbar below the court. The toolbar shows the selected player, team, libero marker when applicable, current input phase, skill buttons, evaluation buttons, undo when available, and an Events shortcut.

The toolbar is part of the live rally layout rather than a modal. It stays visible while the operator selects players, moves the ball, chooses a skill, and chooses an evaluation. It does not cover the ball or player markers.

The toolbar shows the primary live skills first, with the secondary skills visually quieter (`src/features/scouting/live/rally/toolbar-mode-layout.ts`).

## Smartphone Landscape Layout

Live scouting is optimized for smartphone landscape orientation. On small-height landscape screens, the live stage switches to an ultra-compact operational layout: the header and score shrink, team names are ellipsized, the current set and serving team remain visible, and the court receives the maximum usable height.

The live toolbar remains fixed below the court. It keeps the selected player summary compact and preserves the essential controls: skill, evaluation, Events, and Undo when available. Skill and evaluation groups can wrap inside the toolbar when the viewport is very narrow, but the screen should not require horizontal scrolling.

The live court scales with CSS variables for marker size, ball size, toolbar control height, header height, and trajectory stroke weight. Player markers and the draggable ball are smaller in smartphone landscape, while jersey numbers and evaluation buttons remain readable and tappable. Ball trajectories and outside-court free-zone movement remain visible and are not clipped at the court boundary.

For phone-sized portrait viewports during live scouting, the app shows an orientation guard asking the operator to rotate to landscape. This guard is scoped to live scouting on phone-width portrait screens. Match setup, set end, match end, analysis/statistics pages, and tablet portrait workflows remain available without that live guard.

## Normal Rally Sequence

Player selection highlights the marker and does not hide the court. Moving or dragging the ball updates `pendingBallPosition`; ball movement alone does not create a touch. The live court also shows ball trajectory from the previous position to the destination, even when the target is outside the court surface. Snapping the ball to a legal in-court zone creates or updates `pendingTouch`, while the latest outside-court destination remains preserved until the touch is committed.

Skill and evaluation selection happen through the fixed toolbar. Evaluation commits the touch according to the existing rally rules, including ace victim selection and terminal touch handling. Non-terminal touches are committed once from the toolbar so the DataVolley sequence updates without waiting for another popup interaction.

After a reception, the next selected player defaults directly to `attack`; the operator can still change the skill to `set` before committing. After an opponent `attack +`, the flow keeps the rally alive and lets the operator choose the next relevant player without first asking for a `dig`. Freeball and cover situations follow the same rule: they never block the rally flow, and they are recorded only when selected explicitly.

## Events Panel Boundary

The Events panel remains reserved for dead-ball work:

- substitutions
- libero changes
- timeouts
- sanctions
- replay and corrections
- video check
- position faults

The toolbar Events button opens the existing Events panel. When the Events panel is opened, it still replaces the court area. Closing the panel restores the court-first live rally stage. Normal rally skill/evaluation input does not use the Events panel.

## Compatibility

`BallTouchPopup` remains in the codebase for compatibility and possible future advanced workflows, but the normal live rally workflow no longer opens it after ball movement. The fixed toolbar is sufficient for player, ball, skill, and evaluation input.

Tactical transitions, libero visibility, setter release timing, side-out rotation rules, and stats generation continue to derive from committed touches and the existing live engines.

## Deterministic Inference

Inference is rule-based, never probabilistic, and never guesses player
ownership beyond what the lineup makes certain. When the operator taps the next
player after a reception or dig, the missing intermediate touch (typically the
`set`) is inferred on redraw, and a set inherits its type from the attack that
follows it. Inferred touches carry `source: "inferred"` and an
`inferenceReason`.

Setter inference assigns `playerId` only when the active tactical players
expose a single deterministic setter; otherwise the touch stays unattributed.

## Explicit Override

Explicit operator input wins over inference. Changing the player, skill, or evaluation on an inferred pending touch clears `inferenceReason`, changes `source` back to `"explicit"`, and allows the explicit touch to replace the latest inferred touch rather than creating a duplicate.

Replay preserves inference metadata because `touch_recorded` events store the whole `BallTouch`. Current stats generation includes inferred touches in the same aggregate totals as explicit touches.
