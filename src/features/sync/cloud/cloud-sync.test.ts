// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it, vi } from 'vitest';
import type { MatchProject } from '@src/domain/match/types';
import { createEmptyMatchProject } from '@src/domain/match/factories';
import { PkceAuth } from './auth-pkce';
import { CloudSyncController } from './controller';
import { DriveClient } from './drive';
import { DropboxClient } from './dropbox';
import { META, synchronise } from './engine';
import { readCloudSyncFile, writeCloudSyncFile } from './file';
import { type CloudSnapshot, EMPTY_CLOUD_SNAPSHOT, diffCloudSnapshots, mergeCloudSnapshots } from './merge';
import type { AppAssetRecord } from '@src/infrastructure/db/match-project-db';
import { OneDriveClient } from './onedrive';
import type { SyncProvider } from './provider';
import { type Fetch, type RemoteStorage, StorageError } from './storage';
import { makeMemoryArchive, makeMemoryRemote } from './test-helpers';

function makeMatch(id: string, updatedAt: string, competition = 'League'): MatchProject {
  const project = createEmptyMatchProject();
  project.metadata.id = id;
  project.homeSelection.teamName = 'Aurora';
  project.awaySelection.teamName = 'Boreal';
  project.updatedAt = Date.parse(updatedAt);
  project.metadata.competition = competition;
  return {
    ...project,
    homeTeam: { ...project.homeTeam, name: 'Aurora' },
    awayTeam: { ...project.awayTeam, name: 'Boreal' },
  };
}

describe('cloud snapshot merge', () => {
  it('merges one-sided edits, honours deletion tombstones, and preserves concurrent match conflicts as copies', () => {
    const baseMatch = makeMatch('m1', '2026-11-01T10:00:00.000Z', 'Cup');
    const toDelete = makeMatch('m2', '2026-11-01T10:00:00.000Z', 'Cup');
    const localBase: CloudSnapshot = { ...EMPTY_CLOUD_SNAPSHOT, matches: [baseMatch, toDelete] };
    const { base } = mergeCloudSnapshots(localBase, localBase, {}, () => 'unused', new Date('2026-11-01T10:05:00.000Z'));

    // Local edits m1 (newer) and deletes m2; remote edits m1 (older) and adds m3.
    const localEdited = makeMatch('m1', '2026-11-02T12:00:00.000Z', 'Cup Local');
    const remoteEdited = makeMatch('m1', '2026-11-02T11:00:00.000Z', 'Cup Remote');
    const remoteNew = makeMatch('m3', '2026-11-02T11:30:00.000Z', 'Friendly');

    const local: CloudSnapshot = {
      ...EMPTY_CLOUD_SNAPSHOT,
      matches: [localEdited],
      deletions: { 'matches:m2': '2026-11-02T10:00:00.000Z' },
    };
    const remote: CloudSnapshot = {
      ...EMPTY_CLOUD_SNAPSHOT,
      matches: [remoteEdited, toDelete, remoteNew],
    };

    const result = mergeCloudSnapshots(local, remote, base, () => 'm1-copy', new Date('2026-11-02T12:05:00.000Z'));
    expect(result.conflicts).toBe(1);
    expect(result.merged.matches.map((m) => m.metadata.id).sort()).toEqual(['m1', 'm1-copy', 'm3']);
    expect(result.merged.matches.find((m) => m.metadata.id === 'm1')?.metadata.competition).toBe('Cup Local');
    expect(result.merged.matches.find((m) => m.metadata.id === 'm1-copy')?.metadata.competition).toBe('Cup Remote (copy)');
    expect(result.merged.deletions['matches:m2']).toBe('2026-11-02T10:00:00.000Z');
  });
});

const LOGO_A = 'data:image/png;base64,QUFBQQ==';
const LOGO_B = 'data:image/png;base64,QkJCQg==';
const logo = (value: string, updatedAt: string): AppAssetRecord => ({ id: 'image:clubLogo', kind: 'image', value, updatedAt });
const theme = (id: string, updatedAt: string): AppAssetRecord => ({ id: 'printTheme', kind: 'printTheme', value: { id }, updatedAt });

