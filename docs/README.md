# Documentation Index

This documentation describes the current codebase. Planned work is called out
explicitly and should not be read as implemented behavior. For what the app
does and how to get it, start from the [project README](../README.md).

## For users

- [User guide](user-guide.md) (Italian) - teams, match setup, scouting,
  DataVolley import/export, reports, video analysis and team data study.
- [Scouting guide](scouting-guide.md) ([Italiano](scouting-guide_it.md)) - the
  live scouting flow, touch by touch.
- Tutorials (getting started, scouting, video and sharing, tactical report) are
  slide shows inside the app, under About → Tutorials; their screenshots are in
  `public/tutorials/` and are taken by `tools/docs-screenshots`.
- [Privacy policy](../public/privacy.html), published at
  <https://scout.volleyserve.it/privacy.html>.

## Architecture and data

- [Architecture](architecture.md) - application composition, routing, state flow,
  feature boundaries, analysis/video flows and aggregation model.
- [Code structure](code-structure.md) - folder layout and where new code belongs.
- [Data model](data-model.md) - persisted aggregates, runtime state, events,
  derived statistics, video analysis metadata and aggregated team analysis.
- [Domain model](domain-model.md) - core volleyball entities and relationships.
- [Persistence](persistence.md) - IndexedDB schema (version 8), localStorage,
  storage modules and repository wrappers.
- [Match data migrations](match-migrations.md) - adding a versioned migration.
- [Team archive architecture](TEAM_ARCHIVE_ARCHITECTURE.md)
- [Developer guidelines](developer-guidelines.md) - conventions, validation,
  manual checks and current technical debt.

## Sync and sharing

- [Cloud synchronisation](cloud-sync.md) - Google Drive, OneDrive and Dropbox:
  storage model, 3-way merge, one scout per match, OAuth setup per platform.
- [Shared statistics links](shared-stats-link.md) - link format and social preview.

## Scouting

- [Scouting architecture](scouting.md) - event-sourced workflow, replay,
  persistence and live-court flow.
- [Live scouting architecture](live-scouting-architecture.md) - tactical flow,
  rally flow, popup positioning, animation helpers and court rendering.
- [Live scouting workflow](scouting-workflow.md) and
  [serve reception workflow](serve-reception-workflow.md)
- [Quick scout flow design](quick-scout-flow-design.md)
- [Scouting page structure](scouting-page-structure.md)
- [Live trajectory system](live-trajectory-system.md) and
  [cone-to-subzone mapping](cone-to-subzone-mapping.md)
- [Match lineup model](match-lineup-model.md) and [libero rules](libero-rules.md)
- [Undo system](undo-system.md)
- [Advanced scouting metadata tagging](advanced-tagging.md)

## Analysis

- [Match report system](match-report-system.md)
- [Performance dashboard](performance-dashboard.md) and
  [analytics engine](analytics-engine.md)
- [Rally phase classifier](rally-phase-classifier.md)
- [Heatmaps and spatial analysis](heatmaps.md)
- [Play-by-play](play-by-play.md)
- [Trends](trends.md)

## Tactical systems

- [Tactical systems](systems.md) - reception and defense editors and the
  position-based system model.
- [Tactical invariants](tactical-invariants.md) and
  [tactical auto-layout](tactical-auto-layout.md)

## Import and export

- [DataVolley import](datavolley-import.md), [DataVolley export](datavolley-export.md)
  and [advanced DataVolley details](advanced-datavolley-details.md)
- [Tiebreak Tech export](tiebreak-export.md) and its
  [verification guide](tiebreak-export-check.md)
- [Roster import](roster-import.md) and [roster export](roster-export.md)

## Feature notes

- [Analysis](features/analysis.md), [Match](features/match.md),
  [Scouting](features/scouting.md), [Systems](features/systems.md),
  [Teams](features/teams.md)

## Manual checks

- [Device checklist](qa/device-checklist.md)
- [Live scouting browser checklist](qa/live-scouting-browser-checklist.md)
- [Tactical report workflow](qa/tactical-report-workflow.md)
- [Team library workflow](qa/team-library-workflow.md)

## Images

- `images/` - screenshots used by the README, taken from the app with the demo
  match by `tools/docs-screenshots/capture-docs.mjs`.
- `reference/` - reference pictures for the match report layout.
- `issue-8-scouting-landscape-optimization.md` - historical notes on the
  smartphone landscape layout.
