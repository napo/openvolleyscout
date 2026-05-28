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
    └── PlayerAnalyticsWidget.tsx          Individual player KPIs and team comparison
```

## Entry Points

The dashboard is accessible from three places — all expose it behind a "Performance Charts" tab, with "Match Report" as the default:

| Location | Stat scope |
|---|---|
| `AnalysisPage` (Match Statistics page) | Full match |
| `SetEndStage` (end of each set) | Current set only (`setStats`) |
| `MatchEndStage` (end of match) | Full match |

## Global Filters

All filters are applied in combination. Active filters are shown on a "Reset filters" button.

| Filter | Values | Effect |
|---|---|---|
| **Team** | All / Home / Away | Restricts data to one team |
| **Set** | All / 1 / 2 / … | Restricts to touches from that set; re-aggregates from raw rally touches |
| **Player** | All / individual players | Shows PlayerAnalyticsWidget for selected player |
| **Role** | All / setter / outside / middle / opposite / libero / DS | Restricts player-level data by role |
| **Source** | All / Explicit / Inferred | Splits explicit scout touches from auto-inferred ones |

When the set filter or source filter is active, skill stats are re-derived from raw `BallTouch` records in `rallyStats[].touches` rather than pre-aggregated totals. This is the only case where `aggregateSkillStatsFromTouches()` runs.

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

Appears at the top of the dashboard, above the existing evaluation/efficiency widgets.

Displays compact tiles for:
- Side-out efficiency (receiving team wins %)
- Break-point efficiency (serving team wins %)
- Counterattack efficiency
- Attack after receive quality
- Attack after dig quality
- Freeball situation efficiency

Each tile shows both teams with a bar and win% (`pointsWon / attempts`).

A set-trend table (SO% / BP% per set) appears when there is more than one set.

An informational banner shows the count of unclassified rallies when it is non-zero.

### Imported Data Behavior

Situation analytics work for both native OVS and imported DataVolley matches:
- Side-out / break-point metrics only require `servingTeam` and `pointWinner`.
- Sub-phases (`attack_after_receive`, etc.) require touch sequence data.
- Incomplete rallies are counted as `unknown` and surfaced in the widget.
- No crash or silent suppression for missing data.

See [rally-phase-classifier.md](rally-phase-classifier.md) for full classifier documentation.

## Non-Goals

The following remain out of scope:

- Court heatmaps (ball trajectory visualization) — classifier is heatmap-ready; touch metadata is preserved
- Momentum engine or win-probability charts
- A parallel stats computation system (always uses the existing `buildMatchStats()` engine)