describe('cloud merge of the print look and the club logo', () => {
  const start = { ...EMPTY_CLOUD_SNAPSHOT, appAssets: [logo(LOGO_A, '2026-11-01T10:00:00.000Z'), theme('ovs', '2026-11-01T10:00:00.000Z')] };
  const { base } = mergeCloudSnapshots(start, start, {}, () => 'unused', new Date('2026-11-01T10:05:00.000Z'));

  it('keeps the newer change when both devices changed the same value', () => {
    const local: CloudSnapshot = { ...start, appAssets: [logo(LOGO_B, '2026-11-02T09:00:00.000Z'), theme('club', '2026-11-02T08:00:00.000Z')] };
    const remote: CloudSnapshot = { ...start, appAssets: [logo(LOGO_A.replace('QUFB', 'Q0ND'), '2026-11-02T08:30:00.000Z'), theme('black-white', '2026-11-02T08:45:00.000Z')] };
    const { merged, conflicts } = mergeCloudSnapshots(local, remote, base, () => 'unused', new Date('2026-11-02T10:00:00.000Z'));
    expect(conflicts).toBe(0);
    expect(merged.appAssets?.find((a) => a.id === 'image:clubLogo')?.value).toBe(LOGO_B);
    expect(merged.appAssets?.find((a) => a.id === 'printTheme')?.value).toEqual({ id: 'black-white' });
    expect(merged.appAssets).toHaveLength(2);
  });

  it('takes a change made on one side only', () => {
    const remote: CloudSnapshot = { ...start, appAssets: [logo(LOGO_B, '2026-11-02T08:30:00.000Z'), theme('ovs', '2026-11-01T10:00:00.000Z')] };
    const { merged } = mergeCloudSnapshots(start, remote, base, () => 'unused', new Date('2026-11-02T10:00:00.000Z'));
    expect(merged.appAssets?.find((a) => a.id === 'image:clubLogo')?.value).toBe(LOGO_B);
    const diff = diffCloudSnapshots(start, merged);
    expect(diff.putAppAssets.map((a) => a.id)).toEqual(['image:clubLogo']);
  });

  it('removes a logo deleted on one device and unchanged on the other', () => {
    const local: CloudSnapshot = {
      ...start,
      appAssets: [theme('ovs', '2026-11-01T10:00:00.000Z')],
      deletions: { 'appAssets:image:clubLogo': '2026-11-02T09:00:00.000Z' },
    };
    const { merged } = mergeCloudSnapshots(local, start, base, () => 'unused', new Date('2026-11-02T10:00:00.000Z'));
    expect(merged.appAssets?.map((a) => a.id)).toEqual(['printTheme']);
    expect(merged.deletions['appAssets:image:clubLogo']).toBe('2026-11-02T09:00:00.000Z');
    const toRemote = diffCloudSnapshots(start, merged);
    expect(toRemote.deleteIds.appAssets).toEqual(['image:clubLogo']);
  });

  it('keeps the values of this device when the cloud file was written before they were synced', () => {
    const remote: CloudSnapshot = { ...EMPTY_CLOUD_SNAPSHOT, appAssets: undefined };
    const { merged } = mergeCloudSnapshots(start, remote, {}, () => 'unused', new Date('2026-11-02T10:00:00.000Z'));
    expect(merged.appAssets).toEqual(start.appAssets);
    expect(diffCloudSnapshots(start, merged).changed).toBe(false);
  });

  it('lets a change or a deletion made elsewhere win over a value copied from an older version of the app', () => {
    // Device B upgrades late: its logo comes from localStorage and is dated at the oldest time.
    const legacy: CloudSnapshot = { ...EMPTY_CLOUD_SNAPSHOT, appAssets: [logo(LOGO_A, new Date(0).toISOString())] };
    const deletedRemote: CloudSnapshot = { ...EMPTY_CLOUD_SNAPSHOT, deletions: { 'appAssets:image:clubLogo': '2026-11-02T09:00:00.000Z' } };
    const afterDeletion = mergeCloudSnapshots(legacy, deletedRemote, {}, () => 'unused', new Date('2026-11-03T10:00:00.000Z')).merged;
    expect(afterDeletion.appAssets).toEqual([]);
    expect(afterDeletion.deletions['appAssets:image:clubLogo']).toBe('2026-11-02T09:00:00.000Z');

    const changedRemote: CloudSnapshot = { ...EMPTY_CLOUD_SNAPSHOT, appAssets: [logo(LOGO_B, '2026-11-02T09:00:00.000Z')] };
    const afterChange = mergeCloudSnapshots(legacy, changedRemote, {}, () => 'unused', new Date('2026-11-03T10:00:00.000Z')).merged;
    expect(afterChange.appAssets?.map((a) => a.value)).toEqual([LOGO_B]);
  });

  it('keeps a value saved by a later version of the app as it is, without writing its own one back', () => {
    // A later version adds a theme and a field this version does not know.
    const future: AppAssetRecord = { id: 'printTheme', kind: 'printTheme', value: { id: 'sepia', paper: 'cream' }, updatedAt: '2026-11-02T09:00:00.000Z' };
    const remote = readCloudSyncFile(writeCloudSyncFile({ ...start, appAssets: [logo(LOGO_A, '2026-11-01T10:00:00.000Z'), future] }));
    expect(remote.appAssets?.find((a) => a.id === 'printTheme')).toEqual(future);
    const { merged } = mergeCloudSnapshots(start, remote, base, () => 'unused', new Date('2026-11-03T10:00:00.000Z'));
    expect(merged.appAssets?.find((a) => a.id === 'printTheme')).toEqual(future);
    expect(diffCloudSnapshots(remote, merged).changed).toBe(false);
  });

  it('carries them in the cloud file; an older file reads as having none', () => {
    const read = readCloudSyncFile(writeCloudSyncFile(start));
    expect(read.appAssets).toEqual(start.appAssets);
    const legacy = readCloudSyncFile(writeCloudSyncFile({ ...EMPTY_CLOUD_SNAPSHOT, appAssets: undefined }));
    expect(legacy.appAssets).toEqual([]);
  });
});

