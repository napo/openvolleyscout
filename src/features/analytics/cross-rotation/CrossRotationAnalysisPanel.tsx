import { useEffect, useMemo, useRef, useState } from 'react';
import { ChipSelect, FilterGroup, FilterGroups, ResetFiltersButton } from '@src/components/filter-chips/FilterChips';
import { buildCrossRotationStatsFromRallies } from '@src/features/scouting/model/match-stats';
import { useRememberedState } from '@src/lib/hooks/useRememberedState';
import { statsScopeKey } from '@src/lib/utils/stats-scope';
import { useTranslation } from '@src/i18n';
import type { MatchStats } from '@src/features/scouting/model/match-stats';
import { CrossRotationTable } from './CrossRotationTable';
import { CrossRotationTooltip, type CrossRotationActiveCell } from './CrossRotationTooltip';
import './cross-rotation-analysis.css';

interface CrossRotationAnalysisPanelProps {
  stats: MatchStats;
}

export function CrossRotationAnalysisPanel({ stats }: CrossRotationAnalysisPanelProps) {
  const { t } = useTranslation();
  const scope = statsScopeKey(stats);
  const [setNumber, setSetNumber, resetSet] = useRememberedState<number | 'all'>('cross-rotation-set', scope, () => 'all');
  const setNumbers = useMemo(() => stats.setStats.map((set) => set.setNumber), [stats.setStats]);
  // One set: the table is counted again from that set's rallies, with the same rules as the whole match.
  const shown = useMemo(() => (
    setNumber === 'all' || !setNumbers.includes(setNumber)
      ? stats
      : { ...stats, crossRotationStats: buildCrossRotationStatsFromRallies(stats.rallyStats.filter((rally) => rally.setNumber === setNumber)) }
  ), [stats, setNumber, setNumbers]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeCell, setActiveCell] = useState<CrossRotationActiveCell | null>(null);
  const [pinned, setPinned] = useState(false);

  const homeTeamName = stats.teamStats.home.teamName || t('homeTeam');
  const awayTeamName = stats.teamStats.away.teamName || t('awayTeam');

  const handleHover = (info: CrossRotationActiveCell | null) => {
    if (pinned) return;
    setActiveCell(info);
  };

  const handleToggle = (info: CrossRotationActiveCell) => {
    if (pinned && activeCell?.servingRotation === info.servingRotation && activeCell?.receivingRotation === info.receivingRotation && activeCell?.servingTeamName === info.servingTeamName) {
      setPinned(false);
      setActiveCell(null);
      return;
    }
    setActiveCell(info);
    setPinned(true);
  };

  // A pinned tooltip should close on any click outside the grid - not just clicks that land
  // inside the container but miss a cell (cell clicks stopPropagation, so this only ever
  // fires for genuine "elsewhere" clicks, whether inside or outside this component's DOM).
  useEffect(() => {
    if (!pinned) return;
    const handleDocumentClick = () => {
      setPinned(false);
      setActiveCell(null);
    };
    document.addEventListener('click', handleDocumentClick);
    return () => document.removeEventListener('click', handleDocumentClick);
  }, [pinned]);

  const dismissPinned = () => {
    if (pinned) {
      setPinned(false);
      setActiveCell(null);
    }
  };

  const homeMatrix = shown.crossRotationStats.bySide.home;
  const awayMatrix = shown.crossRotationStats.bySide.away;
  const containerRect = containerRef.current?.getBoundingClientRect();

  return (
    <div className="cross-rotation-analysis">
      {setNumbers.length > 1 ? (
        <>
          <FilterGroups>
            <FilterGroup title={t('filterSet')} active={setNumber !== 'all'}>
              <ChipSelect
                single
                allLabel={t('setterViewReceptionAll')}
                options={setNumbers.map((value) => ({ value, label: String(value) }))}
                selected={setNumber === 'all' ? [] : [setNumber]}
                onChange={(next) => { dismissPinned(); setSetNumber(next[0] ?? 'all'); }}
              />
            </FilterGroup>
          </FilterGroups>
          <ResetFiltersButton count={setNumber !== 'all' ? 1 : 0} onReset={() => { dismissPinned(); resetSet(); }} />
        </>
      ) : null}
      <p className="cross-rotation-analysis__description">{t('crossRotationAnalysisDescription')}</p>
      <div className="cross-rotation-analysis__legend">
        <span className="cross-rotation-analysis__legend-item">
          <span className="cross-rotation-analysis__legend-swatch cross-rotation-analysis__legend-swatch--green-so" />
          {t('crossRotationLegendSideOutGood')}
        </span>
        <span className="cross-rotation-analysis__legend-item">
          <span className="cross-rotation-analysis__legend-swatch cross-rotation-analysis__legend-swatch--red-so" />
          {t('crossRotationLegendSideOutBad')}
        </span>
        <span className="cross-rotation-analysis__legend-item">
          <span className="cross-rotation-analysis__legend-swatch cross-rotation-analysis__legend-swatch--green-bp" />
          {t('crossRotationLegendBreakPointGood')}
        </span>
        <span className="cross-rotation-analysis__legend-item">
          <span className="cross-rotation-analysis__legend-swatch cross-rotation-analysis__legend-swatch--red-bp" />
          {t('crossRotationLegendBreakPointBad')}
        </span>
        <span className="cross-rotation-analysis__legend-item">
          <span className="cross-rotation-analysis__subscript--service">S</span>
          {t('crossRotationLegendServiceError')}
        </span>
        <span className="cross-rotation-analysis__legend-item">
          <span className="cross-rotation-analysis__subscript--reception">R</span>
          {t('crossRotationLegendReceptionError')}
        </span>
      </div>
      <div className="cross-rotation-analysis__container" ref={containerRef} onClick={dismissPinned}>
        <div className="cross-rotation-analysis__grid">
          <CrossRotationTable
            title={t('crossRotationBreakPointTitle', { team: homeTeamName })}
            matrix={homeMatrix}
            view="breakPoint"
            servingTeamName={homeTeamName}
            receivingTeamName={awayTeamName}
            onCellHover={handleHover}
            onCellToggle={handleToggle}
          />
          <CrossRotationTable
            title={t('crossRotationSideOutTitle', { team: awayTeamName })}
            matrix={homeMatrix}
            view="sideOut"
            servingTeamName={homeTeamName}
            receivingTeamName={awayTeamName}
            onCellHover={handleHover}
            onCellToggle={handleToggle}
          />
          <CrossRotationTable
            title={t('crossRotationBreakPointTitle', { team: awayTeamName })}
            matrix={awayMatrix}
            view="breakPoint"
            servingTeamName={awayTeamName}
            receivingTeamName={homeTeamName}
            onCellHover={handleHover}
            onCellToggle={handleToggle}
          />
          <CrossRotationTable
            title={t('crossRotationSideOutTitle', { team: homeTeamName })}
            matrix={awayMatrix}
            view="sideOut"
            servingTeamName={awayTeamName}
            receivingTeamName={homeTeamName}
            onCellHover={handleHover}
            onCellToggle={handleToggle}
          />
        </div>
        {activeCell && containerRect ? (
          <CrossRotationTooltip cell={activeCell} containerRect={containerRect} />
        ) : null}
      </div>
    </div>
  );
}
