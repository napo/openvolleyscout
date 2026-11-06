import type { OpponentReport } from '@src/domain/opponent-report/types';
import { getPieceIdsForSheet } from './board-pieces';
import type { ReportView, ViewT } from './report-view';

/** Initializes only a fresh draft. Reopening or changing sources never replaces manual content. */
export function createTacticalReportDraft(report: OpponentReport, view: ReportView, sourceScopeKey: string, now = Date.now(), t?: ViewT): OpponentReport {
  if (report.draftStatus !== 'preparing' || report.draftCreatedAt || report.boardPieceIds !== undefined) return { ...report, draftStatus: 'editing' };
  return {
    ...report,
    draftStatus: 'editing',
    draftCreatedAt: now,
    sourceScopeKey,
    boardPieceIds: (['keys', 'serveTargets', 'setter', 'attackers', 'serve', 'board'] as const).flatMap((sheet) => getPieceIdsForSheet(sheet, report, view)),
    pieceEdits: {
      ...report.pieceEdits,
      'keys:main': { items: view.keys.slice(0, 4).map((key) => key.sample !== undefined && t ? `${key.text} (${t('opponentReportKeySample', { n: key.sample })})` : key.text), ...report.pieceEdits?.['keys:main'] },
    },
  };
}
