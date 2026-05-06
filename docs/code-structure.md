# Code Structure

OpenVolleyScout is organized by application layer and feature area.

The application version and metadata are exported from:

- `src/lib/constants/app.ts`
- `src/app/config/app-info.ts`

## Top-Level Source Folders

- `src/app/`
- `src/components/`
- `src/domain/`
- `src/features/`
- `src/i18n/`
- `src/infrastructure/`
- `src/lib/`
- `src/styles/`

## `src/app`

Application-wide composition and navigation.

Important files:

- `components/AppNavigation.tsx` - shared navigation.
- `layout/AppShell.tsx` - standard and compact scouting shells.
- `layout/OrientationGuard.tsx` - portrait guard used by selected scouting
  stages.
- `providers/AppProviders.tsx` - provider composition.
- `router/AppRouter.tsx` - hash-route definitions.
- `store/app-store.ts` - active match project store.

Use this layer for app composition, not feature-specific business logic.

## `src/components`

Shared UI components that are not owned by a single feature.

Current example:

- `layout/AppPageLayout.tsx`

Keep this folder small. Prefer feature-local components unless a component is
clearly shared.

## `src/domain`

Pure TypeScript domain models and helpers.

Examples:

- `match/`
- `team/`
- `roster/`
- `events/`
- `scouting/`
- `lineup/`
- `spatial/`
- `systems/`
- `tactical/`

Rules:

- keep domain helpers pure where possible
- avoid React imports
- avoid direct Dexie/browser storage access
- add domain types before embedding new concepts into JSX state

## `src/features`

User-facing workflows and route-level screens.

Current feature areas:

- `landing`
- `teams`
- `startup`
- `scouting`
- `systems`
- `analysis`

Typical structure:

- `pages/` for route-level components
- `components/` for feature UI pieces
- `model/` for feature-local state, derived logic, and workflow helpers
- `hooks/` for feature-specific hooks

Not every feature has every subfolder yet.

## `src/infrastructure`

Persistence and repository boundaries.

Important folders:

- `db/` - Dexie database setup.
- `storage/` - low-level IndexedDB/localStorage access.
- `repositories/` - feature-facing wrappers with cloning and error handling.

Feature code should prefer repository wrappers when they exist.

## `src/i18n`

Locale and translation support.

Current responsibilities:

- supported locale list
- browser-locale detection
- locale persistence in `localStorage`
- translation dictionaries for English and Italian
- `I18nProvider`
- `useTranslation`

## `src/lib`

Shared helpers that do not fit cleanly into one feature or domain area.

Current examples:

- application constants
- roster validation
- match-readiness validation
- player-code generation utilities
- sequential Enter-key navigation hook

## `src/styles`

Global CSS and app-wide styling.

Feature-specific styles currently also exist next to features when needed, such
as `src/features/scouting/scouting-screen.css`.

## Where to Put New Code

Use this order of preference:

1. Domain types/helpers in `src/domain/` for business concepts.
2. Storage/repository code in `src/infrastructure/` for persistence.
3. Feature pages/components/model code under `src/features/<feature>/`.
4. Shared utilities in `src/lib/` only when they are genuinely cross-feature.
5. App composition changes in `src/app/` only when routing, providers, shells,
   or global stores change.

## Current Large Modules

Some route-level files still do significant orchestration:

- `src/features/startup/pages/MatchSetupPage.tsx`
- `src/features/teams/pages/TeamsPage.tsx`
- `src/features/scouting/pages/ScoutingPage.tsx`

When adding behavior in these areas, prefer extracting:

- pure transformations into `domain/` or feature `model/`
- persistence calls into repositories/storage
- interaction state into hooks
- repeated UI into feature components

## Structural Notes

- Match setup is the boundary between archived data and match-specific data.
- Scouting is event/replay-oriented and persists through the active project.
- Systems currently split editor-specific `DefenseSystem` data from generic
  tactical-system definitions.
- Analysis has route structure but no real feature model yet.
