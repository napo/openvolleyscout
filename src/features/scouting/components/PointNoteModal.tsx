// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState } from 'react';
import type { PointNote, PointNoteTag } from '@src/domain/video/types';
import { POINT_NOTE_TAGS } from '@src/domain/video/point-notes';
import type { TranslationKey } from '@src/i18n';
import { useTranslation } from '@src/i18n';
import './point-note-modal.css';

const TAG_LABEL_KEYS: Record<PointNoteTag, TranslationKey> = {
  double_touch: 'pointNoteTagDoubleTouch',
  net_invasion: 'pointNoteTagNetInvasion',
  rotation_fault: 'pointNoteTagRotationFault',
  formation_fault: 'pointNoteTagFormationFault',
  to_review: 'pointNoteTagToReview',
};

export function getPointNoteTagLabelKey(tag: PointNoteTag): TranslationKey {
  return TAG_LABEL_KEYS[tag];
}

interface PointNoteModalProps {
  /** Existing note when editing; undefined when creating a new note. */
  note?: PointNote;
  setNumber: number;
  homeScore: number;
  awayScore: number;
  onSave: (payload: { tags: PointNoteTag[]; text: string }) => void;
  onDelete?: () => void;
  onClose: () => void;
}

/**
 * Compact modal for recording or editing a point note.
 * In create mode, one tap on any preset tag records the note immediately;
 * free text is optional and never required.
 */
export function PointNoteModal({
  note,
  setNumber,
  homeScore,
  awayScore,
  onSave,
  onDelete,
  onClose,
}: PointNoteModalProps) {
  const { t } = useTranslation();
  const isEditing = Boolean(note);
  const [selectedTags, setSelectedTags] = useState<PointNoteTag[]>(note?.tags ?? []);
  const [text, setText] = useState(note?.text ?? '');

  const handleTagClick = (tag: PointNoteTag) => {
    if (!isEditing) {
      onSave({ tags: [tag], text });
      return;
    }
    setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag]));
  };

  const canSaveManual = isEditing
    ? selectedTags.length > 0 || text.trim().length > 0
    : text.trim().length > 0;

  return (
    <div className="point-note-backdrop" role="presentation" onClick={onClose}>
      <div
        className="point-note-modal"
        role="dialog"
        aria-modal="true"
        aria-label={isEditing ? t('pointNoteEditTitle') : t('pointNoteTitle')}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="point-note-modal__header">
          <div>
            <h3>{isEditing ? t('pointNoteEditTitle') : t('pointNoteTitle')}</h3>
            <p className="point-note-modal__context">
              {t('pointNoteContext', { set: setNumber, home: homeScore, away: awayScore })}
            </p>
          </div>
          <button type="button" className="btn-secondary btn-small" onClick={onClose} aria-label={t('cancel')}>
            ×
          </button>
        </div>

        <div className="point-note-modal__tags">
          {POINT_NOTE_TAGS.map((tag) => {
            const active = selectedTags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                className={`point-note-modal__tag${active ? ' is-selected' : ''}`}
                onClick={() => handleTagClick(tag)}
                aria-pressed={isEditing ? active : undefined}
              >
                {t(TAG_LABEL_KEYS[tag])}
              </button>
            );
          })}
        </div>

        <input
          type="text"
          className="point-note-modal__input"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={t('pointNoteTextPlaceholder')}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && canSaveManual) {
              event.preventDefault();
              onSave({ tags: selectedTags, text });
            } else if (event.key === 'Escape') {
              event.preventDefault();
              onClose();
            }
          }}
        />

        <div className="point-note-modal__actions">
          {isEditing && onDelete ? (
            <button type="button" className="btn-secondary point-note-modal__delete" onClick={onDelete}>
              {t('pointNoteDelete')}
            </button>
          ) : null}
          <button type="button" className="btn-secondary" onClick={onClose}>
            {t('cancel')}
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={!canSaveManual}
            onClick={() => onSave({ tags: selectedTags, text })}
          >
            {t('pointNoteSave')}
          </button>
        </div>
      </div>
    </div>
  );
}
