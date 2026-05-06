# Teams Feature

## Purpose

The Teams feature manages the local archive of volleyball teams and rosters.
Archived team data is reused during match setup, where it is copied into
match-specific team selections.

## Current Scope

Implemented in:

- `src/features/teams/pages/TeamsPage.tsx`

Current responsibilities:

- list archived teams
- create new teams
- edit team name and staff
- add, update, and delete archived players
- generate a random test roster from the default roster helper
- delete archived teams
- keep the editor synchronized with persisted data after writes

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

This works, but it is one of the larger page files in the project.

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

## Current Gaps

- The page mixes orchestration, form state, validation, and persistence calls.
- Historical roster browsing is modeled but not exposed as a full UI workflow.
- Search/browse UX is still basic.
