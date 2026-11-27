// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 3-way snapshot merge for cloud synchronisation across devices.
 *
 * Each record is stamped by its modification timestamp (or a stable content
 * hash when a record carries no timestamp) and each deletion leaves a dated
 * tombstone retained for 400 days. Compared against the base recorded at the
 * previous sync:
 * - changed on one side only -> that side wins;
 * - deleted on one side and unchanged on the other -> deletion wins;
 * - changed on both sides -> newer modification wins; for matches, the older
 *   version is also kept as a copy with a new id so no scouted match is lost.
 */

import type { CompetitionArchiveEntry } from '@src/domain/archive/types';
import type { MatchProject } from '@src/domain/match/types';
import type { OpponentReport } from '@src/domain/opponent-report/types';
import type { ArchivedRoster, ArchivedTeam } from '@src/domain/team/types';
import type { AppAssetRecord } from '@src/infrastructure/db/match-project-db';
import type { Presence } from './presence';

export type CloudCollection =
  | 'matches'
  | 'teams'
  | 'rosters'
  | 'competitions'
  | 'opponentReports'
  | 'receptionSystems'
  | 'defenseSystems'
  | 'appAssets';

/** Tombstones keyed by `${collection}:${id}` -> ISO timestamp when deleted. */
export type DeletionMap = Record<string, string>;

/** Base stamps from the last completed sync, keyed by `${collection}:${id}` -> stamp string. */
export type SyncBase = Record<string, string>;

export interface CloudSystemRecord {
  id: string;
  updatedAt?: string | number;
  [key: string]: unknown;
}

export interface CloudSnapshot {
  readonly matches: readonly MatchProject[];
  readonly teams: readonly ArchivedTeam[];
  readonly rosters: readonly ArchivedRoster[];
  readonly competitions: readonly CompetitionArchiveEntry[];
  readonly opponentReports: readonly OpponentReport[];
  readonly receptionSystems: readonly CloudSystemRecord[];
  readonly defenseSystems: readonly CloudSystemRecord[];
  /** Print look and club logo; absent (none) in cloud files written before they were synced. */
  readonly appAssets?: readonly AppAssetRecord[];
  readonly deletions: DeletionMap;
  /** Scouting claims and devices, only in the cloud file (never merged as data). */
  readonly presence?: Presence;
}

export const EMPTY_CLOUD_SNAPSHOT: CloudSnapshot = {
  matches: [],
  teams: [],
  rosters: [],
  competitions: [],
  opponentReports: [],
  receptionSystems: [],
  defenseSystems: [],
  appAssets: [],
  deletions: {},
};

const TOMBSTONE_TTL_MS = 400 * 24 * 60 * 60 * 1000;

export function keyOf(collection: CloudCollection, id: string): string {
  return `${collection}:${id}`;
}

/** Stable string stamp for a record (prefers updatedAt, falls back to JSON hash). */
function simpleHash(text: string): string {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `h:${(hash >>> 0).toString(36)}`;
}

function isoTime(value: string | number | undefined): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

/** The version of a record as sync compares it. */
export function recordStamp(collection: CloudCollection, item: unknown): string {
  if (collection === 'matches') {
    const match = item as MatchProject;
    return `${match.updatedAt}|e:${match.events.length}|${match.events.at(-1)?.id ?? ''}`;
  }
  if (collection === 'opponentReports') {
    const report = item as OpponentReport;
    return `t:${report.updatedAt}`;
  }
  if (collection === 'appAssets') {
    // The time of the change, and the value itself in case two devices changed it at the same instant.
    const asset = item as AppAssetRecord;
    return `t:${asset.updatedAt}|${simpleHash(JSON.stringify(asset.value) ?? '')}`;
  }
  if (collection === 'teams' || collection === 'rosters' || collection === 'competitions') {
    const rec = item as { updatedAt?: string | number };
    if (rec.updatedAt !== undefined && rec.updatedAt !== null && rec.updatedAt !== '') {
      return typeof rec.updatedAt === 'number' ? `t:${rec.updatedAt}` : rec.updatedAt;
    }
  }
  return simpleHash(JSON.stringify(item));
}

