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

## Touch-Level Tactical Phase (`TouchPhase`)

A separate, simpler classification from the 8-phase whole-rally one above: `classifyRallyTouchPhases(rally)` labels **every individual touch** with one of 4 values, keyed by touch id:

| Phase | Meaning |
|---|---|
| `break_point` | `serve`, or the serving team's *first* occurrence of block/dig/set/attack/cover in the rally |
| `point` | `receive`, or the receiving team's *first* occurrence of set/attack/cover |
| `transition_break_point` | Any further (2nd+) touch by the serving team |
| `transition_point` | Any further (2nd+) touch by the receiving team, including their block/dig/freeball |

This is the filter powering the dashboard's shared **Rally phase** dropdown (`TOUCH_PHASES`, re-exported from `dashboard-filters.ts`) and `filterTouchesByPhase()`. It used to have a single undifferentiated `transition` value; it was split into `transition_break_point` / `transition_point` so widgets can distinguish which team's extended-rally touches they're looking at (e.g. a team may run a different defensive scheme in break-point vs. side-out phase — see `DefenseContext` in `src/domain/systems/types.ts`).

## First Ball Side-Out (`isFirstBallSideOutKill`)

`isFirstBallSideOutKill(rally)` is a strict, narrower check than the `attack_after_receive` (K1) phase: it returns `true` only when the receiving team's first attack after reception is the literal **terminal touch of the rally** (nobody touches the ball again) **and** is scored as a kill (`evaluation === '#'`). K1 only requires that a first-ball attack was *attempted* — the rally may still continue (block, dig, extended exchange). This distinction feeds the FBSO% metric in `situation-metrics.ts`.

## Attack Preceding-Context (`classifyAttackPrecedingContext`)

`classifyAttackPrecedingContext(rally): Map<touchId, 'receive' | 'dig'>` classifies **every** `attack` touch in the rally (not just the first or last) by whether its immediate same-team build-up was a reception (first-ball attack) or a dig (transition attack). For each attack, it scans backward through the same team's touches, skipping `set`/`cover`, until it finds the nearest `receive` or `dig` — or stops with no entry if the nearest touch belongs to the opponent, or is something else entirely (e.g. a `freeball`).

This generalizes the receive-vs-dig distinction `classifyRallyPhase` already makes for a single attack (the last winning one) to every attack touch in the rally, independently. It powers the player-heatmap's **attack context** filter (`'all' | 'receive' | 'dig'`) in `ZoneDensityMode.tsx` — when active, only `attack` touches resolvable to the chosen context are shown; all non-attack touches and unresolvable attacks are excluded.

## Attack after Service Turn (`isAttackAfterDigKill`)

`isAttackAfterDigKill(rally)` is the dig-side mirror of `isFirstBallSideOutKill`: it returns `true` only when the literal **terminal touch of the rally** is an `attack` scored as a kill (`evaluation === '#'`) whose immediate same-team build-up (per `classifyAttackPrecedingContext`) was a `dig`. This is strictly narrower than the `attack_after_dig` phase, which only checks that the eventual rally winner's *last* attack was preceded by a dig — it does **not** require that attack to be the rally's actual terminal touch (the point could still be decided by a later block or opponent error). This distinction feeds the AST% metric in `situation-metrics.ts`, keeping AST and FBSO symmetric: both require the qualifying attack to close the rally immediately, differing only in whether the build-up was a reception or a dig.
