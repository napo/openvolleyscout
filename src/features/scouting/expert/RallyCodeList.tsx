import { useTranslation } from '@src/i18n';
import type { Player } from '@src/domain/roster/types';
import type { BallTouch } from '@src/domain/touch/types';
import { buildDataVolleyTouchCode } from '../model/datavolley-code';
import './rally-code-list.css';

export type RallyCodeEntry = {
  code: string;
  timestamp: string;
  touchId: string;
  sequenceNumber: number;
  isLatest: boolean;
};

interface RallyCodeListProps {
  touches: BallTouch[];
  homePlayers: Player[];
  awayPlayers: Player[];
  onCodeClick?: (entry: RallyCodeEntry) => void;
  highlightLatest?: boolean;
}

function formatDataVolleyTime(value: string | number | undefined): string {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return '--:--:--';

  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

function getJerseyNumberForTouch(
  touch: BallTouch,
  homePlayers: Player[],
  awayPlayers: Player[],
): number | string | undefined {
  const players = touch.teamSide === 'home' ? homePlayers : awayPlayers;
  return players.find((player) => player.id === touch.playerId)?.jerseyNumber;
}

function buildRallyCodeEntries(input: {
  touches: BallTouch[];
  homePlayers: Player[];
  awayPlayers: Player[];
}): RallyCodeEntry[] {
  return input.touches.map((touch, index) => ({
    code: buildDataVolleyTouchCode({
      touch,
      jerseyNumber: getJerseyNumberForTouch(touch, input.homePlayers, input.awayPlayers),
    }),
    timestamp: touch.recordedAtTime ?? formatDataVolleyTime(touch.recordedAtIso ?? touch.createdAt),
    touchId: touch.id,
    sequenceNumber: touch.sequenceNumber,
    isLatest: index === input.touches.length - 1,
  }));
}

export function RallyCodeList({
  touches,
  homePlayers,
  awayPlayers,
  onCodeClick,
  highlightLatest = false,
}: RallyCodeListProps) {
  const { t } = useTranslation();
  const rallyCodeEntries = buildRallyCodeEntries({ touches, homePlayers, awayPlayers });

  return (
    <div className="rally-code-list" aria-label={t('rallyCodes', { defaultValue: 'Rally codes' })}>
      <div className="rally-code-list__label">
        {t('rallyCodes', { defaultValue: 'Rally codes' })}
      </div>
      {rallyCodeEntries.length > 0 ? (
        <div className="rally-code-list__items">
          {rallyCodeEntries.map((entry) => (
            <button
              key={entry.touchId}
              type="button"
              className={[
                'rally-code-list__item',
                entry.isLatest && highlightLatest ? 'is-latest' : '',
              ].filter(Boolean).join(' ')}
              onClick={() => onCodeClick?.(entry)}
              disabled={!onCodeClick}
              title={entry.isLatest && highlightLatest
                ? t('expertModeEditLatest', { defaultValue: 'Edit latest touch' })
                : t('expertModeEditCode', { defaultValue: 'Load code into input' })}
            >
              <span className="rally-code-list__item-time">
                {entry.timestamp}
              </span>
              <span className="rally-code-list__item-index">
                {entry.sequenceNumber}
              </span>
              <span className="rally-code-list__item-code">
                {entry.code}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="rally-code-list__empty">
          {t('expertModeNoRallyCodes', { defaultValue: 'No rally codes yet' })}
        </div>
      )}
    </div>
  );
}
