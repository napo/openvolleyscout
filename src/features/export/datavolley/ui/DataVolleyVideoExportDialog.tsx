import { useState } from 'react';
import { useTranslation } from '@src/i18n';
import { parseVideoPositionOrLink } from '@src/lib/utils/video-position';
import type { DataVolleyExportOptions } from '../index';

type DataVolleyVideoExportDialogProps = {
  /** Touches already carry video positions (scouted with the video panel or tag input). */
  hasRecordedVideoTimes: boolean;
  /** Sync points set in the Video analysis tab. */
  syncPointCount: number;
  onClose: () => void;
  /** `useSyncPoints`: map video times through the Video analysis sync points. */
  onExport: (options: DataVolleyExportOptions & { useSyncPoints: boolean }) => void;
};

const MAX_SHIFT_SECONDS = 600;

/**
 * DVW export with video times lined up to a recording of the match (e.g. a
 * YouTube video), so DataVolley-compatible viewers jump to the right moment.
 */
export function DataVolleyVideoExportDialog({ hasRecordedVideoTimes, syncPointCount, onClose, onExport }: DataVolleyVideoExportDialogProps) {
  const { t } = useTranslation();
  const [useSyncPoints, setUseSyncPoints] = useState(syncPointCount > 0);
  const [firstServeText, setFirstServeText] = useState('');
  const [shiftText, setShiftText] = useState('0');

  // Sync points already place every action; the first-serve field would fight them.
  const asksFirstServe = !hasRecordedVideoTimes && !useSyncPoints;
  const firstServeSeconds = asksFirstServe && firstServeText.trim() ? parseVideoPositionOrLink(firstServeText) : undefined;
  const shiftSeconds = Number(shiftText);
  const isFirstServeValid = firstServeSeconds !== null;
  const isShiftValid = Number.isFinite(shiftSeconds) && Math.abs(shiftSeconds) <= MAX_SHIFT_SECONDS;
  const canExport = isFirstServeValid && isShiftValid;

  const handleExport = () => {
    if (!canExport) return;
    onExport({
      firstServeVideoSeconds: firstServeSeconds ?? undefined,
      videoShiftSeconds: shiftSeconds || undefined,
      useSyncPoints,
    });
  };

  return (
    <div className="roster-modal" role="dialog" aria-modal="true" aria-labelledby="dvw-video-export-title">
      <div className="roster-modal__backdrop" onClick={onClose} />
      <section className="roster-modal__panel">
        <header className="roster-modal__header">
          <div>
            <h3 id="dvw-video-export-title" className="roster-modal__title">{t('dvwVideoExportTitle')}</h3>
            <p className="roster-modal__help">{t('dvwVideoExportHelp')}</p>
          </div>
        </header>

        <div className="roster-modal__body">
          {syncPointCount > 0 ? (
            <label className="form-checkbox">
              <input type="checkbox" checked={useSyncPoints} onChange={(event) => setUseSyncPoints(event.target.checked)} />
              <span>{t('dvwVideoExportUseSyncPoints', { count: syncPointCount })}</span>
            </label>
          ) : null}
          {!asksFirstServe ? (
            <p className="roster-modal__help">
              {useSyncPoints ? t('dvwVideoExportSyncPointsHelp') : t('dvwVideoExportRecordedTimes')}
            </p>
          ) : (
            <div className="roster-modal__select-group">
              <label className="form-label" htmlFor="dvw-video-first-serve">{t('dvwVideoExportFirstServe')}</label>
              <input
                id="dvw-video-first-serve"
                type="text"
                className="form-input"
                autoComplete="off"
                autoFocus
                placeholder={t('dvwVideoExportFirstServePlaceholder')}
                value={firstServeText}
                onChange={(event) => setFirstServeText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') handleExport();
                }}
              />
              {!isFirstServeValid ? <p className="form-error">{t('dvwVideoExportFirstServeInvalid')}</p> : null}
            </div>
          )}

          <div className="roster-modal__select-group">
            <label className="form-label" htmlFor="dvw-video-shift">{t('dvwVideoExportShift')}</label>
            <input
              id="dvw-video-shift"
              type="number"
              className="form-input"
              step={1}
              min={-MAX_SHIFT_SECONDS}
              max={MAX_SHIFT_SECONDS}
              value={shiftText}
              onChange={(event) => setShiftText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') handleExport();
              }}
            />
            <p className="roster-modal__help">{t('dvwVideoExportShiftHelp')}</p>
          </div>
        </div>

        <footer className="roster-modal__footer">
          <div className="roster-modal__actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              {t('cancel')}
            </button>
            <button type="button" className="btn-primary" onClick={handleExport} disabled={!canExport}>
              {t('exportDataVolley')}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
