// SPDX-License-Identifier: AGPL-3.0-or-later
import type { OpponentReport } from '@src/domain/opponent-report/types';

/** The report's own title or, when left empty, its creation date followed by the opponent's name. */
export function opponentReportTitle(report: Pick<OpponentReport, 'title' | 'createdAt' | 'opponent'>): string {
  const own = report.title.trim();
  if (own) return own;
  const date = new Intl.DateTimeFormat(undefined, { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(report.createdAt));
  return [date, report.opponent.name.trim()].filter(Boolean).join(' ');
}
