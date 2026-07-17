import { getMatchTeamSnapshot, normalizeMatchProject } from '@src/domain/match';
import type { MatchProject } from '@src/domain/match/types';
import { createLiveMatchStateFromProject, syncProjectWithLiveMatch } from '@src/features/scouting/model/session';
import { buildMetaJson } from '../ovs-bundle/serializer/meta-json';
import { mergeEventLog, type OpenSetDivergenceConflict } from './event-log-merge';
import { mergeMetaJson, type MetaConflict } from './meta-merge';

export type MatchMergeBlockedReason = 'open_set_divergence' | 'unreplayable_sequence';

export interface MatchMergeResult {
  status: 'merged' | 'blocked';
  merged?: MatchProject;
  /** Field/entity-level conflicts already auto-resolved with a default; surfaced for review, not blocking. */
  conflicts: MetaConflict[];
  /** Must be resolved (one `'local' | 'remote'` choice per set number) and the merge re-run before it can proceed. */
  divergenceConflicts: OpenSetDivergenceConflict[];
  blockedReason?: MatchMergeBlockedReason;
}

/**
 * True 3-way merge of a match project against a recorded common ancestor
 * (`base`, i.e. the state at the last successful sync with this peer).
 *
 * `scoutingSession` is never merged — it's fully derived from `events`, so it
 * gets recomputed here from the merged event log via the same
 * replay/session helpers the live scouting flow itself uses. If the merged
 * event log isn't replayable (e.g. a pathological reordering), the merge is
 * rejected rather than persisting a broken session.
 */
export function mergeMatchProjects(
  base: MatchProject,
  local: MatchProject,
  remote: MatchProject,
  divergenceResolutions: Record<number, 'local' | 'remote'> = {},
): MatchMergeResult {
  const eventResult = mergeEventLog(base.events, local.events, remote.events, divergenceResolutions);
  if (eventResult.merged === null) {
    return {
      status: 'blocked',
      conflicts: [],
      divergenceConflicts: eventResult.divergenceConflicts,
      blockedReason: 'open_set_divergence',
    };
  }

  const metaResult = mergeMetaJson(buildMetaJson(base), buildMetaJson(local), buildMetaJson(remote));
  const { homeSelection, awaySelection } = metaResult.merged;
  const homeTeam = getMatchTeamSnapshot({ homeSelection, awaySelection }, 'home');
  const awayTeam = getMatchTeamSnapshot({ homeSelection, awaySelection }, 'away');

  const candidateProject: MatchProject = {
    ...metaResult.merged,
    homeTeam,
    awayTeam,
    events: eventResult.merged,
    scoutingSession: undefined,
  };

  const eventFieldConflicts: MetaConflict[] = eventResult.fieldConflicts.map((conflict) => ({
    path: `events:${conflict.id}`,
    base: conflict.base,
    local: conflict.local,
    remote: conflict.remote,
  }));
  const conflicts = [...eventFieldConflicts, ...metaResult.conflicts];

  // A merged log with no `set_started` at all means neither side has begun
  // scouting yet — there's no session to recompute and nothing for replay to
  // validate, so this is a trivially valid (not "unreplayable") state.
  const hasAnySetStarted = eventResult.merged.some((event) => event.type === 'set_started');
  if (!hasAnySetStarted) {
    return { status: 'merged', merged: normalizeMatchProject(candidateProject), conflicts, divergenceConflicts: [] };
  }

  const liveMatch = createLiveMatchStateFromProject(candidateProject);
  if (!liveMatch) {
    return {
      status: 'blocked',
      conflicts,
      divergenceConflicts: [],
      blockedReason: 'unreplayable_sequence',
    };
  }

  const merged = normalizeMatchProject(syncProjectWithLiveMatch(candidateProject, liveMatch));

  return { status: 'merged', merged, conflicts, divergenceConflicts: [] };
}
