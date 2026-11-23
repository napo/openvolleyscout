// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Who is scouting which match, and which devices use the same cloud file.
 * There is no server: the claims live in the cloud file, and the write of the
 * file is conditional on its version, so when two devices claim the same match
 * the first upload wins and the other device finds that claim on its next try.
 *
 * - A claim is renewed by every round of the device that holds it.
 * - Another device may take over once nothing was recorded for the takeover
 *   time chosen in Settings (5 minutes by default).
 * - A claim not renewed for 15 minutes (device off or offline) has expired:
 *   any device may scout the match.
 */

import type { DeviceInfo } from './device';

export interface ScoutingClaim {
  readonly matchId: string;
  readonly deviceId: string;
  readonly deviceName: string;
  readonly os: string;
  readonly appVersion: string;
  /** When this device started scouting the match. */
  readonly since: string;
  /** Last action recorded in the match. */
  readonly lastInputAt: string;
  /** Last round of the device holding the claim. */
  readonly lastSeenAt: string;
}

export interface DeviceEntry {
  readonly deviceId: string;
  readonly name: string;
  readonly os: string;
  readonly appVersion: string;
  readonly lastSyncedAt: string;
}

export interface Presence {
  readonly claims: Readonly<Record<string, ScoutingClaim>>;
  readonly devices: Readonly<Record<string, DeviceEntry>>;
}

export const EMPTY_PRESENCE: Presence = { claims: {}, devices: {} };

export const CLAIM_EXPIRY_MS = 15 * 60_000;
/** A held claim is rewritten at most this often when nothing else changed. */
const RENEW_MS = 2 * 60_000;
/** The device list entry is rewritten at most this often when nothing else changed. */
const DEVICE_RENEW_MS = 60 * 60_000;

/** What this device wants: the match it scouts, if any, and whether to take it over. */
export interface ScoutingIntent {
  readonly matchId: string | null;
  readonly lastInputAt: string | null;
  readonly takeOver: boolean;
}

export type ClaimOutcome =
  | { readonly state: 'none' }
  | { readonly state: 'mine'; readonly claim: ScoutingClaim }
  | { readonly state: 'other'; readonly claim: ScoutingClaim; readonly canTakeOver: boolean };

const time = (iso: string | undefined) => {
  const value = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(value) ? value : 0;
};

export function isExpired(claim: ScoutingClaim, now: Date): boolean {
  return now.getTime() - time(claim.lastSeenAt) >= CLAIM_EXPIRY_MS;
}

export function idleMs(claim: ScoutingClaim, now: Date): number {
  return now.getTime() - Math.max(time(claim.lastInputAt), time(claim.since));
}

export function canTakeOver(claim: ScoutingClaim, now: Date, takeoverMs: number): boolean {
  return isExpired(claim, now) || idleMs(claim, now) >= takeoverMs;
}

export interface PresenceResult {
  readonly presence: Presence;
  /** True when the file must be written for the presence alone. */
  readonly changed: boolean;
  readonly outcome: ClaimOutcome;
}

export function resolvePresence(
  remote: Presence,
  self: DeviceInfo,
  intent: ScoutingIntent,
  now: Date,
  takeoverMs: number,
): PresenceResult {
  const at = now.toISOString();
  const claims: Record<string, ScoutingClaim> = {};
  let changed = false;

  for (const [matchId, claim] of Object.entries(remote.claims)) {
    const mineElsewhere = claim.deviceId === self.deviceId && matchId !== intent.matchId;
    if (isExpired(claim, now) || mineElsewhere) {
      // Expired claims are dropped; a device scouts one match at a time.
      if (claim.deviceId === self.deviceId) changed = true;
      continue;
    }
    claims[matchId] = claim;
  }

  let outcome: ClaimOutcome = { state: 'none' };
  if (intent.matchId) {
    const current = claims[intent.matchId];
    const mine = !current || current.deviceId === self.deviceId;
    if (mine || (intent.takeOver && canTakeOver(current, now, takeoverMs))) {
      const lastInputAt = intent.lastInputAt ?? current?.lastInputAt ?? at;
      const stale = !current
        || current.deviceId !== self.deviceId
        || current.lastInputAt !== lastInputAt
        || current.deviceName !== self.name
        || now.getTime() - time(current.lastSeenAt) >= RENEW_MS;
      const claim: ScoutingClaim = stale
        ? {
          matchId: intent.matchId,
          deviceId: self.deviceId,
          deviceName: self.name,
          os: self.os,
          appVersion: self.appVersion,
          since: current && current.deviceId === self.deviceId ? current.since : at,
          lastInputAt,
          lastSeenAt: at,
        }
        : current;
      if (stale) changed = true;
      claims[intent.matchId] = claim;
      outcome = { state: 'mine', claim };
    } else {
      outcome = { state: 'other', claim: current!, canTakeOver: canTakeOver(current!, now, takeoverMs) };
    }
  }

  const devices: Record<string, DeviceEntry> = { ...remote.devices };
  const known = devices[self.deviceId];
  if (
    !known
    || known.name !== self.name
    || known.os !== self.os
    || known.appVersion !== self.appVersion
    || now.getTime() - time(known.lastSyncedAt) >= DEVICE_RENEW_MS
  ) {
    devices[self.deviceId] = { deviceId: self.deviceId, name: self.name, os: self.os, appVersion: self.appVersion, lastSyncedAt: at };
    changed = true;
  }

  return { presence: { claims, devices }, changed, outcome };
}

/** Reads the presence entry of a cloud file, ignoring anything malformed. */
export function parsePresence(raw: unknown): Presence {
  if (!raw || typeof raw !== 'object') return EMPTY_PRESENCE;
  const { claims, devices } = raw as { claims?: unknown; devices?: unknown };
  const pick = <T>(value: unknown, valid: (item: Record<string, unknown>) => boolean) => {
    const out: Record<string, T> = {};
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
        if (item && typeof item === 'object' && valid(item as Record<string, unknown>)) out[key] = item as T;
      }
    }
    return out;
  };
  return {
    claims: pick<ScoutingClaim>(claims, (c) => typeof c.matchId === 'string' && typeof c.deviceId === 'string' && typeof c.lastSeenAt === 'string'),
    devices: pick<DeviceEntry>(devices, (d) => typeof d.deviceId === 'string' && typeof d.name === 'string'),
  };
}
