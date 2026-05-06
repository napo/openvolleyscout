# Match Feature

## Purpose

The Match feature creates and edits match projects from competition metadata,
archived teams, and match-specific roster selections. It is the boundary between
long-lived archive data and a concrete scouting project.

## Current Scope

Implemented primarily in:

- `src/features/startup/pages/MatchSetupPage.tsx`

Current responsibilities:

- collect competition, match date/time, venue, and match number
- choose or create home and away teams
- load archived rosters into match-selection state
- create manual match roster players
- validate team and roster requirements
- save reusable competition names
- save or update archived team data when needed
- build `homeSelection` and `awaySelection`
- save a normalized `MatchProject`
- set the saved project as active in `useAppStore`
- navigate into Scouting

## UI Structure

Main page:

- `MatchSetupPage.tsx`

Supporting components:

- `CompetitionNameInput.tsx`
- `TeamNameInput.tsx`
- `MatchTeamSelection.tsx`
- `MatchRosterTable.tsx`
- `MatchSetupForm.tsx`
- `MatchReadinessSection.tsx`

The current flow is a multi-step wizard inside one route rather than separate
route steps.

## Domain Model

Important models:

- `MatchProject`
- `MatchMetadata`
- `MatchTeamSelection`
- `MatchRosterPlayer`
- `MatchRosterSelectionPlayer`
- `ArchivedTeam`
- `ArchivedRoster`
- `ArchivedPlayer`

Important helpers:

- `createEmptyMatchProject()`
- `createMatchTeamSelection()`
- `createMatchRosterSelectionFromArchived()`
- `normalizeMatchProject()`
- `setMatchTeamSelection()`

## Persistence

The page uses repository wrappers:

- `matchRepository`
- `teamRepository`
- `competitionRepository`

Durable writes include:

- archived competition names
- archived teams and rosters
- final match project

The saved project is normalized and then placed in `useAppStore` as the active
project.

## Validation

Validation uses:

- `src/lib/validation/roster-validation.ts`
- `src/lib/validation/match-readiness.ts`

Current validation checks include:

- required match metadata
- required home and away team names
- selected-player jersey/name requirements
- roster rule validation
- home and away team names must differ

## Constraints

- Keep archive data and match-specific data separate.
- Treat `homeSelection` and `awaySelection` as canonical match team data.
- Keep derived `homeTeam` and `awayTeam` aligned through normalization.
- Keep validation helpers and UI validation behavior aligned.
- Prefer extracting model helpers if `MatchSetupPage.tsx` grows further.

## Current Gaps

- The page still owns a lot of orchestration logic.
- Match setup and archive synchronization are closely coupled in the page.
- There is no separate persisted draft wizard state.
