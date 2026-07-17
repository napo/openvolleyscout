import { getMatchTeamSnapshot, normalizeMatchProject } from '@src/domain/match';
import type { MatchProject } from '@src/domain/match/types';
import { createLiveMatchStateFromProject, syncProjectWithLiveMatch } from '@src/features/scouting/model/session';
import { matchRepository } from '@src/infrastructure/repositories/match-repository';
import { getSyncState } from '@src/infrastructure/storage/match-sync-state-storage';
import { parseOvsBundleFile, type ParsedOvsMatch } from '../ovs-bundle';
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

function buildProjectFromParsed(parsed: ParsedOvsMatch): MatchProject {
  const { homeSelection, awaySelection } = parsed.meta;
  const homeTeam = getMatchTeamSnapshot({ homeSelection, awaySelection }, 'home');
  const awayTeam = getMatchTeamSnapshot({ homeSelection, awaySelection }, 'away');

  const candidate: MatchProject = {
    ...parsed.meta,
    homeTeam,
    awayTeam,
    events: parsed.events,
    scoutingSession: undefined,
  };

  const liveMatch = createLiveMatchStateFromProject(candidate);
  const withSession = liveMatch ? syncProjectWithLiveMatch(candidate, liveMatch) : candidate;

  return normalizeMatchProject(withSession);
}

/**
 * Inspects an `.ovs` file against local state without writing anything.
 * - No local match with this id yet -> plain new import.
 * - Local match exists but we've never recorded a sync with this exact peer
 *   device -> no common ancestor to 3-way merge against; the caller must
 *   pick one side wholesale (`no_common_base`).
 * - Local match exists and a prior sync state is recorded -> a true 3-way
 *   merge against that recorded base.
 */
export async function buildOvsImportPreview(bytes: Uint8Array): Promise<OvsImportPreview> {
  const parsed = parseOvsBundleFile(bytes);
  const remoteProject = buildProjectFromParsed(parsed);
  const peerDeviceId = parsed.manifest.exportedByDeviceId;
  const localProject = await matchRepository.getById(parsed.matchId);

  if (!localProject) {
    return { kind: 'new_match', matchId: parsed.matchId, peerDeviceId, project: remoteProject };
  }

  const syncState = await getSyncState(parsed.matchId, peerDeviceId);
  if (!syncState) {
    return { kind: 'no_common_base', matchId: parsed.matchId, peerDeviceId, local: localProject, remote: remoteProject };
  }

  const result = mergeMatchProjects(syncState.baseSnapshot, localProject, remoteProject);

  return {
    kind: 'merge',
    matchId: parsed.matchId,
    peerDeviceId,
    base: syncState.baseSnapshot,
    local: localProject,
    remote: remoteProject,
    result,
  };
}
