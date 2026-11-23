// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import type { DeviceInfo } from './device';
import { synchronise } from './engine';
import { EMPTY_PRESENCE, type PresenceResult, type ScoutingIntent, resolvePresence } from './presence';
import { makeMemoryArchive, makeMemoryRemote } from './test-helpers';

const tablet: DeviceInfo = { deviceId: 'tablet', name: 'Tablet panchina', os: 'Android 14', appVersion: '0.41.0' };
const laptop: DeviceInfo = { deviceId: 'laptop', name: 'Windows · app', os: 'Windows 10.0', appVersion: '0.41.0' };
const FIVE_MIN = 5 * 60_000;
const at = (minutes: number) => new Date(Date.UTC(2026, 10, 23, 18, 0) + minutes * 60_000);
const scout = (matchId: string | null, lastInputMinute: number | null = null, takeOver = false): ScoutingIntent => ({
  matchId,
  lastInputAt: lastInputMinute === null ? null : at(lastInputMinute).toISOString(),
  takeOver,
});

describe('scouting claims', () => {
  it('gives the match to the first device and blocks the second while input is recent', () => {
    const first = resolvePresence(EMPTY_PRESENCE, tablet, scout('m1', 0), at(0), FIVE_MIN);
    expect(first.outcome.state).toBe('mine');

    const second = resolvePresence(first.presence, laptop, scout('m1', null, true), at(2), FIVE_MIN);
    expect(second.outcome).toMatchObject({ state: 'other', canTakeOver: false, claim: { deviceName: 'Tablet panchina', os: 'Android 14' } });
    expect(second.presence.claims.m1.deviceId).toBe('tablet');
  });

  it('lets another device take over after the takeover time without new actions', () => {
    const first = resolvePresence(EMPTY_PRESENCE, tablet, scout('m1', 0), at(0), FIVE_MIN);
    const asked = resolvePresence(first.presence, laptop, scout('m1'), at(5), FIVE_MIN);
    expect(asked.outcome).toMatchObject({ state: 'other', canTakeOver: true });
    expect(asked.presence.claims.m1.deviceId).toBe('tablet');

    const taken = resolvePresence(first.presence, laptop, scout('m1', null, true), at(5), FIVE_MIN);
    expect(taken.outcome.state).toBe('mine');
    expect(taken.presence.claims.m1.deviceId).toBe('laptop');
  });

  it('frees a claim not renewed for 15 minutes, and drops it when scouting ends', () => {
    const first = resolvePresence(EMPTY_PRESENCE, tablet, scout('m1', 0), at(0), 60 * 60_000);
    expect(resolvePresence(first.presence, laptop, scout('m1'), at(15), 60 * 60_000).outcome.state).toBe('mine');

    const released = resolvePresence(first.presence, tablet, scout(null), at(1), FIVE_MIN);
    expect(released.presence.claims).toEqual({});
    expect(released.changed).toBe(true);
  });

  it('does not rewrite the file for an unchanged claim renewed recently', () => {
    const first = resolvePresence(EMPTY_PRESENCE, tablet, scout('m1', 0), at(0), FIVE_MIN);
    expect(resolvePresence(first.presence, tablet, scout('m1', 0), at(1), FIVE_MIN).changed).toBe(false);
    expect(resolvePresence(first.presence, tablet, scout('m1', 1), at(1), FIVE_MIN).changed).toBe(true);
    expect(resolvePresence(first.presence, tablet, scout('m1', 0), at(2), FIVE_MIN).changed).toBe(true);
  });

  it('lists the devices sharing the file', () => {
    const one = resolvePresence(EMPTY_PRESENCE, tablet, scout(null), at(0), FIVE_MIN);
    const two = resolvePresence(one.presence, laptop, scout(null), at(1), FIVE_MIN);
    expect(Object.values(two.presence.devices).map((d) => d.name).sort()).toEqual(['Tablet panchina', 'Windows · app']);
  });
});

describe('scouting claims through the cloud file', () => {
  it('first device to upload wins; the other sees who scouts', async () => {
    const remote = makeMemoryRemote();
    const auth = { token: async () => 'tok', invalidate: () => undefined, signOut: async () => undefined };
    const run = async (self: DeviceInfo, intent: ScoutingIntent, now: Date) => {
      let result: PresenceResult | null = null;
      await synchronise({
        archive: makeMemoryArchive(),
        auth,
        storage: () => remote,
        now: () => now,
        presence: { self: async () => self, intent: () => intent, takeoverMs: () => FIVE_MIN, onResolved: (r) => { result = r; } },
      });
      return result!;
    };

    expect((await run(tablet, scout('m1', 0), at(0))).outcome.state).toBe('mine');
    const blocked = await run(laptop, scout('m1'), at(1));
    expect(blocked.outcome).toMatchObject({ state: 'other', claim: { deviceId: 'tablet' } });
    expect((await run(laptop, scout('m1', null, true), at(6))).outcome.state).toBe('mine');
    expect((await run(tablet, scout('m1', 0), at(7))).outcome).toMatchObject({ state: 'other', claim: { deviceId: 'laptop' } });
  });
});
