// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CloudAuth } from './auth';
import { CloudSyncController } from './controller';
import { notifyLocalDataChanged } from './local-change-bus';
import type { SyncProvider } from './provider';
import type { RemoteStorage } from './storage';
import { makeMemoryArchive, makeMemoryRemote } from './test-helpers';

/** A cloud account whose token can be made to expire, renewed only by renew() (like Google on the web). */
function makeAuth() {
  const auth = {
    valid: true,
    renewResult: 'fresh' as string | null,
    token: vi.fn(async (interactive: boolean) => (auth.valid || interactive ? 'tok' : null)),
    invalidate: vi.fn(),
    signOut: vi.fn(async () => {}),
    needsRenewal: () => !auth.valid,
    renew: vi.fn(async () => {
      if (auth.renewResult) auth.valid = true;
      return auth.renewResult;
    }),
    prepareRenewal: vi.fn(),
  };
  return auth;
}

async function setup(options: { offline?: () => boolean; archive?: ReturnType<typeof makeMemoryArchive> } = {}) {
  const archive = options.archive ?? makeMemoryArchive();
  const remote = makeMemoryRemote();
  const auth = makeAuth();
  let rounds = 0;
  const provider: SyncProvider = {
    id: 'google-drive',
    platforms: ['web'],
    available: () => true,
    createAuth: async () => auth as CloudAuth,
    storage: (): RemoteStorage => {
      rounds += 1;
      if (options.offline?.()) {
        return { ...remote, findArchive: async () => { throw new TypeError('offline'); }, version: async () => { throw new TypeError('offline'); } };
      }
      return remote;
    },
    videos: () => { throw new Error('not used'); },
  };
  const controller = new CloudSyncController(archive);
  expect(await controller.connect(provider)).toBe(true);
  const internals = controller as unknown as { running: Promise<void> | null };
  /** Lets the round in progress (and the one it asked for) finish. */
  const idle = async () => {
    for (let i = 0; i < 5; i += 1) {
      await vi.advanceTimersByTimeAsync(0);
      while (internals.running) await internals.running;
    }
  };
  await idle();
  return {
    controller,
    archive,
    auth,
    idle,
    rounds: () => rounds,
    resetRounds: () => { rounds = 0; },
    isRunning: () => internals.running !== null,
  };
}

let visibility: DocumentVisibilityState = 'visible';
let online = true;

beforeEach(() => {
  localStorage.clear();
  visibility = 'visible';
  online = true;
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => online });
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('cloud sync scheduling', () => {
  it('sends changes at least every 30 seconds while scouting, however often new actions arrive', async () => {
    const env = await setup();
    env.controller.claimScouting('m1', new Date().toISOString());
    await env.idle();
    expect(env.controller.status.scouting.state).toBe('mine');
    env.resetRounds();

    // One action every 2 seconds: the 4-second pause alone would never run a round.
    for (let second = 0; second < 32; second += 2) {
      notifyLocalDataChanged();
      await vi.advanceTimersByTimeAsync(2000);
    }
    expect(env.rounds()).toBeGreaterThanOrEqual(1);
    expect(env.rounds()).toBeLessThanOrEqual(2);
    env.controller.dispose();
  });

  it('caps the wait at a minute outside scouting, and follows the interval chosen in Settings', async () => {
    const env = await setup();
    env.resetRounds();
    for (let second = 0; second < 56; second += 2) {
      notifyLocalDataChanged();
      await vi.advanceTimersByTimeAsync(2000);
    }
    expect(env.rounds()).toBe(0);
    for (let second = 56; second < 64; second += 2) {
      notifyLocalDataChanged();
      await vi.advanceTimersByTimeAsync(2000);
    }
    expect(env.rounds()).toBe(1);
    await env.idle();

    localStorage.setItem('openvolleyscout.sync.scoutingIntervalSeconds', '15');
    env.controller.claimScouting('m1', new Date().toISOString());
    await env.idle();
    env.resetRounds();
    for (let second = 0; second < 16; second += 2) {
      notifyLocalDataChanged();
      await vi.advanceTimersByTimeAsync(2000);
    }
    expect(env.rounds()).toBe(1);
    env.controller.dispose();
  });

  it('keeps the 4-second pause after a single change', async () => {
    const env = await setup();
    env.resetRounds();
    notifyLocalDataChanged();
    await vi.advanceTimersByTimeAsync(3900);
    expect(env.rounds()).toBe(0);
    await vi.advanceTimersByTimeAsync(200);
    await env.idle();
    expect(env.rounds()).toBe(1);
    env.controller.dispose();
  });
});

