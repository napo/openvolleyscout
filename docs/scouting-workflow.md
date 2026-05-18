# Live Scouting Workflow

## Simple vs Advanced Scouting Modes

OpenVolleyScout supports two live scouting modes.

Simple mode is the default. It is optimized for phone and tablet operation, keeping the court central and the toolbar compact. The operator can work quickly through player selection, ball movement, skill choice, and evaluation, while the state model allows defaulted secondary input when the operator continues to the next touch. This prepares the workflow for future implicit inference without generating inferred touches yet.

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

All touches recorded today remain explicit. Touch metadata now has future-ready `source`, `touchOrigin`, `requiredExplicitInput`, `inferredCandidate`, and `pendingInference` fields so future inference rules can distinguish inferred touches from operator-entered touches without changing the rally event shape.

## Fixed Live Toolbar

Normal rally skill and evaluation entry is handled by the fixed live toolbar below the court. The toolbar shows the selected player, team, libero marker when applicable, current input phase, skill buttons, evaluation buttons, undo when available, and an Events shortcut.

The toolbar is part of the live rally layout rather than a modal. It stays visible while the operator selects players, moves the ball, chooses a skill, and chooses an evaluation. It does not cover the ball or player markers.

In Simple mode, the toolbar uses a compact layout and shows the most common live skills first. In Advanced mode, it keeps the full current skill set visible and reserves a wider detailed layout for future explicit detail controls.

## Normal Rally Sequence

Player selection highlights the marker and does not hide the court. Moving or dragging the ball updates `pendingBallPosition`; ball movement alone does not create a touch. The live court also shows ball trajectory from the previous position to the destination, even when the target is outside the court surface. Snapping the ball to a legal in-court zone creates or updates `pendingTouch`, while the latest outside-court destination remains preserved until the touch is committed.

Skill and evaluation selection happen through the fixed toolbar. Evaluation commits the touch according to the existing rally rules, including ace victim selection and terminal touch handling. Non-terminal touches are committed once from the toolbar so the DataVolley sequence updates without waiting for another popup interaction.

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

## Future Inference Integration

Future inference work should use Simple mode as the lower-workload path. Examples include inferred freeballs, setter assignment, cover touches, or secondary touch details. Those rules should write touches with `source: "inferred"` only when the inference engine is actually implemented. Until then, the workflow only records explicit operator touches and keeps inference hooks inert.

Advanced mode should remain the explicit input path. Future DataVolley detail fields should expand the mode-aware toolbar and pending-touch metadata without changing match reports or the existing stats engines in this foundational step.
