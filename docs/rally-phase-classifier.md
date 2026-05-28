# Rally Phase Classifier

The rally phase classifier assigns each rally a game-situation label used by the Performance Dashboard for situation analytics.

## Location

```
src/features/analytics/rally-phase/rally-phase-classifier.ts
```

## Phases

| Phase | Description |
|---|---|
| `freeball` | At least one freeball touch appears in the rally |
| `attack_after_receive` | Winning team attacks directly after a reception (first-ball attack) |
| `attack_after_dig` | Winning team attacks after a dig |
| `counterattack` | Serving team wins after the receiving team already attacked |
| `transition_attack` | Winning team attacked, but the path cannot be classified more specifically |
| `side_out` | Receiving team wins (fallback when no sub-phase applies) |
| `break_point` | Serving team wins (fallback when no sub-phase applies) |
| `unknown` | Insufficient data (missing serving team, missing point winner, or no touches) |

## Classification Priority

The classifier returns the **most specific** applicable phase:

```
freeball > attack_after_receive > attack_after_dig > counterattack >
transition_attack > side_out | break_point > unknown
```

This means a rally with a freeball touch is always classified as `freeball`, even if the winning team also had a reception.

## Algorithm

```
classifyRallyPhase(rally):
  if servingTeam is null OR pointWinner is null → 'unknown'
  if touches is empty → 'unknown'

  if any touch.skill === 'freeball' → 'freeball'

  winnerAttacks = touches where teamSide === pointWinner AND skill === 'attack'
  if winnerAttacks is empty → side_out or break_point (broad fallback)

  lastWinnerAttack = last of winnerAttacks (by sequenceNumber)
  prevWinnerTouch  = winner's last touch before lastWinnerAttack

  if prevWinnerTouch.skill === 'receive' → 'attack_after_receive'
  if prevWinnerTouch.skill === 'dig'     → 'attack_after_dig'

  opponentAttacks = touches where teamSide !== pointWinner AND skill === 'attack'
  if pointWinner === servingTeam AND opponentAttacks.length > 0 → 'counterattack'

  if winnerAttacks.length > 0 → 'transition_attack'

  → side_out (receiving team won) | break_point (serving team won)
```

## Broad Filters

`side_out` and `break_point` used as **filters** match ALL rallies where the respective team won, regardless of specific sub-phase:

```typescript
rallyMatchesPhaseFilter(rally, 'side_out')   // true for any rally where receiving team wins
rallyMatchesPhaseFilter(rally, 'break_point') // true for any rally where serving team wins
rallyMatchesPhaseFilter(rally, 'freeball')   // only rallies classified as freeball
```

## Classifier Limits

- **Set context**: The classifier works per-rally and has no access to rotation state or lineup positions.
- **Touch completeness**: Classification depends on how many touches were recorded. Sparse touch data (e.g. score-only imports) produces more `unknown` classifications.
- **Setter inference**: Set touches are not used for classification. If only attack touches are recorded without reception/dig context, the result falls back to `transition_attack`, `side_out`, or `break_point`.
- **Simultaneous events**: If multiple touches share the same `sequenceNumber`, sorting by `createdAt` is used as a tiebreaker.

## Native OVS vs Imported DataVolley Data

| Feature | Native OVS | DataVolley Import |
|---|---|---|
| `servingTeam` | Always available after rally | Available if [3SCOUT] rows encode it |
| `pointWinner` | Always available | Available from score lines |
| Touch sequence | Full (serve → receive → set → attack …) | Partial — key skills recorded, some inferred |
| `freeball` skill | When explicitly scouted | Mapped from DataVolley `F` skill code |
| `dig` skill | When explicitly scouted | Mapped from DataVolley `D` skill code |

For imported DataVolley matches, classification is best-effort:
- `attack_after_receive` and `attack_after_dig` rely on touch sequence being present.
- If only the terminal attack is recorded, the phase will be `transition_attack`, `side_out`, or `break_point`.
- `unknown` count is exposed in the `SituationMetricsWidget` when it is non-zero.
- No crash occurs for incomplete data — the classifier always returns a valid phase.

## Future Use: Heatmaps

The classifier is designed so that each `BallTouch` retains its original `zone`, `originZone`, `targetZone`, and `direction` metadata unchanged. Future heatmap features can:
1. Filter touches by rally phase using `rallyMatchesPhaseFilter`.
2. Render zone frequencies from the filtered touch set without any schema changes.
