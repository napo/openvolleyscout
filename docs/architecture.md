# Architecture Overview

## Application Shape

OpenVolleyScout is a client-side React + TypeScript single-page application for volleyball scouting workflows on portable devices. The current codebase is organized around feature areas rather than a single monolithic app layer.

The app boot path is:

1. `src/main.tsx` mounts the React application.
2. `src/App.tsx` composes providers, shell, and router.
3. `src/app/providers/AppProviders.tsx` currently installs `I18nProvider`.
4. `src/app/layout/AppShell.tsx` wraps the app in `OrientationGuard`.
5. `src/app/router/AppRouter.tsx` defines SPA navigation and the shared header layout for non-landing pages.

The current orientation strategy is landscape-first. `OrientationGuard` blocks the main UI in portrait mode and shows a rotate-device message instead.

## Main Application Sections

### Landing

- Implemented in `src/features/landing/`.
- Entry route: `/`.
- Provides the branded home screen, top-level entry actions, About, Load Data, and Settings.
- The landing page is intentionally visually distinct from the rest of the app and does not use the shared in-app header layout.

### Teams

- Implemented in `src/features/teams/`.
- Route: `/teams`.
- Manages locally archived teams and archived rosters.
- This feature is connected to IndexedDB-backed storage through `archived-team-storage.ts`.

### Match

- Implemented in `src/features/startup/`.
- Route: `/match`.
- Responsible for match setup, competition metadata, team selection, and match roster selection.
- This is the point where archived team data is transformed into match-specific team/player data.

### Scouting

- Implemented in `src/features/scouting/`.
- Route: `/scouting`.
- Uses a local `zustand` store to model an in-progress scouting session (`liveMatch`).
- Contains the current court UI, event draft foundation, event log, and set/rally workflow.
- The court interaction and tactical resolution work are present as foundations and are still in progress.

### Analysis

- Implemented in `src/features/analysis/`.
- Route: `/analysis`.
- Current state: planned / placeholder.
- The page exists, but it only renders a “coming soon” style placeholder.

### Systems

- Implemented in `src/features/systems/`.
- Route: `/systems`.
- This is a domain-specific tactical systems area, separate from generic application settings.
- Current state: foundation only.
- It supports listing in-memory reception/defense systems and editing basic metadata, but not full persistence or zone editing yet.

## SPA Routing Structure

`src/app/router/AppRouter.tsx` uses React Router and a two-level layout structure:

- `/` renders `LandingPage` directly.
- Non-landing routes render inside `AppLayout`, which adds the shared `AppNavigation` header.

Current main routes:

- `/`
- `/teams`
- `/match`
- `/scouting`
- `/systems`
- `/load-data`
- `/settings`
- `/about`
- `/analysis`

Unknown routes are redirected to `/`.

## Main Data Flow

There are two distinct state paths in the app today.

### Persistent project and archive flow

1. A feature page collects user input.
2. The feature usually calls an infrastructure storage function directly.
3. The storage layer persists data to Dexie / IndexedDB.
4. The UI reloads or refreshes local state from storage.

Examples:

- Teams page -> `archived-team-storage.ts` -> IndexedDB -> refreshed Teams page state
- Match setup page -> `match-project-storage.ts` -> IndexedDB -> `useAppStore.setActiveProject`
- Load Data page -> `getAllMatchProjects()` -> project selection -> `useAppStore.setActiveProject`

### In-memory scouting flow

1. The active match project is held in `useAppStore`.
2. The scouting feature creates a separate `liveMatch` state in `useScoutingStore`.
3. Set/rally/touch/point operations append events to the scouting event log.
4. The Scouting page renders from that in-memory event/session state.

The current scouting session is not yet synchronized back into the persisted `MatchProject.events` collection. That is an important future integration point.

## Separation of Responsibilities

### UI components

UI components live mainly under `src/features/**/components` and page entry files under `src/features/**/pages`.

Their responsibilities are:

- render user interfaces
- collect input
- call storage functions or local stores
- render derived state

Examples:

- `LandingPage.tsx`
- `TeamsPage.tsx`
- `ScoutingCourt.tsx`
- `SystemsPage.tsx`

### Domain logic

Domain models live under `src/domain/`.

Their responsibilities are:

- define stable TypeScript types
- represent business concepts such as teams, matches, events, zones, lineups, tactical systems
- provide pure helpers and factory functions

Examples:

- `domain/match/types.ts`
- `domain/court/helpers.ts`
- `domain/tactical/resolver.ts`
- `domain/systems/types.ts`

### Persistence layer

Persistence is implemented under `src/infrastructure/`.

Its responsibilities are:

- configure the Dexie database
- provide storage functions and a small number of repository-style wrappers
- isolate IndexedDB access from UI components

Examples:

- `db/match-project-db.ts`
- `storage/match-project-storage.ts`
- `storage/archived-team-storage.ts`
- `storage/archived-competition-storage.ts`

## Current Architectural Notes

- The app is strongly feature-driven in UI structure, and most features still import storage functions directly instead of using a single abstract data-access layer.
- Tactical systems currently exist in the domain and feature UI, but persistence for systems is not implemented yet.
- Scouting interaction is in progress: court geometry, zone selection, drag foundation, and resolution models exist, but end-to-end event encoding is still planned.
- Analysis is planned, not implemented.
