---

## docs/architecture.md

```md
# Architecture

## Guiding principles

1. The UI must stay thin.
2. Volleyball rules must live in domain modules.
3. Match data must be persisted locally.
4. Statistics must be derived from events.
5. Export logic must be isolated from the UI.

## Layers

### App layer
Routing, providers, app shell, orientation guard.

### Feature layer
Startup, scouting, analysis, import/export.

### Domain layer
Pure types, factories, rules, selectors, event definitions.

### Infrastructure layer
IndexedDB, local repositories, migrations, serialization.

## Source of truth
The source of truth is the match event log.
Snapshots may be added later for performance, but events remain authoritative.
