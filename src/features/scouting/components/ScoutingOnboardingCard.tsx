import { useTranslation } from '@src/i18n';

interface ScoutingOnboardingCardProps {
  open: boolean;
  onClose: () => void;
  onOpenManual: () => void;
}

export function ScoutingOnboardingCard({ open, onClose, onOpenManual }: ScoutingOnboardingCardProps) {
  const { t } = useTranslation();

  if (!open) {
    return null;
  }

  return (
    <div className="scouting-help-card" role="dialog" aria-modal="true" aria-labelledby="scouting-onboarding-title">
      <div className="scouting-help-card__panel">
        <div className="scouting-help-card__content">
          <h2 id="scouting-onboarding-title" className="scouting-help-card__title">
            {t('liveScoutingWelcomeTitle')}
          </h2>
          <p className="scouting-help-card__message">{t('liveScoutingWelcomeMessage')}</p>
          <ul className="scouting-help-card__steps">
            <li>{t('liveScoutingWelcomeStepServe')}</li>
            <li>{t('liveScoutingWelcomeStepPlayer')}</li>
            <li>{t('liveScoutingWelcomeStepScore')}</li>
          </ul>
        </div>

        <div className="scouting-help-card__actions">
          <button type="button" className="btn-secondary btn-small scouting-help-card__button" onClick={onOpenManual}>
            {t('liveScoutingWelcomeOpenManual')}
          </button>
          <button type="button" className="btn-primary btn-small scouting-help-card__button" onClick={onClose}>
            {t('gotIt')}
          </button>
        </div>
      </div>
    </div>
  );
}
