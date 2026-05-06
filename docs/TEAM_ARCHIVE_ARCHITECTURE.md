# Team Archive Architecture

The team archive stores reusable team and roster data in IndexedDB. Match setup
uses this archive as source data, then copies selected players into a
match-specific roster snapshot.

## Core Concepts

### Archived Team

Defined as `ArchivedTeam` in `src/domain/team/types.ts`.

An archived team stores:

- `id`
- `name`
- `teamCode`
- `staff`
- `rosterIds`
- `createdAt`
- `updatedAt`

Team codes are generated from the team name and id. Missing codes are backfilled
when archive records are read.

### Archived Roster

Defined as `ArchivedRoster` in `src/domain/team/types.ts`.

An archived roster stores:

- `id`
- `teamId`
- `players`
- timestamps

The model supports multiple rosters per team. The current UI mostly edits the
latest active roster.

### Archived Player

Defined as `ArchivedPlayer`.

An archived player stores:

- jersey number
- first and last name
- short/player code
- libero flag
- captain flag

### Match Roster Player

Defined as `MatchRosterPlayer` and `MatchRosterSelectionPlayer` in
`src/domain/match/types.ts`.

Match roster players are match-specific copies derived from archived players or
manual entry. They can reference archived team/player ids, but they are saved
inside the match project as a snapshot.

## Data Flow

1. The user types or selects a team name during match setup.
2. Team suggestions are loaded from the archive.
3. If an archived team is selected, the latest roster is loaded.
4. Archived players are converted into match roster selection players.
5. The user chooses the players available for that match.
6. Match setup builds `homeSelection` and `awaySelection`.
7. The final `MatchProject` embeds the selected match rosters.

Archived rosters remain reusable archive data. Match rosters are the frozen
match-specific selection used by scouting.

## Storage Layer

Database setup:

- `src/infrastructure/db/match-project-db.ts`

Relevant tables:

- `archivedTeams`
- `archivedRosters`

Storage module:

- `src/infrastructure/storage/archived-team-storage.ts`

Repository wrapper:

- `src/infrastructure/repositories/team-repository.ts`

The repository exposes methods such as:

- `create`
- `getById`
- `getByName`
- `list`
- `searchByName`
- `update`
- `delete`
- `addPlayer`
- `updatePlayer`
- `deletePlayer`
- `getLatestRoster`

## Transactions

Team deletion removes the team and all rosters for that team in a single Dexie
transaction.

Team updates and roster updates that must stay aligned are also written through
the storage module rather than directly from UI components.

## Validation

Roster validation lives in:

- `src/lib/validation/roster-validation.ts`

Match readiness validation lives in:

- `src/lib/validation/match-readiness.ts`

Validation covers match roster constraints such as player counts, libero counts,
captain selection, and readiness requirements before scouting starts.

## Current UI

Archive management:

- `src/features/teams/pages/TeamsPage.tsx`

Match selection:

- `src/features/startup/pages/MatchSetupPage.tsx`
- `src/features/startup/components/TeamNameInput.tsx`
- `src/features/startup/components/MatchTeamSelection.tsx`
- `src/features/startup/components/MatchRosterTable.tsx`

## Design Rules

- Treat archived teams as reusable local archive data.
- Treat match rosters as match-specific snapshots.
- Do not mutate archived rosters as a side effect of changing an already saved
  match roster.
- Use `teamRepository` from feature code.
- Keep validation helpers aligned with UI behavior.

## Current Gaps

- Historical roster browsing exists in the data model but not as a full UI.
- The Teams page is still a large component.
- Import/export for team archives is not implemented.