function recordTime(collection: CloudCollection, item: unknown): number {
  if (collection === 'matches') return isoTime((item as MatchProject).updatedAt);
  if (collection === 'opponentReports') return isoTime((item as OpponentReport).updatedAt);
  if (collection === 'appAssets') return isoTime((item as AppAssetRecord).updatedAt);
  if (collection === 'teams' || collection === 'rosters' || collection === 'competitions') {
    return isoTime((item as { updatedAt?: string }).updatedAt);
  }
  return isoTime((item as CloudSystemRecord).updatedAt);
}

export function snapshotStamps(snapshot: CloudSnapshot): Map<string, string> {
  const stamps = new Map<string, string>();
  for (const m of snapshot.matches) stamps.set(keyOf('matches', m.metadata.id), recordStamp('matches', m));
  for (const t of snapshot.teams) stamps.set(keyOf('teams', t.id), recordStamp('teams', t));
  for (const r of snapshot.rosters) stamps.set(keyOf('rosters', r.id), recordStamp('rosters', r));
  for (const c of snapshot.competitions) stamps.set(keyOf('competitions', c.id), recordStamp('competitions', c));
  for (const o of snapshot.opponentReports) stamps.set(keyOf('opponentReports', o.id), recordStamp('opponentReports', o));
  for (const s of snapshot.receptionSystems) stamps.set(keyOf('receptionSystems', s.id), recordStamp('receptionSystems', s));
  for (const s of snapshot.defenseSystems) stamps.set(keyOf('defenseSystems', s.id), recordStamp('defenseSystems', s));
  for (const a of snapshot.appAssets ?? []) stamps.set(keyOf('appAssets', a.id), recordStamp('appAssets', a));
  for (const [k, deletedAt] of Object.entries(snapshot.deletions)) {
    if (!stamps.has(k)) stamps.set(k, `del:${deletedAt}`);
  }
  return stamps;
}

function cloneMatchWithNewId(match: MatchProject, newId: string, nowMs: number): MatchProject {
  const copy = JSON.parse(JSON.stringify(match)) as MatchProject;
  copy.metadata.id = newId;
  copy.updatedAt = nowMs;
  const suffix = ' (copy)';
  if (copy.metadata.competition && !copy.metadata.competition.endsWith(suffix)) {
    copy.metadata.competition = `${copy.metadata.competition}${suffix}`;
  } else if (!copy.metadata.competition) {
    copy.metadata.competition = 'Copy';
  }
  return copy;
}

