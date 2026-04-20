# Persistence Layer

## Overview

The persistence layer lives under `src/infrastructure/` and is currently centered around a single local Dexie database backed by IndexedDB.

The app also includes a development-only reset helper that clears browser storage, but most application data is stored in IndexedDB rather than `localStorage`.

## Local Storage Strategy

### IndexedDB

Primary persistence is implemented with Dexie in:

- `src/infrastructure/db/match-project-db.ts`

The database name is:

- `OpenVolleyScoutDatabase`

Current tables:

- `matchProjects`
- `archivedTeams`
- `archivedRosters`
- `archivedCompetitions`

### localStorage / sessionStorage

These are not part of the normal application persistence flow.

Current actual usage:

- `reset-local-data.ts` clears `window.localStorage` and `window.sessionStorage`

There is no general-purpose state persistence currently implemented through `localStorage`, and locale selection is not persisted yet.

## Database Schema

Defined in `MatchProjectDatabase`:

- `matchProjects: 'metadata.id, updatedAt'`
- `archivedTeams: 'id, name, updatedAt'`
- `archivedRosters: 'id, teamId'`
- `archivedCompetitions: 'id, name, updatedAt'`

This schema shows that the app currently persists:

- match projects
- archived teams and their rosters
- archived competition names

It does not yet persist:

- scouting live session state as a separate store
- tactical systems

## Repository and Storage Modules

### `matchRepository`

Defined in `src/infrastructure/storage/match-project-storage.ts`.

Current operations:

- create
- update
- delete
- get by id
- get latest
- get all

This is the closest thing to a formal repository abstraction in the project today.

### `teamRepository`

Defined in `src/infrastructure/storage/archived-team-storage.ts`.

Current operations include:

- create team
- update team
- delete team
- add/update/delete player
- get team record
- query teams by id, name, or partial name

This module handles both archived team metadata and archived roster data, including team-roster linking.

### Competition storage

`src/infrastructure/storage/archived-competition-storage.ts` provides persistence for archived competition names, but it is exposed as storage functions rather than a named repository object.

### `systemRepository`

Current state: not implemented.

The Systems feature exists at the domain and UI level, but there is no persistence module or repository for systems yet.

## CRUD Flow

The typical flow in the current app is:

1. UI collects input
2. feature calls a storage function or repository method
3. infrastructure module writes to Dexie
4. UI reloads local state or updates in-memory view state

### Example: Teams

`TeamsPage`:

- loads teams with `getAllArchivedTeams()`
- selects a team via `getTeamRecord()`
- updates players using `updatePlayer()`
- creates teams using `createTeam()`

After writes, the page refreshes local state to stay aligned with the database.

### Example: Match creation

`MatchSetupPage`:

- creates or reuses archived teams
- saves competition name suggestions
- saves the final `MatchProject`
- sets the new project into `useAppStore`

### Example: Load Data

`LoadDataPage`:

- loads all saved match projects via `getAllMatchProjects()`
- sets the chosen project into `useAppStore`
- navigates to Scouting

## UI -> Repository -> Storage -> UI Update

The current architecture is deliberately direct.

Pattern:

- UI pages usually import storage modules directly
- storage modules call Dexie tables
- UI refreshes its own local state after writes

This keeps the code simple, but it also means persistence behavior is not centralized behind a single repository layer and the UI must remain disciplined about reloading after database changes.

## Importance of Keeping UI and DB in Sync

Because the app does not use a centralized query cache, consistency depends on explicit refresh behavior after writes.

Current examples:

- Teams page refreshes selected team state after mutations
- Match setup reads archive data before creating match-specific data
- Load Data reloads projects at page load

If future features add:

- systems persistence
- scouting session persistence
- optimistic UI updates

then synchronization rules will become even more important.

## Current Status

### Implemented

- local IndexedDB persistence for matches, archived teams, rosters, competitions
- lightweight repository-style wrappers for matches and teams plus direct storage helpers for competitions
- development reset flow

### In progress

- tighter alignment between persisted `MatchProject.events` and in-memory scouting session state

### Planned

- persistence for tactical systems
- richer repository abstraction if the app grows significantly
