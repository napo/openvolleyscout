type PlayerMarkerProps = {
  playerId: string;
  jerseyNumber: number | string;
  x: number;
  y: number;
  teamSide: 'home' | 'away';
  onSelect?: (playerId: string, teamSide: 'home' | 'away') => void;
  isSelectedPlayer?: boolean;
  isLibero?: boolean;
  isSetter?: boolean;
  isLastTouchedPlayer?: boolean;
  replacingPlayerLabel?: string;
};

export function PlayerMarker({
  playerId,
  jerseyNumber,
  x,
  y,
  teamSide,
  onSelect,
  isSelectedPlayer,
  isLibero,
  isSetter,
  isLastTouchedPlayer,
  replacingPlayerLabel,
}: PlayerMarkerProps) {
  const ariaLabel = replacingPlayerLabel
    ? `${teamSide} ${jerseyNumber}. ${replacingPlayerLabel}`
    : `${teamSide} ${jerseyNumber}`;

  return (
    <button
      type="button"
      className={`scouting-court__marker scouting-court__marker--${teamSide}${
        isSelectedPlayer ? ' is-selected-player' : ''
      }${
        isLibero ? ' is-libero' : ''
      }${
        isSetter ? ' is-setter' : ''
      }${
        isLastTouchedPlayer ? ' is-last-touched-player' : ''
      }`}
      style={{
        left: `${x}%`,
        top: `${y}%`,
      }}
      onClick={() => onSelect?.(playerId, teamSide)}
      aria-label={ariaLabel}
      title={replacingPlayerLabel}
    >
      {isSetter ? (
        <span className="scouting-court__marker-crown" aria-hidden="true" />
      ) : null}
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
