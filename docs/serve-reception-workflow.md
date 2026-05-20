# Serve Reception Workflow

OpenVolleyScout live scouting derives the serve evaluation from the reception evaluation. The operator evaluates the receiver's outcome; the system records the corresponding inferred serve touch before the explicit receive touch.

## Live Flow

1. The serving player is selected from the active rotation.
2. The operator drags the ball from the serve start toward the receiving court.
3. On release, the nearest receiving-team player to the ball destination is selected.
4. The operator may override the receiver with another player from the receiving team.
5. The operator chooses the reception evaluation.
6. The system infers the serve evaluation and commits two touches in order:
   - inferred `serve` for the server
   - explicit `receive` for the selected receiver

Serving-team players are not valid receiver overrides during this pending reception step.

## Inference Mapping

The serve evaluation is deterministic:

```ts
const RECEIVE_TO_SERVE_EVALUATION = {
  '=': '#',
  '/': '/',
  '-': '+',
  '!': '!',
  '+': '-',
  '#': '=',
};
```

The inferred serve touch has `source: "inferred"` and `inferenceReason: "serve_from_reception"`. The receive touch has `source: "explicit"` and carries the operator's selected reception evaluation.

## Receiver Selection

Receiver selection is based on distance from the released ball destination to the receiving team's on-court player markers. The serving team is ignored even if a serving-team marker is physically closer to the destination. If the operator overrides the receiver, the override must still be on the receiving team.

## Serve Trajectory

The serve trajectory starts at the current ball start point and ends at the release destination. It is rendered as a straight dashed arrow with the arrowhead at the destination. While the reception evaluation is pending, the trajectory remains visible as the pending serve trajectory; after commit, it is preserved on the inferred serve touch for replay and reports.

## Reception `/`

Reception `/` means the ball returns to the serving team. It infers serve `/`, does not award a point, and keeps the rally alive. The next touch context belongs to the serving team and defaults to a playable continuation while still allowing the operator to choose the appropriate skill, such as freeball, attack, dig, or block.

## Simple And Advanced Modes

In Simple mode, set and dig touches remain optional operator steps. The workflow may queue deterministic inferred touches, such as a setter after a controlled reception, when the existing inference rules can identify them. Otherwise, the operator can continue directly with the next player and choose the relevant skill.

Advanced mode keeps explicit skill and evaluation control after the serve reception pair is committed.

## Stats And Replay

Stats count the inferred serve and explicit reception as normal touches:

- inferred serve evaluations are included in serve totals
- explicit reception evaluations are included in reception totals
- receive `=` counts as a reception error for the receiver
- inferred serve `#` counts as an ace and point for the server
- no synthetic duplicate receive touch is added when the explicit receive `=` is already present

Replay stores and restores the inferred serve touch, explicit receive touch, receiver player id, serve trajectory, and `serve_from_reception` inference reason. Older sessions without these fields remain valid because the new metadata is optional.
