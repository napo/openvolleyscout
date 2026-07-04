import { useTranslation } from '@src/i18n';
import {
  ROTATION_DISPLAY_ORDER,
  type CrossRotationMatrix,
  type RotationNumber,
} from '@src/features/scouting/model/match-stats';
import {
  formatCrossRotationCellMain,
  getCrossRotationCellTone,
  getCrossRotationPercentage,
  type CrossRotationView,
} from './cross-rotation-format';
import type { CrossRotationActiveCell } from './CrossRotationTooltip';

interface CrossRotationTableProps {
  title: string;
  matrix: CrossRotationMatrix;
  view: CrossRotationView;
  servingTeamName: string;
  receivingTeamName: string;
  onCellHover: (info: CrossRotationActiveCell | null) => void;
  onCellToggle: (info: CrossRotationActiveCell) => void;
}

export function CrossRotationTable({
  title,
  matrix,
  view,
  servingTeamName,
  receivingTeamName,
  onCellHover,
  onCellToggle,
}: CrossRotationTableProps) {
  const { t } = useTranslation();

  const makeActiveCell = (
    servingRotation: RotationNumber | 'TOT',
    receivingRotation: RotationNumber | 'TOT',
    aggregate: CrossRotationMatrix['grandTotal'],
    anchorRect: DOMRect,
  ): CrossRotationActiveCell => ({
    anchorRect,
    servingTeamName,
    receivingTeamName,
    servingRotation,
    receivingRotation,
    aggregate,
  });

  function renderCell(
    aggregate: CrossRotationMatrix['grandTotal'],
    servingRotation: RotationNumber | 'TOT',
    receivingRotation: RotationNumber | 'TOT',
    key: string,
  ) {
    const { fraction, percentage } = formatCrossRotationCellMain(aggregate, view);
    const tone = aggregate.attempts > 0 ? getCrossRotationCellTone(getCrossRotationPercentage(aggregate, view), view) : null;
    const isEmpty = aggregate.attempts === 0;
    const toneClass = tone ? ` cross-rotation-analysis__cell--${tone}` : '';

    const handleActivate = (anchorRect: DOMRect) => {
      onCellToggle(makeActiveCell(servingRotation, receivingRotation, aggregate, anchorRect));
    };

    return (
      <td
        key={key}
        className={`cross-rotation-analysis__cell${toneClass}${isEmpty ? ' cross-rotation-analysis__cell--empty' : ''}`}
        tabIndex={isEmpty ? undefined : 0}
        onMouseEnter={isEmpty ? undefined : (e) => onCellHover(makeActiveCell(servingRotation, receivingRotation, aggregate, e.currentTarget.getBoundingClientRect()))}
        onMouseLeave={isEmpty ? undefined : () => onCellHover(null)}
        onFocus={isEmpty ? undefined : (e) => onCellHover(makeActiveCell(servingRotation, receivingRotation, aggregate, e.currentTarget.getBoundingClientRect()))}
        onBlur={isEmpty ? undefined : () => onCellHover(null)}
        onClick={isEmpty ? undefined : (e) => { e.stopPropagation(); handleActivate(e.currentTarget.getBoundingClientRect()); }}
        onKeyDown={isEmpty ? undefined : (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            handleActivate(e.currentTarget.getBoundingClientRect());
          }
        }}
      >
        {isEmpty ? null : (
          <>
            <div className="cross-rotation-analysis__cell-fraction">{fraction}</div>
            <div className="cross-rotation-analysis__cell-percentage">{percentage}</div>
            {(aggregate.serviceErrorLosses > 0 || aggregate.receptionErrorLosses > 0) ? (
              <div className="cross-rotation-analysis__cell-subscripts">
                {aggregate.serviceErrorLosses > 0 ? (
                  <span className="cross-rotation-analysis__subscript--service">S={aggregate.serviceErrorLosses}</span>
                ) : null}
                {aggregate.receptionErrorLosses > 0 ? (
                  <span className="cross-rotation-analysis__subscript--reception">R={aggregate.receptionErrorLosses}</span>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </td>
    );
  }

  return (
    <div className="cross-rotation-analysis__table-card">
      <h3 className="cross-rotation-analysis__table-title">{title}</h3>
      <div className="cross-rotation-analysis__table-scroll">
        <table className="cross-rotation-analysis__table">
          <thead>
            <tr>
              <th scope="col" />
              {ROTATION_DISPLAY_ORDER.map((rotation) => (
                <th scope="col" key={rotation}>P{rotation}</th>
              ))}
              <th scope="col">{t('crossRotationTotal')}</th>
            </tr>
          </thead>
          <tbody>
            {ROTATION_DISPLAY_ORDER.map((servingRotation) => (
              <tr key={servingRotation}>
                <th scope="row">P{servingRotation}</th>
                {ROTATION_DISPLAY_ORDER.map((receivingRotation) => (
                  renderCell(matrix.cells[servingRotation][receivingRotation], servingRotation, receivingRotation, `${servingRotation}-${receivingRotation}`)
                ))}
                {renderCell(matrix.rowTotals[servingRotation], servingRotation, 'TOT', `${servingRotation}-tot`)}
              </tr>
            ))}
            <tr>
              <th scope="row">{t('crossRotationTotal')}</th>
              {ROTATION_DISPLAY_ORDER.map((receivingRotation) => (
                renderCell(matrix.columnTotals[receivingRotation], 'TOT', receivingRotation, `tot-${receivingRotation}`)
              ))}
              {renderCell(matrix.grandTotal, 'TOT', 'TOT', 'tot-tot')}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
