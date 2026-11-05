import type { OpponentReport } from '@src/domain/opponent-report/types';
import { matchProjectDb } from '../db/match-project-db';
import { cloneEntity, withRepositoryError } from './shared';

const REPOSITORY_NAME = 'opponentReportRepository';

export const opponentReportRepository = {
  /** Every report, most recently updated first. */
  async list(): Promise<OpponentReport[]> {
    return withRepositoryError(REPOSITORY_NAME, 'list opponent reports', async () => {
      const reports = await matchProjectDb.opponentReports.orderBy('updatedAt').reverse().toArray();
      return reports.map((report) => cloneEntity(report));
    });
  },

  async getById(id: string): Promise<OpponentReport | null> {
    return withRepositoryError(REPOSITORY_NAME, 'read opponent report', async () => {
      const report = await matchProjectDb.opponentReports.get(id);
      return report ? cloneEntity(report) : null;
    });
  },

  /** Saves the report, stamping `updatedAt`. */
  async save(report: OpponentReport, now = Date.now()): Promise<OpponentReport> {
    return withRepositoryError(REPOSITORY_NAME, 'save opponent report', async () => {
      const record = { ...cloneEntity(report), updatedAt: now };
      await matchProjectDb.opponentReports.put(record);
      return cloneEntity(record);
    });
  },

  async delete(id: string): Promise<void> {
    return withRepositoryError(REPOSITORY_NAME, 'delete opponent report', async () => {
      await matchProjectDb.opponentReports.delete(id);
    });
  },

  /** Writes a full record as-is (e.g. from a `.ovs` sync merge), keeping its `updatedAt`. */
  async restore(report: OpponentReport): Promise<void> {
    return withRepositoryError(REPOSITORY_NAME, 'restore opponent report', async () => {
      await matchProjectDb.opponentReports.put(cloneEntity(report));
    });
  },
};
