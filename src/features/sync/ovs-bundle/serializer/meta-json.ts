import type { MatchProject } from '@src/domain/match/types';
import type { OvsMetaJson } from '../types';
import { pruneUndefined } from './json-utils';

export function buildMetaJson(project: MatchProject): OvsMetaJson {
  return pruneUndefined({
    metadata: project.metadata,
    homeSelection: project.homeSelection,
    awaySelection: project.awaySelection,
    phase: project.phase,
    scoutingConfig: project.scoutingConfig,
    linkedSystemIds: project.linkedSystemIds,
    linkedAttackCombinationIds: project.linkedAttackCombinationIds,
    linkedSetterCallIds: project.linkedSetterCallIds,
    videoAnalysis: project.videoAnalysis,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  });
}

/**
 * Applies a bundle's `meta.json` onto a base project, producing everything
 * `MatchProject` needs except `events`/`homeTeam`/`awayTeam`/`scoutingSession`
 * (the caller derives those separately).
 */
export function applyMetaJson(
  meta: OvsMetaJson,
): Omit<MatchProject, 'events' | 'homeTeam' | 'awayTeam' | 'scoutingSession'> {
  return pruneUndefined({
    metadata: meta.metadata,
    homeSelection: meta.homeSelection,
    awaySelection: meta.awaySelection,
    phase: meta.phase,
    scoutingConfig: meta.scoutingConfig,
    linkedSystemIds: meta.linkedSystemIds,
    linkedAttackCombinationIds: meta.linkedAttackCombinationIds,
    linkedSetterCallIds: meta.linkedSetterCallIds,
    videoAnalysis: meta.videoAnalysis,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
  });
}
