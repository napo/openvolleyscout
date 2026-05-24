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
- `validateMatchReportTotals()`

These validate serve, receive, attack, block, dig, set, freeball, and cover totals across team tables, player rows, and evaluation charts.
The report totals validator additionally checks rendered BP, V-P, visible
numeric columns, and recomputed percentage columns in the tabellino model.

## Report Structure

`buildDataVolleyMatchReport()` creates the shared report model used by both React rendering and HTML export.

The default report model contains:

- compact match header with teams, final result, set scores, durations, partial scores, and match info
- one home team tabellino table
- one away team tabellino table
- player rows with jersey, captain/libero markers, set-number participation columns, compact starter markers, compact empty entry/libero markers, BP, V-P, serve, receive, attack, and block
- team total rows inside the same team table
- set summary rows inside the same team table
- compact bottom summary tables for side-out/direct cambio palla, counterattack/contrattacco, receive points/punti CP, and serve break point/punti BP
- compact single-row footer branding with the OpenVolleyScout logo, version, repository URL, and free software line

Participation columns are set columns. The header group is labeled `Set`, and
each column header is the plain set number itself unless the team represented by
the table started that set serving. Serving-start set headers are circled. This
is computed independently for home and away tables from the set-start serving
team.

Starter markers use compact jersey-number rectangles captured from set-start
participation. The captain's starter marker is a white rectangle with black text
and a thin border. Other starter markers are grey rectangles with black text.
First-server identity is retained in the participation model, but the visible
report does not print extra first-server text.

Normal substitutions and libero participation render as one compact empty
rectangle per player per set. The visible report does not repeat entry
rectangles, does not show substituted-player numbers, and does not print `IN`,
`L`, `L2`, replacement text, exits, or return text in the participation cells.
The official participation model still keeps the full substitution and libero
history internally for validation and future exports.

## Evaluation Charts

The analysis page renders the report first and evaluation charts second. Charts are built from team evaluation totals for:

- serve
- receive
- attack

Charts use lightweight Recharts stacked bars, OpenVolleyScout evaluation colors, hover tooltips, and memoized row data. The downloadable report export intentionally excludes charts.

The official tabellino remains distinct from analytics. Bottom summary blocks
are compact tables, not charts, and evaluation charts stay outside the
exportable report.

## Export Architecture

`buildMatchReportHtml()` returns a standalone print-ready HTML document with inline A4 portrait print styles. This is the browser print/PDF template and is not a print-page capture of the app UI.

The analysis page opens this standalone report in a new printable page instead
of downloading raw HTML. The printable template uses A4 portrait page settings
with a 10 mm print margin on every side:

`@page { size: A4 portrait; margin: 10mm; }`

The standalone document keeps the page body at `width: 210mm` and
`min-height: 297mm` so the layout has A4 proportions without forcing a fixed
height that could clip longer reports.

The export includes:

- compact report header
- exactly one report table per team
- set-number participation columns with serving-team circled indicators
- team total and set summary rows inside each team table
- compact bottom summary tables
- compact left-aligned footer branding on one row: `OpenVolleyScout vX.Y.Z - https://github.com/napo/openvolleyscout - Free Software scouting system by napo`, with the version read from the shared app metadata
- a small grayscale-friendly OpenVolleyScout SVG logo before the footer text
- no charts
- no default dig, set, freeball, or cover sections

The analysis page also exposes a high-resolution PNG export. The PNG is built
client-side from the same standalone match report model and inline print styles,
not from a scrolling screenshot of the app. It exports only the match report:
no app chrome, no analysis charts, no live scouting controls.

PNG export targets A4 portrait at 300 DPI:

`2480 x 3508 px`

The PNG workflow preserves OpenVolleyScout styling, the footer/logo,
participation markers, table borders, and the compact DataVolley layout. The
report is scaled into the target image so it remains practical for smartphone
reading and easy sharing on WhatsApp, Telegram, and post-match social channels.

PDF remains optional through the browser print/save-as-PDF flow. Future PDF work
can replace the standalone printable-page transport with a renderer pipeline
while keeping the same report model.

The printable page title and default PDF filename follow the official match
summary format:

`Home Team - Guest Team 3-2 (25-23, 21-25, 25-22, 19-25, 15-12)`

`createMatchReportPrintTitle()` builds the title from the home team, guest team,
sets won, and ordered set scores. `createMatchReportFilename()` sanitizes
invalid filename characters and appends the export extension. Printable PDF and
PNG exports reuse this filename convention, changing only the extension.

The printable layout is optimized for A4 portrait density. Fonts, paddings,
marker sizes, borders, and summary blocks are intentionally compact and
monochrome-friendly so a full match tabellino can fit on one page whenever the
roster size and number of completed sets make that reasonable. The report avoids
dashboard/card spacing and preserves a print-oriented DataVolley-style table
appearance. The high-resolution PNG uses the same compact visual system and
fills the portrait page naturally while respecting the intended margins.

OpenVolleyScout visual identity is applied through restrained primary and
accent colors from the logo (`#002554` and `#0169D8`) on headers, separators,
set indicators, and table highlights. The color usage is deliberately modest so
the tabellino remains readable in grayscale and still feels official rather than
dashboard-like.

## Set Phase Splits

`buildSetPhaseSplits()` prepares future analytics buckets:

- sets with more than 15 total points use 3 phases
- sets with 15 or fewer total points use 2 phases

The helper is intentionally model-only for now; no momentum UI is rendered yet.
