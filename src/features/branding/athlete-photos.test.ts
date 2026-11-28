// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { matchProjectDb } from '@src/infrastructure/db/match-project-db';
import { restoreAppAssets } from '@src/infrastructure/storage/app-asset-storage';
import { createLiveCloudSyncArchive } from '@src/features/sync/cloud/archive-adapter';
import { diffCloudSnapshots, snapshotStamps } from '@src/features/sync/cloud/merge';
import { subscribeDataChanges } from '@src/features/sync/cloud/local-change-bus';
import { isUsableAppAsset, readAppAssetRecords } from './app-asset-records';
import {
  MAX_ATHLETE_PHOTO_LENGTH,
  archivedPlayerIdFromPhotoAssetId,
  athletePhotoAssetId,
  isAthletePhoto,
  isAthletePhotoAssetId,
  remapRestoredAthletePhotos,
  resolveAthletePhotoIds,
} from './athlete-photos';
import {
  loadAthletePhoto,
  loadAthletePhotos,
  removeAthletePhoto,
  removeAthletePhotos,
  saveAthletePhoto,
  saveAthletePhotoChanges,
} from './athlete-photo-storage';
import { useAthletePhotos } from './use-athlete-photos';

const PHOTO = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
const OTHER = 'data:image/png;base64,iVBORw0KGgo=';

beforeEach(async () => {
  await Promise.all(matchProjectDb.tables.map((table) => table.clear()));
});

describe('athlete photo ids and values', () => {
  it('names a photo after the archived athlete', () => {
    expect(athletePhotoAssetId('p-1')).toBe('image:athlete:p-1');
    expect(isAthletePhotoAssetId('image:athlete:p-1')).toBe(true);
    expect(isAthletePhotoAssetId('image:athlete:')).toBe(false);
    expect(isAthletePhotoAssetId('image:clubLogo')).toBe(false);
    expect(archivedPlayerIdFromPhotoAssetId('image:athlete:p-1')).toBe('p-1');
    expect(archivedPlayerIdFromPhotoAssetId('printTheme')).toBeNull();
  });

  it('accepts only small PNG or JPEG data URLs', () => {
    expect(isAthletePhoto(PHOTO)).toBe(true);
    expect(isAthletePhoto(OTHER)).toBe(true);
    expect(isAthletePhoto('data:image/webp;base64,UklGR==')).toBe(false);
    expect(isAthletePhoto('data:image/svg+xml;base64,PHN2Zz4=')).toBe(false);
    expect(isAthletePhoto('https://example.org/a.jpg')).toBe(false);
    expect(isAthletePhoto(`data:image/jpeg;base64,${'A'.repeat(MAX_ATHLETE_PHOTO_LENGTH)}`)).toBe(false);
    expect(isAthletePhoto(42)).toBe(false);
  });

  it('a backup or cloud file may carry a good photo, never a bad one', () => {
    const record = (id: string, kind: string, value: unknown) => ({ id, kind: kind as 'image', value, updatedAt: '2026-11-27T10:00:00.000Z' });
    expect(isUsableAppAsset(record('image:athlete:p-1', 'image', PHOTO))).toBe(true);
    expect(isUsableAppAsset(record('image:athlete:p-1', 'image', 'data:text/html;base64,PGI+'))).toBe(false);
    expect(isUsableAppAsset(record('image:athlete:p-1', 'printTheme', PHOTO))).toBe(false);
    // Images of a later version are kept as they are.
    expect(isUsableAppAsset(record('image:somethingNew', 'image', 'data:image/avif;base64,AAAA'))).toBe(true);
  });
});

