import type { OpponentReport } from '@src/domain/opponent-report/types';
import { getPieceIdsForSheet } from './board-pieces';
import { reportPriorities } from './report-priorities';
import type { KeySuggestion } from './report-keys';
import type { ReportView, ViewT } from './report-view';

/** Initializes only a fresh draft. Reopening or changing sources never replaces manual content. */
export function createTacticalReportDraft(report: OpponentReport, view: ReportView, sourceScopeKey: string, now = Date.now(), t?: ViewT, suggestions?: readonly KeySuggestion[]): OpponentReport {
  if (report.draftStatus !== 'preparing' || report.draftCreatedAt || report.boardPieceIds !== undefined) return { ...report, draftStatus: 'editing' };
  return {
    ...report,
    draftStatus: 'editing',
    draftCreatedAt: now,
    sourceScopeKey,
    boardPieceIds: (['keys', 'serveTargets', 'setter', 'attackers', 'board'] as const).flatMap((sheet) => getPieceIdsForSheet(sheet, report, view)),
    ...(suggestions ? { keys: reportPriorities(report, suggestions) } : {}),
    pieceEdits: report.pieceEdits ?? {},
  };
}

/** Restore sheets omitted when an older archived import yielded no setter data. */
export function recoverArchivedSetterSheets(report: OpponentReport, view: ReportView, hasStaleSetterReferences: boolean): OpponentReport {
  if (!hasStaleSetterReferences || report.setterDistributionRecovered || report.draftStatus === 'preparing' || !report.boardPieceIds || !view.setter.groups.length) return report;
  const setterIds = getPieceIdsForSheet('setter', report, view);
  const alreadySelected = setterIds.some(id => report.boardPieceIds!.includes(id));
  return { ...report, setterDistributionRecovered: true,
    boardPieceIds: alreadySelected ? report.boardPieceIds : [...report.boardPieceIds, ...setterIds],
  };
}
