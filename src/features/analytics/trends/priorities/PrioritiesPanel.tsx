import { EmptyState } from '@src/components/EmptyState';
import { formatPlayerLabel } from '@src/domain/roster/helpers';
import { useMemo } from 'react';
import { useTranslation } from '@src/i18n';
import type { MatchProject } from '@src/domain/match/types';
import { getWeakRotations, type RotationPhase } from './tactical-rotation';
import { useIsSharedTrends, useTrendsSource, useTrendsViewStore } from '../trends-data-source';
import { CategoryRadarChart } from './CategoryRadarChart';
import { RotationBarCharts } from './RotationBarCharts';
import { PlayerPicker } from './PlayerPicker';
import './priorities-panel.css';

export interface PrioritiesPanelProps {
  matches: readonly MatchProject[];
  teamRef: { teamId?: string; teamName?: string };
}

const PHASE_HEADER_KEY: Record<RotationPhase, 'prioritiesRotationSideOutHeader' | 'prioritiesRotationBreakPointHeader'> = {
  sideOut: 'prioritiesRotationSideOutHeader',
  breakPoint: 'prioritiesRotationBreakPointHeader',
};

export function PrioritiesPanel({ matches, teamRef }: PrioritiesPanelProps) {
  const { t } = useTranslation();
  const source = useTrendsSource(matches, teamRef);
  const shared = useIsSharedTrends();
  const teamDiagnosis = useMemo(() => source.teamDiagnosis(), [source]);
  const rotationDiagnosis = useMemo(() => source.rotationDiagnosis(), [source]);
  const weakRotations = useMemo(() => getWeakRotations(rotationDiagnosis), [rotationDiagnosis]);
  const availablePlayers = useMemo(() => source.availablePlayers(), [source]);
  const storedPlayerIds = useTrendsViewStore((state) => state.priorityPlayerIds);
  const togglePlayer = useTrendsViewStore((state) => state.togglePriorityPlayer);
  // Athletes picked for another team (or match) are not shown here.
  const selectedPlayerIds = useMemo(
    () => new Set(storedPlayerIds.filter((id) => availablePlayers.some((player) => player.playerId === id))),
    [storedPlayerIds, availablePlayers],
  );

  if (source.matchCount === 0) {
    return <EmptyState>{t('prioritiesNoMatches')}</EmptyState>;
  }

  return (
    <div className="priorities-panel">
      <section className="priorities-panel__section">
        <CategoryRadarChart
          title={t('prioritiesTeamTechnicalTitle')}
          diagnosis={teamDiagnosis}
          currentLabel={t('prioritiesCurrentLabel')}
          benchmarkLabel={t('prioritiesBenchmarkLabel')}
          matches={matches}
          teamRef={teamRef}
        />
      </section>

      <section className="priorities-panel__section">
        <h3 className="priorities-panel__title">{t('prioritiesTacticalTitle')}</h3>
        <RotationBarCharts diagnosis={rotationDiagnosis} />
        {weakRotations.length === 0 ? (
          <EmptyState>{t('prioritiesNoWeakRotations')}</EmptyState>
        ) : (
          <ul className="priorities-panel__weak-list">
            {weakRotations.map((weak) => (
              <li key={`${weak.rotation}-${weak.phase}`}>
                {t('prioritiesRotationLabel', { number: weak.rotation })} · {t(PHASE_HEADER_KEY[weak.phase])} - {(weak.percentage * 100).toFixed(0)}%
              </li>
            ))}
          </ul>
        )}
      </section>

      {shared && availablePlayers.length === 0 ? null : (
      <section className="priorities-panel__section">
        <h3 className="priorities-panel__title">{t('prioritiesPlayerTechnicalTitle')}</h3>
        <PlayerPicker players={availablePlayers} selectedIds={selectedPlayerIds} onToggle={togglePlayer} />
        {selectedPlayerIds.size === 0 ? (
          <EmptyState>{t('prioritiesNoPlayerSelected')}</EmptyState>
        ) : (
          <div className="priorities-panel__player-grid">
            {Array.from(selectedPlayerIds).map((playerId) => {
              const player = availablePlayers.find((p) => p.playerId === playerId);
              const diagnosis = source.playerDiagnosis(playerId);
              const playerTitle = `${formatPlayerLabel(player?.jerseyNumber, player?.playerName)}`;
              return (
                <div key={playerId} className="priorities-panel__player-block">
                  <CategoryRadarChart
                    title={playerTitle}
                    diagnosis={diagnosis}
                    currentLabel={t('prioritiesCurrentLabel')}
                    benchmarkLabel={t('prioritiesPlayerBenchmarkLabel')}
                    matches={matches}
                    teamRef={teamRef}
                    playerId={playerId}
                  />
                </div>
              );
            })}
          </div>
        )}
      </section>
      )}
    </div>
  );
}
