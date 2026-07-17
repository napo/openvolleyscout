import type { MatchMetadata, MatchRosterPlayer, MatchTeamSelection } from '@src/domain/match/types';
import type { MatchVideoAnalysis, VideoSyncPoint } from '@src/domain/video/types';
import type { OvsMetaJson } from '../ovs-bundle/types';
import { deepEqual } from './deep-equal';
import { mergeIdKeyedArray } from './id-keyed-array-merge';
import { recordIdKeyedConflicts, type PathConflict } from './path-conflict';

/** @deprecated use `PathConflict` — kept as an alias so existing imports don't need to change. */
export type MetaConflict = PathConflict;

export interface MetaMergeResult {
  merged: OvsMetaJson;
  conflicts: MetaConflict[];
}

function mergeScalar<T>(path: string, base: T, local: T, remote: T, conflicts: MetaConflict[]): T {
  if (deepEqual(local, remote) || deepEqual(remote, base)) {
    return local;
  }
  if (deepEqual(local, base)) {
    return remote;
  }
  conflicts.push({ path, base, local, remote });
  return local;
}

/** Merges every field of `MatchMetadata` independently, so e.g. a local venue
 * edit and an unrelated remote competition edit don't collide into a single
 * whole-object conflict that discards one side's non-overlapping change. */
function mergeMetadata(
  base: MatchMetadata,
  local: MatchMetadata,
  remote: MatchMetadata,
  conflicts: MetaConflict[],
): MatchMetadata {
  const keys = new Set([
    ...Object.keys(base),
    ...Object.keys(local),
    ...Object.keys(remote),
  ]) as Set<keyof MatchMetadata>;

  const merged = {} as MatchMetadata;
  for (const key of keys) {
    merged[key] = mergeScalar(`metadata.${key}`, base[key], local[key], remote[key], conflicts) as never;
  }
  return merged;
}

function mergeRoster(
  path: string,
  base: MatchRosterPlayer[],
  local: MatchRosterPlayer[],
  remote: MatchRosterPlayer[],
  conflicts: MetaConflict[],
): MatchRosterPlayer[] {
  const { merged, conflicts: rosterConflicts } = mergeIdKeyedArray(base, local, remote, (player) => player.id);
  recordIdKeyedConflicts(path, rosterConflicts, conflicts);
  return merged;
}

function mergeTeamSelection(
  path: string,
  base: MatchTeamSelection,
  local: MatchTeamSelection,
  remote: MatchTeamSelection,
  conflicts: MetaConflict[],
): MatchTeamSelection {
  const { roster: baseRoster, ...baseRest } = base;
  const { roster: localRoster, ...localRest } = local;
  const { roster: remoteRoster, ...remoteRest } = remote;

  return {
    ...mergeScalar(path, baseRest, localRest, remoteRest, conflicts),
    roster: mergeRoster(`${path}.roster`, baseRoster, localRoster, remoteRoster, conflicts),
  };
}

function mergeStringArray(
  path: string,
  base: string[] | undefined,
  local: string[] | undefined,
  remote: string[] | undefined,
  conflicts: MetaConflict[],
): string[] | undefined {
  const { merged, conflicts: idConflicts } = mergeIdKeyedArray(base ?? [], local ?? [], remote ?? [], (id) => id);
  recordIdKeyedConflicts(path, idConflicts, conflicts);
  return merged.length > 0 ? merged : undefined;
}

export function mergeMetaJson(base: OvsMetaJson, local: OvsMetaJson, remote: OvsMetaJson): MetaMergeResult {
  const conflicts: MetaConflict[] = [];

  const homeSelection = mergeTeamSelection(
    'homeSelection',
    base.homeSelection,
    local.homeSelection,
    remote.homeSelection,
    conflicts,
  );
  const awaySelection = mergeTeamSelection(
    'awaySelection',
    base.awaySelection,
    local.awaySelection,
    remote.awaySelection,
    conflicts,
  );

  const videoSyncPoints = mergeIdKeyedArray<VideoSyncPoint>(
    base.videoAnalysis?.syncPoints ?? [],
    local.videoAnalysis?.syncPoints ?? [],
    remote.videoAnalysis?.syncPoints ?? [],
    (point) => point.id,
  );
  recordIdKeyedConflicts('videoAnalysis.syncPoints', videoSyncPoints.conflicts, conflicts);

  function omitSyncPoints(video: MatchVideoAnalysis | undefined): Omit<MatchVideoAnalysis, 'syncPoints'> | undefined {
    if (!video) {
      return undefined;
    }
    const { syncPoints: _syncPoints, ...rest } = video;
    return rest;
  }

  const videoAnalysisRest = mergeScalar(
    'videoAnalysis',
    omitSyncPoints(base.videoAnalysis),
    omitSyncPoints(local.videoAnalysis),
    omitSyncPoints(remote.videoAnalysis),
    conflicts,
  )
    // The scalar merge only looks at the non-syncPoints fields, so it can
    // resolve to "no container" (e.g. one side deleted videoAnalysis) even
    // when the array-merge above legitimately kept sync points the other
    // side added — recover the container's other fields from whichever
    // side still has them rather than silently dropping those points.
    ?? (videoSyncPoints.merged.length > 0
      ? omitSyncPoints(local.videoAnalysis) ?? omitSyncPoints(remote.videoAnalysis) ?? omitSyncPoints(base.videoAnalysis)
      : undefined);

  const merged: OvsMetaJson = {
    metadata: mergeMetadata(base.metadata, local.metadata, remote.metadata, conflicts),
    homeSelection,
    awaySelection,
    phase: mergeScalar('phase', base.phase, local.phase, remote.phase, conflicts),
    scoutingConfig: mergeScalar('scoutingConfig', base.scoutingConfig, local.scoutingConfig, remote.scoutingConfig, conflicts),
    linkedSystemIds: mergeStringArray(
      'linkedSystemIds',
      base.linkedSystemIds,
      local.linkedSystemIds,
      remote.linkedSystemIds,
      conflicts,
    ),
    linkedAttackCombinationIds: mergeStringArray(
      'linkedAttackCombinationIds',
      base.linkedAttackCombinationIds,
      local.linkedAttackCombinationIds,
      remote.linkedAttackCombinationIds,
      conflicts,
    ),
    linkedSetterCallIds: mergeStringArray(
      'linkedSetterCallIds',
      base.linkedSetterCallIds,
      local.linkedSetterCallIds,
      remote.linkedSetterCallIds,
      conflicts,
    ),
    videoAnalysis: videoAnalysisRest
      ? { ...videoAnalysisRest, syncPoints: videoSyncPoints.merged }
      : undefined,
    createdAt: base.createdAt,
    updatedAt: Date.now(),
  };

  return { merged, conflicts };
}
