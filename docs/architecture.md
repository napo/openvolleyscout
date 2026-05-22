# Architecture Overview

OpenVolleyScout is a client-side React and TypeScript single-page application
for volleyball match setup, live scouting, local team archives, and tactical
system editing.

The app is local-first. There is no backend service in the current runtime.
User data is stored in browser storage through Dexie / IndexedDB and a small
amount of `localStorage`.

## Runtime Boot Path

The application starts through the following chain:

1. `src/main.tsx` mounts the React root.
2. `src/App.tsx` composes `AppProviders` and `AppRouter`.
3. `src/app/providers/AppProviders.tsx` installs `I18nProvider`.
4. `src/app/router/AppRouter.tsx` defines hash-based SPA routes.
5. `src/app/layout/AppShell.tsx` applies either the standard shell or the
   compact scouting shell.

The orientation guard is not global. `ScoutingPage` enables
`OrientationGuard` only for scouting stages that require a landscape layout.

## Routing

The app uses `HashRouter`, which makes GitHub Pages deployment simpler.

Current routes:

- `/` - landing page
- `/teams` - archived teams and rosters
- `/match` - match setup
- `/scouting` - live scouting
- `/systems` - defense-system editor
- `/analysis` - placeholder analysis page
- `/load-data` - saved project loading
- `/settings` - locale and local-data actions
- `/about` - project information

Unknown routes redirect to `/`.

`StandardAppShell` wraps most routes. `ScoutingAppShell` wraps `/scouting` and
uses compact navigation so the live scouting screen can reserve more space for
the court and scoreboard.

## Feature Areas

### Landing

Location: `src/features/landing/`

Contains the landing page, load-data page, settings page, about page, and
landing-specific navigation/action components.

### Teams

Location: `src/features/teams/`

Manages archived teams and rosters. It reads and writes through
`teamRepository`, which wraps the archived team storage module.

### Match Setup

Location: `src/features/startup/`

Creates a match project from competition metadata, home and away team
selection, and match-specific roster selection. It uses the team and
competition archives as source data, then saves a `MatchProject` through
`matchRepository`.

### Scouting

Location: `src/features/scouting/`

Runs the active match workflow: pre-match scouting configuration, set setup,
live rally entry, scoring, corrections, set completion, match completion, and
quick reporting.

Live rally entry supports Simple and Advanced scouting modes. Simple mode keeps
the flow on primary touches (`serve`, `receive`, `attack`, `block`) while
`set`, `dig`, `freeball`, and `cover` are optional toolbar details. Advanced
mode keeps those secondary touches explicit for DataVolley-style workflows.

The scouting store is event-oriented. It derives live session state by replaying
`MatchEvent` records, and `useScoutingPersistence` writes live state back into
the active project.

### Systems

Location: `src/features/systems/`

Provides a defense-system editor. The current UI edits simple player-role
markers on a court surface and stores them in `localStorage`.

The broader domain model also includes position-based tactical system
definitions that are intended for future scouting integration.

### Analysis

Location: `src/features/analysis/`

The route exists, but the screen is still a placeholder. Derived match
statistics are currently built inside the scouting feature and shown in scouting
summary stages rather than in a dedicated analysis workspace.

## State Flow

There are three main state paths.

### Active Project State

`src/app/store/app-store.ts` holds the active `MatchProject`.

At the store boundary, projects are normalized with `normalizeMatchProject()`.
This keeps derived team snapshots aligned with the canonical
`homeSelection` and `awaySelection` data.

### Persistent Archive and Project State

Repositories under `src/infrastructure/repositories/` wrap lower-level storage
modules under `src/infrastructure/storage/`.

Typical flow:

1. A page or feature component collects input.
2. The feature calls a repository method.
3. The repository clones/normalizes data and calls a storage module.
4. The storage module writes to IndexedDB or `localStorage`.
5. The feature refreshes local view state or updates `useAppStore`.

### Live Scouting State

`useScoutingStore` owns `liveMatch`, an in-memory `LiveMatchState` derived from
`MatchEvent` records.

The store appends events through actions such as:

- `startSet`
- `startRally`
- `recordTouch`
- `awardPoint`
- `awardManualPoint`
- `endRally`
- `endSet`
- score-correction and undo actions

After each change, replay rebuilds the current live session. The
`useScoutingPersistence` hook compares live state with the active project and
persists differences back into `MatchProject.events` and
`MatchProject.scoutingSession`.

## Layer Responsibilities

### `src/app`

Application composition, providers, router, shells, navigation, and the active
project store.

### `src/features`

User-facing workflows and route-level screens. Feature-local model code lives
beside the feature when it is specific to that workflow.

### `src/domain`

Pure TypeScript business models and helpers. Domain code should not depend on
React, Dexie, or browser APIs except for small factory concerns such as ID
generation.

### `src/infrastructure`

Persistence details, Dexie database setup, storage functions, and repository
wrappers.

### `src/lib`

Shared utilities, validation helpers, constants, and reusable hooks that do not
belong to one feature.

### `src/i18n`

Locale detection, locale persistence, translation dictionaries, and the
`useTranslation` hook.

## Current Architectural Notes

- Match projects use canonical side selections (`homeSelection`,
  `awaySelection`) plus derived read-only team snapshots.
- Scouting is event-sourced at the feature level and now persists back into the
  active match project.
- The Systems feature has two layers that are not fully unified yet:
  `DefenseSystem` editor data in `localStorage`, and generic
  `TacticalSystemDefinition` domain data for future zone responsibility
  workflows.
- Analysis screens are not implemented yet, even though match-statistics
  builders already exist under the scouting model.
