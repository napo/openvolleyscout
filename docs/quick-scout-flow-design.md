# Quick Scout Flow Design

This document defines the target data collection flow for OVS quick scouting mode. It replaces the current quick-scout-flow-store state machine and is DataVolley-compatible.

## Core Model: 3-Touch Cycle

The rally is organized around a repeating 3-touch cycle per team:

```
1st touch → 2nd touch → 3rd touch → ball crosses net → cycle restarts for other team
```

| Touch | Skill | Ring color | Notes |
|-------|-------|-----------|-------|
| 1st | Reception (side-out) or Dig / Freeball / Cover (transition) | Viola (reception) or Verde (dig/freeball/cover) | Optional — scout can skip |
| 2nd | Set | Arancione | Optional — scout can skip |
| 3rd | Attack | Rosso | Always recorded |

The trajectory direction determines the skill:

| Trajectory | Team touch | Proposed skill | Ring |
|-----------|-----------|---------------|------|
| Stays in own court, ball from opponent | 1st | Dig / freeball / cover | Verde |
| Stays in own court | 2nd | Set | Arancione |
| Crosses the net | 3rd (or any) | Attack | Rosso |

The touch counter resets every time the ball crosses the net. The scout can skip 1st and 2nd touches and go directly to an attack by drawing a trajectory across the net.

## Ring Colors

| Color | Situation |
|-------|----------|
| Viola | Receiver selection (after serve) |
| Verde | Dig / freeball / cover (1st touch) |
| Arancione | Set (2nd touch) — setter ring must be prominent |
| Rosso | Attack (3rd touch) |
| Rosa | Block |

## Phase Flow

### Phase 1: `idle` / `serve_drawing`

Server is auto-selected from the rotation.

- **Tap a player →** nothing happens (correct behavior)
- **Drag ball toward opponent court →** draws serve trajectory

If ball lands out of court or before the net → serve error → point for opponent.

### Phase 2: `awaiting_receiver` (serve landed in opponent court)

Serve trajectory stops in the opponent's court. Viola rings on all receiving team players.

- **Tap receiving team player →** selects as receiver, creates reception with default evaluation (+), shows evaluation chip
- **Tap serving team player →** disabled (not just ignored — visually non-tappable)

Serve evaluation is automatically derived from reception (inverse mapping).

### Phase 3: `reception_confirm` (receiver selected, eval chip visible)

The receiver has been selected. Reception evaluation chip is visible (default +). The ball is positioned according to evaluation quality. Players shift into attack formation.

The scout can change the reception evaluation from the chip. For evaluations `-` and `=` the ball stays where it is. Reception `=` auto-commits as reception error and ends the rally.

From here the scout draws a trajectory. The direction determines what happens:

**Trajectory stays in own court →** SET (2nd touch)
- If reception was `#` or `+` → setter is auto-assigned
- If there are 2 setters → ask to select with arancione ring
- Evaluation chip for set appears

**Trajectory crosses the net →** ATTACK
- Set is auto-inferred (if reception `#` or `+`, setter assigned with K1)
- Anello rosso on attacking team players
- Tap attacker → attack recorded with default evaluation (+)
- Evaluation chip for attack appears + block area appears along the net

### Phase 4: General play (3-touch cycle)

After any non-terminal touch the cycle repeats. The scout draws a trajectory and the direction determines the skill:

**Trajectory stays in own court, 1st team touch (ball coming from opponent) →** DIG / FREEBALL / COVER
- Anello verde on players
- Tap the player who made the first touch
- Default skill = dig; changeable from toolbar
- Evaluation chip appears

**Trajectory stays in own court, 2nd team touch →** SET
- Anello arancione — setter ring must be prominent
- Tap the setter (or player who set)
- Evaluation chip for set appears

**Trajectory crosses the net (or toward the net) →** ATTACK
- Anello rosso on attacking team players
- Tap attacker
- Attack recorded with default evaluation (+)
- Evaluation chip for attack appears + block area appears along the net

