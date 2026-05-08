import type { Team } from '@src/domain/roster/types';
import type { StartingLineup } from '@src/domain/lineup/types';
import { useTranslation } from '@src/i18n';
import { SetStartFlow } from './SetStartFlow';
import type { NextSetPrefillConfig } from '../model';

interface SetSetupStageProps {
  matchSummary: string;
  setNumber: number;
  homeTeam: Team;
  awayTeam: Team;
  initialSetup?: NextSetPrefillConfig | null;
  onBack: () => void;
  onSetStarted: (input: {
    homeStartingLineup: StartingLineup;
    awayStartingLineup: StartingLineup;
    servingTeam: 'home' | 'away';
  }) => void;
}

export function SetSetupStage({
  matchSummary,
  setNumber,
  homeTeam,
  awayTeam,
  initialSetup,
  onBack,
  onSetStarted,
}: SetSetupStageProps) {
  const { t } = useTranslation();
  const isNextSetSetup = Boolean(initialSetup);

  return (
    <section className="set-setup-stage">
      <header className="set-setup-stage__header">
        <div>
          <span className="scouting-config__section-kicker">{t('setLabel', { setNumber })}</span>
          <h1 className="set-setup-stage__title">
            {isNextSetSetup ? t('nextSetSetup') : t('setSetupStageTitle', { setNumber })}
          </h1>
        </div>
        {isNextSetSetup ? (
          <div className="set-setup-stage__badges" aria-label={t('nextSetSetup')}>
            <span>{t('prefilledFromPreviousSet')}</span>
            <span>{t('courtSidesInverted')}</span>
            <span>{t('servingTeamInverted')}</span>
          </div>
        ) : null}
      </header>
      <p className="scouting-screen__pre-match-summary">
        <span className="scouting-screen__pre-match-summary-label">{t('match')}:</span>{' '}
        {matchSummary}
      </p>
      <div className="scouting-stage-panel scouting-stage-panel--set-setup">
        <SetStartFlow
          matchSummary={matchSummary}
          setNumber={setNumber}
          homeTeam={homeTeam}
          awayTeam={awayTeam}
          initialSetup={initialSetup ?? null}
          onBack={onBack}
          onSetStarted={onSetStarted}
        />
      </div>
    </section>
  );
}
