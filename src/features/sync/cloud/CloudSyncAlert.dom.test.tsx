// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const syncNow = vi.fn(async () => {});
const controller = { status: {} as Record<string, unknown>, syncNow };

vi.mock('./archive-adapter', () => ({ cloudSyncController: controller }));
vi.mock('./controller', () => ({ useCloudSyncStatus: (c: { status: unknown }) => c.status }));

function statusWith(change: Record<string, unknown>) {
  controller.status = {
    state: 'ok',
    provider: 'google-drive',
    lastSyncedAt: null,
    conflicts: 0,
    problem: null,
    detail: null,
    devices: [],
    unsent: false,
    unsentSince: null,
    scouting: { state: 'free' },
    ...change,
  };
}

async function setup() {
  const { CloudSyncAlert } = await import('./CloudSyncAlert');
  const { I18nProvider } = await import('@src/i18n');
  render(<I18nProvider><CloudSyncAlert placement="inline" /></I18nProvider>);
}

beforeEach(() => syncNow.mockClear());
afterEach(cleanup);

describe('sync warning on every screen', () => {
  it('is hidden while sync works', async () => {
    statusWith({ unsent: true });
    await setup();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('asks to reconnect when the sign-in expired, with the time of the last sync, and reconnects on tap', async () => {
    const lastSyncedAt = new Date(Date.now() - 12 * 60_000).toISOString();
    statusWith({ state: 'paused', problem: 'sign-in', unsent: true, unsentSince: lastSyncedAt, lastSyncedAt });
    await setup();
    const button = screen.getByRole('button');
    expect(button.textContent).toMatch(/Sync paused: tap to reconnect Google Drive/);
    expect(button.textContent).toMatch(/Changes not sent\. Last sync: 12 min ago/);
    await userEvent.click(button);
    expect(syncNow).toHaveBeenCalledWith(true);
  });

  it('stays visible while a new attempt runs', async () => {
    statusWith({ state: 'syncing', problem: 'offline' });
    await setup();
    expect(screen.getByRole('button').textContent).toMatch(/no connection/);
  });
});
