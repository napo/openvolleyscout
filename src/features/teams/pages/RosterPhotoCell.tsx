// SPDX-License-Identifier: AGPL-3.0-or-later
import { useRef } from 'react';
import { AthleteSilhouette } from '@src/components/athlete-silhouettes/AthleteSilhouette';
import type { AthletePose } from '@src/components/athlete-silhouettes/athlete-silhouettes';
import { useTranslation } from '@src/i18n';
import './roster-photo.css';

/** Image types offered when choosing a photo (WebP is converted to PNG or JPEG). */
export const ROSTER_PHOTO_ACCEPT = 'image/png,image/jpeg,image/webp';

/**
 * Photo of an athlete in the roster editor: a small square thumbnail (the
 * photo, or the drawing of her role when there is none) that opens the file
 * picker, and a small button on its corner to remove the photo. A file that
 * is not a usable image marks the thumbnail in red; the message is shown by
 * the roster, since a narrow table cell has no room for it.
 */
export function RosterPhotoCell({ name, pose, photo, busy = false, error = false, onChoose, onRemove }: {
  /** Name (or `#jersey`) of the athlete, for the labels. */
  name: string;
  pose: AthletePose;
  photo: string | null;
  busy?: boolean;
  error?: boolean;
  onChoose: (file: File) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const thumbRef = useRef<HTMLButtonElement>(null);
  const action = photo ? t('athletePhotoReplace') : t('athletePhotoAdd');
  const title = [error ? t('athletePhotoError') : null, photo ? null : t('athletePhotoNone'), action].filter(Boolean).join('. ');

  return (
    <div className="roster-photo">
      <button
        ref={thumbRef}
        type="button"
        className={`roster-photo__thumb${photo ? ' has-photo' : ''}${error ? ' is-error' : ''}`}
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        aria-label={`${action} - ${name}`}
        aria-busy={busy || undefined}
        title={title}
      >
        {photo
          ? <img src={photo} alt={t('athletePhotoAlt', { name })} width={40} height={40} />
          : <AthleteSilhouette pose={pose} size={36} />}
      </button>
      {photo ? (
        <button
          type="button"
          className="roster-photo__remove"
          onClick={() => {
            onRemove();
            // This button goes away with the photo: the keyboard stays on the athlete's thumbnail.
            thumbRef.current?.focus();
          }}
          disabled={busy}
          aria-label={`${t('athletePhotoRemove')} - ${name}`}
          title={t('athletePhotoRemove')}
        >
          ✕
        </button>
      ) : null}
      <input
        ref={inputRef}
        type="file"
        accept={ROSTER_PHOTO_ACCEPT}
        className="roster-photo__input"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Cleared so the same file can be chosen again after a removal.
          event.target.value = '';
          if (file) onChoose(file);
        }}
      />
    </div>
  );
}
