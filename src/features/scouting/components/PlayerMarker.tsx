type PlayerMarkerProps = {
  playerId: string;
  jerseyNumber: number | string;
  x: number;
  y: number;
  teamSide: 'home' | 'away';
  onSelect?: (playerId: string, teamSide: 'home' | 'away') => void;
  isSelectedPlayer?: boolean;
  isServingPlayer?: boolean;
};

export function PlayerMarker({
  playerId,
  jerseyNumber,
  x,
  y,
  teamSide,
  onSelect,
  isSelectedPlayer,
  isServingPlayer,
}: PlayerMarkerProps) {
  return (
    <button
      type="button"
      className={`scouting-court__marker scouting-court__marker--${teamSide}${
        isServingPlayer ? ' is-serving' : ''
      }${isSelectedPlayer ? ' is-selected-player' : ''}`}
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
