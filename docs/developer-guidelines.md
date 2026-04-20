# Developer Guidelines

## Coding Conventions

### General

- Use TypeScript for all new source files.
- Keep source code in English.
- Prefer explicit, readable code over compact abstractions.
- Favor small pure functions for transformations and domain logic.

### React

- Route-level composition belongs in `pages/`.
- Reusable UI blocks belong in feature `components/`.
- Feature-specific interaction logic can live in `hooks/`.
- Keep page components focused on wiring state, navigation, and child components.

### Domain

- Add business concepts to `src/domain/` before embedding them into UI state.
- Keep domain helpers pure.
- Do not couple domain types to React component props unless there is a strong reason.

### Persistence

- Add new IndexedDB/Dexie logic in `src/infrastructure/`.
- Avoid calling Dexie tables directly from UI components.
- If a feature becomes persistent, prefer a storage module or repository wrapper.
- Keep `docs/` aligned with the implementation when architectural boundaries change.

## TypeScript Usage

- Prefer named interfaces and exported types for domain concepts.
- Use unions for event variants and narrow by `type`.
- Keep optional fields intentional; do not make everything optional by default.
- When a model is a foundation only, document that in code comments or docs rather than pretending it is fully complete.

Good examples in the current codebase:

- `MatchEvent` discriminated union
- `CourtZone` geometry model
- `TacticalSystemDefinition` and `PlayerResolutionResult`

## Working with Codex Effectively

This codebase evolves well when requests are scoped precisely.

Useful prompt patterns:

- describe the goal and the non-goals
- explicitly separate “foundation only” from “full implementation”
- specify whether a change belongs in domain, UI, persistence, or all three
- ask for end-of-task summaries of changed files and tradeoffs

Example prompt structure:

1. goal
2. constraints
3. exact scope
4. explicit exclusions
5. requested final summary

That pattern matches the way the current architecture is being built: feature by feature, with clear boundaries.

## How to Structure Prompts

Prompts work best when they say:

- what should exist after the change
- what must not be implemented yet
- whether the result should be a domain model, a UI foundation, persistence, or integration

Examples of good distinctions:

- “Add the domain model, but do not build the editor yet.”
- “Make the court draggable, but do not implement scouting intelligence yet.”
- “Create docs based on the actual codebase, not planned features.”

## Manual Testing Guidance

There is no meaningful automated test suite yet. Manual testing is the current default.

Recommended manual checks after UI/domain changes:

### Navigation

- verify the route loads
- verify header navigation still works
- verify landing actions still navigate correctly

### Teams

- create a new team
- edit players
- reload and verify archive persistence

### Match

- create a match with home and away teams
- confirm the match review screen appears
- start scouting and verify the active project is set

### Scouting

- create basic lineups
- start a set
- drag the ball token to a zone
- confirm the selected zone updates
- confirm the draft panel reflects the selected team side and zone
- record a mock touch and confirm the event log updates

### Systems

- open `/systems`
- create reception and defense systems
- rename them
- switch between them
- verify editor state updates as expected

### Persistence

- create teams and matches
- reload the app
- verify Load Data still shows saved projects

## Keeping the Architecture Clean Over Time

### Prefer foundations before intelligence

This project is currently being built in layers. Continue that pattern:

- geometry before tactical automation
- domain model before editor
- storage before complex sync

### Keep feature boundaries explicit

Do not put volleyball domain features into generic settings or app-shell code.

Examples:

- tactical systems belong in `features/systems`, not `features/landing/pages/SettingsPage.tsx`
- court geometry belongs in `domain/court`, not directly inside JSX math

### Mark incomplete areas honestly

Use:

- `implemented`
- `in progress`
- `planned`

instead of implying a feature is done when it is only scaffolded.

### Watch for these risks

- route components growing too large
- direct DB access from UI
- duplicated geometry or tactical logic in components
- divergence between in-memory scouting state and persisted match state

## Current Technical Debt to Keep in Mind

- Analysis is placeholder-only.
- Systems are not persisted yet.
- The scouting session is not yet written back into persisted match events.
- Manual testing is still the main validation path.
- Some UI text, such as the portrait orientation guard, is currently hardcoded rather than routed through i18n.