describe('athlete photos in the database', () => {
  it('saves, replaces and removes a photo, leaving a deletion for cloud sync', async () => {
    const changes: string[] = [];
    const stop = subscribeDataChanges((origin) => changes.push(origin));
    expect(await saveAthletePhoto('p-1', PHOTO)).toBe(true);
    expect(await saveAthletePhoto('p-1', PHOTO)).toBe(false);
    expect(await loadAthletePhoto('p-1')).toBe(PHOTO);
    expect(await saveAthletePhoto('p-1', OTHER)).toBe(true);
    const row = await matchProjectDb.appAssets.get('image:athlete:p-1');
    expect(row).toMatchObject({ kind: 'image', value: OTHER });
    expect(await removeAthletePhoto('p-1')).toBe(true);
    expect(await removeAthletePhoto('p-1')).toBe(false);
    stop();
    expect(await loadAthletePhoto('p-1')).toBeNull();
    expect(await matchProjectDb.syncDeletions.get('appAssets:image:athlete:p-1')).toBeTruthy();
    expect(changes).toEqual(['local', 'local', 'local']);
  });

  it('refuses a value that is not a photo and writes nothing', async () => {
    await expect(saveAthletePhoto('p-1', 'data:image/webp;base64,UklGR==')).rejects.toThrow();
    await expect(saveAthletePhoto('', PHOTO)).rejects.toThrow();
    await expect(saveAthletePhotoChanges(new Map([['p-1', PHOTO], ['p-2', 'nope']]))).rejects.toThrow();
    expect(await matchProjectDb.appAssets.count()).toBe(0);
  });

  it('loads the photos of many athletes at once, skipping missing and broken ones', async () => {
    await saveAthletePhoto('p-1', PHOTO);
    await saveAthletePhoto('p-2', OTHER);
    await matchProjectDb.appAssets.put({ id: 'image:athlete:p-3', kind: 'image', value: 'broken', updatedAt: '2026-11-27T10:00:00.000Z' });
    const photos = await loadAthletePhotos(['p-1', 'p-2', 'p-3', 'p-4', 'p-1']);
    expect([...photos.entries()]).toEqual([['p-1', PHOTO], ['p-2', OTHER]]);
    expect((await loadAthletePhotos([])).size).toBe(0);
  });

  it('writes the changes of a roster with one notice, and removes the photos of several athletes', async () => {
    await saveAthletePhoto('p-1', PHOTO);
    const changes: string[] = [];
    const stop = subscribeDataChanges((origin) => changes.push(origin));
    expect(await saveAthletePhotoChanges(new Map([['p-1', null], ['p-2', PHOTO], ['p-3', OTHER]]))).toBe(3);
    expect(changes).toEqual(['local']);
    expect(await removeAthletePhotos(['p-2', 'p-3', 'p-9'])).toBe(2);
    expect(await removeAthletePhotos(['p-9'])).toBe(0);
    stop();
    expect(changes).toEqual(['local', 'local']);
    expect(await matchProjectDb.appAssets.count()).toBe(0);
    expect((await matchProjectDb.syncDeletions.toArray()).map((row) => row.key).sort())
      .toEqual(['appAssets:image:athlete:p-1', 'appAssets:image:athlete:p-2', 'appAssets:image:athlete:p-3']);
  });

  it('travels in a backup: a restore brings back the photos removed here', async () => {
    await saveAthletePhoto('p-1', PHOTO);
    const backup = readAppAssetRecords(JSON.parse(JSON.stringify(await matchProjectDb.appAssets.toArray()))).filter(isUsableAppAsset);
    await removeAthletePhoto('p-1');
    expect(await restoreAppAssets(backup)).toBe(1);
    expect(await loadAthletePhoto('p-1')).toBe(PHOTO);
    expect(await matchProjectDb.syncDeletions.get('appAssets:image:athlete:p-1')).toBeUndefined();
  });

  it('travels with cloud sync: a photo added or removed on another device arrives here', async () => {
    const archive = createLiveCloudSyncArchive();
    const local = await archive.snapshot();
    const merged = { ...local, appAssets: [{ id: 'image:athlete:p-1', kind: 'image' as const, value: PHOTO, updatedAt: '2026-11-27T10:00:00.000Z' }] };
    expect(await archive.applySync(diffCloudSnapshots(local, merged), snapshotStamps(local))).toBe(1);
    expect(await loadAthletePhoto('p-1')).toBe(PHOTO);
    await saveAthletePhoto('p-2', OTHER);
    expect((await archive.snapshot()).appAssets?.map((asset) => asset.id).sort()).toEqual(['image:athlete:p-1', 'image:athlete:p-2']);

    const before = await archive.snapshot();
    const deleted = { ...before, appAssets: before.appAssets?.filter((asset) => asset.id !== 'image:athlete:p-1'), deletions: { 'appAssets:image:athlete:p-1': '2026-11-27T11:00:00.000Z' } };
    expect(await archive.applySync(diffCloudSnapshots(before, deleted), snapshotStamps(before))).toBe(1);
    expect(await loadAthletePhoto('p-1')).toBeNull();
  });

  it('the hook reads the photos and reads them again when the data changes', async () => {
    await saveAthletePhoto('p-1', PHOTO);
    const { result } = renderHook(({ ids }) => useAthletePhotos(ids), { initialProps: { ids: ['p-1', 'p-2'] } });
    await waitFor(() => expect(result.current.get('p-1')).toBe(PHOTO));
    expect(result.current.has('p-2')).toBe(false);
    await act(async () => { await saveAthletePhoto('p-2', OTHER); });
    await waitFor(() => expect(result.current.get('p-2')).toBe(OTHER));
  });
});

