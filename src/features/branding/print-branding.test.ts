// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { matchProjectDb } from '@src/infrastructure/db/match-project-db';
import { deleteAppAsset, differsFromLocalAppAsset, putAppAsset, restoreAppAssets } from '@src/infrastructure/storage/app-asset-storage';
import { createLiveCloudSyncArchive } from '@src/features/sync/cloud/archive-adapter';
import { diffCloudSnapshots, snapshotStamps } from '@src/features/sync/cloud/merge';
import { subscribeDataChanges } from '@src/features/sync/cloud/local-change-bus';
import {
  hydratePrintBranding,
  readPrintLogo,
  readStoredPrintThemeChoice,
  savePrintLogo,
  savePrintThemeChoice,
  setPrintBrandingPersister,
  subscribePrintTheme,
} from '@src/lib/theme/print-theme';
import { hydratePrintBrandingFromDatabase, refreshPrintBrandingFromDatabase } from './print-branding';

const LOGO = 'data:image/png;base64,iVBORw0KGgo=';

beforeEach(async () => {
  await Promise.all(matchProjectDb.tables.map((table) => table.clear()));
  window.localStorage.clear();
  setPrintBrandingPersister(null);
  hydratePrintBranding(null);
});

describe('print look and club logo in the database', () => {
  it('copies what this browser kept before into the database at start-up, then saves every change there', async () => {
    window.localStorage.setItem('openvolleyscout.printTheme', JSON.stringify({ id: 'high-contrast' }));
    window.localStorage.setItem('openvolleyscout.printLogo', LOGO);
    await hydratePrintBrandingFromDatabase();
    expect((await matchProjectDb.appAssets.get('printTheme'))?.value).toEqual({ id: 'high-contrast' });
    expect((await matchProjectDb.appAssets.get('image:clubLogo'))?.value).toBe(LOGO);

    const changes: string[] = [];
    const stop = subscribeDataChanges((origin) => changes.push(origin));
    savePrintThemeChoice({ id: 'black-white' });
    savePrintLogo(null);
    await refreshPrintBrandingFromDatabase();
    stop();
    expect((await matchProjectDb.appAssets.get('printTheme'))?.value).toEqual({ id: 'black-white' });
    expect(await matchProjectDb.appAssets.get('image:clubLogo')).toBeUndefined();
    expect(await matchProjectDb.syncDeletions.get('appAssets:image:clubLogo')).toBeTruthy();
    expect(changes).toEqual(['local', 'local']);
    expect(readStoredPrintThemeChoice()).toEqual({ id: 'black-white' });
    expect(readPrintLogo()).toBeNull();
  });

  it('does not bring back from localStorage a logo deleted on another device', async () => {
    await putAppAsset({ id: 'image:clubLogo', kind: 'image', value: LOGO });
    await deleteAppAsset('image:clubLogo');
    window.localStorage.setItem('openvolleyscout.printLogo', LOGO);
    await hydratePrintBrandingFromDatabase();
    expect(await matchProjectDb.appAssets.get('image:clubLogo')).toBeUndefined();
    expect(readPrintLogo()).toBeNull();
    expect(window.localStorage.getItem('openvolleyscout.printLogo')).toBeNull();
  });

  it('dates every change after the one it replaces and ignores a save of the same value', async () => {
    await putAppAsset({ id: 'printTheme', kind: 'printTheme', value: { id: 'ovs' } }, new Date('2026-11-27T10:00:00.000Z'));
    expect(await putAppAsset({ id: 'printTheme', kind: 'printTheme', value: { id: 'ovs' } }, new Date('2026-11-27T11:00:00.000Z'))).toBe(false);
    // A clock behind the last change still gives a later time.
    await putAppAsset({ id: 'printTheme', kind: 'printTheme', value: { id: 'club' } }, new Date('2026-11-26T10:00:00.000Z'));
    expect((await matchProjectDb.appAssets.get('printTheme'))?.updatedAt).toBe('2026-11-27T10:00:00.001Z');
  });

  it('restores from a backup the values that differ, also when they were changed or removed here afterwards', async () => {
    await putAppAsset({ id: 'printTheme', kind: 'printTheme', value: { id: 'ovs' } }, new Date('2026-11-27T10:00:00.000Z'));
    await putAppAsset({ id: 'image:clubLogo', kind: 'image', value: LOGO }, new Date('2026-11-27T10:00:00.000Z'));
    await deleteAppAsset('image:clubLogo', new Date('2026-11-27T11:00:00.000Z'));
    const backup = [
      { id: 'printTheme', kind: 'printTheme' as const, value: { id: 'club' }, updatedAt: '2026-11-20T10:00:00.000Z' },
      { id: 'image:clubLogo', kind: 'image' as const, value: LOGO, updatedAt: '2026-11-20T10:00:00.000Z' },
    ];
    expect(await differsFromLocalAppAsset(backup[0])).toBe(true);
    expect(await restoreAppAssets(backup, new Date('2026-11-27T12:00:00.000Z'))).toBe(2);
    const theme = await matchProjectDb.appAssets.get('printTheme');
    expect(theme?.value).toEqual({ id: 'club' });
    // Saved as a new change, so cloud sync passes it on.
    expect(theme?.updatedAt).toBe('2026-11-27T12:00:00.000Z');
    expect((await matchProjectDb.appAssets.get('image:clubLogo'))?.value).toBe(LOGO);
    expect(await matchProjectDb.syncDeletions.get('appAssets:image:clubLogo')).toBeUndefined();
    // Restoring the same backup again changes nothing.
    expect(await differsFromLocalAppAsset(backup[0])).toBe(false);
    expect(await restoreAppAssets(backup)).toBe(0);
  });

  it('dates a value copied from localStorage at the oldest time, so changes made elsewhere win', async () => {
    window.localStorage.setItem('openvolleyscout.printLogo', LOGO);
    await hydratePrintBrandingFromDatabase();
    expect((await matchProjectDb.appAssets.get('image:clubLogo'))?.updatedAt).toBe(new Date(0).toISOString());
  });

  it('does not overwrite a logo saved in Settings while the start-up copy is running', async () => {
    const OLD = 'data:image/png;base64,T0xET0xE';
    window.localStorage.setItem('openvolleyscout.printLogo', OLD);
    const start = hydratePrintBrandingFromDatabase();
    savePrintLogo(LOGO);
    await start;
    await refreshPrintBrandingFromDatabase();
    const row = await matchProjectDb.appAssets.get('image:clubLogo');
    expect(row?.value).toBe(LOGO);
    expect(row?.updatedAt).not.toBe(new Date(0).toISOString());
    expect(readPrintLogo()).toBe(LOGO);
    expect(window.localStorage.getItem('openvolleyscout.printLogo')).toBe(LOGO);
  });

  it('cloud sync writes the values received and the printed documents use them at once', async () => {
    await hydratePrintBrandingFromDatabase();
    const archive = createLiveCloudSyncArchive();
    const local = await archive.snapshot();
    expect(local.appAssets).toEqual([]);
    let notified = 0;
    const stop = subscribePrintTheme(() => { notified += 1; });
    const merged = {
      ...local,
      appAssets: [
        { id: 'printTheme', kind: 'printTheme' as const, value: { id: 'club', club: { primary: '#112233', accent: '#aa5500' } }, updatedAt: '2026-11-27T10:00:00.000Z' },
        { id: 'image:clubLogo', kind: 'image' as const, value: LOGO, updatedAt: '2026-11-27T10:00:00.000Z' },
      ],
    };
    expect(await archive.applySync(diffCloudSnapshots(local, merged), snapshotStamps(local))).toBe(2);
    expect(readPrintLogo()).toBe(LOGO);
    expect(readStoredPrintThemeChoice()?.id).toBe('club');
    expect(notified).toBeGreaterThan(0);

    // Then the logo is deleted on the other device.
    const before = await archive.snapshot();
    const deleted = { ...before, appAssets: before.appAssets?.filter((a) => a.id !== 'image:clubLogo'), deletions: { 'appAssets:image:clubLogo': '2026-11-27T11:00:00.000Z' } };
    expect(await archive.applySync(diffCloudSnapshots(before, deleted), snapshotStamps(before))).toBe(1);
    stop();
    expect(readPrintLogo()).toBeNull();
    expect((await archive.snapshot()).deletions).toEqual({ 'appAssets:image:clubLogo': '2026-11-27T11:00:00.000Z' });
  });
});
