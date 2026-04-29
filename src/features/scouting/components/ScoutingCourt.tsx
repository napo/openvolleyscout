import { useRef } from 'react';
import { createFullScoutingCells, getDefaultServeStartZone, type ScoutingZone } from '@src/domain/spatial';
import type { ActiveLineup } from '@src/domain/lineup/types';
import type { Team } from '@src/domain/roster/types';
import type { SkillEvaluation, SkillType } from '@src/domain/common/enums';
import type { BallTouch } from '@src/domain/touch/types';
import { useTranslation } from '@src/i18n';
import { BallToken } from './BallToken';
import { BallTouchPopup } from './BallTouchPopup';
import { PlayerMarker } from './PlayerMarker';
import { useCourtBallDrag } from '../hooks/useCourtBallDrag';
import {
  getAllowedZonesForLiveCourtPhase,
  getServingPlayerServeStartPosition,
  type LiveCourtPhase,
} from '../model';

type TeamSide = 'home' | 'away';

type CourtCoordinate = {
  x: number;
  y: number;
};

type CourtPlayer = CourtCoordinate & {
  id: string;
  playerId: string;
  courtPosition: number;
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
  servingTeam: TeamSide | null;
  courtPhase: LiveCourtPhase;
  isRallyActive: boolean;
  currentRallyTouches: BallTouch[];
  selectedZone: ScoutingZone | null;
  onSelectedZoneChange: (zone: ScoutingZone | null) => void;
  selectedPlayerId: string | null;
  pendingTouch: {
    playerId: string;
    teamSide: TeamSide;
    skill: SkillType;
    evaluation?: SkillEvaluation;
  } | null;
  statusMessage?: string | null;
  onPlayerSelect: (input: { playerId: string; teamSide: TeamSide }) => void;
  onPendingTouchSkillChange: (skill: SkillType) => void;
  onPendingTouchEvaluationChange: (evaluation: SkillEvaluation) => void;
  onZoneHover?: (zone: ScoutingZone | null) => void;
};

