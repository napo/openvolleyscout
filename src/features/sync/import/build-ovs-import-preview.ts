import { getMatchTeamSnapshot, normalizeMatchProject } from '@src/domain/match';
import type { MatchEvent } from '@src/domain/events/types';
import type { MatchProject } from '@src/domain/match/types';
import { createLiveMatchStateFromProject, syncProjectWithLiveMatch } from '@src/features/scouting/model/session';
import { matchRepository } from '@src/infrastructure/repositories/match-repository';
import { getSyncState } from '@src/infrastructure/storage/match-sync-state-storage';
import { parseOvsBundleFile } from '../ovs-bundle';
import { mergeMatchProjects, type MatchMergeResult } from '../merge/match-project-merge';

export type OvsImportPreview =
  | { kind: 'new_match'; matchId: string; peerDeviceId: string; project: MatchProject }
  | { kind: 'no_common_base'; matchId: string; peerDeviceId: string; local: MatchProject; remote: MatchProject }
  | {
      kind: 'merge';
      matchId: string;
      peerDeviceId: string;
      base: MatchProject;
      local: MatchProject;
      remote: MatchProject;
      result: MatchMergeResult;
    };

/**
 * Reconstructs a full `MatchProject` from a parsed `.ovs` match payload
 * (single-match or one match out of a backup bundle — both produce the same
 * `{meta, events}` shape). Exported so the backup import flow can reuse it
 * per match instead of re-deriving `homeTeam`/`awayTeam`/`scoutingSession`.
 */
export function buildProjectFromParsed(
  meta: Omit<MatchProject, 'events' | 'homeTeam' | 'awayTeam' | 'scoutingSession'>,
  events: MatchEvent[],
): MatchProject {
  const { homeSelection, awaySelection } = meta;
  const homeTeam = getMatchTeamSnapshot({ homeSelection, awaySelection }, 'home');
  const awayTeam = getMatchTeamSnapshot({ homeSelection, awaySelection }, 'away');

  const candidate: MatchProject = {
    ...meta,
    homeTeam,
    awayTeam,
    events,
    scoutingSession: undefined,
  };

  const liveMatch = createLiveMatchStateFromProject(candidate);
  const withSession = liveMatch ? syncProjectWithLiveMatch(candidate, liveMatch) : candidate;

  return normalizeMatchProject(withSession);
}

/**
 * Inspects one match's remote data against local state without writing
 * anything.
 * - No local match with this id yet -> plain new import.
 * - Local match exists but we've never recorded a sync with this exact peer
 *   device -> no common ancestor to 3-way merge against; the caller must
 *   pick one side wholesale (`no_common_base`).
 * - Local match exists and a prior sync state is recorded -> a true 3-way
 *   merge against that recorded base.
 *
 * Shared by the single-match and whole-database backup import flows.
 */
export async function buildMatchImportPreview(
  matchId: string,
  peerDeviceId: string,
  remoteProject: MatchProject,
): Promise<OvsImportPreview> {
  const localProject = await matchRepository.getById(matchId);

  if (!localProject) {
    return { kind: 'new_match', matchId, peerDeviceId, project: remoteProject };
  }

  const syncState = await getSyncState(matchId, peerDeviceId);
  if (!syncState) {
    return { kind: 'no_common_base', matchId, peerDeviceId, local: localProject, remote: remoteProject };
  }

  const result = mergeMatchProjects(syncState.baseSnapshot, localProject, remoteProject);

  return {
    kind: 'merge',
    matchId,
    peerDeviceId,
    base: syncState.baseSnapshot,
    local: localProject,
    remote: remoteProject,
    result,
  };
}

export async function buildOvsImportPreview(bytes: Uint8Array): Promise<OvsImportPreview> {
  const parsed = parseOvsBundleFile(bytes);
  const remoteProject = buildProjectFromParsed(parsed.meta, parsed.events);

  return buildMatchImportPreview(parsed.matchId, parsed.manifest.exportedByDeviceId, remoteProject);
}
