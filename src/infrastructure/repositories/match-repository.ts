import { normalizeMatchProject } from '@src/domain/match';
import type { MatchProject } from '@src/domain/match/types';
import {
  deleteMatchProject,
  getAllMatchProjects,
  getAllMatchSummaries,
  getLatestMatchProject,
  getMatchProjectById,
  saveMatchProject,
  type MatchSummaryRecord,
  type StorageLoadProgress,
} from '../storage/match-project-storage';

export type { MatchSummaryRecord };
import { cloneEntity, withRepositoryError } from './shared';
import { notifyLocalDataChanged } from '@src/features/sync/cloud/local-change-bus';

const REPOSITORY_NAME = 'matchRepository';

// A match with a few thousand events is close to 1 MB: every deep copy costs
// several ms on a tablet, and update() runs after every scouted touch. So:
// - writes copy the caller's project once (IndexedDB keeps its own copy) and
//   return what was stored instead of reading it back;
// - reads return the objects IndexedDB just deserialized, which nobody else holds.
function normalizeForPersistence(project: MatchProject): MatchProject {
  return normalizeMatchProject(cloneEntity(project));
}

export const matchRepository = {
  async create(project: MatchProject): Promise<MatchProject> {
    return withRepositoryError(REPOSITORY_NAME, 'create match project', async () => {
      const saved = await saveMatchProject(normalizeForPersistence(project));
      notifyLocalDataChanged();
      return saved;
    });
  },

  async getById(projectId: string): Promise<MatchProject | null> {
    return withRepositoryError(REPOSITORY_NAME, 'read match project by id', async () => {
      return getMatchProjectById(projectId);
    });
  },

  async getLatest(): Promise<MatchProject | null> {
    return withRepositoryError(REPOSITORY_NAME, 'read latest match project', async () => {
      return getLatestMatchProject();
    });
  },

  async list(): Promise<MatchProject[]> {
    return withRepositoryError(REPOSITORY_NAME, 'list match projects', async () => {
      return getAllMatchProjects();
    });
  },

  async listWithProgress(onProgress: (progress: StorageLoadProgress) => void): Promise<MatchProject[]> {
    return withRepositoryError(REPOSITORY_NAME, 'list match projects', async () => {
      return getAllMatchProjects(onProgress);
    });
  },

  async listSummaries(onProgress?: (progress: StorageLoadProgress) => void): Promise<MatchSummaryRecord[]> {
    return withRepositoryError(REPOSITORY_NAME, 'list match summaries', async () => {
      return getAllMatchSummaries(onProgress);
    });
  },

  async update(project: MatchProject): Promise<MatchProject> {
    return withRepositoryError(REPOSITORY_NAME, 'update match project', async () => {
      const saved = await saveMatchProject(normalizeForPersistence(project));
      notifyLocalDataChanged();
      return saved;
    });
  },

  async delete(projectId: string): Promise<void> {
    return withRepositoryError(REPOSITORY_NAME, 'delete match project', async () => {
      await deleteMatchProject(projectId);
      notifyLocalDataChanged();
    });
  },
};
