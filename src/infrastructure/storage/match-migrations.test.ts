// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it, vi } from 'vitest';
import { normalizeMatchProject } from '@src/domain/match';
import type { MatchProject } from '@src/domain/match/types';
import { buildOvsBundle } from '@src/features/sync/ovs-bundle/zip-bundle';
import { parseOvsBundleFile } from '@src/features/sync/ovs-bundle';
import { buildOvsBackupBundle } from '@src/features/sync/backup-bundle/zip-backup-bundle';
import { parseOvsBackupBundleFile } from '@src/features/sync/backup-bundle';
import {
  LATEST_MATCH_MIGRATION_VERSION,
  runMatchMigrations,
  type MatchMigration,
} from './match-migrations';

function makeProject(options: { imported?: boolean; migrationVersion?: number } = {}): MatchProject {
  return normalizeMatchProject({
    metadata: {
      id: 'mig-match-1',
      title: 'Migration Test',
      format: 'best_of_5',
      schemaVersion: 5,
      ...(options.migrationVersion !== undefined ? { migrationVersion: options.migrationVersion } : {}),
    },
    phase: 'analysis',
    createdAt: 1000,
    updatedAt: 2000,
    homeTeam: { id: 'h1', code: 'HOM', name: 'Home', players: [], staff: { headCoach: '', assistantCoach: '' } },
    awayTeam: { id: 'a1', code: 'AWY', name: 'Away', players: [], staff: { headCoach: '', assistantCoach: '' } },
    homeSelection: { teamId: 'h1', teamName: 'Home', source: 'manual_entry', staff: { headCoach: '', assistantCoach: '' }, roster: [] },
    awaySelection: { teamId: 'a1', teamName: 'Away', source: 'manual_entry', staff: { headCoach: '', assistantCoach: '' }, roster: [] },
    events: [
      {
        id: 'e1',
        type: 'touch_recorded',
        createdAt: 1000,
        touch: {
          id: 't1',
          setNumber: 1,
          rallyNumber: 1,
          sequenceNumber: 1,
          teamSide: 'home',
          skill: 'attack',
          evaluation: '+',
          createdAt: 1000,
          startZoneCode: '4',
          endZoneCode: '6d',
        },
      },
    ],
    ...(options.imported ? { dataVolleyCodeTables: { attackCombinations: [], setterCalls: [] } } : {}),
  });
}

describe('versioned match migrations', () => {
  it('runs missing migrations once and records migrationVersion', () => {
    const project = makeProject({ imported: true });
    const first = runMatchMigrations(project);
    expect(first.changed).toBe(true);
    expect(first.appliedIds).toEqual([1]);
    expect(first.project.metadata.migrationVersion).toBe(LATEST_MATCH_MIGRATION_VERSION);
    const touch = first.project.events[0];
    expect(touch.type === 'touch_recorded' && touch.touch.ballDirection).toBeDefined();

    // Second run is a no-op (run-once + idempotent).
    const second = runMatchMigrations(first.project);
    expect(second.changed).toBe(false);
    expect(second.appliedIds).toEqual([]);
    expect(second.project).toBe(first.project);
  });

  it('is idempotent even if migrationVersion is reset', () => {
    const first = runMatchMigrations(makeProject({ imported: true }));
    const resetVersion: MatchProject = {
      ...first.project,
      metadata: { ...first.project.metadata, migrationVersion: 0 },
    };
    const rerun = runMatchMigrations(resetVersion);
    expect(rerun.changed).toBe(false);
    expect(rerun.project.events).toEqual(first.project.events);
  });

  it('does not touch live-scouted matches that do not need migration', () => {
    const live = makeProject({ imported: false });
    const result = runMatchMigrations(live);
    expect(result.changed).toBe(false);
    expect(result.project).toBe(live);
  });

  it('leaves the match untouched and logs an error when a migration throws', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failingMigrations: MatchMigration[] = [
      {
        id: 1,
        name: 'broken-migration',
        run: () => {
          throw new Error('boom');
        },
      },
    ];
    const original = makeProject({ imported: true });
    const result = runMatchMigrations(original, failingMigrations);

    expect(result.changed).toBe(false);
    expect(result.project).toBe(original);
    expect(result.error).toBeInstanceOf(Error);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });

  it('leaves a match from a newer app version untouched with a warning', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const future = makeProject({ imported: true, migrationVersion: LATEST_MATCH_MIGRATION_VERSION + 5 });
    const result = runMatchMigrations(future);

    expect(result.changed).toBe(false);
    expect(result.project).toBe(future);
    expect(result.warning).toContain('newer than supported');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });

  it('carries migrationVersion through .ovs single-match and backup-bundle round trips', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    // 1. Older .ovs file (no migrationVersion, missing ballDirection) is migrated on import.
    const olderProject = makeProject({ imported: true });
    const olderBytes = buildOvsBundle(olderProject, 'dev-1');
    const parsedOlder = parseOvsBundleFile(olderBytes);
    expect(parsedOlder.meta.metadata.migrationVersion).toBe(LATEST_MATCH_MIGRATION_VERSION);
    expect(parsedOlder.migrationWarning).toBeUndefined();
    const repairedEvent = parsedOlder.events[0];
    expect(repairedEvent.type === 'touch_recorded' && repairedEvent.touch.ballDirection).toBeDefined();

    // 2. Newer .ovs file (migrationVersion > LATEST) is left untouched with a warning.
    const newerProject = makeProject({ imported: true, migrationVersion: LATEST_MATCH_MIGRATION_VERSION + 3 });
    const newerBytes = buildOvsBundle(newerProject, 'dev-2');
    const parsedNewer = parseOvsBundleFile(newerBytes);
    expect(parsedNewer.meta.metadata.migrationVersion).toBe(LATEST_MATCH_MIGRATION_VERSION + 3);
    expect(parsedNewer.migrationWarning).toContain('newer than supported');
    const untouchedEvent = parsedNewer.events[0];
    expect(untouchedEvent.type === 'touch_recorded' && untouchedEvent.touch.ballDirection).toBeUndefined();

    // 3. Backup bundle round trip migrates older and warns on newer.
    const backupBytes = buildOvsBackupBundle(
      [olderProject, { ...newerProject, metadata: { ...newerProject.metadata, id: 'mig-match-2' } }],
      { teams: [], rosters: [], competitions: [], opponentReports: [] },
      {},
      'dev-3',
    );
    const parsedBackup = parseOvsBackupBundleFile(backupBytes);
    expect(parsedBackup.matches).toHaveLength(2);
    expect(parsedBackup.matches[0].meta.metadata.migrationVersion).toBe(LATEST_MATCH_MIGRATION_VERSION);
    expect(parsedBackup.matches[0].migrationWarning).toBeUndefined();
    expect(parsedBackup.matches[1].meta.metadata.migrationVersion).toBe(LATEST_MATCH_MIGRATION_VERSION + 3);
    expect(parsedBackup.matches[1].migrationWarning).toContain('newer than supported');

    warnSpy.mockRestore();
  });
});
