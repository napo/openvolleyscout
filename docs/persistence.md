# Persistence Layer

OpenVolleyScout is local-first. The current app persists durable match and
archive data in IndexedDB through Dexie, and uses `localStorage` for a small
number of browser-local preferences/editor states.

There is no server-side persistence in the current codebase.

## IndexedDB

Dexie database setup lives in:

- `src/infrastructure/db/match-project-db.ts`

Database name:

- `OpenVolleyScoutDatabase`

Current schema version:

- `3`

Tables:

- `matchProjects: 'metadata.id, updatedAt'`
- `archivedTeams: 'id, name, updatedAt'`
- `archivedRosters: 'id, teamId'`
- `archivedCompetitions: 'id, name, updatedAt'`

IndexedDB currently stores:

- match projects
- archived teams
- archived rosters
- archived competition names

IndexedDB does not yet store:

- generic tactical-system definitions
- the current defense-system editor list
- analysis-specific artifacts

## localStorage

`localStorage` is used intentionally in a few places:

- `openvolleyscout.locale` - persisted UI locale from `I18nProvider`.
- `openvolleyscout.defenseSystems` - current defense-system editor state from
  `useDefenseSystemStore`.
- `openvolleyscout.systems` - generic tactical-system storage helper in
  `system-storage.ts`; this helper exists but is not the main state path used by
  `SystemsPage`.

`reset-local-data.ts` clears IndexedDB, `localStorage`, and `sessionStorage` for
the browser-local reset flow.

## Storage Modules

Storage modules live in `src/infrastructure/storage/`.

### Match Project Storage

File:

- `src/infrastructure/storage/match-project-storage.ts`

Responsibilities:

- save projects
- load latest project
- load by id
- list projects by `updatedAt`
- delete projects
- normalize projects on read and write

### Archived Team Storage

File:

- `src/infrastructure/storage/archived-team-storage.ts`

Responsibilities:

- create/update/delete archived teams
- create and link active rosters
- add/update/delete players
- search teams by name
- generate missing unique team codes
- delete team rosters in the same transaction as team deletion

### Archived Competition Storage

File:

- `src/infrastructure/storage/archived-competition-storage.ts`

Responsibilities:

- create/update competition-name entries
- read by id or name
- list and search competition names
- delete entries

### System Storage

File:

- `src/infrastructure/storage/system-storage.ts`

Responsibilities:

- read/write generic `TacticalSystemDefinition[]` from `localStorage`

This helper is a lightweight localStorage store. It is not an IndexedDB-backed
systems repository, and it is separate from the current defense-system editor
store.

## Repository Wrappers

Repository wrappers live in `src/infrastructure/repositories/`.

They provide a cleaner boundary for feature code by cloning entities and
wrapping storage failures in `RepositoryError`.

Current repositories:

- `matchRepository`
- `teamRepository`
- `competitionRepository`
- `systemRepository`

The first three wrap IndexedDB storage modules. `systemRepository` re-exports
the localStorage-backed system storage helper.

## Scouting Persistence

Scouting persistence is implemented by:

- `src/features/scouting/model/use-scouting-persistence.ts`
- `src/features/scouting/model/session.ts`

The flow is:

1. `ScoutingPage` calls `useScoutingPersistence(activeProject)`.
2. `useScoutingStore` derives `liveMatch` from event replay.
3. The persistence hook compares the active project with `liveMatch`.
4. If they differ, `syncProjectWithLiveMatch()` creates a new project snapshot.
5. The hook saves that project through `matchRepository.update()`.
6. The persisted project is written back into `useAppStore`.

The persisted fields are:

- `MatchProject.events`
- `MatchProject.scoutingSession`
- `MatchProject.phase`
- `MatchProject.updatedAt`

This means live scouting is no longer memory-only. Reloaded projects can replay
the persisted event log and resume from the stored session snapshot.

## Consistency Rules

- Do not write directly to Dexie tables from React components.
- Use repository wrappers from feature code when they exist.
- Normalize match projects before treating them as current schema data.
- After writes, refresh the feature-local view state or update `useAppStore`.
- Keep localStorage-backed system editor state documented as browser-local
  editor persistence, not as durable project data.

## Current Gaps

- Defense-system editor state is persisted in `localStorage`, not IndexedDB.
- Generic tactical-system persistence is not yet unified with the Systems page.
- Analysis has no dedicated persistence model.
- There is no centralized query cache; features explicitly refresh after writes.
