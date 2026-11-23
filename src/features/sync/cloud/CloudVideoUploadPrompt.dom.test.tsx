// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const GB = 1_000_000_000;
const enqueue = vi.fn();
const trash = vi.fn();
let cloudFiles: Array<{ matchId: string; id: string }> = [];
let project: unknown;

vi.mock('@src/infrastructure/repositories', () => ({ matchRepository: { getById: async () => project } }));
vi.mock('./archive-adapter', () => ({
  cloudSyncController: {
    status: { state: 'ok', provider: 'google-drive', lastSyncedAt: null, devices: [], scouting: { state: 'free' } },
    videoStorage: async () => ({ listVideos: async () => cloudFiles, trashVideo: trash }),
    spaceUsage: async () => ({ used: 5 * GB, total: 15 * GB }),
  },
}));
vi.mock('./controller', () => ({ useCloudSyncStatus: (controller: { status: unknown }) => controller.status }));
vi.mock('./video-sync', async () => ({
  ...(await vi.importActual<typeof import('./video-sync')>('./video-sync')),
  measureVideoFile: async () => 4 * GB,
  readVideoSyncEnabled: () => true,
}));
vi.mock('./video-upload', async () => ({
  canUploadVideos: () => true,
  createChunkReader: async () => async () => new Uint8Array(),
  videoUploadQueue: { current: new Map(), enqueue: (...args: unknown[]) => enqueue(...args) },
  deleteCloudVideoOfMatch: async (matchId: string) => {
    for (const file of cloudFiles.filter((entry) => entry.matchId === matchId)) await trash(file);
  },
}));

function matchWithFile(cloudCopy?: unknown) {
  return {
    metadata: { id: 'm1', title: '' },
    homeSelection: { teamName: 'Viserba' },
    awaySelection: { teamName: 'Ostellato' },
    videoAnalysis: { source: { kind: 'file', path: '/v/match.mp4', fileName: 'match.mp4' }, syncPoints: [], starredTouchIds: [], cloudCopy },
  };
}

beforeEach(() => {
  localStorage.clear();
  enqueue.mockClear();
  trash.mockClear();
  cloudFiles = [];
  project = matchWithFile();
  vi.resetModules();
});
afterEach(cleanup);

async function setup() {
  const module = await import('./CloudVideoUploadPrompt');
  const { I18nProvider } = await import('@src/i18n');
  render(<I18nProvider><module.CloudVideoUploadPrompt /></I18nProvider>);
  return module;
}

describe('asking to upload the match video', () => {
  it('asks with the video size and the free space, and uploads', async () => {
    const { askToUploadMatchVideo } = await setup();
    await act(() => askToUploadMatchVideo('m1'));
    expect(screen.getByText(/Viserba - Ostellato/)).toBeTruthy();
    expect(screen.getByText(/The video is 4\.0 GB; 10\.0 GB free on Google Drive/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Upload' }));
    expect(enqueue).toHaveBeenCalledWith([expect.objectContaining({ size: 4 * GB })]);
  });

  it('does not ask automatically after "Don\'t ask again", but the button still asks', async () => {
    const { askToUploadMatchVideo } = await setup();
    await act(() => askToUploadMatchVideo('m1'));
    await userEvent.click(screen.getByRole('button', { name: "Don't ask again for this match" }));
    await act(() => askToUploadMatchVideo('m1'));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await act(() => askToUploadMatchVideo('m1', true));
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    expect(screen.queryByRole('button', { name: "Don't ask again for this match" })).toBeNull();
  });

  it('does not ask when the video is already in the cloud or the match is gone', async () => {
    const { askToUploadMatchVideo } = await setup();
    cloudFiles = [{ matchId: 'm1', id: 'f1' }];
    await act(() => askToUploadMatchVideo('m1'));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    cloudFiles = [];
    project = null;
    await act(() => askToUploadMatchVideo('m1'));
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('removes the cloud video when the match is deleted', async () => {
    await setup();
    cloudFiles = [{ matchId: 'm1', id: 'f1' }, { matchId: 'm2', id: 'f2' }];
    const { notifyMatchDeleted } = await import('./local-change-bus');
    await act(async () => { notifyMatchDeleted('m1'); await new Promise((resolve) => setTimeout(resolve, 10)); });
    expect(trash).toHaveBeenCalledTimes(1);
    expect(trash).toHaveBeenCalledWith({ matchId: 'm1', id: 'f1' });
  });
});
