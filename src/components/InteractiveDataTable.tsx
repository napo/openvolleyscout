// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from '@src/i18n';
import './interactive-data-table.css';

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

export interface InteractiveTableColumn<T> {
  key: string;
  label: string;
  /** Plain text used for global filtering and default sorting. */
  text: (item: T) => string;
  /** Optional custom sort value (e.g. timestamp or number). */
  sortValue?: (item: T) => string | number;
  /** Optional rich cell renderer (defaults to `text(item)`). */
  render?: (item: T) => ReactNode;
  sortable?: boolean;
  title?: (item: T) => string | undefined;
}

export function filterAndSortTableRows<T>(
  items: readonly T[],
  columns: readonly InteractiveTableColumn<T>[],
  query: string,
  sortKey: string | null,
  sortDir: 'asc' | 'desc',
  extraSearchText?: (item: T) => string,
): T[] {
  const q = query.trim().toLowerCase();
  const filtered = q
    ? items.filter((item) => {
      const hay = [
        ...columns.map((c) => c.text(item)),
        extraSearchText ? extraSearchText(item) : '',
      ].join(' ').toLowerCase();
      return hay.includes(q);
    })
    : [...items];

  if (!sortKey) return filtered;
  const sortCol = columns.find((c) => c.key === sortKey);
  if (!sortCol || sortCol.sortable === false) return filtered;

  const dir = sortDir === 'asc' ? 1 : -1;
  return filtered.sort((a, b) => {
    const va = sortCol.sortValue ? sortCol.sortValue(a) : sortCol.text(a);
    const vb = sortCol.sortValue ? sortCol.sortValue(b) : sortCol.text(b);
    if (typeof va === 'number' && typeof vb === 'number') {
      return (va - vb) * dir;
    }
    return String(va).localeCompare(String(vb)) * dir;
  });
}

export function paginateTableRows<T>(
  rows: readonly T[],
  page: number,
  pageSize: number,
): { pageRows: T[]; safePage: number; totalPages: number; startIndex: number } {
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const startIndex = (safePage - 1) * pageSize;
  return {
    pageRows: rows.slice(startIndex, startIndex + pageSize),
    safePage,
    totalPages,
    startIndex,
  };
}

export interface InteractiveDataTableProps<T> {
  label: string;
  items: readonly T[];
  columns: readonly InteractiveTableColumn<T>[];
  getId: (item: T) => string;
  emptyText: string;
  extraSearchText?: (item: T) => string;
  defaultSortKey?: string;
  defaultSortDir?: 'asc' | 'desc';
  defaultPageSize?: 10 | 25 | 50 | 100;
  /** Controlled selection (optional); if omitted, component manages its own selection state. */
  selectedIds?: ReadonlySet<string>;
  onSelectionChange?: (selectedIds: Set<string>) => void;
  /** Highlighted active row id (e.g. currently opened team or system). */
  activeId?: string | null;
  isRowDisabled?: (item: T) => boolean;
  renderActions?: (item: T) => ReactNode;
  actionsLabel?: string;
  renderBulkActions?: (selectedItems: T[], clearSelection: () => void) => ReactNode;
  headerExtra?: ReactNode;
}

