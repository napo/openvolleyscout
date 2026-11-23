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

- `8`

Tables:

- `matchProjects: 'metadata.id, updatedAt'`
- `archivedTeams: 'id, name, updatedAt'`
- `archivedRosters: 'id, teamId'`
- `archivedCompetitions: 'id, name, updatedAt'`
- `matchSyncState: 'id, matchId, peerDeviceId'` (since v4)
- `archiveSyncState: 'id, peerDeviceId'` (since v5)
- `opponentReports: 'id, updatedAt'` (since v6)
- `matchSummaries: 'id, updatedAt, playedAt, homeTeamId, awayTeamId'` (since v7)
- `syncDeletions: 'key'` (since v8) - deletions remembered for cloud sync,
  keyed by `collection:id`, written in the same transaction as the deletion
- `syncMeta: 'key'` (since v8) - cloud sync state (enabled, provider, remote
  file id, base stamps, last sync)
- `systemBlocks: 'key, kind'` (since v8) - reception and defense systems,
  keyed by `kind:id`

IndexedDB currently stores:

- match projects
- archived teams
- archived rosters
- archived competition names
- `.ovs` match and backup sync state (3-way merge bases per peer device)
- opponent reports
- reception and defense systems (since v8; the system stores keep a copy in
  `localStorage` only to start synchronously)
- cloud sync deletions and state (since v8)

Version 8 moves the cloud sync state, its deletions and the reception/defense
systems from `localStorage` into the database on upgrade. See
[cloud-sync.md](cloud-sync.md).

Match projects include optional `videoAnalysis` metadata. This metadata stores
only a local path/file name or YouTube URL, sync points, and clip-padding
preferences. It does not store video bytes.

IndexedDB does not store:

- generic tactical-system definitions (`system-storage.ts`, unused by the Systems page)
- exported reports, playlists, or clip files

## Video File Handles

Local browser video files use an additional IndexedDB database when the File
System Access API is available:

- database: `ovs-video-file-handles`
- object store: `handles`
- key: match project id
- value: `FileSystemFileHandle`

This is intentionally separate from `OpenVolleyScoutDatabase`. File handles are
structured-cloneable browser objects and must not pass through the JSON
serialization used for `MatchProject`.

## localStorage

`localStorage` is used intentionally in a few places:

- `openvolleyscout.locale` - persisted UI locale from `I18nProvider`.
- `openvolleyscout.defenseSystemBlocks` and
  `openvolleyscout.receptionSystemBlocks` - start-up copy of the systems held
  in the `systemBlocks` table (the database is the source cloud sync reads).
- `openvolleyscout.sync.deviceName`, `openvolleyscout.sync.takeoverMinutes` -
  cloud sync device name and scouting takeover minutes.
- Cloud service refresh tokens (`openvolleyscout.dropbox.refresh-token` and
  similar), kept on the device only.
- `openvolleyscout.systems` - generic tactical-system storage helper in
  `system-storage.ts`; this helper exists but is not the main state path used by
  `SystemsPage`.
- `openvolleyscout.liveScoutingOnboardingSeen` - live scouting onboarding state.
- `openvolleyscout.smartphoneWarningDismissed` - small-screen warning state.
- `openvolleyscout.expertCodeHistory[.<matchId>]` - optional Expert-mode code
  input history.

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
systems repository, and it is separate from the current reception/defense
editor stores.

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

## Analysis and Video Persistence

Analysis dashboards, match reports, side-out tables, heatmaps, and team
aggregation are derived on demand. They do not have separate persisted tables.

Video analysis writes only to the match project:

- `MatchProject.videoAnalysis.source`
- `MatchProject.videoAnalysis.syncPoints`
- `MatchProject.videoAnalysis.paddingBeforeSeconds`
- `MatchProject.videoAnalysis.paddingAfterSeconds`
- `MatchProject.videoAnalysis.updatedAt`

Generated files are outside the app database:

- report PNG/PDF files are browser downloads
- DataVolley `.dvw` exports are browser downloads
- clip exports are browser downloads on the web; the desktop app writes them
  (with a same-named `.srt`) to the user's Downloads folder
- YouTube playlists are downloaded as text files

## Consistency Rules

- Do not write directly to Dexie tables from React components.
- Use repository wrappers from feature code when they exist.
- Normalize match projects before treating them as current schema data.
- After writes, refresh the feature-local view state or update `useAppStore`.
- Write a deletion together with its `syncDeletions` tombstone (see
  `src/infrastructure/storage/sync-deletions.ts`), so cloud sync can pass it on.
- Keep video files external; only persist references and synchronization
  metadata.

## Current Gaps

- Generic tactical-system persistence is not yet unified with the Systems page.
- Analysis has no dedicated persisted report model; reports and charts are
  regenerated from match projects.
- There is no centralized query cache; features explicitly refresh after writes.

## `.ovs` files and the app version

Every `.ovs` file (a single match or a whole-database backup) contains a
`manifest.json` with the field `appVersion`: the version of OpenVolleyScout
that exported the file, next to `exportedAt` and the format version
(`ovsFormatVersion`). It says which release wrote the file, not which release
scouted the match. Use it first when a problem is reported on a shared or
restored match.
