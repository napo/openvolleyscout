// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-or-later
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const GB = 1_000_000_000;
const video = { matchId: 'm1', label: 'Viserba - Ostellato', playedAt: '', fileName: 'match.mp4', path: '/v/match.mp4' };
const enqueue = vi.fn();
let cloudFiles: Array<{ matchId: string }> = [];

vi.mock('./archive-adapter', () => ({
  cloudSyncController: {
    status: { state: 'ok', provider: 'google-drive', lastSyncedAt: '2026-11-23T10:00:00Z', devices: [], scouting: { state: 'free' } },
    subscribe: () => () => undefined,
    videoStorage: async () => ({ listVideos: async () => cloudFiles }),
    spaceUsage: async () => ({ used: 5 * GB, total: 15 * GB }),
  },
}));
vi.mock('./controller', () => ({
  useCloudSyncStatus: (controller: { status: unknown }) => controller.status,
}));
vi.mock('./video-sync', async () => {
  const actual = await vi.importActual<typeof import('./video-sync')>('./video-sync');
  return {
    ...actual,
    listLocalVideoMatches: async () => [video],
    measureVideoFile: async () => 4 * GB,
    readVideoSyncEnabled: () => true,
  };
});
vi.mock('./video-upload', () => ({
  canUploadVideos: () => true,
  createChunkReader: async () => async () => new Uint8Array(),
  videoUploadQueue: { isRunning: false, enqueue: (...args: unknown[]) => enqueue(...args) },
}));

beforeEach(() => {
  localStorage.clear();
  enqueue.mockClear();
  cloudFiles = [];
  vi.resetModules();
});
afterEach(cleanup);

async function renderPrompt() {
  const { CloudVideoUploadPrompt } = await import('./CloudVideoUploadPrompt');
  const { I18nProvider } = await import('@src/i18n');
  render(<I18nProvider><CloudVideoUploadPrompt /></I18nProvider>);
}

describe('asking to upload a match video after a sync', () => {
  it('asks with the size and the free space, and uploads on Upload', async () => {
    await renderPrompt();
    expect(await screen.findByText(/Viserba - Ostellato/)).toBeTruthy();
    expect(screen.getByText(/4\.0 GB/)).toBeTruthy();
    expect(screen.getByText(/10\.0 GB/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Upload' }));
    expect(enqueue).toHaveBeenCalledWith([expect.objectContaining({ video, size: 4 * GB })]);
  });

  it('never asks again for a match after "Don\'t ask again"', async () => {
    await renderPrompt();
    await userEvent.click(await screen.findByRole('button', { name: "Don't ask again for this match" }));
    expect(JSON.parse(localStorage.getItem('openvolleyscout.sync.videoPromptDismissed')!)).toEqual(['m1']);
  });

  it('does not ask when the video is already in the cloud', async () => {
    cloudFiles = [{ matchId: 'm1' }];
    await renderPrompt();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});
