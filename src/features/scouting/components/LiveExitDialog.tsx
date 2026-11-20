// SPDX-License-Identifier: AGPL-3.0-or-later

import { useTranslation } from '@src/i18n';

export interface LiveExitDialogProps {
  open: boolean;
  onGoToAnalysis: () => void;
  onSuspend: () => void;
  onDeleteAndRestart: () => void;
  onOpenMenu: () => void;
  onClose: () => void;
}

export function LiveExitDialog({
  open,
  onGoToAnalysis,
  onSuspend,
  onDeleteAndRestart,
  onOpenMenu,
  onClose,
}: LiveExitDialogProps) {
  const { t } = useTranslation();

  if (!open) return null;

  return (
    <div
      className="scouting-screen__setter-assignment-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="live-exit-title"
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose();
      }}
    >
      <div className="scouting-screen__setter-assignment-dialog live-exit-dialog">
        <strong id="live-exit-title">{t('liveExitTitle')}</strong>
        <p className="live-exit-dialog__note">{t('liveExitSaved')}</p>
        <button type="button" className="live-exit-dialog__choice" onClick={onGoToAnalysis}>
          <strong>{t('liveExitStats')}</strong>
          <span>{t('liveExitStatsHint')}</span>
        </button>
        <button type="button" className="live-exit-dialog__choice" onClick={onSuspend}>
          <strong>{t('liveExitSuspend')}</strong>
          <span>{t('liveExitSuspendHint')}</span>
        </button>
        <button type="button" className="live-exit-dialog__choice live-exit-dialog__choice--danger" onClick={onDeleteAndRestart}>
          <strong>{t('liveExitRestart')}</strong>
          <span>{t('liveExitRestartHint')}</span>
        </button>
        <div className="live-exit-dialog__footer">
          <button type="button" className="btn-secondary btn-small" onClick={onOpenMenu}>
            ☰ {t('appMenu')}
          </button>
          <button type="button" className="btn-primary btn-small" onClick={onClose}>
            {t('liveExitBack')}
          </button>
        </div>
      </div>
    </div>
  );
}
