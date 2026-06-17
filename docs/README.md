# Documentation Index

This documentation describes the current codebase. Planned work is called out
explicitly and should not be read as implemented behavior.

## Core Documentation

- [Architecture](architecture.md) - application composition, routing, state flow,
  feature boundaries, analysis/video flows, and aggregation model.
- [Code Structure](code-structure.md) - folder layout and where new code belongs.
- [Data Model](data-model.md) - persisted aggregates, runtime state, events, and
  derived statistics, video analysis metadata, and aggregated team analysis.
- [Domain Model](domain-model.md) - core volleyball entities and relationships.
- [Persistence](persistence.md) - IndexedDB, localStorage, storage modules, and
  repository wrappers.
- [Scouting Architecture](scouting.md) - event-sourced scouting workflow,
  replay, persistence, and live-court flow.
- [Live Scouting Architecture](live-scouting-architecture.md) - tactical flow,
  rally flow, popup positioning, animation helpers, and court rendering split.
- [Tactical Systems](systems.md) - defense-system editor state and the
  position-based tactical-system model.
- [Developer Guidelines](developer-guidelines.md) - conventions, validation,
  manual checks, and current technical debt.

## User Documentation

- [User Guide](user-guide.md) - Italian user-facing guide for teams, match setup,
  scouting, DataVolley import/export, reports, video analysis, and team data
  study workflows.

## Feature Notes

- [Analysis](features/analysis.md) - match reports, dashboards, side-out study,
  heatmaps, video analysis, and multi-match team analysis.
- [Match](features/match.md) - match setup and project creation.
- [Scouting](features/scouting.md) - live scouting workflow and event
  persistence.
- [Systems](features/systems.md) - reception and defense tactical-system
  editors.
- [Teams](features/teams.md) - local team archive, roster import/export, and
  team-level analysis entry point.

## Additional Notes

- [Team Archive Architecture](TEAM_ARCHIVE_ARCHITECTURE.md)
