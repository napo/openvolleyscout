interface PlayerMarkerProps {
  jerseyNumber: number | string;
  x: number;
  y: number;
  teamSide: 'home' | 'away';
  isServingPlayer?: boolean;
}

export function PlayerMarker({ jerseyNumber, x, y, teamSide, isServingPlayer = false }: PlayerMarkerProps) {
  return (
    <div
      className={`scouting-court__marker scouting-court__marker--${teamSide}${isServingPlayer ? ' is-serving' : ''}`}
      style={{ left: `${x}%`, top: `${y}%` }}
    >
      <span className="scouting-court__marker-number">{jerseyNumber}</span>
      <span className="scouting-court__marker-dot" aria-hidden="true" />
    </div>
  );
}
