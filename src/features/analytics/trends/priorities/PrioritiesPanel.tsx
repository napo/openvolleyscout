import { useMemo, useState } from 'react';
import { useTranslation } from '@src/i18n';
import type { MatchProject } from '@src/domain/match/types';
import { computeTeamTechnicalDiagnosis, rankTeamTechnicalDiagnosis } from './technical-team';
import {
  computePlayerTechnicalDiagnosis,
  rankPlayerTechnicalDiagnosis,
  getAvailablePlayers,
} from './technical-player';
import { computeRotationDiagnosis, getWeakRotations, type RotationPhase } from './tactical-rotation';
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
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<string>>(new Set());

  const teamDiagnosis = useMemo(
    () => rankTeamTechnicalDiagnosis(computeTeamTechnicalDiagnosis(matches, teamRef)),
    [matches, teamRef],
  );
  const rotationDiagnosis = useMemo(() => computeRotationDiagnosis(matches, teamRef), [matches, teamRef]);
  const weakRotations = useMemo(() => getWeakRotations(rotationDiagnosis), [rotationDiagnosis]);
  const availablePlayers = useMemo(() => getAvailablePlayers(matches, teamRef), [matches, teamRef]);

  const togglePlayer = (playerId: string) => {
    setSelectedPlayerIds((prev) => {
      const next = new Set(prev);
      if (next.has(playerId)) next.delete(playerId);
      else next.add(playerId);
      return next;
    });
  };

  if (matches.length === 0) {
    return <p className="trends-panel__empty">{t('prioritiesNoMatches')}</p>;
  }

  return (
    <div className="priorities-panel">
      <section className="priorities-panel__section">
        <h3 className="priorities-panel__title">{t('prioritiesTeamTechnicalTitle')}</h3>
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
          <p className="trends-panel__empty">{t('prioritiesNoWeakRotations')}</p>
        ) : (
          <ul className="priorities-panel__weak-list">
            {weakRotations.map((weak) => (
              <li key={`${weak.rotation}-${weak.phase}`}>
                {t('prioritiesRotationLabel', { number: weak.rotation })} · {t(PHASE_HEADER_KEY[weak.phase])} — {(weak.percentage * 100).toFixed(0)}%
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="priorities-panel__section">
        <h3 className="priorities-panel__title">{t('prioritiesPlayerTechnicalTitle')}</h3>
        <PlayerPicker players={availablePlayers} selectedIds={selectedPlayerIds} onToggle={togglePlayer} />
        {selectedPlayerIds.size === 0 ? (
          <p className="trends-panel__empty">{t('prioritiesNoPlayerSelected')}</p>
        ) : (
          <div className="priorities-panel__player-grid">
            {Array.from(selectedPlayerIds).map((playerId) => {
              const player = availablePlayers.find((p) => p.playerId === playerId);
              const diagnosis = rankPlayerTechnicalDiagnosis(
                computePlayerTechnicalDiagnosis(matches, teamRef, playerId),
              );
              const playerTitle = `#${player?.jerseyNumber} ${player?.playerName}`;
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
    </div>
  );
}
