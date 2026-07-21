# Performance Analytics Dashboard

The Performance Analytics Dashboard provides interactive, filterable charts for post-match and end-of-set analysis. It replaces the previous `SkillEvaluationDashboard` and `MatchStatsQuickReport` in the "Performance Charts" tab across all analysis entry points.

## Architecture

```
src/features/analytics/dashboard/
├── index.ts                        Entry point — exports PerformanceDashboard
├── PerformanceDashboard.tsx        Main component with FilterBar
├── performance-dashboard.css       OVS-token-based styles
├── filters/
│   └── dashboard-filters.ts        Filter types, defaults, helpers
├── selectors/
│   └── dashboard-selectors.ts      Data derivation from MatchStats + filters
├── metrics/
│   └── dashboard-metrics.ts        Efficiency, points/errors, per-set computations
├── validation/
│   └── dashboard-validation.ts     Consistency checks against match report totals
└── widgets/
    ├── EvaluationDistributionWidget.tsx   Stacked bar chart by skill
    ├── EfficiencyWidget.tsx               Serve/reception/attack/block efficiency bars
    ├── PointsErrorsWidget.tsx             Points vs errors per skill
    ├── PerformanceBySetWidget.tsx         Per-set performance table
    ├── PlayerAnalyticsWidget.tsx          Individual player KPIs and team comparison
    └── SituationMetricsWidget.tsx         Game-situation phase tiles (v2)

src/features/analytics/heatmaps/         Ball direction heatmap module (v3)
```

## Entry Points

The dashboard is accessible from three places — all expose it behind a "Performance Charts" tab, with "Match Report" as the default:

| Location | Stat scope |
|---|---|
| `AnalysisPage` (Match Statistics page) | Full match |
| `SetEndStage` (end of each set) | Current set only (`setStats`) |
| `MatchEndStage` (end of match) | Full match |

## Global Filters

All filters are applied in combination to **every** visible widget. Active filters are shown on a "Reset filters" button.

| Filter | Values | Effect |
|---|---|---|
| **Team** | All / Home / Away | Restricts data to one team. In heatmaps switches between one and two half-courts. |
| **Set** | All / 1 / 2 / … | Restricts to touches from that set; re-aggregates from raw rally touches. |
| **Player** | All / individual players | Shows `PlayerAnalyticsWidget` for selected player; also re-aggregates that player's stats filtered by set/phase/source. |
| **Role** | All / setter / outside / middle / opposite / libero / DS | Restricts player-level data by role (also propagates to heatmaps). |
| **Source** | All / Explicit / Inferred | Splits explicit scout touches from auto-inferred ones (also propagates to heatmaps). |
| **Rally phase** | All / break_point / point / transition_break_point / transition_point | Restricts touches by the touch-level tactical phase (`TouchPhase`, see [rally-phase-classifier.md](rally-phase-classifier.md)). `SituationMetricsWidget` uses its own whole-rally classification instead and does not respect this filter. |

### Re-aggregation rule

When **any** of set, source, rallyPhase, player, or role filters is active, skill stats are re-derived from raw `BallTouch` records via `aggregateSkillStatsFromTouches()`. Pre-aggregated `teamStats` totals are used only when all filters are at their "all" default.

### Two-team split

Most widgets always preserve home vs. away comparison even when filters are active. Data is grouped by team before displaying. Exception: if the team filter restricts to one side, only that side's data is shown.

### Performance by Set exception

`PerformanceBySetWidget` always shows every set as a row (the set axis is its purpose). It respects all other filters (team, player, role, source, rallyPhase) within each set's data. The global **set** filter is intentionally ignored by this widget so the per-set breakdown stays intact.

## Widgets

### Evaluation Distribution (`EvaluationDistributionWidget`)

Stacked horizontal bar chart per skill (serve, receive, attack, block), one bar per team in scope. Each segment maps to an OVS evaluation grade:

| Grade | Meaning | Color |
|---|---|---|
| `#` | Ace / Perfect | `#16a34a` |
| `+` | Positive | `#22c55e` |
| `!` | Over-positive | `#a3e635` |
| `-` | Negative | `#eab308` |
| `/` | Error opportunity | `#f97316` |
| `=` | Error | `#dc2626` |

Uses the same Recharts stacked `BarChart` pattern as the existing `SkillEvaluationDashboard`.

### Efficiency (`EfficiencyWidget`)

