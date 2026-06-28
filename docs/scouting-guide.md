# Scouting Guide

This guide explains step by step how to record a volleyball match using OpenVolleyScout's live scouting interface.

## Starting a Rally

### Serve

1. OVS shows the server in the default serve position (position 1).
2. You can tap the serve start zones (1, 6, or 5) on the serving team's side to change the starting position. The server and the ball move to the selected zone.
3. Drag the ball from the server toward the opponent's court, drawing the serve trajectory.
4. If the ball lands outside the court or before the net, OVS records a serve error and awards the point to the opponent.

### Reception

5. The serve trajectory stops in the opponent's court. OVS highlights all receiving team players with a purple ring.
6. Tap the player who received the ball. The purple rings disappear.
7. OVS assigns the reception with a default evaluation (+). The ball moves to a court position corresponding to the evaluation quality. The serve evaluation is automatically derived from the reception.
8. You can change the reception evaluation from the toolbar. The ball moves accordingly. For evaluations - and = the ball stays where it is.
9. The receiving team's players shift into attack formation (the setter moves to the setting position).

## After Reception: Recording the Rally

After reception, you are free to choose the level of detail you prefer. You can perform any of these actions:

### Action A: Drag the ball across the net (attack)

10. Drag the ball from its current position toward the opponent's court, drawing the attack trajectory.
11. OVS highlights the attacking team's players with purple rings and asks you to select the attacker.
12. Tap the player who attacked.
13. OVS records the attack. If the reception was # or +, OVS also auto-inserts the setter's set touch with K1. OVS suggests the attack evaluation and you can modify it from the toolbar.

### Action B: Drag the ball onto the net (block)

10. While dragging the ball, if it approaches the net line, the net turns thick and yellow as visual feedback.
11. Release the ball on the yellow net. OVS pre-selects evaluation A/ (blocked) and highlights the opposing team's front-row players (positions 2, 3, 4) with purple rings.
12. Tap the blocker. The point is awarded to the blocking team.

### Action C: Tap a player on the same team (set, cover)

10. Tap a player on the team that has possession.
11. The ball moves toward that player.
12. OVS suggests the skill based on context:
    - If the player is the setter after reception or dig: skill = set with K1 preset
    - Otherwise: skill = attack
13. You can change the skill from the toolbar (set, attack, cover, etc.).
14. You can then drag the ball to define the trajectory.

### Action D: Tap a player on the other team (dig, freeball)

10. Tap a player on the opposing team.
11. The ball moves toward that player.
12. OVS suggests the skill based on context (dig, freeball).
13. You can change the skill and evaluation from the toolbar.

## After the Attack

Based on the attack evaluation:

- **A# (kill)**: Point for the attacker. Rally ends.
- **A= (error)**: Point for the opponent. Rally ends.
- **A/ (blocked)**: OVS asks you to select the blocker. Point for the blocking team.
- **A! (block touch)**: OVS asks you to select the blocker. Rally continues.
- **A+ or A- (defended)**: Rally continues. The opponent team now has possession. Go back to "After Reception" and repeat with the new possessing team.

## Rally Continuation

After any non-terminal touch (dig, set, freeball, cover), you return to the same three options: drag the ball across the net (attack), tap a player on the same team, or tap a player on the other team. The rally continues until a terminal evaluation (#, =, /) assigns the point.

## Closing the Rally

- OVS awards the point to the team indicated by the terminal evaluation.
- The complete rally code is added to the code list.
- You can correct any code using Undo or the manual code toolbar.

## Key Principle

OVS never blocks you. The minimum required to record a complete rally is:

**Serve (drag) -> Receiver (tap) -> Attack (drag across net) -> Attacker (tap) -> Point**

Everything else (explicit set, dig, freeball, cover) is optional and adds statistical detail.

## Toolbar Controls

During the rally, the toolbar at the bottom shows:

- **Skill buttons**: Serve, Receive, Attack, Block, Set, Dig, Freeball, Cover. The suggested skill is pre-selected, but you can always change it.
- **Evaluation buttons**: The available evaluations for the selected skill (e.g., =, /, !, -, +, # for reception).
- **K code buttons**: When the skill is Set or Attack, the K combination code selector appears (K1, K2, K7, KC, KM). K1 is the default for good receptions.
- **Ball type buttons**: H, M, Q, T, U, N, O for serve and attack type codes.
- **Number of blockers**: 0, 1, 2, 3 for attack touches.