function mergeCollection<T>(
  collection: CloudCollection,
  getId: (item: T) => string,
  localItems: readonly T[],
  remoteItems: readonly T[],
  localDeletions: DeletionMap,
  remoteDeletions: DeletionMap,
  base: SyncBase,
  now: Date,
  nextDeletions: DeletionMap,
  onConflictCopy?: (older: T) => T,
): { merged: T[]; conflicts: number } {
  const localMap = new Map(localItems.map((item) => [getId(item), item]));
  const remoteMap = new Map(remoteItems.map((item) => [getId(item), item]));
  const allIds = new Set<string>([...localMap.keys(), ...remoteMap.keys()]);

  // Also include ids that appear in deletions for this collection.
  const prefix = `${collection}:`;
  for (const k of [...Object.keys(localDeletions), ...Object.keys(remoteDeletions)]) {
    if (k.startsWith(prefix)) allIds.add(k.slice(prefix.length));
  }

  const merged: T[] = [];
  let conflicts = 0;
  const cutoff = now.getTime() - TOMBSTONE_TTL_MS;

  for (const id of allIds) {
    const k = keyOf(collection, id);
    const local = localMap.get(id);
    const remote = remoteMap.get(id);
    const localDel = localDeletions[k];
    const remoteDel = remoteDeletions[k];
    const baseStamp = base[k];

    const localStamp = local ? recordStamp(collection, local) : undefined;
    const remoteStamp = remote ? recordStamp(collection, remote) : undefined;

    // Both missing: keep the newest non-expired tombstone.
    if (!local && !remote) {
      const winnerDel = isoTime(localDel) >= isoTime(remoteDel) ? localDel : remoteDel;
      if (winnerDel && isoTime(winnerDel) >= cutoff) nextDeletions[k] = winnerDel;
      continue;
    }

    // Present on both sides.
    if (local && remote) {
      if (localStamp === remoteStamp) {
        merged.push(local);
        continue;
      }
      const localChanged = localStamp !== baseStamp;
      const remoteChanged = remoteStamp !== baseStamp;
      if (localChanged && !remoteChanged) {
        merged.push(local);
      } else if (!localChanged && remoteChanged) {
        merged.push(remote);
      } else {
        // Both sides changed since base: newer wins; matches keep the older version as a copy.
        const localNewer = recordTime(collection, local) >= recordTime(collection, remote);
        const winner = localNewer ? local : remote;
        const loser = localNewer ? remote : local;
        merged.push(winner);
        if (onConflictCopy) {
          merged.push(onConflictCopy(loser));
          conflicts += 1;
        }
      }
      continue;
    }

    // Present only on one side.
    const item = (local ?? remote)!;
    const itemStamp = (localStamp ?? remoteStamp)!;
    const otherDel = local ? remoteDel : localDel;
    const itemTime = recordTime(collection, item);
    const delTime = isoTime(otherDel);

    if (otherDel && (itemStamp === baseStamp || delTime >= itemTime)) {
      // Deleted on the other side and unchanged here (or deletion is newer).
      if (delTime >= cutoff) nextDeletions[k] = otherDel;
    } else {
      // Newly created on one side, or edited after the other side deleted it.
      merged.push(item);
    }
  }

  return { merged, conflicts };
}

export interface CloudMergeResult {
  readonly merged: CloudSnapshot;
  readonly base: SyncBase;
  readonly conflicts: number;
}

export function mergeCloudSnapshots(
  local: CloudSnapshot,
  remote: CloudSnapshot,
  base: SyncBase,
  newId: () => string,
  now: Date = new Date(),
): CloudMergeResult {
  const nextDeletions: DeletionMap = {};
  const nowMs = now.getTime();

  const matches = mergeCollection(
    'matches',
    (m) => m.metadata.id,
    local.matches,
    remote.matches,
    local.deletions,
    remote.deletions,
    base,
    now,
    nextDeletions,
    (older) => cloneMatchWithNewId(older, newId(), nowMs),
  );
  const teams = mergeCollection('teams', (t) => t.id, local.teams, remote.teams, local.deletions, remote.deletions, base, now, nextDeletions);
  const rosters = mergeCollection('rosters', (r) => r.id, local.rosters, remote.rosters, local.deletions, remote.deletions, base, now, nextDeletions);
  const competitions = mergeCollection('competitions', (c) => c.id, local.competitions, remote.competitions, local.deletions, remote.deletions, base, now, nextDeletions);
  const opponentReports = mergeCollection('opponentReports', (o) => o.id, local.opponentReports, remote.opponentReports, local.deletions, remote.deletions, base, now, nextDeletions);
  const receptionSystems = mergeCollection('receptionSystems', (s) => s.id, local.receptionSystems, remote.receptionSystems, local.deletions, remote.deletions, base, now, nextDeletions);
  const defenseSystems = mergeCollection('defenseSystems', (s) => s.id, local.defenseSystems, remote.defenseSystems, local.deletions, remote.deletions, base, now, nextDeletions);
  const appAssets = mergeCollection('appAssets', (a) => a.id, local.appAssets ?? [], remote.appAssets ?? [], local.deletions, remote.deletions, base, now, nextDeletions);

  const merged: CloudSnapshot = {
    matches: matches.merged,
    teams: teams.merged,
    rosters: rosters.merged,
    competitions: competitions.merged,
    opponentReports: opponentReports.merged,
    receptionSystems: receptionSystems.merged,
    defenseSystems: defenseSystems.merged,
    appAssets: appAssets.merged,
    deletions: nextDeletions,
  };

  const nextBase = Object.fromEntries(snapshotStamps(merged));
  return { merged, base: nextBase, conflicts: matches.conflicts };
}

