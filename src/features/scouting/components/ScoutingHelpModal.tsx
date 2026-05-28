import { useTranslation } from '@src/i18n';

interface ScoutingHelpModalProps {
  open: boolean;
  onClose: () => void;
}

export function ScoutingHelpModal({ open, onClose }: ScoutingHelpModalProps) {
  const { t } = useTranslation();

  if (!open) {
    return null;
  }

  return (
    <div className="scouting-help-modal" role="dialog" aria-modal="true" aria-labelledby="scouting-manual-title">
      <div className="scouting-help-modal__panel">
        <header className="scouting-help-modal__header">
          <div>
            <h2 id="scouting-manual-title" className="scouting-help-modal__title">
              {t('liveScoutingManualTitle')}
            </h2>
            <p className="scouting-help-modal__intro">{t('liveScoutingManualIntro')}</p>
          </div>
          <button type="button" className="scouting-help-modal__close" onClick={onClose}>
            {t('cancel')}
          </button>
        </header>

        <div className="scouting-help-modal__content">
          <ul className="scouting-help-modal__list">
            <li>{t('liveScoutingManualStepServe')}</li>
            <li>{t('liveScoutingManualStepPlayer')}</li>
            <li>{t('liveScoutingManualStepScore')}</li>
            <li>{t('liveScoutingManualStepHelp')}</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
