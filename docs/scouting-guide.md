# Scouting Guide

This guide explains step by step how to record a volleyball match using OpenVolleyScout's live scouting interface.

## Key Principle

OVS never blocks you. The minimum required to record a complete rally is:

**Serve (drag) → Receiver (tap) → Attack (drag across net) → Attacker (tap) → Evaluation → Point**

Everything else (set, dig, freeball, cover, block) is optional and adds statistical detail.

## The 3-Touch Cycle

A volleyball rally is organized around a repeating 3-touch cycle per team:

1. **1st touch** — reception (in side-out) or dig / freeball / cover (in transition)
2. **2nd touch** — set
3. **3rd touch** — attack (ball crosses the net)

After the attack, the cycle restarts for the other team. The 1st and 2nd touches are optional — you can skip them and go directly to the attack.

OVS determines what skill to propose based on the **direction of the trajectory you draw**:

| Trajectory | Touch | Proposed skill | Ring color |
|-----------|-------|---------------|------------|
| Stays in own court, ball from opponent | 1st | Dig / freeball / cover | Green |
| Stays in own court | 2nd | Set | Orange |
| Crosses the net | 3rd | Attack | Red |

## Starting a Rally

### Serve

1. OVS shows the server in the default serve position (position 1).
2. You can tap the serve start zones (1, 6, or 5) on the serving team's side to change the starting position. The server and the ball move to the selected zone.
3. Drag the ball from the server toward the opponent's court, drawing the serve trajectory.
4. If the ball lands outside the court or before the net, OVS records a serve error and awards the point to the opponent.

### Reception

5. The serve trajectory stops in the opponent's court. OVS highlights all receiving team players with a **viola ring**. Serving team players are disabled and cannot be tapped.
6. Tap the player who received the ball. The rings disappear.
7. OVS assigns the reception with default evaluation (+). The ball moves to a court position corresponding to the evaluation quality. The serve evaluation is automatically derived from the reception.
8. You can change the reception evaluation from the toolbar. The ball moves accordingly. For evaluations - and = the ball stays where it is. Reception = auto-commits as reception error and ends the rally.
9. The receiving team's players shift into attack formation (the setter moves to the setting position).

## After Reception: Recording the Rally

After reception you draw a trajectory. The direction determines what happens:

### Trajectory stays in own court → Set

10. Draw a trajectory that stays within the team's own court.
11. OVS proposes **set** (2nd touch). If the reception was # or +, the setter is auto-assigned. If there are two setters, OVS asks you to select one with an **orange ring**.
12. You can change the skill and evaluation from the toolbar.

### Trajectory crosses the net → Attack

10. Drag the ball from the current position toward the opponent's court, drawing the attack trajectory. The set is auto-inferred (if reception # or +, setter assigned with K1).
11. OVS highlights the attacking team's players with **red rings** and asks you to select the attacker.
12. Tap the player who attacked.
13. OVS records the attack with default evaluation (+). You can modify the evaluation from the toolbar. The **block area** appears along the net.

### Trajectory onto the net → Block

10. While dragging the ball, if it approaches the net line, the net turns thick and yellow as visual feedback.
11. Release the ball on the yellow net. OVS enters the block sub-state.

## Rally Continuation (3-Touch Cycle)

After any non-terminal touch the cycle repeats. Draw a trajectory and OVS proposes the skill based on direction:

### 1st team touch — Dig / Freeball / Cover (ball coming from opponent)

- OVS highlights players with **green rings**.
- Tap the player who made the first touch.
- Default skill = dig; changeable from the toolbar (freeball, cover).

### 2nd team touch — Set

- OVS highlights with **orange rings** — the setter ring is prominent.
- Tap the setter (or whoever set the ball).

### 3rd touch — Attack (trajectory crosses the net)

- OVS highlights with **red rings**.
- Tap the attacker.
- Default evaluation (+). Block area appears along the net.

### Special case: ball returns to same team

If the opponent fails to keep the ball (e.g. failed counterattack, dig goes long), the touch counter resets for the same team. Simply draw a new trajectory across the net to record another attack.

## After the Attack

The attack evaluation chip is visible (default +). The block area is visible along the net. You can:

- **Select #** — kill, point for attacker. Rally ends.
- **Select =** — error, point for opponent. Rally ends.
- **Select + or -** — defended (no block involved). Rally continues, 3-touch cycle restarts for the opponent.
- **Tap the block area (or select / or !)** — enters the block sub-state.

## Block (sub-state of the attack)

The block is a consequence of the attack, not a separate action. When activated, OVS highlights the front-row players of the blocking team with **pink rings**.

1. Tap the blocker.
2. Select people at block: 0, 1, 2, 3 (default 2).
3. Select the block evaluation:

| Evaluation | Meaning | Result |
|-----------|---------|--------|
| B# | Block winner | Point for blocking team, rally ends |
| B= | Block error (hands out, in net, ball down) | Point for attacking team, rally ends |
| B/ | Invasion | Point for attacking team, rally ends |
| B+ | Ball touched, playable by blocking team | Rally continues, blocking team has possession |
| B- | Ball touched, playable by attacking team | Rally continues, attacking team has possession |
| B! | Blocked but recovered in cover | Rally continues, attacking team has possession |

## Closing the Rally

- OVS awards the point to the team indicated by the terminal evaluation.
- The complete rally code is added to the code list and to the manual entry toolbar.
- You can correct any code using Undo.
- OVS rotates if necessary (side-out) and auto-selects the new server.

## Toolbar Controls

During the rally, the toolbar at the bottom shows:

- **Skill buttons**: Serve, Receive, Attack, Block, Set, Dig, Freeball, Cover. The suggested skill is pre-selected, but you can always change it.
- **Evaluation buttons**: The available evaluations for the selected skill. Hover over each button to see its meaning for the current skill.
- **K code buttons**: When the skill is Set or Attack, the K combination code selector appears (K1, K2, K7, KC, KM). Hover for descriptions.
- **Ball type buttons**: H, M, Q, T, U, N, O for serve and attack type codes. Hover for descriptions.
- **People at block**: 0, 1, 2, 3 for attack touches (default 2). Hover for descriptions.

## Ring Colors Summary

| Color | Situation |
|-------|----------|
| Viola | Receiver selection (after serve) |
| Green | Dig / freeball / cover (1st touch) |
| Orange | Set (2nd touch) |
| Red | Attack (3rd touch) |
| Pink | Block |
