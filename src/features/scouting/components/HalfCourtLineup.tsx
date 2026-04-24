import type { CourtPosition } from '@src/domain/common/enums';
import { useTranslation } from '@src/i18n';
import type { CourtDisplaySide } from '../model/set-start';

interface HalfCourtLineupPlayer {
  position: CourtPosition;
  label: string;
  playerName?: string;
  jerseyNumber?: number | string;
  isSetter?: boolean;
  isSelected?: boolean;
}

interface HalfCourtLineupProps {
  side: CourtDisplaySide;
  players: HalfCourtLineupPlayer[];
  selectedPosition?: CourtPosition;
  onPositionSelect?: (position: CourtPosition) => void;
}

const LEFT_SIDE_COORDINATES: Record<CourtPosition, { x: number; y: number }> = {
  1: { x: 24, y: 78 },
  2: { x: 73, y: 78 },
  3: { x: 73, y: 50 },
  4: { x: 73, y: 22 },
  5: { x: 24, y: 22 },
  6: { x: 24, y: 50 },
};

const RIGHT_SIDE_COORDINATES: Record<CourtPosition, { x: number; y: number }> = {
  1: { x: 76, y: 22 },
  2: { x: 27, y: 22 },
  3: { x: 27, y: 50 },
  4: { x: 27, y: 78 },
  5: { x: 76, y: 78 },
  6: { x: 76, y: 50 },
};

function getCoordinates(side: CourtDisplaySide, position: CourtPosition) {
  return side === 'left' ? LEFT_SIDE_COORDINATES[position] : RIGHT_SIDE_COORDINATES[position];
}

export function HalfCourtLineup({ side, players, selectedPosition, onPositionSelect }: HalfCourtLineupProps) {
  const { t } = useTranslation();

  return (
    <section className={`half-court half-court--${side}`} aria-label={t('setSetupMiniCourtLabel')}>
      <div className="half-court__surface">
        <div className="half-court__glow" />
        <div className="half-court__court-area" />
        <div className="half-court__outer" />
        <div className="half-court__zone-block half-court__zone-block--back" />
        <div className="half-court__zone-block half-court__zone-block--front" />
        <div className={`half-court__net half-court__net--${side}`} />
        <div className={`half-court__attack-line half-court__attack-line--${side}`} />

        {players.map((player) => {
          const coordinates = getCoordinates(side, player.position);

          return (
            <button
              type="button"
              key={player.position}
              className={`half-court__marker${player.isSetter ? ' is-setter' : ''}${player.isSelected || selectedPosition === player.position ? ' is-selected' : ''}`}
              style={{ left: `${coordinates.x}%`, top: `${coordinates.y}%` }}
              onClick={() => onPositionSelect?.(player.position)}
              aria-label={t('setSetupCourtPosition', { position: player.position })}
            >
              <div className="half-court__marker-topline">
                <span className="half-court__marker-label">{player.label}</span>
                {player.isSetter && <span className="half-court__setter-badge">{t('setSetupSetterBadge')}</span>}
              </div>
              <div className="half-court__marker-body">
                <strong className="half-court__marker-number">{player.jerseyNumber ?? '—'}</strong>
                <span className="half-court__marker-name">{player.playerName ?? t('setSetupEmptySlot')}</span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
