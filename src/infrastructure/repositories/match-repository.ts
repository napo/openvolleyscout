import { normalizeMatchProject } from '@src/domain/match';
import type { MatchProject } from '@src/domain/match/types';
import {
  deleteMatchProject,
  getAllMatchProjects,
  getLatestMatchProject,
  getMatchProjectById,
  saveMatchProject,
} from '../storage/match-project-storage';
import { cloneEntity, withRepositoryError } from './shared';

const REPOSITORY_NAME = 'matchRepository';

function normalizeForPersistence(project: MatchProject): MatchProject {
  return normalizeMatchProject(cloneEntity(project));
}

async function readPersistedProjectOrThrow(projectId: string): Promise<MatchProject> {
  const persistedProject = await getMatchProjectById(projectId);
  if (!persistedProject) {
    throw new Error(`Match project ${projectId} not found`);
  }

  return normalizeForPersistence(persistedProject);
}

export const matchRepository = {
  async create(project: MatchProject): Promise<MatchProject> {
    return withRepositoryError(REPOSITORY_NAME, 'create match project', async () => {
      const normalizedProject = normalizeForPersistence(project);
      await saveMatchProject(normalizedProject);
      return cloneEntity(await readPersistedProjectOrThrow(normalizedProject.metadata.id));
    });
  },

  async getById(projectId: string): Promise<MatchProject | null> {
    return withRepositoryError(REPOSITORY_NAME, 'read match project by id', async () => {
      const project = await getMatchProjectById(projectId);
      return project ? cloneEntity(normalizeForPersistence(project)) : null;
    });
  },

  async getLatest(): Promise<MatchProject | null> {
    return withRepositoryError(REPOSITORY_NAME, 'read latest match project', async () => {
      const project = await getLatestMatchProject();
      return project ? cloneEntity(normalizeForPersistence(project)) : null;
    });
  },

  async list(): Promise<MatchProject[]> {
    return withRepositoryError(REPOSITORY_NAME, 'list match projects', async () => {
      const projects = await getAllMatchProjects();
      return projects.map((project) => cloneEntity(normalizeForPersistence(project)));
    });
  },

  async update(project: MatchProject): Promise<MatchProject> {
    return withRepositoryError(REPOSITORY_NAME, 'update match project', async () => {
      const normalizedProject = normalizeForPersistence(project);
      await saveMatchProject(normalizedProject);
      return cloneEntity(await readPersistedProjectOrThrow(normalizedProject.metadata.id));
    });
  },

  async delete(projectId: string): Promise<void> {
    return withRepositoryError(REPOSITORY_NAME, 'delete match project', async () => {
      await deleteMatchProject(projectId);
    });
  },
};
