// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useMemo, useState } from 'react';
import { translateImportMessage } from '../diagnostics/translate';
import { useTranslation } from '@src/i18n';
import {
  filterAndSortBulkProblems,
  type BulkImportDecision,
  type BulkImportIssueKind,
  type BulkImportProblemRow,
  type BulkTableSortKey,
} from './bulk-import';
import './bulk-import-table.css';

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

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
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<BulkTableSortKey>('fileName');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [pageSize, setPageSize] = useState<number>(10);
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkDecision, setBulkDecision] = useState<BulkImportDecision>('skip');

  const issueLabel = (kind: BulkImportIssueKind): string => {
    switch (kind) {
      case 'duplicate_match': return t('bulkImportIssueDuplicate');
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

  const filteredRows = useMemo(
    () => filterAndSortBulkProblems(rows, query, sortKey, sortDir, issueLabel, decisionLabel),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, query, sortKey, sortDir, t],
  );

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const pageRows = filteredRows.slice(startIndex, startIndex + pageSize);

  useEffect(() => {
    setPage(1);
  }, [query, pageSize, sortKey, sortDir]);

  useEffect(() => {
    const valid = new Set(rows.map((r) => r.id));
    setSelectedIds((prev) => new Set([...prev].filter((id) => valid.has(id))));
  }, [rows]);

  const toggleSort = (key: BulkTableSortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const toggleRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allPageSelected = pageRows.length > 0 && pageRows.every((r) => selectedIds.has(r.id));
  const togglePage = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allPageSelected) {
        pageRows.forEach((r) => next.delete(r.id));
      } else {
        pageRows.forEach((r) => next.add(r.id));
      }
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelectedIds(new Set(filteredRows.map((r) => r.id)));
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  const selectedArray = [...selectedIds];
  const rowDecisionById = useMemo(() => new Map(rows.map((r) => [r.id, r.decision])), [rows]);
  const actionableSelectedCount = selectedArray.filter((id) => {
    const d = rowDecisionById.get(id);
    return d !== undefined && d !== 'skip';
  }).length;
  const sortIndicator = (key: BulkTableSortKey) => (sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '');

  const paginationBar = (
    <div className="bulk-import__pagination">
      <span>
        {t('bulkImportPaginationInfo', {
          from: filteredRows.length ? startIndex + 1 : 0,
          to: Math.min(startIndex + pageSize, filteredRows.length),
          total: filteredRows.length,
          page: safePage,
          pages: totalPages,
        })}
      </span>
      <div className="bulk-import__page-buttons">
        <button type="button" className="btn-secondary btn-small" disabled={safePage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
          ‹
        </button>
        <button type="button" className="btn-secondary btn-small" disabled={safePage >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
          ›
        </button>
      </div>
    </div>
  );

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

      <div className="bulk-import__toolbar">
        <input
          type="search"
          className="bulk-import__search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('bulkImportSearchPlaceholder')}
          aria-label={t('bulkImportSearchPlaceholder')}
        />
        <label className="bulk-import__page-size">
          <span>{t('bulkImportPageSize')}</span>
          <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
        </label>
        <button type="button" className="btn-secondary btn-small" onClick={selectAllFiltered} disabled={!filteredRows.length || isBusy}>
          {t('bulkImportSelectAllFiltered')} ({filteredRows.length})
        </button>
        <button type="button" className="btn-secondary btn-small" onClick={clearSelection} disabled={!selectedIds.size || isBusy}>
          {t('tableClearVisible')}
        </button>
      </div>

      {selectedIds.size > 0 ? (
        <div className="bulk-import__bulk-bar">
          <span>{t('bulkImportSelectedCount', { count: selectedIds.size })}</span>
          <select
            value={bulkDecision}
            onChange={(event) => {
              const nextDecision = event.target.value as BulkImportDecision;
              setBulkDecision(nextDecision);
              onBulkDecisionChange(selectedArray, nextDecision);
            }}
            aria-label={t('bulkImportApplyAction')}
          >
            <option value="overwrite">{decisionLabel('overwrite')}</option>
            <option value="copy">{decisionLabel('copy')}</option>
            <option value="merge_players">{decisionLabel('merge_players')}</option>
            <option value="create_players">{decisionLabel('create_players')}</option>
            <option value="use_remote">{decisionLabel('use_remote')}</option>
            <option value="keep_local">{decisionLabel('keep_local')}</option>
            <option value="skip">{decisionLabel('skip')}</option>
          </select>
          <button
            type="button"
            className="btn-secondary btn-small"
            disabled={isBusy}
            onClick={() => onBulkDecisionChange(selectedArray, bulkDecision)}
          >
            {t('bulkImportApplyAction')}
          </button>
          <button
            type="button"
            className="btn-primary btn-small"
            disabled={isBusy || actionableSelectedCount === 0}
            onClick={() => onImportSelected(selectedArray)}
          >
            {t('bulkImportConfirmSelected', { count: actionableSelectedCount })}
          </button>
        </div>
      ) : null}

      {paginationBar}

      <div className="bulk-import__table-wrap">
        <table className="bulk-import__table">
          <thead>
            <tr>
              <th scope="col" className="bulk-import__check">
                <input
                  type="checkbox"
                  checked={allPageSelected}
                  onChange={togglePage}
                  aria-label={t('tableSelectVisible')}
                />
              </th>
              <th scope="col">
                <button type="button" className="bulk-import__sort" onClick={() => toggleSort('fileName')}>
                  {t('bulkImportColFile')}{sortIndicator('fileName')}
                </button>
              </th>
              <th scope="col">
                <button type="button" className="bulk-import__sort" onClick={() => toggleSort('format')}>
                  {t('bulkImportColFormat')}{sortIndicator('format')}
                </button>
              </th>
              <th scope="col">
                <button type="button" className="bulk-import__sort" onClick={() => toggleSort('matchLabel')}>
                  {t('bulkImportColMatch')}{sortIndicator('matchLabel')}
                </button>
              </th>
              <th scope="col">
                <button type="button" className="bulk-import__sort" onClick={() => toggleSort('issueKind')}>
                  {t('bulkImportColIssue')}{sortIndicator('issueKind')}
                </button>
              </th>
              <th scope="col">
                <button type="button" className="bulk-import__sort" onClick={() => toggleSort('issueSummary')}>
                  {t('bulkImportColDetails')}{sortIndicator('issueSummary')}
                </button>
              </th>
              <th scope="col">
                <button type="button" className="bulk-import__sort" onClick={() => toggleSort('decision')}>
                  {t('bulkImportColAction')}{sortIndicator('decision')}
                </button>
              </th>
              <th scope="col">{t('bulkImportColInspect')}</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row) => (
              <tr key={row.id} className={selectedIds.has(row.id) ? 'is-selected' : undefined}>
                <td className="bulk-import__check">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(row.id)}
                    onChange={() => toggleRow(row.id)}
                    aria-label={row.fileName}
                  />
                </td>
                <td>{row.fileName}</td>
                <td>{row.format.toUpperCase()}</td>
                <td>{row.matchLabel}</td>
                <td>{issueLabel(row.issueKind)}</td>
                <td>{detailsText(row)}</td>
                <td>
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
                </td>
                <td>
                  <button
                    type="button"
                    className="btn-secondary btn-small"
                    disabled={isBusy}
                    title={t('bulkImportOpenPreviewHint')}
                    onClick={() => onOpenRowPreview(row)}
                  >
                    {t('bulkImportOpenPreview')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredRows.length === 0 ? (
          <p className="bulk-import__empty">
            {rows.length === 0 ? t('bulkImportAllResolved') : t('pickerNoResults')}
          </p>
        ) : null}
      </div>

      {paginationBar}
    </section>
  );
}
