import { useState, useMemo } from 'react';
import { useTranslation } from '@src/i18n';
import type { VideoSyncPoint } from '@src/domain/video/types';
import { formatVideoSeconds, isAnchorSyncPoint } from './video-sync';

export type SyncPointScopeFilter = 'all' | 'anchor' | 'single';

export const SYNC_POINTS_PAGE_SIZE_OPTIONS = [5, 10, 20, 50] as const;

export interface SyncPointsTableProps {
  syncPoints: readonly VideoSyncPoint[];
  onToggleScope?: (pointId: string) => void;
  onDelete: (pointId: string) => void;
  defaultPageSize?: number;
}

export function filterSyncPoints(
  syncPoints: readonly VideoSyncPoint[],
  searchQuery: string,
  scopeFilter: SyncPointScopeFilter = 'all',
): VideoSyncPoint[] {
  const normalizedQuery = searchQuery.trim().toLowerCase();
  return syncPoints.filter((point) => {
    if (scopeFilter === 'anchor' && !isAnchorSyncPoint(point)) {
      return false;
    }
    if (scopeFilter === 'single' && isAnchorSyncPoint(point)) {
      return false;
    }
    if (!normalizedQuery) {
      return true;
    }
    const code = (point.label ?? point.touchId).toLowerCase();
    const formattedTime = formatVideoSeconds(point.videoSeconds).toLowerCase();
    return code.includes(normalizedQuery) || formattedTime.includes(normalizedQuery);
  });
}

export function paginateSyncPoints(
  points: readonly VideoSyncPoint[],
  page: number,
  pageSize: number,
): {
  items: VideoSyncPoint[];
  currentPage: number;
  totalPages: number;
} {
  const safePageSize = Math.max(1, pageSize);
  const totalPages = Math.max(1, Math.ceil(points.length / safePageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const startIndex = (currentPage - 1) * safePageSize;
  return {
    items: points.slice(startIndex, startIndex + safePageSize),
    currentPage,
    totalPages,
  };
}

export function SyncPointsTable({
  syncPoints,
  onToggleScope,
  onDelete,
  defaultPageSize = 5,
}: SyncPointsTableProps) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [scopeFilter, setScopeFilter] = useState<SyncPointScopeFilter>('all');
  const [pageSize, setPageSize] = useState<number>(defaultPageSize);
  const [page, setPage] = useState<number>(1);

  const sortedPoints = useMemo(
    () => [...syncPoints].sort((a, b) => a.eventClockSeconds - b.eventClockSeconds),
    [syncPoints],
  );

  const filteredPoints = useMemo(
    () => filterSyncPoints(sortedPoints, searchQuery, onToggleScope ? scopeFilter : 'all'),
    [sortedPoints, searchQuery, scopeFilter, onToggleScope],
  );

  const { items: pageItems, currentPage, totalPages } = useMemo(
    () => paginateSyncPoints(filteredPoints, page, pageSize),
    [filteredPoints, page, pageSize],
  );

  if (syncPoints.length === 0) {
    return <p className="video-analysis__hint">{t('videoNoSyncPoints')}</p>;
  }

  return (
    <div className="video-analysis__sync-table-container">
      <div className="video-analysis__sync-toolbar">
        <input
          type="search"
          className="form-input video-analysis__sync-search"
           value={searchQuery}
          onChange={(event) => {
            setSearchQuery(event.target.value);
            setPage(1);
          }}
          placeholder={t('videoSyncSearchPlaceholder')}
          aria-label={t('videoSyncSearchPlaceholder')}
        />
        {onToggleScope ? (
          <label className="video-analysis__sync-toolbar-field">
            <span>{t('videoSyncFilterScope')}</span>
            <select
              className="form-select"
              value={scopeFilter}
              onChange={(event) => {
                setScopeFilter(event.target.value as SyncPointScopeFilter);
                setPage(1);
              }}
            >
              <option value="all">{t('videoSyncFilterAll')}</option>
              <option value="anchor">{t('videoSyncScopeAnchor')}</option>
              <option value="single">{t('videoSyncScopeSingle')}</option>
            </select>
          </label>
        ) : null}
        <label className="video-analysis__sync-toolbar-field">
          <span>{t('videoSyncPageSize')}</span>
          <select
            className="form-select"
            value={pageSize}
            onChange={(event) => {
              setPageSize(Number(event.target.value));
              setPage(1);
            }}
          >
            {SYNC_POINTS_PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
        <span className="video-analysis__sync-count">
          {t('pickerResultCount', { shown: filteredPoints.length, total: syncPoints.length })}
        </span>
      </div>

      {filteredPoints.length > 0 ? (
        <>
          <div className="video-analysis__sync-table-scroll">
            <table className="video-analysis__sync-table">
              <thead>
                <tr>
                  <th>{t('videoSyncColumnAction')}</th>
                  <th>{t('videoSyncColumnTime')}</th>
                  {onToggleScope ? <th>{t('videoSyncColumnScope')}</th> : null}
                  <th className="video-analysis__sync-table-actions-col" aria-label={t('videoSyncPointDelete')} />
                </tr>
              </thead>
              <tbody>
                {pageItems.map((point) => (
                  <tr key={point.id}>
                    <td>
                      <code>{point.label ?? point.touchId}</code>
                    </td>
                    <td className="video-analysis__sync-time-cell">
                      <span>{formatVideoSeconds(point.videoSeconds)}</span>
                    </td>
                    {onToggleScope ? (
                      <td>
                        <button
                          type="button"
                          className="btn-secondary video-analysis__sync-scope-btn"
                          onClick={() => onToggleScope(point.id)}
                          title={t('videoSyncScopeToggle')}
                        >
                          {isAnchorSyncPoint(point) ? t('videoSyncScopeAnchor') : t('videoSyncScopeSingle')}
                        </button>
                      </td>
                    ) : null}
                    <td className="video-analysis__sync-table-actions-col">
                      <button
                        type="button"
                        className="video-analysis__icon-button"
                        onClick={() => onDelete(point.id)}
                        title={t('videoSyncPointDelete')}
                        aria-label={t('videoSyncPointDelete')}
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 ? (
            <div className="video-analysis__sync-pagination">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setPage(Math.max(1, currentPage - 1))}
                disabled={currentPage <= 1}
              >
                {t('videoPlayerPagePrevious')}
              </button>
              <span className="video-analysis__sync-page-status">
                {t('videoSyncPageStatus', { current: currentPage, total: totalPages })}
              </span>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage >= totalPages}
              >
                {t('videoPlayerPageNext')}
              </button>
            </div>
          ) : null}
        </>
      ) : (
        <p className="video-analysis__hint">{t('pickerNoResults')}</p>
      )}
    </div>
  );
}
