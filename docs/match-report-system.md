# Match Report System

OpenVolleyScout statistics are built from the same normalized touch stream used by rally replay. The match report is the primary statistics artifact: it renders one compact DataVolley-style tabellino for the home team and one for the away team, with evaluation charts available as an alternative view.

The Match Report uses the official set participation model described in
`docs/match-lineup-model.md`. Starter markers, entry markers, first-server
markers, and libero participation are read from set lineup snapshots and
team-scoped player participation, not from live tactical coordinates or visual
court side.

## volleyreport Reference

The report structure is derived from a direct reading of the open-source
[openvolley/volleyreport](https://github.com/openvolley/volleyreport) R project
(`style="ov1"`, `format="paged_pdf"`). The following R source files were inspected:

- `R/vr_match_summary.R` — main entry point, stat computation functions
- `R/content.R` — all section rendering functions
- `R/indicators.R` — efficiency formulas
- `inst/extdata/paged_pdf.Rmd` — paged PDF layout template
- `inst/extdata/html.Rmd` — HTML layout template (same structure)

**Report section order from the template (ov1, paged_pdf):**

1. Header 4-column row: match outcome | date/time | refs | partial scores (horizontal, sets as cols)
2. Home team player tabellino (full width)
3. Home team set summary (below player table)
4. Score evolution plot (ov1 only) — **deferred** in OVS (chart)
5. Visiting team player tabellino
6. Visiting team set summary
7. Footer: team-names row + [home pts-by-rot | attack/rec/trans tables | visiting pts-by-rot] + legend
   — pts-by-rot and attack/rec/trans **deferred** in OVS (require rotation tracking and rally-sequence data)

**Player tabellino columns (ov1, from `vr_content_team_table()`/ `vr_points()`/ `vr_serve()`/ `vr_reception()`/ `vr_attack()`/ `vr_block()`):**

| # | Player | C/L | Set 1..N | **Won** | Srv: Tot/Err/Ace/srvEff% | Rec: Tot/Err/Pos%/recEff% | Atk: Tot/Err/Blo/Kill/K%/attEff% | **Blk: Blo** |

Key differences from generic DataVolley layout:

- **No BP column** in player rows (ov1 drops it; `vr_points(style="ov1")` omits BP and W-L)
- **Won** instead of V-P (raw points won, not net)
- Reception: **Pos%** = (perfect+positive)/total; no separate # and + columns
- Attack: columns ordered Tot/Err/Blo/Kill/**K%**/attEff%
- Block: single **Blo** column (winning blocks only; `vr_block()` returns total winning blocks)

**Starter marker style (ov1, from `vr_content_team_table()`):**

- Non-captain starter: **dark background #444444** with white text
- Captain starter: **white background** with border and black text
- Substitute / libero: grey background, no label

OVS extends the ov1 convention with one additional rule:

- **Setter starter**: **light blue background (#eef5ff)** with OVS accent border (#0169D8) — overrides the dark starter background; captain override still applies on top if the setter is also captain

**Starter marker label — rotation position, not jersey number:**

The number shown in each starter box is the **starting rotation position** (1–6), not the player's jersey number. Jersey numbers range arbitrarily; rotation positions are always 1–6 and directly readable as zone indicators. The `MatchReportEntryMarker.label` field is set to `String(participation.startingRotationPosition)` inside `buildMatchEntryMarkers()`.

The OVS report adopts the **structure and statistics organization** from
volleyreport while preserving the full OVS visual identity, color palette,
typography, and UI design system. Do not copy the visual styling of volleyreport
directly; the report must feel native to OpenVolleyScout.

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
The report totals validator additionally checks rendered Won, Pos%, K%, visible
numeric columns, and recomputed percentage columns in the tabellino model.

## Report Structure

`buildDataVolleyMatchReport()` creates the shared report model used by both React rendering and HTML export.

The default report model contains:

- compact match header with teams, final result, set scores, durations, partial scores, and match info
- one home team tabellino table
- one away team tabellino table
- player rows with jersey, captain/libero markers, set-number participation columns, compact starter markers, compact empty entry/libero markers, **Won** (points won), serve (Tot/Err/Ace/srvEff%), receive (Tot/Err/Pos%/recEff%), attack (Tot/Err/Blo/Kill/K%/attEff%), and block (Blo)
- team total row inside the same team table
- **separate set summary section** per team below the player table (volleyreport ov1 `vr_content_team_set_summary()` structure), with columns:
  - Set label (number + score + duration)
  - Won group: Tot / Ser (aces) / Atk (attack kills) / Blo (block wins)
  - Op.Err (opponent errors = setScore − directPoints)
  - Serve group: Tot / Err / Ace / srvEff% / **BP%**
  - Reception group: Tot / Err / Pos% / recEff% / **SO%**
  - Attack group: Tot / Err / Blo / Kill / K% / attEff%
  - Block: Blo
  - Total row aggregating all sets (BP% and SO% shown as `-` for the total row)
- compact bottom summary tables for side-out/direct cambio palla, counterattack/contrattacco, receive points/punti CP, and serve break point/punti BP
- compact single-row footer branding with the OpenVolleyScout logo, version, repository URL, and free software line

### Set Summary Section

`TabellinoSetSummaryRow` carries the per-set computed fields:

- `directPoints` = `ser` + `atk` + `blo` (own winning touches)
- `ser` = aces
- `atk` = attack kills
- `blo` = block wins
- `opponentErrors` = `max(0, setScore − directPoints)`
- `breakPointRate` = BP% for the set from `buildSetMatchStats().breakPointStats`
- `sideOutRate` = SO% for the set from `buildSetMatchStats().sideOutStats`

`TabellinoTeamTable.setTotals` is an aggregated total row built by
`buildTabellinoSetTotals()`. BP% and SO% are `null` in the total row (displayed
as `-`) because aggregating percentages across sets requires attempt counts that
are not retained in the summary model.

Participation columns are set columns. The header group is labeled `Set`, and
each column header is the plain set number itself unless the team represented by
the table started that set serving. Serving-start set headers are circled. This
is computed independently for home and away tables from the set-start serving
team.

Starter markers use compact jersey-number rectangles captured from set-start
participation, following the volleyreport ov1 visual convention:

- Non-captain starters: **dark rectangle (#444444) with white text** (jersey number)
- Captain's starter: **white rectangle with black text** and a thin border

First-server identity is retained in the participation model, but the visible
report does not print extra first-server text.

Normal substitutions and libero participation render as one compact empty
rectangle per player per set. The visible report does not repeat entry
rectangles, does not show substituted-player numbers, and does not print `IN`,
`L`, `L2`, replacement text, exits, or return text in the participation cells.
The official participation model still keeps the full substitution and libero
history internally for validation and future exports.

## Default Report View and Alternative Performance Charts

The Match Report is the **default statistics view** in all three locations where
statistics are presented:

1. **End of set** (`SetEndStage`) — shown immediately when a set ends
2. **End of match** (`MatchEndStage`) — shown immediately when the match ends
3. **Match statistics page** (`AnalysisPage`) — shown when opening analysis

In each location a tab bar with two buttons appears above the content:

- **Match Report** (default, selected by default on mount)
- **Performance Charts** (alternative, shows evaluation charts)

The user switches between views by clicking these tab buttons. The tab state is
local to each stage component and does not persist across stages.

The Report tab renders `MatchReportTable` — the full DataVolley-style tabellino.
The Charts tab renders `SkillEvaluationDashboard` (in `SetEndStage` and
`AnalysisPage`) or `MatchStatsQuickReport` with embedded charts (in
`MatchEndStage`).

### CSS and accessibility

Tab buttons use `role="tablist"` / `role="tab"` / `role="tabpanel"` and
`aria-selected`. CSS class `.stats-view-tabs__tab--active` marks the active
tab. Styling uses OVS design tokens:

- `--color-primary` for active tab color and border
- `--color-primary-light` for tab bar underline and hover background
- `--color-text-secondary` for inactive tab text
- `--font-size-sm` / `--font-weight-semibold` for tab typography

Tabs are hidden via `display: none` inside `@media print` so the printed/exported
report contains only the Match Report content without UI chrome.

## Incremental End-of-Set Report

At the end of each set the Match Report is cumulative: it includes statistics
for all sets completed so far, not only the latest set.

- After set 1 ends: report shows set 1
- After set 2 ends: report shows set 1 + set 2
- After set 3 ends: report shows set 1 + set 2 + set 3
- etc.

`SetEndStage` receives two separate stats objects:

- `matchStats` — cumulative stats for all completed sets (passed to
  `MatchReportTable`)
- `setStats` — stats for the latest set only (passed to `SkillEvaluationDashboard`
  in the Performance Charts tab, so the operator can review per-set evaluation
  quality)

This allows the report to always give the full picture of the match so far
while the charts remain focused on the set just completed.

## Evaluation Charts

The evaluation charts (Performance Charts tab) are built from team evaluation
totals for:

- serve
- receive
- attack

Charts use lightweight Recharts stacked bars, OpenVolleyScout evaluation colors,
hover tooltips, and memoized row data. The downloadable report export
intentionally excludes charts.

The official tabellino remains distinct from analytics. Bottom summary blocks
are compact tables, not charts, and evaluation charts stay outside the
exportable report.

## OVS Branding Preservation

The Match Report visual identity uses OpenVolleyScout colors, not generic black/
white HTML tables or R Markdown aesthetics. OVS branding tokens applied in the
report:

- `--match-report-primary: #002554` (OVS logo navy — headers, separators, set indicators)
- `--match-report-accent: #0169D8` (OVS logo blue — accent borders and highlights)
- `--match-report-soft: #eef5ff` (OVS soft blue — table header backgrounds)
- `--match-report-border: #7f93b4` (OVS muted blue-grey — table cell borders)

Tab switcher tokens:

- `--color-primary`, `--color-primary-light`, `--color-text-secondary`
- `--font-size-sm`, `--font-weight-semibold`

The report remains readable in grayscale and still feels official rather than
dashboard-like.

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

## Future: Interactive Dashboard

The interactive analytics dashboard (detailed momentum analysis, per-rotation
heatmaps, serve zone efficiency, advanced tactical breakdowns) is scoped as a
**separate future step** and will be added in a dedicated phase.

For now, evaluation charts remain available behind the Performance Charts tab.
The Match Report tabellino remains the primary statistics artifact.
