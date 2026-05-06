# Developer Guidelines

## General Conventions

- Use TypeScript for new source files.
- Keep source code, comments, and documentation in English.
- Prefer explicit, readable code over compact abstractions.
- Keep behavior close to the existing architecture unless a refactor is part of
  the task.
- Add comments only where they clarify non-obvious logic.

## React

- Route-level composition belongs in `pages/`.
- Feature UI blocks belong in feature `components/`.
- Feature-local workflow logic can live in feature `model/`.
- Feature-specific interaction state can live in feature `hooks/`.
- Keep route pages focused on state wiring, navigation, and composition.

## Domain

- Add business concepts to `src/domain/` before embedding them into UI state.
- Keep domain helpers pure when practical.
- Do not couple domain models to React component props.
- Use discriminated unions for event variants.
- Keep optional fields intentional.

Good current examples:

- `MatchEvent`
- `MatchProject`
- `ScoutingMatchConfig`
- `ScoutingSession`
- `StartingLineup` and `ActiveLineup`
- `TacticalSystemDefinition`

## Persistence

- Do not call Dexie tables directly from React components.
- Prefer repository wrappers from `src/infrastructure/repositories/`.
- Keep raw browser storage access in `src/infrastructure/storage/` or a
  feature store that clearly documents its localStorage key.
- Normalize match projects before persisting, activating, or consuming imported
  project data.
- After writes, refresh local feature state or update `useAppStore`.

## Scouting

- Treat the event log as the primary source for live scouting behavior.
- Use replay to rebuild live state after changes.
- Add new event types to replay deliberately; unsupported event types should be
  rejected rather than silently ignored.
- Keep score corrections event-log based.
- Keep match progression rules in model/domain helpers, not in JSX.
- When changing persistence, update both `session.ts` and
  `use-scouting-persistence.ts` docs or tests as needed.

## Tactical Systems

- Keep tactical responsibility position-based.
- Do not map zones directly to player ids in system definitions.
- Reuse spatial/court models instead of introducing duplicate zone systems.
- Be clear whether a change affects:
  - `DefenseSystem` editor data
  - generic `TacticalSystemDefinition` data
  - runtime tactical resolution

## Internationalization

- User-facing text should use `useTranslation()` and the dictionaries under
  `src/i18n/locales/`.
- Keep English and Italian translation keys aligned.
- Locale selection is persisted by `I18nProvider`.

## Validation and Tests

The current automated validation surface is narrow.

Available command:

```bash
npm test
```

This runs:

```bash
npm run validate:match-stats
```

The validation script bundles and executes
`src/features/scouting/model/match-stats.validation.ts`.

For changes outside match-statistics logic, manual testing is still important.

## Manual Testing Checklist

### Navigation

- open landing page
- navigate to Teams, Match, Systems, Scouting, Settings, About
- verify unknown routes redirect to landing

### Teams

- create a team
- add/edit/delete players
- use random roster fill if relevant
- reload and verify archive persistence

### Match

- create match metadata
- select or create home and away teams
- select valid rosters
- save project
- confirm the active project opens in Scouting

### Scouting

- save pre-match scouting config
- start a set with valid lineups
- start a rally through the court flow
- record touches
- award points
- undo a point
- apply a score correction
- finish a set
- reload and verify persisted scouting state resumes

### Systems

- create a defense system
- rename it
- drag position markers
- save it
- reload and verify localStorage persistence

### Persistence Reset

- use Settings reset flow
- verify match/team/archive data and local preferences are cleared as expected

## Current Technical Debt

- Analysis is still a placeholder route.
- Defense systems are persisted in `localStorage`, not IndexedDB.
- Generic tactical-system definitions and the current defense-system editor are
  not yet unified.
- Automated tests cover match statistics only.
- Some route-level components remain large and should be decomposed as behavior
  grows.
- Full DataVolley export compatibility is not implemented yet.
