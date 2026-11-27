// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const syncNow = vi.fn(async () => {});
const declineRenewal = vi.fn();
const controller = {
  status: {} as Record<string, unknown>,
  syncNow,
  declineRenewal,
};

const stored = vi.hoisted(() => ({ project: null as unknown, shown: null as unknown, calls: [] as string[] }));
vi.mock('@src/infrastructure/repositories', () => ({ matchRepository: { getById: async () => stored.project } }));
vi.mock('@src/app/store/app-store', () => {
  const state = {
    get activeProject() { return stored.shown; },
    setActiveProject: (project: unknown) => {
      stored.calls.push('activeProject');
      stored.shown = project;
    },
  };
  const useAppStore = (select: (s: typeof state) => unknown) => select(state);
  useAppStore.getState = () => state;
  return { useAppStore };
});
vi.mock('@src/features/scouting/model/scouting-store', () => ({
  useScoutingStore: { getState: () => ({ syncWithProject: () => stored.calls.push('liveMatch') }) },
}));
vi.mock('./archive-adapter', () => ({ cloudSyncController: controller }));
vi.mock('./controller', () => ({
  NO_RENEW_ATTRIBUTE: 'data-sync-no-renew',
  useCloudSyncStatus: (c: { status: unknown }) => c.status,
}));

const project = { metadata: { id: 'm1', title: '' }, updatedAt: 0 };

function statusWith(problem: string, state = problem === 'sign-in' ? 'paused' : 'error') {
  controller.status = {
    state,
    provider: 'google-drive',
    lastSyncedAt: null,
    conflicts: 0,
    problem,
    detail: null,
    devices: [],
    unsent: false,
    unsentSince: null,
    scouting: { state: 'unverified', matchId: 'm1' },
  };
}

async function setup() {
  const { ScoutingLockGate } = await import('./ScoutingLockGate');
  const { I18nProvider } = await import('@src/i18n');
  render(
    <MemoryRouter>
      <I18nProvider>
        <ScoutingLockGate project={project as never} />
      </I18nProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  stored.project = null;
  stored.shown = null;
  stored.calls = [];
  localStorage.clear();
  syncNow.mockClear();
  declineRenewal.mockClear();
});
afterEach(cleanup);

describe('opening a match that could not be checked in the cloud', () => {
  it('asks to reconnect when the sign-in expired, and reconnects from the tap', async () => {
    statusWith('sign-in');
    await setup();
    expect(screen.getByText(/Could not get the latest data from Google Drive\. Reconnect before scouting/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Reconnect' }));
    expect(syncNow).toHaveBeenCalledWith(true);
  });

  it('lets the scout continue anyway, leaving only the small notice', async () => {
    statusWith('sign-in');
    await setup();
    const proceed = screen.getByRole('button', { name: 'Continue anyway' });
    // The tap on it must not open Google's window, nor the next taps for a while.
    expect(proceed.hasAttribute('data-sync-no-renew')).toBe(true);
    await userEvent.click(proceed);
    expect(declineRenewal).toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('status').textContent).toMatch(/Cannot check whether another device is scouting/);
  });

  it('says when it is offline, and still allows to continue', async () => {
    statusWith('offline');
    await setup();
    expect(screen.getByText(/No connection: could not get the latest data from Google Drive/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continue anyway' })).toBeTruthy();
  });

  it('replaces the match on screen with a newer copy brought by sync, live rallies first', async () => {
    statusWith('sign-in');
    stored.shown = { ...project, updatedAt: 1 };
    stored.project = { ...project, updatedAt: 5 };
    await setup();
    const { notifyLocalDataChanged } = await import('./local-change-bus');
    notifyLocalDataChanged('sync');
    await vi.waitFor(() => expect(stored.calls).toEqual(['liveMatch', 'activeProject']));
    expect(stored.shown).toBe(stored.project);

    // An older or equal copy changes nothing.
    stored.calls = [];
    notifyLocalDataChanged('sync');
    await new Promise((done) => setTimeout(done, 0));
    expect(stored.calls).toEqual([]);
  });

  it('shows nothing once the match is checked', async () => {
    statusWith('sign-in');
    controller.status = { ...controller.status, state: 'ok', problem: null, scouting: { state: 'free' } };
    await setup();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });
});
