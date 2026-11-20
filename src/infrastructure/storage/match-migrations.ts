// SPDX-License-Identifier: AGPL-3.0-or-later

import type { MatchProject } from '@src/domain/match/types';
import { repairDataVolleyBallDirections } from '@src/features/import/mapping/datavolley-direction-repair';

export interface MatchMigration {
  readonly id: number;
  readonly name: string;
  run(project: MatchProject): MatchProject;
}

/**
 * Ordered list of pure, idempotent migrations applied to stored MatchProjects.
 * Each migration must return the exact same project object reference when no
 * changes are needed so untouched matches (such as live-scouted ones) are not
 * rewritten unnecessarily.
 */
export const MATCH_MIGRATIONS: readonly MatchMigration[] = [
  {
    id: 1,
    name: 'repair-datavolley-ball-directions',
    run: repairDataVolleyBallDirections,
  },
];

export const LATEST_MATCH_MIGRATION_VERSION = MATCH_MIGRATIONS.length > 0
  ? MATCH_MIGRATIONS[MATCH_MIGRATIONS.length - 1].id
  : 0;

export interface MatchMigrationResult {
  project: MatchProject;
  changed: boolean;
  appliedIds: number[];
  warning?: string;
  error?: unknown;
}

/**
 * Applies any pending migrations (id > project.metadata.migrationVersion) in order.
 * - Never mutates the input project.
 * - Leaves matches from a newer app version untouched and returns a warning.
 * - If any migration throws, logs the error and returns the original project untouched.
 */
export function runMatchMigrations(
  project: MatchProject,
  migrations: readonly MatchMigration[] = MATCH_MIGRATIONS,
): MatchMigrationResult {
  const currentVersion = project.metadata.migrationVersion ?? 0;
  const latestVersion = migrations.length > 0 ? migrations[migrations.length - 1].id : 0;

  if (currentVersion > latestVersion) {
    const warning = `Match "${project.metadata.id}" has migration version ${currentVersion}, newer than supported version ${latestVersion}; left untouched.`;
    console.warn(`[OpenVolleyScout] ${warning}`);
    return { project, changed: false, appliedIds: [], warning };
  }

  if (currentVersion === latestVersion) {
    return { project, changed: false, appliedIds: [] };
  }

  const pending = migrations
    .filter((migration) => migration.id > currentVersion)
    .sort((a, b) => a.id - b.id);

  let current = project;
  let dataChanged = false;
  const appliedIds: number[] = [];

  for (const migration of pending) {
    try {
      const next = migration.run(current);
      if (next !== current) {
        dataChanged = true;
        current = next;
      }
      appliedIds.push(migration.id);
    } catch (error) {
      console.error(
        `[OpenVolleyScout] Match migration #${migration.id} (${migration.name}) failed for match "${project.metadata.id}":`,
        error,
      );
      return { project, changed: false, appliedIds: [], error };
    }
  }

  if (!dataChanged) {
    return { project, changed: false, appliedIds: [] };
  }

  const migrated: MatchProject = {
    ...current,
    metadata: {
      ...current.metadata,
      migrationVersion: latestVersion,
    },
  };
  return { project: migrated, changed: true, appliedIds };
}
