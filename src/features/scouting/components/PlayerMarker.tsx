type PlayerMarkerProps = {
  playerId: string;
  jerseyNumber: number | string;
  x: number;
  y: number;
  teamSide: 'home' | 'away';
  isServingPlayer?: boolean;
  isLastTouchedPlayer?: boolean;
  isSelected?: boolean;
  onSelect?: (playerId: string, teamSide: 'home' | 'away') => void;
};

export function PlayerMarker({
  playerId,
  jerseyNumber,
  x,
  y,
  teamSide,
  isServingPlayer,
  isLastTouchedPlayer,
  isSelected,
  onSelect,
}: PlayerMarkerProps) {
  return (
    <button
      type="button"
      className={`scouting-court__marker scouting-court__marker--${teamSide}${
        isServingPlayer ? ' is-serving' : ''
      }${isLastTouchedPlayer ? ' is-last-touched' : ''}${isSelected ? ' is-selected-player' : ''}`}
      style={{
        left: `${x}%`,
        top: `${y}%`,
      }}
      onClick={() => onSelect?.(playerId, teamSide)}
      aria-label={`${teamSide} ${jerseyNumber}`}
    >
      <span className="scouting-court__marker-number">{jerseyNumber}</span>
      <span className="scouting-court__marker-dot" aria-hidden="true" />
    </button>
  );
}