Horizontal progress bars for serve, reception, attack, and block efficiency per team. Color is derived from `getEfficiencyColor()`:

| Threshold | Color |
|---|---|
| ≥ 0.30 | `#16a34a` (green) |
| ≥ 0.10 | `#22c55e` |
| ≥ 0.00 | `#eab308` (yellow) |
| ≥ −0.10 | `#f97316` (orange) |
| < −0.10 | `#dc2626` (red) |

### Points & Errors (`PointsErrorsWidget`)

Side-by-side bars for points (green `#16a34a`) and errors (red `#dc2626`) per skill.

### Performance by Set (`PerformanceBySetWidget`)

Table with one row per set: score, aces, attack points, block points, and errors (serve / reception / attack) for each team. A totals row appears in `<tfoot>` when there is more than one set.

### Player Analytics (`PlayerAnalyticsWidget`)

Appears only when a specific player is selected in the player filter. Shows:
- Player badge (jersey number, name, team, role chip)
- KPI blocks: total points, errors, touches
- Per-skill panels (serve, reception, attack, block) — hidden when a skill has zero touches
- Player vs. team comparison: player value / team total with percentage

## Data Flow

```
MatchStats (pre-aggregated)
  │
  ├─ filters.set === 'all' && filters.source === 'all'
  │    └─ use teamStats / playerStats directly
  │
  └─ set or source filter active
       └─ getFilteredTouches(stats, filters)
            └─ aggregateSkillStatsFromTouches(touches, teamSide, skill)
```

The dashboard never calls `buildMatchStats()` itself — it always receives a fully-built `MatchStats` object from its parent.

## Validation

`dashboard-validation.ts` provides sanity-check helpers (used in tests and optionally in dev tooling):

- `validateDashboardFilteredTotals` — checks that filtered skill totals add up correctly
- `validatePlayerVsTeamConsistency` — verifies a player's touches are a subset of team totals
- `validateInferredExplicitBalance` — checks explicit + inferred = total for each skill
- `isDashboardConsistentWithMatchReport` — top-level boolean for quick consistency gate

## Styling

All structural colors come from OVS CSS custom properties (`var(--color-primary)`, `var(--color-surface)`, `var(--color-text-primary)`, etc.). The three OVS semantic colors are used directly as hex values only for data visualization:

- `#16a34a` — positive / ace / high efficiency
- `#eab308` / `#f97316` — medium performance
- `#dc2626` — error / low efficiency

The dashboard layout is responsive:
- Evaluation grid: 4-col → 2-col (≤ 900 px) → 1-col (≤ 600 px)
- Efficiency / Points-Errors grids: 2-col → 1-col (≤ 900 px)

Card entrance animation (`@keyframes perf-card-in`) is disabled when `prefers-reduced-motion: reduce` is set.

## Game Situation Analytics (v2)

Added in v2. Located at:

```
src/features/analytics/rally-phase/           # classifier
src/features/analytics/dashboard/situation/   # metrics engine
src/features/analytics/dashboard/widgets/SituationMetricsWidget.tsx
```

### Rally Phase Filter

A new **Phase** filter in the filter bar restricts all existing widgets to touches from rallies matching a given phase:

| Filter value | Matches |
|---|---|
| `all` | No restriction |
| `side_out` | All rallies where the receiving team wins |
| `break_point` | All rallies where the serving team wins |
| `counterattack` | Only `counterattack`-classified rallies |
| `attack_after_receive` | Only those specific rallies |
| `attack_after_dig` | Only those specific rallies |
| `freeball` | Only freeball rallies |
| `unknown` | Only unclassifiable rallies |

### Situation Metrics Widget (`SituationMetricsWidget`)

Appears at the top of the dashboard, above the existing evaluation/efficiency widgets. A "Metrics glossary" link in the section header opens `/metrics-glossary`, a dedicated page defining every abbreviation used here.

