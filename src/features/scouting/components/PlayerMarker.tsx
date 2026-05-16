import type { TeamSide } from '@src/domain/common/enums';
import { createMarkerPositionStyle } from '../live/animation/marker-animation';

type PlayerMarkerProps = {
  playerId: string;
  jerseyNumber: number | string;
  x: number;
  y: number;
  teamSide: TeamSide;
  onSelect?: (playerId: string, teamSide: TeamSide) => void;
  isSetter?: boolean;
  isLibero?: boolean;
  isSelectedForTouch?: boolean;
  isDisabled?: boolean;
  replacingPlayerLabel?: string;
};

export function PlayerMarker({
  playerId,
  jerseyNumber,
  x,
  y,
  teamSide,
  onSelect,
  isSetter,
  isLibero,
  isSelectedForTouch,
  isDisabled,
  replacingPlayerLabel,
}: PlayerMarkerProps) {
  const ariaLabel = replacingPlayerLabel
    ? `${teamSide} ${jerseyNumber}. ${replacingPlayerLabel}`
    : `${teamSide} ${jerseyNumber}`;

  return (
    <button
      type="button"
      className={`scouting-court__marker scouting-court__marker--${teamSide}${
        isSetter ? ' is-setter' : ''
      }${
        isLibero ? ' is-libero' : ''
      }${
        isSelectedForTouch ? ' is-selected-for-touch' : ''
      }${
        isDisabled ? ' is-disabled' : ''
      }`}
      style={createMarkerPositionStyle({ x, y })}
      onClick={() => {
        if (!isDisabled) {
          onSelect?.(playerId, teamSide);
        }
      }}
      disabled={isDisabled}
      data-player-id={playerId}
      data-team-side={teamSide}
      aria-label={ariaLabel}
      aria-pressed={Boolean(isSelectedForTouch)}
      title={replacingPlayerLabel}
    >
      <span className="scouting-court__marker-number">
        {jerseyNumber}
        {isLibero ? (
          <span className="scouting-court__marker-libero-badge" aria-hidden="true">L</span>
        ) : null}
      </span>
      <span className="scouting-court__marker-dot" aria-hidden="true" />
    </button>
  );
}
