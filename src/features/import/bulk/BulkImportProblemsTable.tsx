// SPDX-License-Identifier: AGPL-3.0-or-later
import { useMemo, useState } from 'react';
import { InteractiveDataTable, type InteractiveTableColumn } from '@src/components/InteractiveDataTable';
import { translateImportMessage } from '../diagnostics/translate';
import { useTranslation } from '@src/i18n';
import type {
  BulkImportDecision,
  BulkImportIssueKind,
  BulkImportProblemRow,
} from './bulk-import';
import './bulk-import-table.css';

interface BulkImportProblemsTableProps {
  autoImportedCount: number;
  autoImportedWithWarnings: number;
  totalCount: number;
  rows: readonly BulkImportProblemRow[];
  isBusy: boolean;
  onRowDecisionChange: (rowId: string, decision: BulkImportDecision) => void;
  onBulkDecisionChange: (rowIds: readonly string[], decision: BulkImportDecision) => void;
  onImportSelected: (rowIds: readonly string[]) => void;
  onOpenRowPreview: (row: BulkImportProblemRow) => void;
  onClose: () => void;
}

export function BulkImportProblemsTable({
  autoImportedCount,
  autoImportedWithWarnings,
  totalCount,
  rows,
  isBusy,
  onRowDecisionChange,
  onBulkDecisionChange,
  onImportSelected,
  onOpenRowPreview,
  onClose,
}: BulkImportProblemsTableProps) {
  const { t } = useTranslation();
  const [bulkDecision, setBulkDecision] = useState<BulkImportDecision>('skip');

  const issueLabel = (kind: BulkImportIssueKind): string => {
    switch (kind) {
      case 'duplicate_match': return t('bulkImportIssueDuplicate');
      case 'similar_team': return t('bulkImportIssueSimilarTeam');
      case 'player_reconciliation': return t('bulkImportIssuePlayer');
      case 'ovs_conflict': return t('bulkImportIssueOvsConflict');
      case 'tiebreak_multi_game': return t('bulkImportIssueMultiGame');
      case 'validation_error': return t('bulkImportIssueValidation');
      case 'parse_error': return t('bulkImportIssueParse');
    }
  };

  const decisionLabel = (decision: BulkImportDecision): string => {
    switch (decision) {
      case 'overwrite': return t('bulkImportDecisionOverwrite');
      case 'copy': return t('bulkImportDecisionCopy');
      case 'link_similar_team': return t('bulkImportDecisionLinkTeam');
      case 'create_new_team': return t('bulkImportDecisionCreateTeam');
      case 'merge_players': return t('bulkImportDecisionMergePlayers');
      case 'create_players': return t('bulkImportDecisionCreatePlayers');
      case 'use_remote': return t('bulkImportDecisionUseRemote');
      case 'keep_local': return t('bulkImportDecisionKeepLocal');
      case 'skip': return t('bulkImportDecisionSkip');
    }
  };

  const detailsText = (row: BulkImportProblemRow): string => (
    row.issueDiagnostic
      ? translateImportMessage(row.issueDiagnostic, t as (key: string, params?: Record<string, string | number>) => string)
      : row.issueSummary
  );

  const columns = useMemo<InteractiveTableColumn<BulkImportProblemRow>[]>(() => [
    { key: 'fileName', label: t('bulkImportColFile'), text: (row) => row.fileName },
    { key: 'format', label: t('bulkImportColFormat'), text: (row) => row.format, render: (row) => row.format.toUpperCase() },
    { key: 'matchLabel', label: t('bulkImportColMatch'), text: (row) => row.matchLabel },
    { key: 'issueKind', label: t('bulkImportColIssue'), text: (row) => issueLabel(row.issueKind) },
    { key: 'issueSummary', label: t('bulkImportColDetails'), text: (row) => row.issueSummary, render: detailsText },
    {
      key: 'decision',
      label: t('bulkImportColAction'),
      text: (row) => decisionLabel(row.decision),
      render: (row) => (
        <select
          value={row.decision}
          disabled={isBusy || row.availableDecisions.length <= 1}
          onChange={(event) => onRowDecisionChange(row.id, event.target.value as BulkImportDecision)}
          aria-label={`${row.fileName}: ${t('bulkImportColAction')}`}
        >
          {row.availableDecisions.map((d) => (
            <option key={d} value={d}>{decisionLabel(d)}</option>
          ))}
        </select>
      ),
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [t, isBusy, onRowDecisionChange]);

  const rowDecisionById = useMemo(() => new Map(rows.map((r) => [r.id, r.decision])), [rows]);

  return (
    <section className="bulk-import" aria-label={t('bulkImportTitle')}>
      <header className="bulk-import__header">
        <div>
          <h2>{t('bulkImportTitle')}</h2>
          <p className="bulk-import__summary">
            {t('bulkImportSummary', {
              total: totalCount,
              imported: autoImportedCount,
              warnings: autoImportedWithWarnings,
              problems: rows.length,
            })}
          </p>
          <p className="bulk-import__summary">{t('bulkImportHelpHint')}</p>
        </div>
        <button type="button" className="btn-secondary btn-small" onClick={onClose} disabled={isBusy}>
          {t('cancelImport')}
        </button>
      </header>

      <InteractiveDataTable
        label={t('bulkImportTitle')}
        items={rows}
        columns={columns}
        getId={(row) => row.id}
        emptyText={t('bulkImportAllResolved')}
        defaultSortKey="fileName"
        actionsLabel={t('bulkImportColInspect')}
        renderActions={(row) => (
          <button
            type="button"
            className="btn-secondary btn-small"
            disabled={isBusy}
            title={t('bulkImportOpenPreviewHint')}
            onClick={() => onOpenRowPreview(row)}
          >
            {t('bulkImportOpenPreview')}
          </button>
        )}
        renderBulkActions={(selected) => {
          const ids = selected.map((row) => row.id);
          const actionable = ids.filter((id) => {
            const d = rowDecisionById.get(id);
            return d !== undefined && d !== 'skip';
          }).length;
          return (
            <>
              <select
                value={bulkDecision}
                onChange={(event) => {
                  const nextDecision = event.target.value as BulkImportDecision;
                  setBulkDecision(nextDecision);
                  onBulkDecisionChange(ids, nextDecision);
                }}
                aria-label={t('bulkImportApplyAction')}
              >
                {(['overwrite', 'copy', 'link_similar_team', 'create_new_team', 'merge_players', 'create_players', 'use_remote', 'keep_local', 'skip'] as const).map((d) => (
                  <option key={d} value={d}>{decisionLabel(d)}</option>
                ))}
              </select>
              <button type="button" className="btn-secondary btn-small" disabled={isBusy} onClick={() => onBulkDecisionChange(ids, bulkDecision)}>
                {t('bulkImportApplyAction')}
              </button>
              <button type="button" className="btn-primary btn-small" disabled={isBusy || actionable === 0} onClick={() => onImportSelected(ids)}>
                {t('bulkImportConfirmSelected', { count: actionable })}
              </button>
            </>
          );
        }}
      />
    </section>
  );
}
