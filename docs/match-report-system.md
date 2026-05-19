# Match Report System

OpenVolleyScout statistics are built from the same normalized touch stream used by rally replay. The match report is the primary statistics artifact: each set renders a home team table first, an away team table second, and evaluation charts after the report in the analysis page.

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

For every set, the model contains:

- set score and duration
- phase splits for future momentum analytics
- home team table
- away team table
- player rows with jersey, name, starter/entry marker, libero visibility, skill totals, and efficiency metrics
- team total rows

Starter markers use the starting rotation position (`S1` through `S6`). Substitutions use `IN`. Libero rows expose replacement visibility through the report model so PDF and future exports can render replacement detail.

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
- per-set home and away tables
- pagination-safe table sections
- no charts

Future PDF work can replace the HTML download transport with a renderer pipeline while keeping the same report model.

## Set Phase Splits

`buildSetPhaseSplits()` prepares future analytics buckets:

- sets with more than 15 total points use 3 phases
- sets with 15 or fewer total points use 2 phases

The helper is intentionally model-only for now; no momentum UI is rendered yet.
