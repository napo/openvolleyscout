import type { MatchProject } from '@src/domain/match/types';
import {
  persistDataVolleyImportedTeams,
  previewDataVolleyTeamPersistence,
} from '@src/features/import/persistence/datavolley-team-persistence';
import type { DataVolleyPlayerDecisions } from '@src/features/import/persistence/types';
import { matchRepository } from '@src/infrastructure/repositories/match-repository';
import { teamRepository } from '@src/infrastructure/repositories/team-repository';
import { saveSyncState } from '@src/infrastructure/storage/match-sync-state-storage';
import { mergeMatchProjects } from '../merge/match-project-merge';
import type { OvsImportPreview } from './build-ovs-import-preview';

export type NoCommonBaseChoice = 'keep_local' | 'use_remote';

export interface ConfirmOvsImportOptions {
  /** Required when `preview.kind === 'no_common_base'`. */
  noCommonBaseChoice?: NoCommonBaseChoice;
  /** Required when the merge is blocked on open-set divergence: one 'local' | 'remote' choice per set number. */
  divergenceResolutions?: Record<number, 'local' | 'remote'>;
}

export class OvsImportBlockedError extends Error {
  constructor(public readonly reason: string) {
    super(`Cannot complete .ovs import: ${reason}`);
  }
}

/**
 * The preview (and any merge computed from it) is built from a local
 * snapshot fetched when the file was picked, but confirming can happen an
 * arbitrary amount of time later while the user reviews conflicts. Refusing
 * to write when the local match changed in the meantime (e.g. continued
 * live-scouting elsewhere) avoids silently rolling that newer state back.
 */
export class OvsImportStaleStateError extends Error {
  constructor() {
    super('This match changed locally after the import preview was built - please re-select the .ovs file to try again.');
  }
}

async function assertLocalStateUnchanged(matchId: string, expectedUpdatedAt: number): Promise<void> {
  const current = await matchRepository.getById(matchId);
  if (current && current.updatedAt !== expectedUpdatedAt) {
    throw new OvsImportStaleStateError();
  }
}

async function linkAndPersistOvsTeams(project: MatchProject): Promise<MatchProject> {
  try {
    const preview = await previewDataVolleyTeamPersistence(project, teamRepository);
    const decisions: DataVolleyPlayerDecisions = {};
    for (const teamPreview of preview.teamPreviews) {
      for (const item of teamPreview.playerReconciliations ?? []) {
        const candidate = item.candidates[0];
        if (candidate) {
          decisions[item.key] = { action: 'merge', playerId: candidate.id };
        }
      }
    }
    const persisted = await persistDataVolleyImportedTeams(project, teamRepository, decisions);
    return persisted.project;
  } catch {
    return project;
  }
}

export async function confirmOvsImport(
  preview: OvsImportPreview,
  options: ConfirmOvsImportOptions = {},
): Promise<MatchProject> {
  if (preview.kind === 'new_match') {
    const linked = await linkAndPersistOvsTeams(preview.project);
    const saved = await matchRepository.create(linked);
    await saveSyncState(preview.matchId, preview.peerDeviceId, saved);
    return saved;
  }

  if (preview.kind === 'no_common_base') {
    await assertLocalStateUnchanged(preview.matchId, preview.local.updatedAt);
    const chosen = options.noCommonBaseChoice === 'use_remote'
      ? await linkAndPersistOvsTeams(preview.remote)
      : preview.local;
    const saved = await matchRepository.update(chosen);
    await saveSyncState(preview.matchId, preview.peerDeviceId, saved);
    return saved;
  }

  let result = preview.result;
  if (result.status === 'blocked' && result.blockedReason === 'open_set_divergence' && options.divergenceResolutions) {
    result = mergeMatchProjects(preview.base, preview.local, preview.remote, options.divergenceResolutions);
  }

  if (result.status !== 'merged' || !result.merged) {
    throw new OvsImportBlockedError(result.blockedReason ?? 'unknown_error');
  }

  await assertLocalStateUnchanged(preview.matchId, preview.local.updatedAt);
  const saved = await matchRepository.update(result.merged);
  await saveSyncState(preview.matchId, preview.peerDeviceId, saved);
  return saved;
}