describe('cloud synchronisation engine and controller', () => {
  it('uploads initial archive, syncs across two devices, and retries on remote version conflict', async () => {
    const remote = makeMemoryRemote();
    const deviceA = makeMemoryArchive({ matches: [makeMatch('m1', '2026-11-22T10:00:00.000Z')] });
    const deviceB = makeMemoryArchive({ matches: [makeMatch('m2', '2026-11-22T10:01:00.000Z')] });
    const auth = { token: async () => 'tok', invalidate: vi.fn(), signOut: vi.fn() };

    const outA = await synchronise({ archive: deviceA, auth, storage: () => remote });
    expect(outA).toMatchObject({ done: true, uploaded: true, conflicts: 0 });
    expect(remote.file).not.toBeNull();

    remote.conflictOnce = true;
    const outB = await synchronise({ archive: deviceB, auth, storage: () => remote });
    expect(outB).toMatchObject({ done: true, uploaded: true, received: 1, conflicts: 0 });
    expect(deviceB.state.matches.map((m) => m.metadata.id).sort()).toEqual(['m1', 'm2']);

    // Device A pulls m2 on next sync.
    const outA2 = await synchronise({ archive: deviceA, auth, storage: () => remote });
    expect(outA2).toMatchObject({ done: true, uploaded: false, received: 1 });
    expect(deviceA.state.matches.map((m) => m.metadata.id).sort()).toEqual(['m1', 'm2']);
  });

  it('invalidates token and retries once on HTTP 401', async () => {
    const archive = makeMemoryArchive();
    let calls = 0;
    const auth = {
      token: vi.fn(async () => (calls++ === 0 ? 'stale' : 'fresh')),
      invalidate: vi.fn(),
      signOut: vi.fn(),
    };
    const remote = makeMemoryRemote();
    const storage = (token: string): RemoteStorage => ({
      ...remote,
      findArchive: async () => {
        if (token === 'stale') throw new StorageError(401);
        return remote.findArchive();
      },
    });
    const out = await synchronise({ archive, auth, storage });
    expect(out.done).toBe(true);
    expect(auth.invalidate).toHaveBeenCalledTimes(1);
    expect(auth.token).toHaveBeenCalledTimes(2);
  });

  it('connects, syncs, and disconnects with optional remote trash via CloudSyncController', async () => {
    const archive = makeMemoryArchive({ matches: [makeMatch('m1', '2026-11-22T10:00:00.000Z')] });
    const remote = makeMemoryRemote();
    const provider: SyncProvider = {
      id: 'dropbox',
      platforms: ['web', 'desktop'],
      available: () => true,
      createAuth: async () => ({ token: async () => 'tok', invalidate: vi.fn(), signOut: vi.fn(async () => {}) }),
      storage: () => remote,
      videos: () => { throw new Error('not used'); },
    };
    const controller = new CloudSyncController(archive);
    expect(await controller.connect(provider)).toBe(true);
    expect(controller.status.state).toBe('ok');
    expect(controller.status.provider).toBe('dropbox');
    expect(await archive.getMeta(META.fileId)).toBe('remote-1');
    expect(remote.file).not.toBeNull();

    await controller.disconnect(true);
    expect(controller.status.state).toBe('off');
    expect(remote.file).toBeNull();
    expect(await archive.getMeta(META.enabled)).toBe(false);
    controller.dispose();
  });
});