describe('which archived athlete a report player is', () => {
  const roster = [
    { id: 'a-1', jerseyNumber: 7, firstName: 'Anna', lastName: 'Rossi' },
    { id: 'a-2', jerseyNumber: 9, firstName: 'Bea', lastName: 'Bianchi' },
    { id: 'a-3', jerseyNumber: 9, firstName: 'Carla', lastName: 'Verdi' },
    { id: 'a-4', jerseyNumber: 12, firstName: '', lastName: '' },
  ];

  it('uses the archived id of the key, else a unique jersey and name', () => {
    const ids = resolveAthletePhotoIds([
      { key: 'a-1', jersey: '7', name: 'Anna Rossi' },
      { key: '#9|verdi', jersey: '9', name: 'Carla Verdi' },
      { key: 'random-uuid', jersey: '9', name: 'Bea Bianchi' },
      { key: '#7|rossi', jersey: '7', name: 'A. Rossi' },
    ], roster);
    expect([...ids.entries()]).toEqual([['a-1', 'a-1'], ['#9|verdi', 'a-3'], ['random-uuid', 'a-2'], ['#7|rossi', 'a-1']]);
  });

  it('gives no photo when the athlete is not certain or there is no roster', () => {
    const ids = resolveAthletePhotoIds([
      // Two athletes wear 9 and this one has no name.
      { key: '#9|9', jersey: '9', name: '#9' },
      // A name that is on the roster with another jersey.
      { key: '#8|rossi', jersey: '8', name: 'Anna Rossi' },
      // The same jersey but another athlete.
      { key: '#12|neri', jersey: '12', name: 'Neri' },
    ], roster);
    expect(ids.size).toBe(0);
    expect(resolveAthletePhotoIds([{ key: 'a-1', jersey: '7', name: 'Anna Rossi' }], undefined).size).toBe(0);
  });

  it('takes the only athlete with the jersey when the player has no name', () => {
    expect([...resolveAthletePhotoIds([{ key: '#7|7', jersey: '7', name: '#7' }], roster).entries()]).toEqual([['#7|7', 'a-1']]);
  });
});

describe('photos of a backup restored into a team that was here already', () => {
  const rec = (playerId: string, value = PHOTO) => ({ id: athletePhotoAssetId(playerId), kind: 'image' as const, value });

  it('gives the photo of a merged athlete to the athlete here when she has none', () => {
    const remap = new Map([['in-1', 'here-1'], ['in-2', 'here-2'], ['in-3', 'here-3']]);
    const records = [
      { id: 'print-theme', kind: 'theme' as const, value: '{}' },
      rec('in-1'),
      // The athlete here already has a photo: hers stays.
      rec('in-2'),
      // The backup carries a photo for the athlete here too: that one wins.
      rec('in-3'), rec('here-3', OTHER),
      // An athlete that was not merged keeps her id.
      rec('in-4'),
    ];
    const result = remapRestoredAthletePhotos(records, remap, new Set(['here-2']));
    expect(result.map((r) => [r.id, r.value])).toEqual([
      ['print-theme', '{}'],
      [athletePhotoAssetId('here-1'), PHOTO],
      [athletePhotoAssetId('here-3'), OTHER],
      [athletePhotoAssetId('in-4'), PHOTO],
    ]);
  });

  it('two incoming copies of the same athlete give one photo', () => {
    const remap = new Map([['in-1', 'here-1'], ['in-1b', 'here-1']]);
    const result = remapRestoredAthletePhotos([rec('in-1'), rec('in-1b', OTHER)], remap, new Set());
    expect(result.map((r) => [r.id, r.value])).toEqual([[athletePhotoAssetId('here-1'), PHOTO]]);
  });
});