export interface SnapshotDiff {
  readonly changed: boolean;
  readonly putMatches: MatchProject[];
  readonly putTeams: ArchivedTeam[];
  readonly putRosters: ArchivedRoster[];
  readonly putCompetitions: CompetitionArchiveEntry[];
  readonly putOpponentReports: OpponentReport[];
  readonly putReceptionSystems: CloudSystemRecord[];
  readonly putDefenseSystems: CloudSystemRecord[];
  readonly putAppAssets: AppAssetRecord[];
  readonly deleteIds: Record<CloudCollection, string[]>;
  readonly deletions: DeletionMap;
}

function diffCollection<T>(
  collection: CloudCollection,
  getId: (item: T) => string,
  fromItems: readonly T[],
  toItems: readonly T[],
): { puts: T[]; deletes: string[] } {
  const fromStamps = new Map(fromItems.map((item) => [getId(item), recordStamp(collection, item)]));
  const toIds = new Set<string>();
  const puts: T[] = [];
  for (const item of toItems) {
    const id = getId(item);
    toIds.add(id);
    if (fromStamps.get(id) !== recordStamp(collection, item)) puts.push(item);
  }
  const deletes: string[] = [];
  for (const id of fromStamps.keys()) {
    if (!toIds.has(id)) deletes.push(id);
  }
  return { puts, deletes };
}

/** Computes what must be written/deleted to turn `from` into `to`. */
export function diffCloudSnapshots(from: CloudSnapshot, to: CloudSnapshot): SnapshotDiff {
  const matches = diffCollection('matches', (m) => m.metadata.id, from.matches, to.matches);
  const teams = diffCollection('teams', (t) => t.id, from.teams, to.teams);
  const rosters = diffCollection('rosters', (r) => r.id, from.rosters, to.rosters);
  const competitions = diffCollection('competitions', (c) => c.id, from.competitions, to.competitions);
  const opponentReports = diffCollection('opponentReports', (o) => o.id, from.opponentReports, to.opponentReports);
  const receptionSystems = diffCollection('receptionSystems', (s) => s.id, from.receptionSystems, to.receptionSystems);
  const defenseSystems = diffCollection('defenseSystems', (s) => s.id, from.defenseSystems, to.defenseSystems);
  const appAssets = diffCollection('appAssets', (a) => a.id, from.appAssets ?? [], to.appAssets ?? []);

  const deletionsChanged = JSON.stringify(from.deletions) !== JSON.stringify(to.deletions);
  const changed = Boolean(
    deletionsChanged
    || matches.puts.length || matches.deletes.length
    || teams.puts.length || teams.deletes.length
    || rosters.puts.length || rosters.deletes.length
    || competitions.puts.length || competitions.deletes.length
    || opponentReports.puts.length || opponentReports.deletes.length
    || receptionSystems.puts.length || receptionSystems.deletes.length
    || defenseSystems.puts.length || defenseSystems.deletes.length
    || appAssets.puts.length || appAssets.deletes.length,
  );

  return {
    changed,
    putMatches: matches.puts,
    putTeams: teams.puts,
    putRosters: rosters.puts,
    putCompetitions: competitions.puts,
    putOpponentReports: opponentReports.puts,
    putReceptionSystems: receptionSystems.puts,
    putDefenseSystems: defenseSystems.puts,
    putAppAssets: appAssets.puts,
    deleteIds: {
      matches: matches.deletes,
      teams: teams.deletes,
      rosters: rosters.deletes,
      competitions: competitions.deletes,
      opponentReports: opponentReports.deletes,
      receptionSystems: receptionSystems.deletes,
      defenseSystems: defenseSystems.deletes,
      appAssets: appAssets.deletes,
    },
    deletions: to.deletions,
  };
}
