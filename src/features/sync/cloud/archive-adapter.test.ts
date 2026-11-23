// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MatchProject } from '@src/domain/match/types';
import { createEmptyMatchProject } from '@src/domain/match/factories';
import { matchProjectDb } from '@src/infrastructure/db/match-project-db';
import { matchRepository } from '@src/infrastructure/repositories/match-repository';
import { teamRepository } from '@src/infrastructure/repositories/team-repository';
import { createLiveCloudSyncArchive } from './archive-adapter';
import { diffCloudSnapshots, snapshotStamps } from './merge';

function makeMatch(id: string, updatedAt: number): MatchProject {
  const project = createEmptyMatchProject();
  project.metadata.id = id;
  project.updatedAt = updatedAt;
  return project;
}

beforeEach(async () => {
  await Promise.all(matchProjectDb.tables.map((table) => table.clear()));
});

describe('live cloud sync archive', () => {
  it('remembers deletions in the database, rosters included', async () => {
    await matchRepository.create(makeMatch('m1', 1000));
    await matchRepository.delete('m1');
    await teamRepository.restoreTeam({ id: 't1', name: 'Aurora' } as never);
    await teamRepository.restoreRoster({ id: 'r1', teamId: 't1', players: [] });
    await teamRepository.delete('t1');

    const snapshot = await createLiveCloudSyncArchive().snapshot();
    expect(Object.keys(snapshot.deletions).sort()).toEqual(['matches:m1', 'rosters:r1', 'teams:t1']);
  });

  it('does not overwrite or bring back what changed on this device during a round', async () => {
    const archive = createLiveCloudSyncArchive();
    await matchRepository.create(makeMatch('edited', 1000));
    await matchRepository.create(makeMatch('deleted', 1000));
    const local = await archive.snapshot();

    // While the round runs, the user edits one match and deletes the other.
    await matchRepository.update(makeMatch('edited', 5000));
    await matchRepository.delete('deleted');

    // The round brings older remote versions of both.
    const merged = { ...local, matches: [makeMatch('edited', 2000), makeMatch('deleted', 2000)] };
    const written = await archive.applySync(diffCloudSnapshots(local, merged), snapshotStamps(local));

    expect(written).toBe(0);
    expect((await matchProjectDb.matchProjects.get('edited'))?.updatedAt).toBe(5000);
    expect(await matchProjectDb.matchProjects.get('deleted')).toBeUndefined();
    expect((await archive.snapshot()).deletions['matches:deleted']).toBeTruthy();
  });

  it('writes remote changes and deletions for records unchanged here', async () => {
    const archive = createLiveCloudSyncArchive();
    await matchRepository.create(makeMatch('a', 1000));
    await matchRepository.create(makeMatch('b', 1000));
    const local = await archive.snapshot();
    const merged = {
      ...local,
      matches: [makeMatch('a', 3000)],
      deletions: { 'matches:b': new Date(4000).toISOString() },
    };
    const written = await archive.applySync(diffCloudSnapshots(local, merged), snapshotStamps(local));

    expect(written).toBe(2);
    expect((await matchProjectDb.matchProjects.get('a'))?.updatedAt).toBe(3000);
    expect(await matchProjectDb.matchSummaries.get('b')).toBeUndefined();
    expect((await archive.snapshot()).deletions).toEqual({ 'matches:b': new Date(4000).toISOString() });
  });

  it('keeps a change later than the version it replaces when the clock is behind', async () => {
    await matchRepository.create(makeMatch('m', 9000));
    const saved = await matchRepository.update(makeMatch('m', 5000));
    expect(saved.updatedAt).toBe(9001);
  });

  it('keeps sync state in the database', async () => {
    const archive = createLiveCloudSyncArchive();
    await archive.setMeta('sync.fileId', 'file-1');
    expect(await archive.getMeta('sync.fileId')).toBe('file-1');
    await archive.setMeta('sync.fileId', null);
    expect(await archive.getMeta('sync.fileId')).toBeNull();
  });
});
