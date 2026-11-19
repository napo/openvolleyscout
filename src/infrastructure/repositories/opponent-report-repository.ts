import type { OpponentReport } from '@src/domain/opponent-report/types';
import { matchProjectDb } from '../db/match-project-db';
import { cloneEntity, withRepositoryError } from './shared';

const REPOSITORY_NAME = 'opponentReportRepository';
const REPORT_LOAD_BATCH_SIZE = 10;

export interface OpponentReportLoadProgress {
  loaded: number;
  total: number;
  currentName: string;
}

export const opponentReportRepository = {
  /** Every report, most recently updated first. */
  async list(): Promise<OpponentReport[]> {
    return withRepositoryError(REPOSITORY_NAME, 'list opponent reports', async () => {
      const reports = await matchProjectDb.opponentReports.orderBy('updatedAt').reverse().toArray();
      return reports.map((report) => cloneEntity(report));
    });
  },

  /** Every report, most recently updated first, reporting progress in batches. */
  async listWithProgress(
    onProgress: (progress: OpponentReportLoadProgress) => void,
  ): Promise<OpponentReport[]> {
    return withRepositoryError(REPOSITORY_NAME, 'list opponent reports', async () => {
      const keys = await matchProjectDb.opponentReports.orderBy('updatedAt').reverse().primaryKeys();
      const total = keys.length;
      onProgress({ loaded: 0, total, currentName: '' });
      if (total === 0) return [];

      const result: OpponentReport[] = [];
      let lastYield = Date.now();

      for (let i = 0; i < total; i += REPORT_LOAD_BATCH_SIZE) {
        const slice = keys.slice(i, i + REPORT_LOAD_BATCH_SIZE);
        const batch = await matchProjectDb.opponentReports.bulkGet(slice);
        let lastName = '';
        for (const raw of batch) {
          if (!raw) continue;
          const report = cloneEntity(raw);
          result.push(report);
          lastName = report.title || report.opponent.name || '';
        }
        onProgress({ loaded: Math.min(i + slice.length, total), total, currentName: lastName });
        if (Date.now() - lastYield >= 16) {
          await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
          lastYield = Date.now();
        }
      }

      return result;
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
