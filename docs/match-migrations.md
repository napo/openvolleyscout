# Adding a Match Data Migration

Stored matches run through the ordered migration registry in `src/infrastructure/storage/match-migrations.ts` when read from IndexedDB or imported from `.ovs` files.

1. Write a pure, idempotent function `(project: MatchProject) => MatchProject` that returns the **same object reference** when nothing needs changing (so live-scouted or already-clean matches are never rewritten).
2. Append `{ id: N, name: 'short-kebab-name', run: yourMigration }` to `MATCH_MIGRATIONS` with the next sequential integer `id`.
3. Add a unit test in `src/infrastructure/storage/match-migrations.test.ts` covering run-once, idempotency, and untouched matches.
4. Keep derived state fixes (such as setter tracking after substitutions) in the event replay (`src/domain/scouting/replay.ts`) rather than as migrations, because replay recomputes them deterministically without mutating historical events.
5. Never remove or renumber shipped migrations; matches exported from a newer app (`migrationVersion > LATEST_MATCH_MIGRATION_VERSION`) are left untouched with a warning.
