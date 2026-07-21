# Trends

The **Trends** tab replaces the standalone "Similarity" tab on both `AnalysisPage` (single match) and `TeamAnalysisPage` (multi-match team study). It groups four related, longer-horizon views behind an inner sub-tab bar:

1. **Similarity** — the existing cross-database similarity feature, unchanged, now nested here.
2. **Season trend** — per-match indicator timeline for one team, plus a "latest match vs. season average" delta table.
3. **Competition comparison** — where a team ranks against other teams in the same competition, across the whole local match database.
4. **Rally model** — Markov-chain absorption probabilities: the probability a rally ends in a point for the team, estimated per game situation from historical touch sequences.

## Location

```
src/features/analytics/trends/
├── TrendsPanel.tsx                  Sub-tab container (Similarity / Season trend / Competition comparison / Rally model)
├── trends-panel.css
├── model/
│   ├── season-trend.ts             computeSeasonTrend, computeDeltaVsAverage
│   ├── competition-comparison.ts   listDistinctCompetitions, computeCompetitionComparison
│   ├── markov-chain-math.ts        invertMatrix, multiplyMatrix, rowSums (generic linear algebra, no domain imports)
│   └── markov-rally-model.ts       computeMarkovChain
└── widgets/
    ├── SeasonTrendPanel.tsx        Metric picker + line chart + delta table
    ├── CompetitionComparisonPanel.tsx  Competition picker + ranked table
    └── MarkovChainPanel.tsx        Side-out/break-point toggle + absorption-probability table
```

`src/features/teams/model/team-match-filter.ts` holds `filterMatchesForTeam()` / `getFocusTeamSide()`, the id-first / normalized-name-fallback team matching shared by `TeamAnalysisPage`, `AnalysisPage`, and the Trends models.

## Similarity (unchanged)

Similarity's comparison pool always stays the **whole local database** — only the highlighted subjects (via `SimilarityFocus`) change depending on which page/match/team is active. A player or team still needs at least 3 matches of history (`minSampleSize`) to be included in similarity scoring; the Trends tab surfaces a short explanatory note about this threshold so a missing player/team isn't mistaken for a bug.

## Season trend

For a single team, `computeSeasonTrend(matches, teamRef)` builds one `SeasonTrendPoint` per match (reusing `buildMatchStats` + `computeTeamRadarValues`, the same per-match radar snapshot used elsewhere), sorted chronologically. `computeDeltaVsAverage(trend)` compares the most recent point against the mean of all others, for every radar axis (serve/reception/attack efficiency, side-out %, break-point %, FBSO/MTRP/AST %, etc. — see [rally-phase-classifier.md](rally-phase-classifier.md) for the situation-phase metrics).

Which matches feed the chart differs by host page:

| Page | Matches used |
|---|---|
| `TeamAnalysisPage` | The page's own `selectedMatches` checkbox selection |
| `AnalysisPage` | Each side's (home/away) full match history, fetched independently — there's no match-selection UI on this page |

## Competition comparison

`computeCompetitionComparison(allMatches, competitionRef)` filters the whole database to matches sharing the same competition, then calls the existing `buildCrossDatabaseAggregation()` (unmodified) to get one aggregated snapshot per team. The UI ranks teams by a chosen metric and highlights the focus team's row with its rank (e.g. "3rd of 8").

This view is always computed over the **whole database**, independent of any match selection on the host page — a competition standing question isn't scoped to a subset of one team's own matches.

### Competition matching rule

A match belongs to a competition if either:

1. `metadata.competitionEntryId` matches the target competition's id (reliable, but only set by the manual match-setup wizard), **or**
2. Falling back to normalized (trimmed, lowercased) equality on the free-text `metadata.competition` string — this is the only signal available for DataVolley-imported matches, which never set `competitionEntryId`.

## Rally model (Markov absorption probabilities)

Models a rally as an absorbing Markov chain and computes, for each game situation ("state") the team's rallies pass through, the probability that the rally eventually ends in a point for that team — the standard method from Accornero et al., *A toolbox for volleyball data analytics*, Journal of Big Data 2025.

**State definition.** A state is one touch's `(skill, evaluation)` pair, using the exact DataVolley 6-symbol evaluation code (`# + ! / - =`) already shown everywhere else in OVS (e.g. "Reception -", "Attack #") — no coarser bucketing, so the vocabulary matches the match report and touch inspector exactly.

**Two independent chains, not one.** Rather than tag every state with "who's serving" (which would double the state space), rallies are split into two separate chains matching the SO%/BP% framing already used elsewhere in OVS ([rally-phase-classifier.md](rally-phase-classifier.md), `SituationMetricsWidget`):
- **Side-out chain** — rallies where the focus team receives (`rally.servingTeam !== focusSide`).
- **Break-point chain** — rallies where the focus team serves (`rally.servingTeam === focusSide`).

Within a chain, team identity doesn't need to be part of the state — it's already fixed by which chain it is and by the touch's position in the sequence. The two absorbing states are "point won" / "point lost", from `rally.pointWinner` vs. the focus side.

**Method.** `computeMarkovChain(matches, teamRef, kind)` (`markov-rally-model.ts`) walks each qualifying rally's touches (sorted by `sequenceNumber`), builds the discrete state path, and counts transitions (including the final transition into an absorbing state) across all rallies. The resulting transition matrix is split into **Q** (transient→transient) and **R** (transient→absorbing); the fundamental matrix **N = (I − Q)⁻¹** and **B = N·R** (`markov-chain-math.ts`, a small self-contained Gauss-Jordan inverter — no linear-algebra dependency in the repo) give, per state, the probability of eventual absorption into "point won". Row sums of **N** additionally give the expected number of remaining touches from that state.

**Sample-size gating**, mirroring the existing Similarity `minSampleWarning` pattern: a chain needs at least 15 total rallies to attempt computation (otherwise an "insufficient data" empty state is shown); within a computed chain, a state needs at least 5 observed occurrences to be included in the table (excluded states are counted and surfaced in a note, rather than silently dropped).

Reuses the same `matches` scope as Season Trend (host-page-provided — `selectedMatches` on `TeamAnalysisPage`, per-side full history on `AnalysisPage`), since it's inherently a per-team-history question, not a whole-database one like Competition Comparison.
