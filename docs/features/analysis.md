# Analysis Feature

## Purpose

The Analysis feature is intended to present derived statistics, summaries, and reports based on match and scouting data.

## Current Scope

Current implementation is minimal.

Implemented route:

- `src/features/analysis/pages/AnalysisPage.tsx`

Current behavior:

- render a placeholder page
- communicate that the area is reserved for future derived analysis

## In Progress

- there is no feature-specific analysis logic yet
- the route and page exist, but they are only a structural placeholder

## Planned

- derived statistics
- box score views
- reporting views
- analysis based on persisted scouting events once scouting persistence is integrated

## Domain Model

Current state: planned.

There is no dedicated analysis domain model yet. Future analysis work will likely depend on:

- `MatchProject`
- persisted scouting events
- team and player models

## UI Structure

Current files:

- `src/features/analysis/pages/AnalysisPage.tsx`
- `src/features/analysis/index.ts`
- `src/features/analysis/components/index.ts`
- `src/features/analysis/model/index.ts`

The page is intentionally minimal and should not be mistaken for a complete feature.

## Persistence

Current state: planned.

The Analysis feature does not own persistence yet. In the future it will likely read:

- persisted match projects
- persisted scouting events

It does not currently write any analysis-specific data.

## Constraints

- do not document or implement derived metrics as if they already exist
- future analysis work depends on stronger scouting persistence than currently available

## Notes for Codex

- treat Analysis as a placeholder feature until real derived models are introduced
- avoid inventing statistics pipelines that are not implemented
- when analysis work begins, start from domain input/output models rather than building calculations directly in page components
