import type { CompetitionArchiveEntry } from '@src/domain/archive/types';
import {
  deleteCompetitionName,
  findCompetitionNamesByText,
  getAllCompetitionNames,
  getCompetitionNameById,
  getCompetitionNameByName,
  saveCompetitionName,
} from '../storage/archived-competition-storage';
import { cloneEntity, withRepositoryError } from './shared';

const REPOSITORY_NAME = 'competitionRepository';

type CompetitionInput = {
  id?: string;
  name: string;
  createdAt?: number;
  updatedAt?: number;
};

function normalizeCompetitionId(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || `competition-${Date.now()}`
  );
}

function buildCompetitionRecord(input: CompetitionInput): CompetitionArchiveEntry {
  const now = input.updatedAt ?? Date.now();

  return {
    id: input.id ?? normalizeCompetitionId(input.name),
    name: input.name.trim(),
    createdAt: input.createdAt ?? now,
    updatedAt: now,
  };
}

export const competitionRepository = {
  async create(input: CompetitionInput): Promise<CompetitionArchiveEntry> {
    return withRepositoryError(REPOSITORY_NAME, 'create competition archive entry', async () => {
      const trimmedName = input.name.trim();
      const existing = await getCompetitionNameByName(trimmedName);
      const nextRecord = buildCompetitionRecord({
        ...input,
        id: existing?.id ?? input.id,
        name: trimmedName,
        createdAt: existing?.createdAt ?? input.createdAt,
      });

      await saveCompetitionName(nextRecord);
      const persistedCompetition = await getCompetitionNameById(nextRecord.id);
      if (!persistedCompetition) {
        throw new Error(`Competition ${nextRecord.id} not found after persistence`);
      }

      return cloneEntity(persistedCompetition);
    });
  },

  async getById(id: string): Promise<CompetitionArchiveEntry | null> {
    return withRepositoryError(REPOSITORY_NAME, 'read competition by id', async () => {
      const competition = await getCompetitionNameById(id);
      return competition ? cloneEntity(competition) : null;
    });
  },

  async getByName(name: string): Promise<CompetitionArchiveEntry | null> {
    return withRepositoryError(REPOSITORY_NAME, 'read competition by name', async () => {
      const competition = await getCompetitionNameByName(name.trim());
      return competition ? cloneEntity(competition) : null;
    });
  },

  async list(): Promise<CompetitionArchiveEntry[]> {
    return withRepositoryError(REPOSITORY_NAME, 'list competitions', async () => {
      const competitions = await getAllCompetitionNames();
      return competitions.map((competition) => cloneEntity(competition));
    });
  },

  async searchByName(searchText: string): Promise<CompetitionArchiveEntry[]> {
    return withRepositoryError(REPOSITORY_NAME, 'search competitions', async () => {
      const competitions = await findCompetitionNamesByText(searchText);
      return competitions.map((competition) => cloneEntity(competition));
    });
  },

  async delete(id: string): Promise<void> {
    return withRepositoryError(REPOSITORY_NAME, 'delete competition', async () => {
      await deleteCompetitionName(id);
    });
  },

  /** Writes a full record as-is (e.g. from a `.ovs` sync merge) — bypasses
   * the id-normalization-from-name logic in `create`. */
  async restore(entry: CompetitionArchiveEntry): Promise<void> {
    return withRepositoryError(REPOSITORY_NAME, 'restore competition', async () => {
      await saveCompetitionName(cloneEntity(entry));
    });
  },
};
