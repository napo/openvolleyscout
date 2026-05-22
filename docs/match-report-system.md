# Match Report System

OpenVolleyScout statistics are built from the same normalized touch stream used by rally replay. The match report is the primary statistics artifact: it renders one compact DataVolley-style tabellino for the home team and one for the away team, with evaluation charts kept outside the exportable report.

The Match Report uses the official set participation model described in
`docs/match-lineup-model.md`. Starter markers, entry markers, first-server
markers, and libero participation are read from set lineup snapshots and
team-scoped player participation, not from live tactical coordinates or visual
court side.

## Aggregation Rules

- Official stats are built from touch events, committed touches, current rally touches, and replayed live match touches.
- Touches are deduplicated by id first, then by semantic rally position so replay or mixed feeds do not count the same inferred touch twice.
- If an explicit touch replaces an inferred touch in the same set, rally, team side, and sequence number, the inferred touch is removed from aggregation.
- Touches without a player id are attributed to a stable per-team unassigned row. This keeps team totals equal to the sum of player rows while preserving inferred/simple-mode data.
- Illegal libero touches are excluded before aggregation.

## Ace And Reception Linkage

A serve evaluated `#` always contributes:

- serve `#`
- server ace
- server point
- linked receiving-team receive `=`
- linked reception error

Modern live scouting records the receive `=` through ace-victim selection. For legacy or partial data that only contains the serve ace, the stats normalizer creates a synthetic linked receive `=` for the receiving side and attributes it to the unassigned receiver row. If the linked receive already exists, it is not duplicated.

## Integrity Helpers

The stats model exposes helpers for regression checks and future import validation:

- `aggregateSkillEvaluationTotals()`
- `validateTeamTotals()`
- `validatePlayerSkillTotals()`
- `validateAceReceptionConsistency()`
- `validateStatsIntegrity()`

These validate serve, receive, attack, block, dig, set, freeball, and cover totals across team tables, player rows, and evaluation charts.

## Report Structure

`buildDataVolleyMatchReport()` creates the shared report model used by both React rendering and HTML export.

The default report model contains:

- compact match header with teams, final result, set scores, durations, partial scores, and match info
- one home team tabellino table
- one away team tabellino table
- player rows with jersey, captain/libero markers, boxed starter markers, compact empty entry/libero markers, BP, V-P, serve, receive, attack, and block
- team total rows inside the same team table
- set summary rows inside the same team table

Starter markers use boxed starting rotation positions captured at set start,
with a white box reserved for the setter's initial position and grey boxes for
the other starters. The first server marker is attached to the rotation 1
starter for the set's configured serving team. Normal substitutions and libero
entries render as compact empty rectangles in the participation cell. Libero
rows expose replacement history, including exits and second-libero swaps,
without counting libero replacements as normal substitutions.

## Evaluation Charts

The analysis page renders the report first and evaluation charts second. Charts are built from team evaluation totals for:

- serve
- receive
- attack

Charts use lightweight Recharts stacked bars, OpenVolleyScout evaluation colors, hover tooltips, and memoized row data. The downloadable report export intentionally excludes charts.

## Export Architecture

`buildMatchReportHtml()` returns a self-contained HTML document with inline A4 print styles. This is the PDF-ready template and is not a print-page capture of the app UI.

The export includes:

- compact report header
- exactly one report table per team
- team total and set summary rows inside each team table
- no charts
- no default dig, set, freeball, or cover sections

Future PDF work can replace the HTML download transport with a renderer pipeline while keeping the same report model.

## Set Phase Splits

`buildSetPhaseSplits()` prepares future analytics buckets:

- sets with more than 15 total points use 3 phases
- sets with 15 or fewer total points use 2 phases

The helper is intentionally model-only for now; no momentum UI is rendered yet.
