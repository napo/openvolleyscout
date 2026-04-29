import { useEffect, useRef, useState } from 'react';
import { createFullScoutingCells, getDefaultServeStartZone, type ScoutingZone } from '@src/domain/spatial';
import type { ActiveLineup } from '@src/domain/lineup/types';
import type { Player, Team } from '@src/domain/roster/types';
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
  onTouchConfirm: (input: {
    playerId?: string;
    teamSide: TeamSide;
    skill: SkillType;
    evaluation?: SkillEvaluation;
    zone: ScoutingZone;
  }) => void;
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

function resolveSelectablePlayers(team: Team | null, lineup: ActiveLineup | null): Player[] {
  const teamPlayers = team?.players ?? [];

  if (!lineup?.slots.length) {
    return teamPlayers;
  }

  return lineup.slots
    .map((slot) => teamPlayers.find((player) => player.id === slot.playerId))
    .filter((player): player is Player => Boolean(player));
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
  onTouchConfirm,
  onZoneHover,
}: ScoutingCourtProps) {
  const { t } = useTranslation();
  const courtRef = useRef<HTMLDivElement>(null);

  const [popupTeamSideOverride, setPopupTeamSideOverride] = useState<TeamSide | null>(null);
  const [lastTouchedPlayerId, setLastTouchedPlayerId] = useState<string | null>(null);
  const [dismissedPopupZoneId, setDismissedPopupZoneId] = useState<string | null>(null);
  useEffect(() => {
    setPopupTeamSideOverride(null);
    setDismissedPopupZoneId(null);
  }, [selectedZone?.id]);

  const awayPlayers = resolveCourtPlayers('away', awayTeam, awayLineup);
  const homePlayers = resolveCourtPlayers('home', homeTeam, homeLineup);

  const awaySelectablePlayers = resolveSelectablePlayers(awayTeam, awayLineup);
  const homeSelectablePlayers = resolveSelectablePlayers(homeTeam, homeLineup);

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

  const previousTouch =
    currentRallyTouches.length > 0
      ? currentRallyTouches[currentRallyTouches.length - 1]
      : undefined;

  const isFirstRallyTouch = currentRallyTouches.length === 0;

  const isForcedServeTouch =
    isRallyActive &&
    courtPhase === 'rally_in_play' &&
    isFirstRallyTouch &&
    selectedZone?.kind === 'in_court' &&
    servingTeam !== null;

  const servingLineup = servingTeam === 'home' ? homeLineup : awayLineup;
  const servingPlayerId =
    servingLineup?.slots.find((slot) => slot.courtPosition === 1)?.playerId;

  const popupTeamSide =
    popupTeamSideOverride ??
    (isForcedServeTouch && servingTeam
      ? servingTeam
      : selectedZone?.teamSide);

  const popupTeamLabel =
    popupTeamSide === 'home'
      ? homeTeam?.name
      : popupTeamSide === 'away'
        ? awayTeam?.name
        : undefined;

  const popupPlayers =
    popupTeamSide === 'away'
      ? awaySelectablePlayers
      : homeSelectablePlayers;

  const shouldShowTouchPopup =
    isRallyActive &&
    courtPhase === 'rally_in_play' &&
    selectedZone?.kind === 'in_court' &&
    selectedZone.id !== dismissedPopupZoneId &&
    popupTeamSide;

  const renderPlayer = (player: CourtPlayer, teamSide: TeamSide) => {
    const isServingPlayer = servingTeam === teamSide && player.courtPosition === 1;
    const isLastTouchedPlayer = player.playerId === lastTouchedPlayerId;
    const coordinates = isServingPlayer && servingPlayerOverridePosition
      ? servingPlayerOverridePosition
      : { x: player.x, y: player.y };

    return (
      <PlayerMarker
        key={player.id}
        jerseyNumber={player.jerseyNumber}
        x={coordinates.x}
        y={coordinates.y}
        teamSide={teamSide}
        isServingPlayer={isServingPlayer}
        isLastTouchedPlayer={isLastTouchedPlayer}
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

        {shouldShowTouchPopup && selectedZone && popupTeamSide && (
          <BallTouchPopup
            players={popupPlayers}
            previousSkill={previousTouch?.skill}
            previousEvaluation={previousTouch?.evaluation}
            forceSkill={isForcedServeTouch ? 'serve' : undefined}
            forcePlayerId={isForcedServeTouch ? servingPlayerId : undefined}
            teamSide={popupTeamSide}
            teamLabel={popupTeamLabel}
            teamOptions={[
              { teamSide: 'home', label: homeTeam?.name ?? t('home') },
              { teamSide: 'away', label: awayTeam?.name ?? t('away') },
            ]}
            onTeamChange={(nextTeamSide) => {
              setPopupTeamSideOverride(nextTeamSide);
            }}
            anchor={ballPosition}
            onConfirm={({ playerId, skill, evaluation }) => {
              onTouchConfirm({
                playerId,
                teamSide: popupTeamSide,
                skill,
                evaluation,
                zone: selectedZone,
              });

              setDismissedPopupZoneId(selectedZone.id);
              setPopupTeamSideOverride(null);
              setLastTouchedPlayerId(playerId ?? null);
            }}
          />
        )}

        {awayPlayers.map((player) => renderPlayer(player, 'away'))}
        {homePlayers.map((player) => renderPlayer(player, 'home'))}
      </div>
    </section>
  );
}