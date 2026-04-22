import { useRef } from 'react';
import type { CourtZone } from '@src/domain/court';
import type { ActiveLineup } from '@src/domain/lineup/types';
import type { Team } from '@src/domain/roster/types';
import { createFullCourtZones } from '@src/domain/court';
import { useTranslation } from '@src/i18n';
import { BallToken } from './BallToken';
import { PlayerMarker } from './PlayerMarker';
import { useCourtBallDrag } from '../hooks/useCourtBallDrag';

type TeamSide = 'home' | 'away';

type CourtCoordinate = {
  x: number;
  y: number;
};

type CourtPlayer = CourtCoordinate & {
  id: string;
  jerseyNumber: number | string;
};

const COURT_POSITION_COORDINATES: Record<TeamSide, Record<number, CourtCoordinate>> = {
  away: {
    1: { x: 18, y: 78 },
    2: { x: 38, y: 78 },
    3: { x: 38, y: 50 },
    4: { x: 38, y: 22 },
    5: { x: 18, y: 22 },
    6: { x: 18, y: 50 },
  },
  home: {
    1: { x: 82, y: 22 },
    2: { x: 62, y: 22 },
    3: { x: 62, y: 50 },
    4: { x: 62, y: 78 },
    5: { x: 82, y: 78 },
    6: { x: 82, y: 50 },
  },
};

type ScoutingCourtProps = {
  awayTeam: Team | null;
  homeTeam: Team | null;
  awayLineup: ActiveLineup | null;
  homeLineup: ActiveLineup | null;
  selectedZone: CourtZone | null;
  onSelectedZoneChange: (zone: CourtZone) => void;
  onZoneHover?: (zone: CourtZone | null) => void;
};

const COURT_ZONES = createFullCourtZones();
const INITIAL_BALL_POSITION = { x: 50, y: 50 };

function createFallbackSlots(team: Team | null) {
  return Array.from({ length: 6 }, (_, index) => ({
    courtPosition: (index + 1) as 1 | 2 | 3 | 4 | 5 | 6,
    playerId: team?.players[index]?.id ?? `placeholder-${index + 1}`,
  }));
}

function resolveCourtPlayers(teamSide: TeamSide, team: Team | null, lineup: ActiveLineup | null): CourtPlayer[] {
  const teamPlayers = team?.players ?? [];
  const slots = lineup?.slots.length ? lineup.slots : createFallbackSlots(team);

  return slots
    .slice()
    .sort((left, right) => left.courtPosition - right.courtPosition)
    .map((slot, index) => {
      const coordinates = COURT_POSITION_COORDINATES[teamSide][slot.courtPosition];
      const lineupPlayer = teamPlayers.find((player) => player.id === slot.playerId);
      const fallbackPlayer = teamPlayers[index];
      const jerseyNumber = lineupPlayer?.jerseyNumber ?? fallbackPlayer?.jerseyNumber ?? slot.courtPosition;

      return {
        id: `${teamSide}-${slot.courtPosition}-${slot.playerId}`,
        jerseyNumber,
        x: coordinates.x,
        y: coordinates.y,
      };
    });
}

export function ScoutingCourt({
  awayTeam,
  homeTeam,
  awayLineup,
  homeLineup,
  selectedZone,
  onSelectedZoneChange,
  onZoneHover,
}: ScoutingCourtProps) {
  const { t } = useTranslation();
  const courtRef = useRef<HTMLDivElement>(null);
  const awayPlayers = resolveCourtPlayers('away', awayTeam, awayLineup);
  const homePlayers = resolveCourtPlayers('home', homeTeam, homeLineup);
  const { ballPosition, isDragging, handleBallPointerDown, snapToZone } = useCourtBallDrag({
    courtRef,
    zones: COURT_ZONES,
    initialPosition: INITIAL_BALL_POSITION,
    selectedZone,
    onZoneSnap: onSelectedZoneChange,
  });

  return (
    <section className="scouting-court" aria-label="Volleyball court">
      <div ref={courtRef} className="scouting-court__surface">
        <div className="scouting-court__line scouting-court__line--outer" />
        <div className="scouting-court__line scouting-court__line--midline" />
        <div className="scouting-court__line scouting-court__line--attack-left" />
        <div className="scouting-court__line scouting-court__line--attack-right" />
        <div className="scouting-court__net" />
        <div className="scouting-court__zone-layer">
          {COURT_ZONES.map((zone) => (
            <button
              key={zone.id}
              type="button"
              className={`scouting-court__zone${selectedZone?.id === zone.id ? ' is-selected' : ''}`}
              style={{
                left: `${zone.bounds.x}%`,
                top: `${zone.bounds.y}%`,
                width: `${zone.bounds.width}%`,
                height: `${zone.bounds.height}%`,
              }}
              data-team-side={zone.teamSide}
              data-zone-id={zone.id}
              onPointerEnter={() => onZoneHover?.(zone)}
              onFocus={() => onZoneHover?.(zone)}
              onPointerLeave={() => onZoneHover?.(null)}
              onBlur={() => onZoneHover?.(null)}
              onClick={() => snapToZone(zone)}
              aria-label={`${zone.teamSide === 'home' ? t('home') : t('away')} ${zone.id}`}
            />
          ))}
        </div>

        <BallToken
          x={ballPosition.x}
          y={ballPosition.y}
          isDragging={isDragging}
          onPointerDown={handleBallPointerDown}
          ariaLabel={t('volleyballToken')}
        />

        {awayPlayers.map((player) => (
          <PlayerMarker
            key={player.id}
            jerseyNumber={player.jerseyNumber}
            x={player.x}
            y={player.y}
            teamSide="away"
          />
        ))}

        {homePlayers.map((player) => (
          <PlayerMarker
            key={player.id}
            jerseyNumber={player.jerseyNumber}
            x={player.x}
            y={player.y}
            teamSide="home"
          />
        ))}
      </div>
    </section>
  );
}
