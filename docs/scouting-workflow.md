# Live Scouting Workflow

## Simple vs Advanced Scouting Modes

OpenVolleyScout supports two live scouting modes.

Simple mode is the default. It is optimized for phone and tablet operation, keeping the court central and the toolbar compact. The normal rally flow prioritizes the primary live touches: `serve`, `receive`, `attack`, and `block`. Secondary touches (`set`, `dig`, `freeball`, and `cover`) stay available, but they are optional details entered only when the operator chooses them.

Advanced mode keeps the explicit workflow stricter. It is intended for DataVolley-like detail and professional analysis, so the toolbar exposes the full skill set and the live input requirements keep skill and evaluation explicit. Future attack tempo, attack type, serve type, set type, and advanced evaluation controls should attach to the Advanced toolbar layout rather than redesigning the rally flow.

The active mode is stored on the scouting session as `scoutingMode`, defaults to `simple`, and is included in live session snapshots. Replaying older event logs remains compatible because replay falls back to Simple mode unless the persisted session carries a different mode.

Mode changes are safest during dead ball. The UI keeps the active mode visible and asks the operator to finish the rally before switching when a rally is active, so pending touches, ace victim selection, libero replacement flows, and tactical transitions are not disturbed.

## Court-First Rally Input

Normal rally scouting keeps the court as the primary surface. During rally input, the operator can select a player, move the ball, choose the skill, and choose the evaluation while the court, player markers, ball, and trajectory context remain visible.

The live input state is explicit:

- `selectedPlayerId`
- `selectedTeamSide`
- `pendingBallPosition`
- `selectedSkill`
- `selectedEvaluation`
- `pendingTouch`
- `scoutingMode`
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

In Simple mode, the toolbar uses a compact layout and shows primary live skills first, with secondary skills visually quieter. In Advanced mode, it keeps the full current skill set visible with equal prominence and reserves a wider detailed layout for future explicit detail controls.

## Smartphone Landscape Layout

Live scouting is optimized for smartphone landscape orientation. On small-height landscape screens, the live stage switches to an ultra-compact operational layout: the header and score shrink, team names are ellipsized, the current set and serving team remain visible, the mode selector stays available, and the court receives the maximum usable height.

The live toolbar remains fixed below the court. It keeps the selected player summary compact and preserves the essential controls: skill, evaluation, Events, and Undo when available. Skill and evaluation groups can wrap inside the toolbar when the viewport is very narrow, but the screen should not require horizontal scrolling.

The live court scales with CSS variables for marker size, ball size, toolbar control height, header height, and trajectory stroke weight. Player markers and the draggable ball are smaller in smartphone landscape, while jersey numbers and evaluation buttons remain readable and tappable. Ball trajectories and outside-court free-zone movement remain visible and are not clipped at the court boundary.

For phone-sized portrait viewports during live scouting, the app shows an orientation guard asking the operator to rotate to landscape. This guard is scoped to live scouting on phone-width portrait screens. Match setup, set end, match end, analysis/statistics pages, and tablet portrait workflows remain available without that live guard.

## Normal Rally Sequence

Player selection highlights the marker and does not hide the court. Moving or dragging the ball updates `pendingBallPosition`; ball movement alone does not create a touch. The live court also shows ball trajectory from the previous position to the destination, even when the target is outside the court surface. Snapping the ball to a legal in-court zone creates or updates `pendingTouch`, while the latest outside-court destination remains preserved until the touch is committed.

Skill and evaluation selection happen through the fixed toolbar. Evaluation commits the touch according to the existing rally rules, including ace victim selection and terminal touch handling. Non-terminal touches are committed once from the toolbar so the DataVolley sequence updates without waiting for another popup interaction.

After a reception in Simple mode, the next selected player defaults directly to `attack`; the operator can still change the skill to `set` before committing. After an opponent `attack +`, Simple mode keeps the rally alive and lets the operator choose the next relevant player without first asking for a `dig`. Freeball and cover situations follow the same rule: they never block the rally flow, and they are recorded only when selected explicitly.

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

`BallTouchPopup` remains in the codebase for compatibility and possible future advanced workflows, but the normal simple live rally workflow no longer opens it after ball movement. The fixed toolbar is sufficient for player, ball, skill, and evaluation input.

Tactical transitions, libero visibility, setter release timing, side-out rotation rules, and stats generation continue to derive from committed touches and the existing live engines.

## Deterministic Inference

Implicit rules are configured in `src/config/scouting/implicit-rules.ts`. The configuration has no probability values; it only enables or disables deterministic rule groups. Simple mode does not queue these secondary inferred touches as mandatory pending steps; inference is reserved for optional metadata/replay paths.

When inference is explicitly requested, Simple mode can infer:

- a `set` after a `receive`, with reason `setter_after_receive`
- a `set` after a `dig`, with reason `setter_after_dig`
- a `dig` after an `attack +`, with reason `dig_after_positive_attack`
- a `freeball` after an `attack -`, with reason `freeball_after_negative_attack`
- a `cover` after a blocked-but-recovered `attack !`, with reason `cover_after_recovered_block`

Setter inference assigns `playerId` only when the active tactical players expose a single deterministic setter. If the setter is unavailable, the engine may still infer the `set` skill but leaves the touch unattributed. Defense, freeball, and cover inference do not assign a player unless future deterministic ownership data exists.

Advanced mode does not run implicit inference. It remains the fully explicit path for DataVolley-like scouting detail.

## Explicit Override

Explicit operator input wins over inference. Changing the player, skill, or evaluation on an inferred pending touch clears `inferenceReason`, changes `source` back to `"explicit"`, and allows the explicit touch to replace the latest inferred touch rather than creating a duplicate.

Replay preserves inference metadata because `touch_recorded` events store the whole `BallTouch`. Current stats generation includes inferred touches in the same aggregate totals as explicit touches.