describe('cloud storage clients', () => {
  it('handles DriveClient find, update conflict, and trash', async () => {
    const fetchFn: Fetch = vi.fn(async (url, init) => {
      if (url.includes('appProperties')) {
        return new Response(JSON.stringify({ files: [{ id: 'f1', version: '7' }] }), { status: 200 });
      }
      if (url.includes('/f1?fields=version,trashed')) {
        return new Response(JSON.stringify({ version: '8', trashed: false }), { status: 200 });
      }
      if (init?.method === 'PATCH' && url.endsWith('/f1')) {
        return new Response(JSON.stringify({}), { status: 200 });
      }
      return new Response(null, { status: 404 });
    });
    const client = new DriveClient('tok', fetchFn);
    expect(await client.findArchive()).toEqual({ id: 'f1', version: '7' });
    // Remote version is 8, expected 7 -> conditional update returns null.
    expect(await client.update('f1', new Uint8Array([1, 2]), '7')).toBeNull();
    await expect(client.trash('f1')).resolves.toBeUndefined();
  });

  it('handles DropboxClient not_found and conflict responses', async () => {
    const fetchFn: Fetch = vi.fn(async (url) => {
      if (url.endsWith('/get_metadata')) {
        return new Response(JSON.stringify({ error_summary: 'path/not_found/...' }), { status: 409 });
      }
      if (url.endsWith('/upload')) {
        return new Response(JSON.stringify({ error_summary: 'path/conflict/file/...' }), { status: 409 });
      }
      return new Response(null, { status: 200 });
    });
    const client = new DropboxClient('tok', fetchFn);
    expect(await client.findArchive()).toBeNull();
    expect(await client.update('/OpenVolleyScout.ovs', new Uint8Array([1]), 'rev1')).toBeNull();
  });

  it('handles OneDriveClient 404 and 412 precondition failed', async () => {
    const fetchFn: Fetch = vi.fn(async (_url, init) => {
      if (init?.method === 'PUT') return new Response(JSON.stringify({ error: { code: 'notAllowed' } }), { status: 412 });
      return new Response(JSON.stringify({ error: { code: 'itemNotFound' } }), { status: 404 });
    });
    const client = new OneDriveClient('tok', fetchFn);
    expect(await client.findArchive()).toBeNull();
    expect(await client.update('OpenVolleyScout.ovs', new Uint8Array([1]), 'etag1')).toBeNull();
  });
});

describe('PkceAuth', () => {
  it('exchanges code for tokens, refreshes on expiry, and revokes on signOut', async () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
    };
    let resolveCallback: ((url: string) => void) | null = null;
    const fetchFn: Fetch = vi.fn(async (url, init) => {
      if (url === 'https://example.test/token') {
        const body = String(init?.body ?? '');
        if (body.includes('authorization_code')) {
          return new Response(JSON.stringify({ access_token: 'acc-1', refresh_token: 'ref-1', expires_in: 3600 }), { status: 200 });
        }
        return new Response(JSON.stringify({ access_token: 'acc-2', expires_in: 3600 }), { status: 200 });
      }
      return new Response(null, { status: 200 });
    });

    const auth = new PkceAuth({
      endpoints: {
        authorize: 'https://example.test/auth',
        token: 'https://example.test/token',
        revoke: 'https://example.test/revoke',
        scope: 'files',
        storageKey: 'test.refresh',
      },
      clientId: 'cid',
      fetch: fetchFn,
      storage,
      openBrowser: async (url) => {
        const state = new URL(url).searchParams.get('state');
        resolveCallback?.(`/?code=abc&state=${state}`);
      },
      redirect: async () => ({
        uri: 'http://localhost:53682/',
        wait: () => new Promise<string>((resolve) => { resolveCallback = resolve; }),
        cancel: () => {},
      }),
    });

    expect(await auth.token(true)).toBe('acc-1');
    expect(store.get('test.refresh')).toBe('ref-1');
    auth.invalidate();
    expect(await auth.token(false)).toBe('acc-2');
    await auth.signOut();
    expect(store.get('test.refresh')).toBeUndefined();
  });

  it('round-trips a CloudSnapshot through writeCloudSyncFile / readCloudSyncFile', async () => {
    const snapshot: CloudSnapshot = {
      ...EMPTY_CLOUD_SNAPSHOT,
      matches: [makeMatch('m1', '2026-11-22T12:00:00.000Z', 'Serie B')],
      deletions: { 'matches:old': '2026-11-20T08:00:00.000Z' },
    };
    const bytes = writeCloudSyncFile(snapshot);
    expect(bytes.byteLength).toBeGreaterThan(0);
  });
});