describe('changes not sent yet', () => {
  it('counts a change as sent only by a round that started after it', async () => {
    const env = await setup();
    expect(env.controller.status.unsent).toBe(false);

    notifyLocalDataChanged();
    expect(env.controller.status.unsent).toBe(true);
    expect(env.controller.status.unsentSince).not.toBeNull();

    // A round starts, then another action is recorded before it ends.
    const round = env.controller.syncNow();
    notifyLocalDataChanged();
    await round;
    expect(env.controller.status.state).toBe('ok');
    expect(env.controller.status.unsent).toBe(true);

    await vi.advanceTimersByTimeAsync(4000);
    await env.idle();
    expect(env.controller.status.unsent).toBe(false);
    expect(env.controller.status.unsentSince).toBeNull();
    env.controller.dispose();
  });

  it('keeps a change made during the last step of a round as not sent', async () => {
    const env = await setup();
    const getMeta = env.archive.getMeta.bind(env.archive);
    let changeOnRead = false;
    env.archive.getMeta = (async (key: string) => {
      const value = await getMeta(key);
      if (changeOnRead && key === 'sync.lastSyncedAt') {
        changeOnRead = false;
        notifyLocalDataChanged();
      }
      return value;
    }) as typeof env.archive.getMeta;

    notifyLocalDataChanged();
    changeOnRead = true;
    await env.controller.syncNow();
    expect(env.controller.status.state).toBe('ok');
    expect(env.controller.status.unsent).toBe(true);
    expect(env.controller.status.unsentSince).not.toBeNull();

    // The round for that change fails: the warning and the leave prompt still know about it.
    env.auth.valid = false;
    await vi.advanceTimersByTimeAsync(4000);
    await env.idle();
    expect(env.controller.status.state).toBe('paused');
    expect(env.controller.status.unsent).toBe(true);
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    env.controller.dispose();
  });

  it('remembers changes left unsent when the app was closed', async () => {
    let offline = false;
    const first = await setup({ offline: () => offline });
    offline = true;
    notifyLocalDataChanged();
    const since = first.controller.status.unsentSince;
    await vi.advanceTimersByTimeAsync(4000);
    await first.idle();
    expect(first.controller.status.unsent).toBe(true);
    first.controller.dispose();

    // The app starts again, still without a connection: the old changes are still reported.
    await vi.advanceTimersByTimeAsync(60_000);
    const second = await setup({ offline: () => offline, archive: first.archive });
    expect(second.controller.status.state).toBe('error');
    expect(second.controller.status.unsent).toBe(true);
    expect(second.controller.status.unsentSince).toBe(since);

    offline = false;
    await second.controller.syncNow();
    expect(second.controller.status.unsent).toBe(false);
    expect(localStorage.getItem('openvolleyscout.sync.unsentSince')).toBeNull();
    second.controller.dispose();
  });

  it('retries every 30 seconds while scouting when a round fails', async () => {
    let offline = false;
    const env = await setup({ offline: () => offline });
    env.controller.claimScouting('m1', new Date().toISOString());
    await env.idle();
    offline = true;
    notifyLocalDataChanged();
    await vi.advanceTimersByTimeAsync(4000);
    await env.idle();
    expect(env.controller.status.state).toBe('error');
    expect(env.controller.status.unsent).toBe(true);
    env.resetRounds();

    offline = false;
    // Checked every 5 seconds: the retry comes between 30 and 35 seconds after the failed round.
    await vi.advanceTimersByTimeAsync(25_000);
    expect(env.rounds()).toBe(0);
    await vi.advanceTimersByTimeAsync(10_000);
    await env.idle();
    expect(env.rounds()).toBe(1);
    expect(env.controller.status.state).toBe('ok');
    expect(env.controller.status.unsent).toBe(false);
    env.controller.dispose();
  });
});

describe('leaving the page', () => {
  it('sends the changes at once when the app is hidden or the page is left', async () => {
    const env = await setup();
    env.resetRounds();

    visibility = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    expect(env.isRunning()).toBe(false);

    notifyLocalDataChanged();
    document.dispatchEvent(new Event('visibilitychange'));
    expect(env.isRunning()).toBe(true);
    await env.idle();
    expect(env.rounds()).toBe(1);
    expect(env.controller.status.unsent).toBe(false);

    notifyLocalDataChanged();
    window.dispatchEvent(new Event('pagehide'));
    expect(env.isRunning()).toBe(true);
    await env.idle();
    expect(env.rounds()).toBe(2);
    env.controller.dispose();
  });

  it('sends the changes made during a round at once when the app is hidden, without waiting for a timer', async () => {
    const env = await setup();
    notifyLocalDataChanged();
    const round = env.controller.syncNow();
    notifyLocalDataChanged();
    visibility = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    await round;
    // The follow-up round already runs: timers of a hidden page may never fire.
    expect(env.isRunning()).toBe(true);
    await env.idle();
    expect(env.controller.status.unsent).toBe(false);
    env.controller.dispose();
  });

  it('asks before closing the page only when changes are not sent', async () => {
    const env = await setup();
    const leave = () => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(leave()).toBe(false);

    env.auth.valid = false;
    notifyLocalDataChanged();
    expect(leave()).toBe(true);
    await env.idle();
    expect(env.controller.status.state).toBe('paused');
    expect(leave()).toBe(true);

    await env.controller.disconnect();
    expect(leave()).toBe(false);
  });
});

