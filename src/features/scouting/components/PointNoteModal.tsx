import { Modal } from '@src/components/Modal';
// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState } from 'react';
import type { PointNote, PointNoteTag } from '@src/domain/video/types';
import { POINT_NOTE_TAGS } from '@src/domain/video/point-notes';
import {
  addCustomPointNoteKeyword,
  loadCustomPointNoteKeywords,
  normalizeCustomKeyword,
  normalizeCustomKeywordList,
} from '@src/domain/video/custom-point-note-keywords';
import type { TranslationKey } from '@src/i18n';
import { useTranslation } from '@src/i18n';
import './point-note-modal.css';

const TAG_LABEL_KEYS: Record<PointNoteTag, TranslationKey> = {
  double_touch: 'pointNoteTagDoubleTouch',
  net_invasion: 'pointNoteTagNetInvasion',
  rotation_fault: 'pointNoteTagRotationFault',
  formation_fault: 'pointNoteTagFormationFault',
  funny_gesture: 'pointNoteTagFunnyGesture',
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
  onSave: (payload: { tags: PointNoteTag[]; customKeywords: string[]; text: string }) => void;
  onDelete?: () => void;
  onClose: () => void;
}

/**
 * Compact modal for recording or editing a point note.
 * In create mode, one tap on any preset tag or saved custom keyword records the note immediately
 * (when no other tags/keywords are already queued); free text is optional and never required.
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
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>(note?.customKeywords ?? []);
  const [availableKeywords, setAvailableKeywords] = useState<string[]>(() =>
    normalizeCustomKeywordList([...loadCustomPointNoteKeywords(), ...(note?.customKeywords ?? [])]),
  );
  const [newKeywordDraft, setNewKeywordDraft] = useState('');
  const [text, setText] = useState(note?.text ?? '');

  const handleTagClick = (tag: PointNoteTag) => {
    if (!isEditing && selectedTags.length === 0 && selectedKeywords.length === 0) {
      onSave({ tags: [tag], customKeywords: [], text });
      return;
    }
    setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag]));
  };

  const handleCustomKeywordClick = (keyword: string) => {
    if (!isEditing && selectedTags.length === 0 && selectedKeywords.length === 0) {
      onSave({ tags: [], customKeywords: [keyword], text });
      return;
    }
    setSelectedKeywords((prev) =>
      prev.some((item) => item.toLowerCase() === keyword.toLowerCase())
        ? prev.filter((item) => item.toLowerCase() !== keyword.toLowerCase())
        : [...prev, keyword],
    );
  };

  const handleAddCustomKeyword = () => {
    const normalized = normalizeCustomKeyword(newKeywordDraft);
    if (!normalized) return;
    const updatedPool = addCustomPointNoteKeyword(normalized);
    setAvailableKeywords(normalizeCustomKeywordList([...updatedPool, ...selectedKeywords]));
    const canonical =
      updatedPool.find((item) => item.toLowerCase() === normalized.toLowerCase()) ?? normalized;
    setSelectedKeywords((prev) =>
      prev.some((item) => item.toLowerCase() === canonical.toLowerCase()) ? prev : [...prev, canonical],
    );
    setNewKeywordDraft('');
  };

  const canSaveManual = selectedTags.length > 0 || selectedKeywords.length > 0 || text.trim().length > 0;

  return (
    <Modal className="point-note-backdrop" ariaLabel={isEditing ? t('pointNoteEditTitle') : t('pointNoteTitle')} onClose={onClose}>
      <div className="point-note-modal">
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
                aria-pressed={isEditing || selectedTags.length > 0 || selectedKeywords.length > 0 ? active : undefined}
              >
                {t(TAG_LABEL_KEYS[tag])}
              </button>
            );
          })}
          {availableKeywords.map((keyword) => {
            const active = selectedKeywords.some((item) => item.toLowerCase() === keyword.toLowerCase());
            return (
              <button
                key={keyword}
                type="button"
                className={`point-note-modal__tag point-note-modal__tag--custom${active ? ' is-selected' : ''}`}
                onClick={() => handleCustomKeywordClick(keyword)}
                aria-pressed={isEditing || selectedTags.length > 0 || selectedKeywords.length > 0 ? active : undefined}
              >
                {keyword}
              </button>
            );
          })}
        </div>

        <div className="point-note-modal__custom-row">
          <input
            type="text"
            className="point-note-modal__input point-note-modal__custom-input"
            value={newKeywordDraft}
            onChange={(event) => setNewKeywordDraft(event.target.value)}
            placeholder={t('pointNoteNewKeywordPlaceholder')}
            aria-label={t('pointNoteNewKeywordPlaceholder')}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                handleAddCustomKeyword();
              }
            }}
          />
          <button
            type="button"
            className="btn-secondary btn-small"
            disabled={!normalizeCustomKeyword(newKeywordDraft)}
            onClick={handleAddCustomKeyword}
          >
            + {t('pointNoteAddKeyword')}
          </button>
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
              onSave({ tags: selectedTags, customKeywords: selectedKeywords, text });
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
            onClick={() => onSave({ tags: selectedTags, customKeywords: selectedKeywords, text })}
          >
            {t('pointNoteSave')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
