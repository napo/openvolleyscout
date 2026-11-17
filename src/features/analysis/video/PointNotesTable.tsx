// SPDX-License-Identifier: AGPL-3.0-or-later
import { useMemo, useState } from 'react';
import type { MatchProject } from '@src/domain/match/types';
import type { PointNote } from '@src/domain/video/types';
import { useTranslation } from '@src/i18n';
import { getPointNoteTagLabelKey } from '@src/features/scouting/components/PointNoteModal';
import {
  buildPointNoteTableRows,
  filterPointNoteRows,
  paginatePointNoteRows,
  sortPointNoteRows,
  type PointNoteSortDir,
  type PointNoteSortKey,
  type PointNoteTableRow,
} from './point-notes-table-model';
import './point-notes-panel.css';

export interface PointNotesTableVideoMode {
  starredTouchIds: readonly string[];
  resolveVideoSeconds?: (note: PointNote) => number | null;
  onJumpToNote: (note: PointNote) => void;
  onToggleStar: (row: PointNoteTableRow) => void;
}

interface PointNotesTableProps {
  project: MatchProject;
  videoMode?: PointNotesTableVideoMode;
}

export function PointNotesTable({ project, videoMode }: PointNotesTableProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<PointNoteSortKey>('time');
  const [sortDir, setSortDir] = useState<PointNoteSortDir>('asc');
  const [page, setPage] = useState(1);

  const rows = useMemo(
    () =>
      buildPointNoteTableRows(
        project,
        (tag) => t(getPointNoteTagLabelKey(tag)),
        t('pointNoteTagOther'),
      ),
    [project, t],
  );

  const filteredRows = useMemo(() => filterPointNoteRows(rows, query), [rows, query]);
  const sortedRows = useMemo(
    () => sortPointNoteRows(filteredRows, sortKey, sortDir),
    [filteredRows, sortKey, sortDir],
  );
  const paginated = useMemo(() => paginatePointNoteRows(sortedRows, page), [sortedRows, page]);

  const handleSort = (key: PointNoteSortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
    setPage(1);
  };

  const renderSortIndicator = (key: PointNoteSortKey) => {
    if (sortKey !== key) return null;
    return <span className="point-notes-table__sort-indicator">{sortDir === 'asc' ? ' ▲' : ' ▼'}</span>;
  };

  return (
    <div className="point-notes-table">
      <div className="point-notes-table__toolbar">
        <input
          type="search"
          className="form-input point-notes-table__search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(1);
          }}
          placeholder={t('pointNoteTableSearchPlaceholder')}
          aria-label={t('pointNoteTableSearchPlaceholder')}
        />
      </div>

      {paginated.items.length === 0 ? (
        <p className="point-notes-panel__empty">
          {rows.length === 0 ? t('pointNoteEmpty') : t('pointNoteEmptyFiltered')}
        </p>
      ) : (
        <div className="point-notes-table__scroll">
          <table className="point-notes-table__grid">
            <thead>
              <tr>
                <th>
                  <button type="button" className="point-notes-table__sort" onClick={() => handleSort('time')}>
                    {t('pointNoteColTime')}
                    {renderSortIndicator('time')}
                  </button>
                </th>
                <th>
                  <button type="button" className="point-notes-table__sort" onClick={() => handleSort('type')}>
                    {t('pointNoteColType')}
                    {renderSortIndicator('type')}
                  </button>
                </th>
                <th>
                  <button type="button" className="point-notes-table__sort" onClick={() => handleSort('score')}>
                    {t('pointNoteColScore')}
                    {renderSortIndicator('score')}
                  </button>
                </th>
                <th>
                  <button type="button" className="point-notes-table__sort" onClick={() => handleSort('codes')}>
                    {t('pointNoteColCodes')}
                    {renderSortIndicator('codes')}
                  </button>
                </th>
                {videoMode ? <th className="point-notes-table__actions-col" aria-label={t('videoStarAction')} /> : null}
              </tr>
            </thead>
            <tbody>
              {paginated.items.map((row) => {
                const { note } = row;
                const videoSeconds = videoMode?.resolveVideoSeconds ? videoMode.resolveVideoSeconds(note) : null;
                const canJump = Boolean(videoMode) && (!videoMode?.resolveVideoSeconds || videoSeconds !== null);
                const isStarred = Boolean(
                  videoMode && row.primaryTouchId && videoMode.starredTouchIds.includes(row.primaryTouchId),
                );

                return (
                  <tr
                    key={note.id}
                    className={canJump ? 'point-notes-table__row--clickable' : undefined}
                    onClick={canJump ? () => videoMode?.onJumpToNote(note) : undefined}
                    title={canJump ? t('pointNoteOpenVideo') : undefined}
                  >
                    <td className="point-notes-table__time-cell">{row.timeLabel}</td>
                    <td>
                      <div className="point-notes-table__type-cell">
                        {note.tags.length > 0 || (note.customKeywords?.length ?? 0) > 0 ? (
                          <span className="point-notes-panel__tags">
                            {note.tags.map((tag) => (
                              <span key={tag} className="point-notes-panel__tag-badge">
                                {t(getPointNoteTagLabelKey(tag))}
                              </span>
                            ))}
                            {(note.customKeywords ?? []).map((keyword) => (
                              <span key={keyword} className="point-notes-panel__tag-badge">
                                {keyword}
                              </span>
                            ))}
                          </span>
                        ) : (
                          <span className="point-notes-panel__tag-badge">{t('pointNoteTagOther')}</span>
                        )}
                        {note.text ? <span className="point-notes-panel__text">{note.text}</span> : null}
                      </div>
                    </td>
                    <td className="point-notes-table__score-cell">{row.scoreLabel}</td>
                    <td>
                      <div className="point-notes-table__codes-cell">
                        {row.codes.length > 0 ? (
                          row.codes.map((token) => (
                            <code
                              key={token.touchId}
                              className={`point-notes-table__code${token.isTarget ? ' point-notes-table__code--target' : ''}`}
                            >
                              {token.code}
                            </code>
                          ))
                        ) : (
                          <span className="point-notes-table__empty-code">-</span>
                        )}
                      </div>
                    </td>
                    {videoMode ? (
                      <td className="point-notes-table__actions-cell">
                        <button
                          type="button"
                          className={`video-analysis__icon-button${isStarred ? ' video-analysis__icon-button--active' : ''}`}
                          disabled={!row.primaryTouchId}
                          onClick={(event) => {
                            event.stopPropagation();
                            videoMode.onToggleStar(row);
                          }}
                          title={isStarred ? t('videoUnstarAction') : t('videoStarAction')}
                          aria-label={isStarred ? t('videoUnstarAction') : t('videoStarAction')}
                          aria-pressed={isStarred}
                        >
                          {isStarred ? '★' : '☆'}
                        </button>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {paginated.totalPages > 1 ? (
        <div className="point-notes-table__pagination">
          <button
            type="button"
            className="btn-secondary btn-small"
            disabled={paginated.page <= 1}
            onClick={() => setPage(paginated.page - 1)}
          >
            ‹
          </button>
          <span className="point-notes-table__page-info">
            {t('pointNotePagination', { page: paginated.page, total: paginated.totalPages })}
          </span>
          <button
            type="button"
            className="btn-secondary btn-small"
            disabled={paginated.page >= paginated.totalPages}
            onClick={() => setPage(paginated.page + 1)}
          >
            ›
          </button>
        </div>
      ) : null}
    </div>
  );
}
