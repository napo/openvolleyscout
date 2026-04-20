# Match Feature

## Purpose

The Match feature builds a match project from metadata, archived teams, and match-specific roster selection. It is the bridge between the persistent archive and the active scouting workflow.

## Current Scope

Implemented primarily in `src/features/startup/pages/MatchSetupPage.tsx`.

Current responsibilities:

- collect match metadata
- choose or create home and away teams
- load archived rosters into match selection state
- validate match roster rules
- save a `MatchProject`
- set the created project as the active project in `useAppStore`
- provide a review/confirmation step before entering scouting

## In Progress

- `MatchSetupPage.tsx` remains a large orchestration component
- match creation, archive synchronization, and roster validation are all coordinated inside one page-level flow

## Planned

- cleaner decomposition of page logic into smaller feature components and hooks
- stronger persistence/state integration around project lifecycle
- deeper alignment between created match projects and later scouting persistence

## Domain Model

Main domain models:

- `MatchProject` in `src/domain/match/types.ts`
- `MatchMetadata` in `src/domain/match/types.ts`
- `MatchPlayer` in `src/domain/team/types.ts`
- `MatchRoster` in `src/domain/team/types.ts`

Supporting models:

- archived teams and archived rosters from `src/domain/team/types.ts`

Important concept:

- archived roster data is reused as source data
- match roster data is a match-scoped selection layer on top of the archive

## UI Structure

Main route:

- `src/features/startup/pages/MatchSetupPage.tsx`

Supporting components:

- `CompetitionNameInput.tsx`
- `MatchTeamSelection.tsx`
- `MatchRosterTable.tsx`
- `MatchSetupForm.tsx`

The page drives a multi-step setup/review flow rather than separate route steps.

## Persistence

Persistence and related storage modules:

- `src/infrastructure/storage/match-project-storage.ts`
- `src/infrastructure/storage/archived-team-storage.ts`
- `src/infrastructure/storage/archived-competition-storage.ts`

Key writes in the current flow:

- save or update archived teams when needed
- save archived competition names for suggestions
- save the final `MatchProject`

After persistence, the feature sets the created project into `useAppStore`.

## Constraints

- roster validation rules must remain aligned with `src/lib/validation/roster-validation.ts`
- the feature depends on archived data but produces match-specific data
- current navigation assumes the created project becomes the active project before Scouting

## Notes for Codex

- treat Match as the creation and transformation boundary between archive data and scouting data
- keep validation logic outside JSX when possible
- if you extend roster behavior, update both UI behavior and validation helpers together
- if the page keeps growing, prefer extracting orchestration into hooks before adding more inline logic
