// SPDX-License-Identifier: AGPL-3.0-or-later
import { useMemo, useState } from 'react';
import type { MatchProject } from '@src/domain/match/types';
import type { PointNote, PointNoteTag } from '@src/domain/video/types';
import { createDefaultMatchVideoAnalysis } from '@src/domain/video/types';
import {
  deletePointNote,
  filterPointNotesByTag,
  POINT_NOTE_TAGS,
  updatePointNote,
} from '@src/domain/video/point-notes';
import { useAppStore } from '@src/app/store/app-store';
import { matchRepository } from '@src/infrastructure/repositories';
import { useTranslation } from '@src/i18n';
import { getPointNoteTagLabelKey, PointNoteModal } from '@src/features/scouting/components/PointNoteModal';
import { buildVideoEventIndex, computeEntryVideoSeconds, resolveIndexSyncPoints } from './video-event-index';
import { formatVideoSeconds } from './video-sync';
import './point-notes-panel.css';

interface PointNotesPanelProps {
  project: MatchProject;
  onOpenVideoAt?: (seconds: number) => void;
}

export function PointNotesPanel({ project, onOpenVideoAt }: PointNotesPanelProps) {
  const { t } = useTranslation();
  const setActiveProject = useAppStore((state) => state.setActiveProject);
  const [selectedTag, setSelectedTag] = useState<PointNoteTag | null>(null);
  const [editingNote, setEditingNote] = useState<PointNote | null>(null);

  const notes = project.videoAnalysis?.notes ?? [];
  const filteredNotes = useMemo(
    () => filterPointNotesByTag(notes, selectedTag),
    [notes, selectedTag],
  );

  const hasVideoSource = Boolean(project.videoAnalysis?.source);
  const eventIndex = useMemo(() => buildVideoEventIndex(project.events), [project.events]);
  const resolvedSyncPoints = useMemo(
    () => resolveIndexSyncPoints(project.videoAnalysis?.syncPoints ?? [], eventIndex),
    [project.videoAnalysis?.syncPoints, eventIndex],
  );
  const syncInterpolation = project.videoAnalysis?.syncInterpolation ?? 'step';

  const resolveNoteVideoSeconds = (note: PointNote): number | null => {
    if (!hasVideoSource) return null;
    if (typeof note.videoTimeSeconds === 'number' && Number.isFinite(note.videoTimeSeconds)) {
      return note.videoTimeSeconds;
    }
    const targetEntry = note.touchId
      ? eventIndex.entries.find((entry) => entry.touchId === note.touchId)
      : eventIndex.entries.find(
          (entry) => entry.setNumber === note.setNumber && entry.rallyNumber === note.rallyNumber,
        );
    if (!targetEntry) return null;
    return computeEntryVideoSeconds(
      targetEntry,
      resolvedSyncPoints,
      eventIndex.clockDomain,
      syncInterpolation,
      project.videoAnalysis?.skillOffsets,
    );
  };

  const persistNotes = (nextNotes: PointNote[]) => {
    const current = project.videoAnalysis ?? createDefaultMatchVideoAnalysis();
    const updatedProject: MatchProject = {
      ...project,
      videoAnalysis: {
        ...current,
        notes: nextNotes,
        updatedAt: Date.now(),
      },
      updatedAt: Date.now(),
    };
    setActiveProject(updatedProject);
    void matchRepository.update(updatedProject).then(setActiveProject).catch(() => {});
  };

  return (
    <div className="point-notes-panel">
      <div className="point-notes-panel__filters" role="group" aria-label={t('pointNoteTab')}>
        <button
          type="button"
          className={`point-notes-panel__filter${selectedTag === null ? ' is-selected' : ''}`}
          onClick={() => setSelectedTag(null)}
          aria-pressed={selectedTag === null}
        >
          {t('pointNoteAllTags')} ({notes.length})
        </button>
        {POINT_NOTE_TAGS.map((tag) => {
          const count = notes.filter((note) => note.tags.includes(tag)).length;
          const active = selectedTag === tag;
          return (
            <button
              key={tag}
              type="button"
              className={`point-notes-panel__filter${active ? ' is-selected' : ''}`}
              onClick={() => setSelectedTag(active ? null : tag)}
              aria-pressed={active}
            >
              {t(getPointNoteTagLabelKey(tag))} ({count})
            </button>
          );
        })}
      </div>

      {filteredNotes.length === 0 ? (
        <p className="point-notes-panel__empty">
          {notes.length === 0 ? t('pointNoteEmpty') : t('pointNoteEmptyFiltered')}
        </p>
      ) : (
        <ul className="point-notes-panel__list">
          {filteredNotes.map((note) => {
            const videoSeconds = resolveNoteVideoSeconds(note);
            const canJump = videoSeconds !== null && Boolean(onOpenVideoAt);
            return (
              <li key={note.id} className="point-notes-panel__row">
                <button
                  type="button"
                  className="point-notes-panel__main"
                  disabled={!canJump}
                  onClick={() => {
                    if (videoSeconds !== null) onOpenVideoAt?.(videoSeconds);
                  }}
                  title={canJump ? t('pointNoteOpenVideo') : undefined}
                >
                  <span className="point-notes-panel__meta">
                    <span className="point-notes-panel__set">{`S${note.setNumber}`}</span>
                    <span className="point-notes-panel__score">{`${note.homeScore}-${note.awayScore}`}</span>
                    {videoSeconds !== null ? (
                      <span className="point-notes-panel__time">{formatVideoSeconds(videoSeconds)}</span>
                    ) : null}
                  </span>
                  <span className="point-notes-panel__tags">
                    {note.tags.map((tag) => (
                      <span key={tag} className="point-notes-panel__tag-badge">
                        {t(getPointNoteTagLabelKey(tag))}
                      </span>
                    ))}
                  </span>
                  {note.text ? <span className="point-notes-panel__text">{note.text}</span> : null}
                </button>
                <div className="point-notes-panel__actions">
                  <button
                    type="button"
                    className="btn-secondary btn-small"
                    onClick={() => setEditingNote(note)}
                    aria-label={t('pointNoteEditTitle')}
                    title={t('pointNoteEditTitle')}
                  >
                    ✎
                  </button>
                  <button
                    type="button"
                    className="btn-secondary btn-small"
                    onClick={() => persistNotes(deletePointNote(notes, note.id))}
                    aria-label={t('pointNoteDelete')}
                    title={t('pointNoteDelete')}
                  >
                    ×
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {editingNote ? (
        <PointNoteModal
          note={editingNote}
          setNumber={editingNote.setNumber}
          homeScore={editingNote.homeScore}
          awayScore={editingNote.awayScore}
          onSave={({ tags, text }) => {
            persistNotes(updatePointNote(notes, editingNote.id, { tags, text }));
            setEditingNote(null);
          }}
          onDelete={() => {
            persistNotes(deletePointNote(notes, editingNote.id));
            setEditingNote(null);
          }}
          onClose={() => setEditingNote(null)}
        />
      ) : null}
    </div>
  );
}