Displays compact tiles for:
- Side-out efficiency (receiving team wins %)
- Break-point efficiency (serving team wins %)
- Counterattack efficiency
- Attack after receive (K1) quality
- **AST** — Attack after Service Turn: strict transition-attack-after-dig kill rate (`isAttackAfterDigKill`), symmetric to FBSO — the attack must be the rally's literal terminal touch, scored as a kill. A separate, narrower field (`attackAfterDigKill`) from the broader `attack_after_dig` phase bucket, which is still used as-is by `PlayerSituationMetricsWidget`'s "Attack after dig" contribution row.
- Freeball situation efficiency
- **Transition · BP** / **Transition · CP** — `transition_attack` rallies split by whether the team was serving or receiving (derived accumulation over `classifyRallyPhase`, not a new `RallyPhase` value)
- **FBSO** — First Ball Side-Out: strict first-ball kill rate over total receptions (`isFirstBallSideOutKill`), with an **FBSO Share** footnote (`FBSO% / Side-out%`) and a ⚠ warning above 55% (over-reliance on the first ball, per the NCAA analytics literature this feature was inspired by)
- **MTRP** — Make Them Play: rate at which a reception led to an attempted first-ball attack (`attack_after_receive.attempts / sideOut.attempts`)
- **CP length** / **BP length** — average number of attack exchanges (`countRallyExchanges()` in `rally-exchange-metrics.ts`) needed to close a side-out vs. break-point point, alongside the point volume for each phase

Abbreviation tiles use a native `<abbr title="...">` for hover tooltips (no custom tooltip component).

Each phase tile shows both teams with a bar and win% (`pointsWon / attempts`).

A set-trend table (SO% / BP% per set) appears when there is more than one set.

An informational banner shows the count of unclassified rallies when it is non-zero.

### Imported Data Behavior

Situation analytics work for both native OVS and imported DataVolley matches:
- Side-out / break-point metrics only require `servingTeam` and `pointWinner`.
- Sub-phases (`attack_after_receive`, etc.) require touch sequence data.
- Incomplete rallies are counted as `unknown` and surfaced in the widget.
- No crash or silent suppression for missing data.

See [rally-phase-classifier.md](rally-phase-classifier.md) for full classifier documentation.

## Ball Direction Heatmaps (v3+)

Located at `src/features/analytics/heatmaps/`. Visualizes ball direction data extracted from `BallTouch.ballDirection` (live scouting) or zone references (DataVolley imports).

### Rendering Modes

| Mode | Purpose | Layout | Filters |
|---|---|---|---|
| **Density** | Event frequency heatmap | Half-court | All dashboard filters |
| **Zone Density** | Volleyball zone (1-9) specific analysis | 6×6 zone grid | team, player, skill, evaluation |
| **Direction** | Attack/receive trajectory arrows | Full court | All dashboard filters |
| **Point** | Event location clusters | Half-court | Planned |

**Zone Density Mode** is optimized for DataVolley imports where trajectory data is zone-based (1-9). Other modes work with both live scouting (precise coordinates) and imported data (synthesized from zones).

### Filter Propagation

- **Density, Direction modes**: Respect all dashboard filters (team, set, player, role, source, rally phase)
- **Zone Density mode**: Currently supports team, player, skill, evaluation only. Filters set, role, source, rallyPhase are **not yet implemented**

### Local Controls

Each heatmap adds widget-local selectors for:
- Skill: all / serve / receive / attack / block / dig / freeball
- Mode: density / zone density / point / direction
- Endpoint (point/density modes only): landing / origin

A diagnostics footer shows data coverage and inferred direction count.

See [heatmaps.md](heatmaps.md) for full technical documentation.

## Metrics Glossary

`src/features/analytics/glossary/MetricsGlossaryPage.tsx`, routed at `/metrics-glossary`. A definitions list (`<dl>`) covering every situation-analytics metric (side-out, break-point, counterattack, K1, AST, freeball, the two transition sub-phases, FBSO, FBSO Share, MTRP, CP/BP length), each with its formula and a one-sentence explanation. Linked from `AboutPage.tsx` and from the dashboard's Situation Analytics section header. Not a general docs renderer — content is hand-authored via i18n keys (`glossary*`), not pulled from these markdown files.

## Match Report Additions

The match report's bottom-summary blocks (`buildBottomSummaryBlocks()` in `match-report.ts`) reuse `computeSituationMetrics()` to add three blocks alongside the existing 4 (`side_out_direct`, `counterattack`, `receive_points`, `serve_break_point`): `fbso`, `mtrp`, `ast`. A separate `phaseVolume` field (not part of `bottomSummaryBlocks`) reports each team's side-out/break-point point counts plus average CP/BP length (`computeRallyExchangeStats()`), rendered as its own table in both the on-screen `MatchReportTable` and the print/PNG HTML export.

## Non-Goals

The following remain out of scope:

- Momentum engine or win-probability charts
- A parallel stats computation system (always uses the existing `buildMatchStats()` engine)