**Special case: ball returns to same team's court** (e.g. opponent's failed counterattack):
- Touch counter resets to 1st touch for the same team
- Scout can skip 1st and 2nd touches and draw directly across the net for another attack

### Phase 5: `attack_eval` (attack evaluation + block area)

The attacker has been selected. Evaluation chip visible (default +). Block area appears along the net.

- **Tap a player →** nothing happens (use Undo to change attacker)
- **Select # →** kill, point for attacker, rally ends
- **Select = →** error, point for opponent, rally ends
- **Select + or - →** defended (no block), rally continues → 3-touch cycle restarts for opponent
- **Tap block area (or select / or !) →** enters block sub-state

### Phase 6: `blocker_select` (block sub-state)

Block is a sub-state of the attack (C&S / DataVolley model). Rosa rings on front-row players of the blocking team.

- **Tap front-row player of blocking team →** selects as blocker
- **Tap attacking team player →** ignored
- **Tap back-row player of blocking team →** ignored

After blocker selection:
- People at block: 0, 1, 2, 3 (default 2)
- Block evaluation chip appears (default +)

Block evaluations (DataVolley-compatible):

| Evaluation | Meaning | Result |
|-----------|---------|--------|
| B# | Block winner (punto diretto) | Point for blocking team, rally ends |
| B= | Block error (hands out, in net, ball down on own court) | Point for attacking team, rally ends |
| B/ | Invasion | Point for attacking team, rally ends |
| B+ | Ball touched, playable by blocking team | Rally continues, 3-touch cycle for **blocking team** |
| B- | Ball touched, playable by attacking team | Rally continues, 3-touch cycle for **attacking team** |
| B! | Blocked but recovered in cover by attacker | Rally continues, 3-touch cycle for **attacking team** |

### Phase 7: `rally_ended`

The rally has ended (terminal evaluation assigned the point).

- **Tap a player →** nothing happens
- Point awarded to the winning team
- Complete rally code added to code list and manual entry toolbar
- OVS rotates if necessary (side-out)
- Returns to `idle` for the next rally with new server auto-selected

## Key Principle

OVS never blocks the scout. The minimum required to record a complete rally is:

**Serve (drag) → Receiver (tap) → Attack (drag across net) → Attacker (tap) → Evaluation → Point**

Everything else (set, dig, freeball, cover, block) is optional and adds statistical detail.

## Toolbar Controls

During the rally, the toolbar at the bottom shows:

- **Skill buttons**: Serve, Receive, Attack, Block, Set, Dig, Freeball, Cover. The suggested skill is pre-selected but always changeable.
- **Evaluation buttons**: Available evaluations for the selected skill. All buttons have contextual tooltips explaining the meaning for the current skill.
- **K code buttons**: When skill is Set or Attack. K1, K2, K7, KC, KM. Contextual tooltips.
- **Ball type buttons**: H, M, Q, T, U, N, O. Contextual tooltips per skill.
- **People at block**: 0, 1, 2, 3 for attack touches (default 2). Contextual tooltips.

## Pending Requirements

The following requirements were identified during the phase review and are to be implemented after the design is finalized:

1. **Serving team players non-tappable during receiver selection** — players must be visually disabled, not just silently ignored.

2. **Set detection from trajectory direction** — in `reception_confirm`, trajectory within own court = set; setter auto-assigned if reception `#` or `+`; if 2 setters, ask with arancione ring.

3. **3-touch cycle state tracking** — system tracks team touch count to distinguish 1st touch (dig) from 2nd touch (set); counter resets when ball crosses the net.

4. **Contextual tooltips on all toolbar buttons** — evaluations, ball types, K codes, and people at block all show DataVolley-compatible descriptions on hover, varying by current skill.

5. **Eliminate `attack_pending` phase** — trajectory always comes first, player selection always comes second. No more "select player then drag" pattern.

6. **Block area on attack** — visible along the net after attacker is selected; tap to enter block sub-state.

7. **Full DataVolley block evaluations** — B#, B=, B/, B+, B-, B! with correct possession assignment.

8. **Hole Block (value 4)** — DataVolley supports a 4th value for "Muro Aperto" on the block players field. To be evaluated.
