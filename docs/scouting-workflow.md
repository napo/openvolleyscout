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

## Normal Rally Sequence

Player selection highlights the marker and does not hide the court. Moving or dragging the ball updates `pendingBallPosition`; ball movement alone does not create a touch. Snapping the ball to a legal in-court zone creates or updates `pendingTouch`.

Skill and evaluation selection are available outside the popup so a fixed toolbar can use the same state later. Evaluation still commits according to the existing rally rules, including ace victim selection, terminal touch handling, and deferred continuation behavior.

## Events Panel Boundary

The Events panel remains reserved for dead-ball work:

- substitutions
- libero changes
- timeouts
- sanctions
- replay and corrections
- video check
- position faults

When the Events panel is opened, it still replaces the court area. Normal rally input does not use the Events panel and should not open it.

## Compatibility

`BallTouchPopup` remains available for the current touch controls and popup positioning safeguards, but the live rally state is no longer trapped inside the popup. The court-first control strip uses the same skill and evaluation handlers as the popup, so both surfaces stay consistent during the transition toward a fixed live toolbar.

Tactical transitions, libero visibility, setter release timing, side-out rotation rules, and stats generation continue to derive from committed touches and the existing live engines.
