import { useTranslation } from '@src/i18n';
import type { CrossRotationAggregate, RotationNumber } from '@src/features/scouting/model/match-stats';

export interface CrossRotationActiveCell {
  anchorRect: DOMRect;
  servingTeamName: string;
  receivingTeamName: string;
  servingRotation: RotationNumber | 'TOT';
  receivingRotation: RotationNumber | 'TOT';
  aggregate: CrossRotationAggregate;
}

interface CrossRotationTooltipProps {
  cell: CrossRotationActiveCell;
  containerRect: DOMRect;
}

const TOOLTIP_WIDTH = 220;
const TOOLTIP_OFFSET = 12;

export function CrossRotationTooltip({ cell, containerRect }: CrossRotationTooltipProps) {
  const { t } = useTranslation();
  const { aggregate } = cell;

  const rawLeft = cell.anchorRect.left - containerRect.left + cell.anchorRect.width / 2 - TOOLTIP_WIDTH / 2;
  const left = Math.min(Math.max(rawLeft, 4), Math.max(containerRect.width - TOOLTIP_WIDTH - 4, 4));
  const top = cell.anchorRect.top - containerRect.top - TOOLTIP_OFFSET;
  const openUpward = top > 120;

  const pointDiff = aggregate.breakPointWins - aggregate.sideOutWins;

  return (
    <div
      className="cross-rotation-analysis__tooltip"
      role="tooltip"
      style={{
        left,
        top: openUpward ? top : top + cell.anchorRect.height + TOOLTIP_OFFSET * 2,
        width: TOOLTIP_WIDTH,
        transform: openUpward ? 'translateY(-100%)' : undefined,
      }}
    >
      <div className="cross-rotation-analysis__tooltip-title">
        {cell.servingTeamName} P{cell.servingRotation} · {cell.receivingTeamName} P{cell.receivingRotation}
      </div>
      <div className="cross-rotation-analysis__tooltip-row">
        <span>{t('crossRotationTooltipRecord')}</span>
        <strong>{aggregate.breakPointWins}–{aggregate.sideOutWins}</strong>
      </div>
      <div className="cross-rotation-analysis__tooltip-row">
        <span>{t('crossRotationBreakPointTitle', { team: cell.servingTeamName })}</span>
        <strong>{aggregate.breakPointPercentage === null ? '—' : `${(aggregate.breakPointPercentage * 100).toFixed(1)}%`}</strong>
      </div>
      <div className="cross-rotation-analysis__tooltip-row">
        <span>{t('crossRotationSideOutTitle', { team: cell.receivingTeamName })}</span>
        <strong>{aggregate.sideOutPercentage === null ? '—' : `${(aggregate.sideOutPercentage * 100).toFixed(1)}%`}</strong>
      </div>
      {aggregate.serviceErrorLosses > 0 ? (
        <div className="cross-rotation-analysis__tooltip-row">
          <span>{t('crossRotationTooltipServiceErrors')}</span>
          <strong>{aggregate.serviceErrorLosses}</strong>
        </div>
      ) : null}
      {aggregate.receptionErrorLosses > 0 ? (
        <div className="cross-rotation-analysis__tooltip-row">
          <span>{t('crossRotationTooltipReceptionErrors')}</span>
          <strong>{aggregate.receptionErrorLosses}</strong>
        </div>
      ) : null}
      <div className="cross-rotation-analysis__tooltip-row">
        <span>{t('crossRotationTooltipDifferential')}</span>
        <strong>{pointDiff > 0 ? `+${pointDiff}` : pointDiff}</strong>
      </div>
    </div>
  );
}
