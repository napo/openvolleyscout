# Architecture Overview

OpenVolleyScout is a client-side React and TypeScript single-page application
for volleyball match setup, live scouting, local team archives, tactical-system
editing, match analysis, video review, and DataVolley interchange.

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
- `/team-analysis` - multi-match analysis for a selected archived team
- `/match` - match setup
- `/scouting` - live scouting
- `/systems` - reception and defense system editors
- `/analysis` - active-match report, dashboards, DataVolley export, and video
  analysis
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

Manages archived teams and rosters, roster import/export, and the entry point
for team-level analysis. It reads and writes through `teamRepository`, which
wraps the archived team storage module.

### Match Setup

Location: `src/features/startup/`

Creates a match project from competition metadata, home and away team
selection, and match-specific roster selection. It uses the team and
competition archives as source data, then saves a `MatchProject` through
`matchRepository`.

### Scouting

Location: `src/features/scouting/`

Runs the active match workflow: pre-match scouting configuration, set setup,
live rally entry, scoring, corrections, undo, set completion, match completion,
quick reporting, and opponent attack/serve direction panels.

Live rally entry supports Quick, Advanced, and Expert workflows. `simple` is a
legacy value normalized to `quick`. Quick mode is the guided Click & Scout-style
flow; Advanced keeps secondary touches explicit for DataVolley-style workflows;
Expert uses code input.

The scouting store is event-oriented. It derives live session state by replaying
`MatchEvent` records, and `useScoutingPersistence` writes live state back into
the active project.

### Systems

Location: `src/features/systems/`

Provides reception and defense system editors. The current UI edits
role-position blocks by rotation and stores those editor libraries in
`localStorage`.

The broader domain model also includes position-based tactical system
definitions that can be reused by future scouting integrations.

### Analysis

Location: `src/features/analysis/`

Provides the active-match analysis workspace:

- match report table
- print, PNG, and PDF report export
- DataVolley `.dvw` export
- team and player performance dashboards
- side-out study
- heatmaps
- video analysis

The feature reuses `buildMatchStats()` from the scouting model instead of
owning a separate statistics engine.

### Analysis Video

Location: `src/features/analysis/video/`

Video analysis links an external local file or YouTube URL to a match project.
The project stores only `videoAnalysis` metadata: source reference, sync
points, and clip padding. Video bytes remain outside OVS.

Single-match video analysis reads the active project. Multi-match video
analysis is used by team analysis and keeps per-project video metadata while
showing focus-team actions across selected matches.

### Team Analysis

Location: `src/features/teams/pages/TeamAnalysisPage.tsx` and
`src/features/teams/model/aggregated-stats.ts`

Team analysis selects saved matches involving an archived team, builds
per-match `MatchStats`, and aggregates them with the focus team normalized to
`home` and all opponents combined as `away`. This lets existing performance,
side-out, heatmap, and video widgets run on an aggregate view.

## State Flow

There are four main state paths.

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

`MatchProject.videoAnalysis` is persisted with the match project. Local video
file handles used by Chromium's File System Access API are stored separately in
the `ovs-video-file-handles` IndexedDB database because they are
structured-cloneable handles, not JSON match data.

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

### Derived Analysis State

Analysis pages derive state at render time from persisted match projects:

- `AnalysisPage` derives one `MatchStats` object for the active project.
- `TeamAnalysisPage` derives one `MatchStats` per selected match, then builds
  an aggregate `MatchStats` shape for focus-team workflows.
- Video event indexes are derived from match events and synchronization points.

Reports, dashboards, heatmaps, side-out tables, video playlists, and clip
exports are generated outputs, not separate persisted aggregates.

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
- Analysis reuses the scouting statistics model and does not duplicate the
  stats engine.
- Video analysis persists references and sync points, never video bytes.
- Team analysis aggregates several match stats into the existing `MatchStats`
  shape by normalizing the focus team to `home`.
- The Systems feature has two layers that are not fully unified yet:
  reception/defense editor libraries in `localStorage`, and generic
  `TacticalSystemDefinition` domain data for future zone responsibility
  workflows.