const COURT_ZONES = createFullScoutingCells();
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
      const resolvedPlayerId = lineupPlayer?.id ?? fallbackPlayer?.id ?? slot.playerId;
      return {
        id: `${teamSide}-${slot.courtPosition}-${resolvedPlayerId}`,
        playerId: resolvedPlayerId,
        courtPosition: slot.courtPosition,
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
  servingTeam,
  courtPhase,
  isRallyActive,
  currentRallyTouches,
  selectedZone,
  onSelectedZoneChange,
  selectedPlayerId,
  pendingTouch,
  statusMessage,
  onPlayerSelect,
  onPendingTouchSkillChange,
  onPendingTouchEvaluationChange,
  onZoneHover,
}: ScoutingCourtProps) {
  const { t } = useTranslation();
  const courtRef = useRef<HTMLDivElement>(null);

  const awayPlayers = resolveCourtPlayers('away', awayTeam, awayLineup);
  const homePlayers = resolveCourtPlayers('home', homeTeam, homeLineup);

  const initialBallZone = servingTeam ? getDefaultServeStartZone(servingTeam, COURT_ZONES) : null;
  const allowedZones = getAllowedZonesForLiveCourtPhase(COURT_ZONES, courtPhase);

  const { ballPosition, isDragging, handleBallPointerDown, snapToZone } = useCourtBallDrag({
    courtRef,
    snapZones: allowedZones,
    initialPosition: initialBallZone?.center ?? INITIAL_BALL_POSITION,
    selectedZone,
    onZoneSnap: onSelectedZoneChange,
  });

  const servingPlayerOverridePosition =
    servingTeam && selectedZone?.kind === 'serve_start' && selectedZone.teamSide === servingTeam
      ? getServingPlayerServeStartPosition(servingTeam, selectedZone)
      : null;

  const lastTouchedPlayerId = currentRallyTouches.at(-1)?.playerId ?? null;
  const pendingPlayerTeam = pendingTouch?.teamSide === 'home' ? homeTeam : awayTeam;
  const pendingPlayer = pendingPlayerTeam?.players.find((player) => player.id === pendingTouch?.playerId);
  const shouldShowTouchPopup =
    Boolean(pendingTouch) &&
    isRallyActive &&
    courtPhase === 'rally_in_play' &&
    selectedZone?.kind === 'in_court';

  const renderPlayer = (player: CourtPlayer, teamSide: TeamSide) => {
    const isServingPlayer = servingTeam === teamSide && player.courtPosition === 1;
    const coordinates = isServingPlayer && servingPlayerOverridePosition
      ? servingPlayerOverridePosition
      : { x: player.x, y: player.y };

    return (
      <PlayerMarker
        key={player.id}
        playerId={player.playerId}
        jerseyNumber={player.jerseyNumber}
        x={coordinates.x}
        y={coordinates.y}
        teamSide={teamSide}
        isServingPlayer={isServingPlayer}
        isLastTouchedPlayer={player.playerId === lastTouchedPlayerId}
        isSelected={player.playerId === selectedPlayerId}
        onSelect={(playerId, playerTeamSide) => onPlayerSelect({ playerId, teamSide: playerTeamSide })}
      />
    );
  };

  return (
    <section className="scouting-court" aria-label={t('volleyballCourt')}>
      <div ref={courtRef} className="scouting-court__surface">
        <div className="scouting-court__glow" />
        <div className="scouting-court__court-area" />
        <div className="scouting-court__line scouting-court__line--outer" />
        <div className="scouting-court__line scouting-court__line--midline" />
        <div className="scouting-court__zone-block scouting-court__zone-block--away-back" />
        <div className="scouting-court__zone-block scouting-court__zone-block--away-front" />
        <div className="scouting-court__zone-block scouting-court__zone-block--home-front" />
        <div className="scouting-court__zone-block scouting-court__zone-block--home-back" />
        <div className="scouting-court__line scouting-court__line--attack-left" />
        <div className="scouting-court__line scouting-court__line--attack-right" />
        <div className="scouting-court__net" />

        <div className="scouting-court__zone-layer">
          {COURT_ZONES.map((zone) => (
            <button
              key={zone.id}
              type="button"
              className={`scouting-court__zone scouting-court__zone--${zone.kind}${
                selectedZone?.id === zone.id ? ' is-selected' : ''
              }${
                !allowedZones.some((allowedZone) => allowedZone.id === zone.id) ? ' is-disabled' : ''
              }`}
              style={{
                left: `${zone.bounds.x}%`,
                top: `${zone.bounds.y}%`,
                width: `${zone.bounds.width}%`,
                height: `${zone.bounds.height}%`,
              }}
              data-team-side={zone.teamSide}
              data-zone-id={zone.id}
              disabled={!allowedZones.some((allowedZone) => allowedZone.id === zone.id)}
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

        {statusMessage ? (
          <div className="scouting-court__status-overlay" role="status" aria-live="polite">
            {statusMessage}
          </div>
        ) : null}

        {shouldShowTouchPopup && selectedZone && pendingTouch && pendingPlayer && pendingPlayerTeam && (
          <BallTouchPopup
            playerLabel={`#${pendingPlayer.jerseyNumber}`}
            teamLabel={pendingPlayerTeam.name || t(pendingTouch.teamSide)}
            skill={pendingTouch.skill}
            evaluation={pendingTouch.evaluation}
            anchor={ballPosition}
            onSkillChange={onPendingTouchSkillChange}
            onEvaluationChange={onPendingTouchEvaluationChange}
          />
        )}

        {awayPlayers.map((player) => renderPlayer(player, 'away'))}
        {homePlayers.map((player) => renderPlayer(player, 'home'))}
      </div>
    </section>
  );
}
