interface PlayerMarkerProps {
  jerseyNumber: number | string;
  x: number;
  y: number;
  teamSide: 'home' | 'away';
}

export function PlayerMarker({ jerseyNumber, x, y, teamSide }: PlayerMarkerProps) {
  return (
    <div
      className={`scouting-court__marker scouting-court__marker--${teamSide}`}
      style={{ left: `${x}%`, top: `${y}%` }}
    >
      <span className="scouting-court__marker-number">{jerseyNumber}</span>
      <span className="scouting-court__marker-dot" aria-hidden="true" />
    </div>
  );
}
