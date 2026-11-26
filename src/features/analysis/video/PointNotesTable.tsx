// SPDX-License-Identifier: AGPL-3.0-or-later
import { useMemo } from 'react';
import { InteractiveDataTable, type InteractiveTableColumn } from '@src/components/InteractiveDataTable';
import type { MatchProject } from '@src/domain/match/types';
import type { PointNote } from '@src/domain/video/types';
import { useTranslation } from '@src/i18n';
import { getPointNoteTagLabelKey } from '@src/features/scouting/components/PointNoteModal';
import { buildPointNoteTableRows, type PointNoteTableRow } from './point-notes-table-model';
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

  const rows = useMemo(
    () =>
      buildPointNoteTableRows(
        project,
        (tag) => t(getPointNoteTagLabelKey(tag)),
        t('pointNoteTagOther'),
      ),
    [project, t],
  );

  const canJump = (row: PointNoteTableRow) => {
    if (!videoMode) return false;
    return !videoMode.resolveVideoSeconds || videoMode.resolveVideoSeconds(row.note) !== null;
  };

  const columns = useMemo<InteractiveTableColumn<PointNoteTableRow>[]>(() => [
    { key: 'time', label: t('pointNoteColTime'), text: (row) => row.timeLabel, sortValue: (row) => row.timeSortValue },
    {
      key: 'type',
      label: t('pointNoteColType'),
      text: (row) => `${row.noteTypeLabel} ${row.note.text}`.trim(),
      render: ({ note }) => (
        <div className="point-notes-table__type-cell">
          {note.tags.length > 0 || (note.customKeywords?.length ?? 0) > 0 ? (
            <span className="point-notes-panel__tags">
              {note.tags.map((tag) => (
                <span key={tag} className="point-notes-panel__tag-badge">{t(getPointNoteTagLabelKey(tag))}</span>
              ))}
              {(note.customKeywords ?? []).map((keyword) => (
                <span key={keyword} className="point-notes-panel__tag-badge">{keyword}</span>
              ))}
            </span>
          ) : (
            <span className="point-notes-panel__tag-badge">{t('pointNoteTagOther')}</span>
          )}
          {note.text ? <span className="point-notes-panel__text">{note.text}</span> : null}
        </div>
      ),
    },
    { key: 'score', label: t('pointNoteColScore'), text: (row) => row.scoreLabel, sortValue: (row) => row.scoreSortValue },
    {
      key: 'codes',
      label: t('pointNoteColCodes'),
      text: (row) => row.codesText,
      render: (row) => (
        <div className="point-notes-table__codes-cell">
          {row.codes.length > 0 ? (
            row.codes.map((token) => (
              <code key={token.touchId} className={`point-notes-table__code${token.isTarget ? ' point-notes-table__code--target' : ''}`}>
                {token.code}
              </code>
            ))
          ) : (
            <span className="point-notes-table__empty-code">-</span>
          )}
        </div>
      ),
    },
  ], [t]);

  return (
    <InteractiveDataTable
      label={t('pointNoteTab')}
      items={rows}
      columns={columns}
      getId={(row) => row.note.id}
      emptyText={t('pointNoteEmpty')}
      defaultSortKey="time"
      selectable={false}
      onRowClick={videoMode ? (row) => videoMode.onJumpToNote(row.note) : undefined}
      isRowClickable={canJump}
      rowTitle={(row) => (canJump(row) ? t('pointNoteOpenVideo') : undefined)}
      renderActions={videoMode ? (row) => {
        const isStarred = Boolean(row.primaryTouchId && videoMode.starredTouchIds.includes(row.primaryTouchId));
        return (
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
        );
      } : undefined}
      actionsLabel={t('videoStarAction')}
    />
  );
}
