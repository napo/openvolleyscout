import type { TeamSide } from '@src/domain/common/enums';
import type { ScoutingZoneId } from '@src/domain/spatial';
import { useTranslation } from '@src/i18n';

interface EventDraftPanelProps {
  selectedTeamSide: TeamSide | null;
  selectedZoneId: ScoutingZoneId | null;
}

export function EventDraftPanel({ selectedTeamSide, selectedZoneId }: EventDraftPanelProps) {
  const { t } = useTranslation();

  const selectedTeamLabel =
    selectedTeamSide === 'home' ? t('home') : selectedTeamSide === 'away' ? t('away') : t('notSpecified');

  return (
    <section className="scouting-draft-panel">
      <div className="scouting-draft-panel__header">
        <span className="scouting-draft-panel__eyebrow">{t('eventDraft')}</span>
        <h3 className="scouting-draft-panel__title">{t('courtSelection')}</h3>
      </div>

      <div className="scouting-draft-panel__grid">
        <div className="scouting-draft-panel__item">
          <span className="scouting-draft-panel__label">{t('selectedTeamSide')}</span>
          <strong className="scouting-draft-panel__value">{selectedTeamLabel}</strong>
        </div>
        <div className="scouting-draft-panel__item">
          <span className="scouting-draft-panel__label">{t('selectedZone')}</span>
          <strong className="scouting-draft-panel__value">{selectedZoneId ?? t('notSpecified')}</strong>
        </div>
      </div>

      <div className="scouting-draft-panel__placeholders">
        <div className="scouting-draft-panel__placeholder">
          <span className="scouting-draft-panel__label">{t('possiblePlayerNumbers')}</span>
          <span className="scouting-draft-panel__placeholder-value">{t('comingSoonPlaceholder')}</span>
        </div>
        <div className="scouting-draft-panel__placeholder">
          <span className="scouting-draft-panel__label">{t('skill')}</span>
          <span className="scouting-draft-panel__placeholder-value">{t('comingSoonPlaceholder')}</span>
        </div>
        <div className="scouting-draft-panel__placeholder">
          <span className="scouting-draft-panel__label">{t('evaluation')}</span>
          <span className="scouting-draft-panel__placeholder-value">{t('comingSoonPlaceholder')}</span>
        </div>
      </div>
    </section>
  );
}