export function InteractiveDataTable<T>({
  label,
  items,
  columns,
  getId,
  emptyText,
  extraSearchText,
  defaultSortKey,
  defaultSortDir = 'asc',
  defaultPageSize = 10,
  selectedIds: controlledSelectedIds,
  onSelectionChange,
  activeId,
  isRowDisabled,
  renderActions,
  actionsLabel,
  renderBulkActions,
  headerExtra,
}: InteractiveDataTableProps<T>) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<string | null>(defaultSortKey ?? columns[0]?.key ?? null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(defaultSortDir);
  const [pageSize, setPageSize] = useState<number>(defaultPageSize);
  const [page, setPage] = useState(1);
  const [internalSelected, setInternalSelected] = useState<Set<string>>(() => new Set());

  const selectedIds = controlledSelectedIds ?? internalSelected;
  const updateSelection = (next: Set<string>) => {
    if (onSelectionChange) onSelectionChange(next);
    if (!controlledSelectedIds) setInternalSelected(next);
  };

  const filteredRows = useMemo(
    () => filterAndSortTableRows(items, columns, query, sortKey, sortDir, extraSearchText),
    [items, columns, query, sortKey, sortDir, extraSearchText],
  );

  const { pageRows, safePage, totalPages, startIndex } = useMemo(
    () => paginateTableRows(filteredRows, page, pageSize),
    [filteredRows, page, pageSize],
  );

  useEffect(() => {
    setPage(1);
  }, [query, pageSize, sortKey, sortDir]);

  useEffect(() => {
    const valid = new Set(items.map(getId));
    const pruned = new Set([...selectedIds].filter((id) => valid.has(id)));
    if (pruned.size !== selectedIds.size) {
      updateSelection(pruned);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  const toggleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const toggleRow = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    updateSelection(next);
  };

  const allPageSelected = pageRows.length > 0 && pageRows.every((item) => selectedIds.has(getId(item)));
  const togglePage = () => {
    const next = new Set(selectedIds);
    if (allPageSelected) {
      pageRows.forEach((item) => next.delete(getId(item)));
    } else {
      pageRows.forEach((item) => next.add(getId(item)));
    }
    updateSelection(next);
  };

  const selectAllFiltered = () => {
    updateSelection(new Set(filteredRows.map(getId)));
  };

  const clearSelection = () => {
    updateSelection(new Set());
  };

  const selectedItems = useMemo(
    () => items.filter((item) => selectedIds.has(getId(item))),
    [items, selectedIds, getId],
  );

  const sortIndicator = (key: string) => (sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '');
  const sortableColumns = useMemo(() => columns.filter((c) => c.sortable !== false), [columns]);

  const paginationBar = (
    <div className="interactive-table__pagination">
      <span>
        {t('bulkImportPaginationInfo', {
          from: filteredRows.length ? startIndex + 1 : 0,
          to: Math.min(startIndex + pageSize, filteredRows.length),
          total: filteredRows.length,
          page: safePage,
          pages: totalPages,
        })}
      </span>
      <div className="interactive-table__page-buttons">
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
    <section className="interactive-table" aria-label={label}>
      <div className="interactive-table__toolbar">
        <input
          type="search"
          className="interactive-table__search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('bulkImportSearchPlaceholder')}
          aria-label={`${label}: ${t('bulkImportSearchPlaceholder')}`}
        />
        <label className="interactive-table__page-size">
          <span>{t('bulkImportPageSize')}</span>
          <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
        </label>
        {sortableColumns.length > 0 ? (
          <div className="interactive-table__mobile-sort">
            <select
              value={sortKey ?? sortableColumns[0].key}
              onChange={(event) => setSortKey(event.target.value)}
              aria-label={label}
            >
              {sortableColumns.map((col) => (
                <option key={col.key} value={col.key}>{col.label}</option>
              ))}
            </select>
            <button
              type="button"
              className="btn-secondary btn-small"
              onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
              aria-label={sortDir === 'asc' ? '▲' : '▼'}
            >
              {sortDir === 'asc' ? '▲' : '▼'}
            </button>
          </div>
        ) : null}
        <button type="button" className="btn-secondary btn-small" onClick={selectAllFiltered} disabled={!filteredRows.length}>
          {t('bulkImportSelectAllFiltered')} ({filteredRows.length})
        </button>
        <button type="button" className="btn-secondary btn-small" onClick={clearSelection} disabled={!selectedIds.size}>
          {t('tableClearVisible')}
        </button>
        {headerExtra}
      </div>

      {selectedIds.size > 0 && renderBulkActions ? (
        <div className="interactive-table__bulk-bar">
          <span>{t('bulkImportSelectedCount', { count: selectedIds.size })}</span>
          {renderBulkActions(selectedItems, clearSelection)}
        </div>
      ) : null}

      {paginationBar}

      <div className="interactive-table__wrap" role="region" aria-label={label} tabIndex={0}>
        <table className="interactive-table__table">
          <thead>
            <tr>
              <th scope="col" className="interactive-table__check">
                <input
                  type="checkbox"
                  checked={allPageSelected}
                  onChange={togglePage}
                  aria-label={t('tableSelectVisible')}
                />
              </th>
              {columns.map((column) => (
                <th key={column.key} scope="col">
                  {column.sortable === false ? (
                    column.label
                  ) : (
                    <button type="button" className="interactive-table__sort" onClick={() => toggleSort(column.key)}>
                      {column.label}{sortIndicator(column.key)}
                    </button>
                  )}
                </th>
              ))}
              {renderActions ? <th scope="col">{actionsLabel ?? t('teamLibraryActions')}</th> : null}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((item) => {
              const id = getId(item);
              const checked = selectedIds.has(id);
              const isActive = activeId === id;
              const disabled = isRowDisabled ? isRowDisabled(item) : false;
              const rowClass = [
                checked ? 'is-selected' : '',
                isActive ? 'is-active' : '',
              ].filter(Boolean).join(' ') || undefined;

              return (
                <tr key={id} className={rowClass}>
                  <td className="interactive-table__check">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => toggleRow(id)}
                      aria-label={columns[0] ? columns[0].text(item) : id}
                    />
                  </td>
                  {columns.map((column) => (
                    <td key={column.key} data-label={column.label} title={column.title?.(item)}>
                      <span className="interactive-table__cell-value">
                        {column.render ? column.render(item) : column.text(item)}
                      </span>
                    </td>
                  ))}
                  {renderActions ? (
                    <td className="interactive-table__actions-cell" data-label={actionsLabel ?? t('teamLibraryActions')}>
                      <div className="interactive-table__actions">
                        {renderActions(item)}
                      </div>
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
        {filteredRows.length === 0 ? (
          <p className="interactive-table__empty">
            {items.length ? t('pickerNoResults') : emptyText}
          </p>
        ) : null}
      </div>

      {paginationBar}
    </section>
  );
}
