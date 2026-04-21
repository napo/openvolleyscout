import { useState } from 'react';
import { useTranslation } from '@src/i18n';
import { useAppStore } from '@src/app/store/app-store';
import { getMatchTeamSnapshot } from '@src/domain/match';
import { useScoutingStore } from '../model';
import type { TeamSide } from '@src/domain/common/enums';
import type { StartingLineup } from '@src/domain/lineup/types';

interface SetStartFlowProps {
  onSetStarted: () => void;
}

export function SetStartFlow({ onSetStarted }: SetStartFlowProps) {
  const { t } = useTranslation();
  const activeProject = useAppStore((state) => state.activeProject);
  const startSet = useScoutingStore((state) => state.startSet);

  const [homeLineup, setHomeLineup] = useState<StartingLineup | null>(null);
  const [awayLineup, setAwayLineup] = useState<StartingLineup | null>(null);
  const [servingTeam, setServingTeam] = useState<TeamSide | null>(null);

  if (!activeProject) {
    return <div>{t('noActiveProject')}</div>;
  }

  const homeTeam = getMatchTeamSnapshot(activeProject, 'home');
  const awayTeam = getMatchTeamSnapshot(activeProject, 'away');

  const handleStartSet = () => {
    if (!homeLineup || !awayLineup || !servingTeam) {
      return;
    }

    startSet(homeLineup, awayLineup, servingTeam);
    onSetStarted();
  };

  // TODO: Implement proper lineup selection UI
  // For now, create basic placeholder lineups
  const createBasicLineup = (teamSide: TeamSide): StartingLineup => ({
    teamSide,
    liberoPlayerIds: [],
    slots: [
      { courtPosition: 1, playerId: 'player-1' },
      { courtPosition: 2, playerId: 'player-2' },
      { courtPosition: 3, playerId: 'player-3' },
      { courtPosition: 4, playerId: 'player-4' },
      { courtPosition: 5, playerId: 'player-5' },
      { courtPosition: 6, playerId: 'player-6' },
    ],
  });

  const handleCreateLineups = () => {
    setHomeLineup(createBasicLineup('home'));
    setAwayLineup(createBasicLineup('away'));
  };

  return (
    <div style={{ padding: 'var(--space-xl)', background: 'var(--color-surface)', borderRadius: 'var(--border-radius-md)', marginBottom: 'var(--space-lg)' }}>
      <h2 style={{ fontSize: 'var(--font-size-xl)', marginBottom: 'var(--space-lg)', color: 'var(--color-text-primary)' }}>
        {t('setStartFlow')}
      </h2>

      <div style={{ display: 'grid', gap: 'var(--space-lg)' }}>
        {/* Lineup Selection */}
        <div>
          <h3 style={{ fontSize: 'var(--font-size-lg)', marginBottom: 'var(--space-md)' }}>
            {t('selectStartingLineup')}
          </h3>

          {!homeLineup || !awayLineup ? (
            <button
              onClick={handleCreateLineups}
              style={{
                padding: 'var(--space-md) var(--space-lg)',
                background: 'var(--color-primary)',
                color: 'var(--color-background)',
                border: 'none',
                borderRadius: 'var(--border-radius-sm)',
                cursor: 'pointer',
              }}
            >
              {t('createBasicLineups')}
            </button>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-lg)' }}>
              <div>
                <h4>{homeTeam.name} ({t('home')})</h4>
                <p>{t('lineupCreated')}</p>
              </div>
              <div>
                <h4>{awayTeam.name} ({t('away')})</h4>
                <p>{t('lineupCreated')}</p>
              </div>
            </div>
          )}
        </div>

        {/* Serving Team Selection */}
        <div>
          <h3 style={{ fontSize: 'var(--font-size-lg)', marginBottom: 'var(--space-md)' }}>
            {t('selectServingTeam')}
          </h3>

          <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
            <button
              onClick={() => setServingTeam('home')}
              style={{
                padding: 'var(--space-md) var(--space-lg)',
                background: servingTeam === 'home' ? 'var(--color-primary)' : 'var(--color-surface)',
                color: servingTeam === 'home' ? 'var(--color-background)' : 'var(--color-text-primary)',
                border: '2px solid var(--color-primary)',
                borderRadius: 'var(--border-radius-sm)',
                cursor: 'pointer',
              }}
            >
              {homeTeam.name}
            </button>
            <button
              onClick={() => setServingTeam('away')}
              style={{
                padding: 'var(--space-md) var(--space-lg)',
                background: servingTeam === 'away' ? 'var(--color-primary)' : 'var(--color-surface)',
                color: servingTeam === 'away' ? 'var(--color-background)' : 'var(--color-text-primary)',
                border: '2px solid var(--color-primary)',
                borderRadius: 'var(--border-radius-sm)',
                cursor: 'pointer',
              }}
            >
              {awayTeam.name}
            </button>
          </div>
        </div>

        {/* Start Set Button */}
        <div>
          <button
            onClick={handleStartSet}
            disabled={!homeLineup || !awayLineup || !servingTeam}
            style={{
              padding: 'var(--space-lg) var(--space-xl)',
              background: (!homeLineup || !awayLineup || !servingTeam) ? 'var(--color-text-secondary)' : 'var(--color-primary)',
              color: 'var(--color-background)',
              border: 'none',
              borderRadius: 'var(--border-radius-md)',
              fontSize: 'var(--font-size-lg)',
              fontWeight: 'var(--font-weight-bold)',
              cursor: (!homeLineup || !awayLineup || !servingTeam) ? 'not-allowed' : 'pointer',
              width: '100%',
            }}
          >
            {t('startSet')}
          </button>
        </div>
      </div>
    </div>
  );
}
