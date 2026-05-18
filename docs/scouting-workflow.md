# Live Scouting Workflow

## Court-First Rally Input

Normal rally scouting keeps the court as the primary surface. During rally input, the operator can select a player, move the ball, choose the skill, and choose the evaluation while the court, player markers, ball, and trajectory context remain visible.

The live input state is explicit:

- `selectedPlayerId`
- `selectedTeamSide`
- `pendingBallPosition`
- `selectedSkill`
- `selectedEvaluation`
- `pendingTouch`
- `currentInputPhase`

The normal phase sequence is:

1. `select_player`
2. `move_ball`
3. `choose_skill`
4. `choose_evaluation`
5. `completed_touch`

The serve ace `#` path uses `ace_victim_selection` so the serve is not committed or tactically advanced until the receiving player is selected.

## Fixed Live Toolbar

Normal rally skill and evaluation entry is handled by the fixed live toolbar below the court. The toolbar shows the selected player, team, libero marker when applicable, current input phase, skill buttons, evaluation buttons, undo when available, and an Events shortcut.

The toolbar is part of the live rally layout rather than a modal. It stays visible while the operator selects players, moves the ball, chooses a skill, and chooses an evaluation. It does not cover the ball or player markers.

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
