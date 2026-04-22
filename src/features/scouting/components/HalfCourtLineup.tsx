import type { CourtPosition } from '@src/domain/common/enums';
import { useTranslation } from '@src/i18n';
import type { CourtDisplaySide } from '../model/set-start';

interface HalfCourtLineupPlayer {
  position: CourtPosition;
  label: string;
  playerName?: string;
  jerseyNumber?: number | string;
  isSetter?: boolean;
}

interface HalfCourtLineupProps {
  side: CourtDisplaySide;
  players: HalfCourtLineupPlayer[];
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

export function HalfCourtLineup({ side, players }: HalfCourtLineupProps) {
  const { t } = useTranslation();

  return (
    <section className={`half-court half-court--${side}`} aria-label={t('setSetupMiniCourtLabel')}>
      <div className="half-court__surface">
        <div className="half-court__glow" />
        <div className="half-court__outer" />
        <div className={`half-court__net half-court__net--${side}`} />
        <div className={`half-court__attack-line half-court__attack-line--${side}`} />
        <div className="half-court__lane half-court__lane--front" />
        <div className="half-court__lane half-court__lane--back" />

        {players.map((player) => {
          const coordinates = getCoordinates(side, player.position);

          return (
            <div
              key={player.position}
              className={`half-court__marker${player.isSetter ? ' is-setter' : ''}`}
              style={{ left: `${coordinates.x}%`, top: `${coordinates.y}%` }}
            >
              <div className="half-court__marker-topline">
                <span className="half-court__marker-label">{player.label}</span>
                {player.isSetter && <span className="half-court__setter-badge">{t('selectSetter')}</span>}
              </div>
              <div className="half-court__marker-body">
                <strong className="half-court__marker-number">{player.jerseyNumber ?? '—'}</strong>
                <span className="half-court__marker-name">{player.playerName ?? t('setSetupEmptySlot')}</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
