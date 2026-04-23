# Code Structure

the version in the file
```bash
src/lib/constants/app.ts
```

## Top-Level Structure

The current source tree is organized around a few primary layers:

- `src/app/`
- `src/features/`
- `src/domain/`
- `src/infrastructure/`
- `src/i18n/`
- `src/lib/`
- `src/styles/`

Each layer has a different responsibility.

## `app/`

The `app/` layer contains application-wide composition and navigation.

Important files:

- `AppNavigation.tsx` - shared in-app header
- `AppRouter.tsx` - SPA route definitions
- `AppShell.tsx` - outer shell composition
- `OrientationGuard.tsx` - landscape-first gate
- `app-store.ts` - active match project store

Rule of thumb:

- put application composition here
- do not put feature-specific business logic here

## `features/`

The `features/` layer contains user-facing workflows and pages.

Current feature areas:

- `landing`
- `teams`
- `startup` (match creation/setup)
- `scouting`
- `systems`
- `analysis`

Typical feature structure:

- `pages/` for route-level entry components
- `components/` for feature UI pieces
- `model/` for feature-local state or types
- `hooks/` for feature-specific hooks when needed

This is the main place to add new product functionality, but not every feature currently uses every subfolder. For example, `teams` is page-heavy, while `scouting` already uses `components/`, `hooks/`, and `model/`.

## `domain/`

The `domain/` layer defines the application’s business concepts and pure logic.

Examples:

- `match/`
- `team/`
- `lineup/`
- `events/`
- `court/`
- `tactical/`
- `systems/`

Rule of thumb:

- put pure TypeScript models and helpers here
- avoid React, Dexie, and browser APIs unless absolutely necessary

## `infrastructure/`

The `infrastructure/` layer is responsible for persistence and storage details.

Current contents:

- `db/` for Dexie database setup
- `storage/` for database-backed CRUD helpers

Rule of thumb:

- UI components should not talk to Dexie tables directly
- persistence logic belongs here

## `components/` vs `pages/`

Within a feature:

- `pages/` should own route-level composition
- `components/` should hold reusable or focused view pieces

Examples:

- `ScoutingPage.tsx` composes the screen
- `ScoutingCourt.tsx` handles the court surface
- `EventDraftPanel.tsx` handles the draft summary block

This keeps page files readable and prevents route components from becoming too large.

## `lib/`

`lib/` is currently used for supporting utilities and validation that do not fit cleanly into a single feature.

Examples:

- roster validation
- player code generation

## How to Add New Features

Recommended process:

1. Define or extend domain types in `src/domain/`
2. Add storage/persistence support in `src/infrastructure/` if needed
3. Build route/page/component structure under `src/features/<feature>/`
4. Add navigation and routing only after the feature entry point exists
5. Add translations for user-facing text

If the feature includes interaction logic:

- keep geometry/math pure when possible
- move pointer/drag state into hooks
- keep route pages focused on composition and state wiring

## How to Avoid Monolithic Components

The codebase already shows both good and mixed examples.

Good pattern:

- `ScoutingPage` composes specialized subcomponents
- `ScoutingCourt` delegates ball token and player marker rendering

More complex area:

- `MatchSetupPage` currently owns a lot of setup logic and state

Guidelines:

- extract repeated UI blocks into feature components
- extract pure transformations into `domain/` or `lib/`
- extract pointer/interaction state into hooks
- avoid combining persistence calls, view logic, and domain transformations in one long component where possible

## Current Structural Notes

- The app is feature-oriented, which is a good fit for current scale.
- `features/systems` is a new dedicated domain feature and should stay separate from generic settings.
- `domain/tactical` and `domain/systems` are closely related but intentionally separate:
  - `systems` defines editable tactical schemes
  - `tactical` defines resolution-oriented runtime logic
