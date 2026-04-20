# Teams Feature

## Purpose

The Teams feature manages the local archive of volleyball teams and their rosters. It is the source of reusable team data that later feeds match setup and scouting workflows.

## Current Scope

Implemented in `src/features/teams/pages/TeamsPage.tsx`.

Current responsibilities:

- list archived teams
- create a new archived team
- edit team name and staff
- add, update, and delete archived players
- delete archived teams
- keep the editor synchronized with the latest persisted archived roster

## In Progress

- the feature currently relies on one large page component with a lot of orchestration logic
- the page mixes editor state, persistence calls, and refresh behavior more than ideal

## Planned

- richer archive browsing and search UX
- historical roster browsing beyond “latest roster”
- stronger separation between page orchestration and editor sections

## Domain Model

Main domain models:

- `ArchivedTeam` in `src/domain/team/types.ts`
- `ArchivedRoster` in `src/domain/team/types.ts`
- `ArchivedPlayer` in `src/domain/team/types.ts`
- `TeamStaff` in `src/domain/roster/types.ts`

Important distinction:

- `ArchivedTeam` holds team metadata and roster references
- `ArchivedRoster` holds the actual list of archived players

This allows the archive model to support historical rosters over time, even though the current UI mostly works with the latest roster only.

## UI Structure

Current UI is centered in one route component:

- `src/features/teams/pages/TeamsPage.tsx`

The page contains:

- a sidebar with archived teams
- a main editor for team metadata
- an embedded roster table/editor

There is no separate `components/` folder for Teams yet. This is functional, but it is also one of the larger UI modules in the codebase.

## Persistence

Persistence is implemented through:

- `src/infrastructure/storage/archived-team-storage.ts`

The feature uses:

- `getAllArchivedTeams()`
- `getTeamRecord()`
- `createTeam()`
- `updateTeam()`
- `addPlayerToTeam()`
- `updatePlayer()`
- `deletePlayer()`
- `deleteTeam()`

The exported `teamRepository` exists in the storage module, but the feature mostly imports storage functions directly.

## Constraints

- archive data is local-only
- the feature depends on IndexedDB through Dexie
- UI refresh after writes is explicit and must stay in sync with storage
- the current page is already fairly large, so new behavior should prefer extraction over further expansion

## Notes for Codex

- treat Teams as archive management, not match runtime state
- prefer adding pure transformations to `src/domain/` or `src/lib/` instead of expanding the page component
- if persistence changes are needed, add them in `src/infrastructure/storage/archived-team-storage.ts`
- if you introduce new team-editing UI, consider extracting dedicated components from `TeamsPage.tsx`
