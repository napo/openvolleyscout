import { useEffect, useRef, useState } from 'react';
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

  // A pinned tooltip should close on any click outside the grid — not just clicks that land
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

  const homeMatrix = stats.crossRotationStats.bySide.home;
  const awayMatrix = stats.crossRotationStats.bySide.away;
  const containerRect = containerRef.current?.getBoundingClientRect();

  return (
    <div className="cross-rotation-analysis">
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
