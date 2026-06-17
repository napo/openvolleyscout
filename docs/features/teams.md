# Teams Feature

## Purpose

The Teams feature manages the local archive of volleyball teams and rosters.
Archived team data is reused during match setup, where it is copied into
match-specific team selections. It also provides the entry point for multi-match
team analysis.

## Current Scope

Implemented in:

- `src/features/teams/pages/TeamsPage.tsx`
- `src/features/teams/pages/TeamAnalysisPage.tsx`
- `src/features/teams/model/aggregated-stats.ts`

Current responsibilities:

- list archived teams
- create new teams
- edit team name and staff
- add, update, and delete archived players
- import rosters from OVS JSON or CSV
- export one team or all teams as roster files
- generate a random test roster from the default roster helper
- delete archived teams
- keep the editor synchronized with persisted data after writes
- open team data study for saved matches involving a team

## UI Structure

The feature is currently page-centered. There is no dedicated
`features/teams/components/` folder yet.

`TeamsPage.tsx` contains:

- team list/sidebar state
- editor form state
- player table/editing behavior
- validation
- persistence calls
- status messages
- roster import/export modal orchestration

This works, but it is one of the larger page files in the project.

`TeamAnalysisPage.tsx` is a separate route-level workflow. It receives a team id
or team name through navigation state, lists saved matches for that team, lets
the user choose matches, and then renders aggregated dashboards and video
analysis.

## Domain Model

Important models:

- `ArchivedTeam`
- `ArchivedRoster`
- `ArchivedPlayer`
- `TeamStaff`

Important helpers:

- `createEmptyArchivedTeam()`
- `createEmptyArchivedRoster()`
- `createArchivedPlayer()`
- `generatePlayerCode()`
- `generateTeamCode()`

## Persistence

The page uses:

- `teamRepository`
- roster import/export helpers under `src/features/import/rosters/` and
  `src/features/export/rosters/`

Repository methods used by the feature include:

- `list()`
- `getById()`
- `create()`
- `update()`
- `delete()`
- `addPlayer()`
- `updatePlayer()`
- `deletePlayer()`

The underlying storage module is:

- `src/infrastructure/storage/archived-team-storage.ts`

Team deletion removes associated roster records in an IndexedDB transaction.
Missing team codes are generated and backfilled when archive records are read.

## Team Analysis

Team analysis reads saved match projects through `matchRepository`, not through
the team archive. The archive team id or name is used only to find matching
projects.

`buildAggregatedTeamMatchStats()` combines selected matches into a single
`MatchStats` object:

- the selected team is normalized to `home`
- all opponents are combined as `away`
- focus-team player stats are accumulated by player id
- rallies are side-normalized so existing dashboard filters still work
- set stats are synthetic buckets by set number across selected matches

The resulting aggregate is rendered by the same analysis widgets used by a
single match, plus `MultiVideoAnalysisPanel` for focus-team video review across
the selected matches.

## Validation

Current form validation checks:

- team name is required
- player jersey number is required and positive
- player first name is required
- player last name is required

## Constraints

- Archive data is local-only.
- UI refresh after writes is explicit.
- Do not bypass `teamRepository` from feature code.
- Treat archived rosters as reusable source data, not active match state.
- Treat team analysis data as derived from saved match projects, not as new
  persisted team-level statistics.

## Current Gaps

- The page mixes orchestration, form state, validation, and persistence calls.
- Historical roster browsing is modeled but not exposed as a full UI workflow.
- Search/browse UX is still basic.
- Team analysis is opened from navigation state; there is no standalone team
  picker on `#/team-analysis` yet.