describe('renewing the sign-in on the next tap', () => {
  it('renews from the next key press or click after a round found no token, then syncs', async () => {
    const env = await setup();
    env.controller.claimScouting('m1', new Date().toISOString());
    await env.idle();
    env.auth.valid = false;
    notifyLocalDataChanged();
    await vi.advanceTimersByTimeAsync(4000);
    await env.idle();
    expect(env.controller.status.state).toBe('paused');
    expect(env.controller.status.problem).toBe('sign-in');
    expect(env.auth.prepareRenewal).toHaveBeenCalled();
    expect(env.auth.renew).not.toHaveBeenCalled();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift' }));
    // Typed keys and shortcuts never move the focus to Google's window.
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    const input = document.createElement('input');
    document.body.append(input);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    input.remove();
    expect(env.auth.renew).not.toHaveBeenCalled();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(env.auth.renew).toHaveBeenCalledTimes(1);
    await env.idle();
    expect(env.controller.status.state).toBe('ok');
    expect(env.controller.status.unsent).toBe(false);

    // One-shot: the next tap does nothing more.
    window.dispatchEvent(new Event('pointerdown'));
    expect(env.auth.renew).toHaveBeenCalledTimes(1);
    env.controller.dispose();
  });

  it('does not open the window again at every tap after the user closed it', async () => {
    const env = await setup();
    env.auth.valid = false;
    env.auth.renewResult = null;
    await env.controller.syncNow();
    expect(env.controller.status.state).toBe('paused');

    window.dispatchEvent(new Event('pointerdown'));
    expect(env.auth.renew).toHaveBeenCalledTimes(1);
    await env.idle();

    await env.controller.syncNow();
    window.dispatchEvent(new Event('pointerdown'));
    expect(env.auth.renew).toHaveBeenCalledTimes(1);
    expect(env.controller.status.state).toBe('paused');

    // After the pause it asks again.
    await vi.advanceTimersByTimeAsync(31_000);
    await env.idle();
    window.dispatchEvent(new Event('pointerdown'));
    expect(env.auth.renew).toHaveBeenCalledTimes(2);
    env.controller.dispose();
  });

  it('does not renew from "Continue anyway", and waits a while after it', async () => {
    const env = await setup();
    env.auth.valid = false;
    await env.controller.syncNow();
    expect(env.controller.status.state).toBe('paused');

    const button = document.createElement('button');
    button.setAttribute('data-sync-no-renew', '');
    document.body.append(button);
    button.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    button.remove();
    expect(env.auth.renew).not.toHaveBeenCalled();
    env.controller.declineRenewal();
    window.dispatchEvent(new Event('pointerdown'));
    expect(env.auth.renew).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(31_000);
    window.dispatchEvent(new Event('pointerdown'));
    expect(env.auth.renew).toHaveBeenCalledTimes(1);
    env.controller.dispose();
  });

  it('says it is offline instead of asking to sign in, and renews only once back online', async () => {
    const env = await setup();
    env.auth.valid = false;
    online = false;
    await env.controller.syncNow();
    expect(env.controller.status.state).toBe('error');
    expect(env.controller.status.problem).toBe('offline');
    window.dispatchEvent(new Event('pointerdown'));
    expect(env.auth.renew).not.toHaveBeenCalled();

    online = true;
    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(0);
    await env.idle();
    expect(env.controller.status.problem).toBe('sign-in');
    window.dispatchEvent(new Event('pointerdown'));
    expect(env.auth.renew).toHaveBeenCalledTimes(1);
    env.controller.dispose();
  });

  it('picks up a token that arrived late (after the sign-in window gave up)', async () => {
    const env = await setup();
    env.auth.valid = false;
    await env.controller.syncNow();
    expect(env.controller.status.state).toBe('paused');
    // The window answered after its time limit: the token is there, nobody asked for a round.
    env.auth.valid = true;
    await vi.advanceTimersByTimeAsync(65_000);
    await env.idle();
    expect(env.controller.status.state).toBe('ok');
    env.controller.dispose();
  });

  it('arms the renewal before the token expires, without waiting for a failed round', async () => {
    const env = await setup();
    env.auth.needsRenewal = () => true;
    await vi.advanceTimersByTimeAsync(5000);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(env.auth.renew).toHaveBeenCalledTimes(1);
    env.controller.dispose();
  });

  it('marks the match as not checked when the first round after opening it cannot sign in', async () => {
    const env = await setup();
    env.auth.valid = false;
    env.controller.claimScouting('m1', new Date().toISOString());
    await env.idle();
    expect(env.controller.status.scouting).toEqual({ state: 'unverified', matchId: 'm1' });
    env.controller.dispose();
  });
});
