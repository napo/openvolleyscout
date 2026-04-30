import { useEffect, useMemo, useRef, useState } from 'react';
import type { SkillEvaluation, SkillType, TeamSide } from '@src/domain/common/enums';
import type { ActiveLineup } from '@src/domain/lineup/types';
import type { Team } from '@src/domain/roster/types';
import { createFullScoutingCells, getDefaultServeStartZone, type ScoutingZone } from '@src/domain/spatial';
import type { BallTouch } from '@src/domain/touch/types';
import { useTranslation } from '@src/i18n';
import { BallToken } from './BallToken';
import { BallTouchPopup } from './BallTouchPopup';
import { PlayerMarker } from './PlayerMarker';
import { useCourtBallDrag } from '../hooks/useCourtBallDrag';
import {
  buildNextPendingTouch,
  getAllowedZonesForLiveCourtPhase,
  getDefaultEvaluationForSkill,
  getServingPlayerServeStartPosition,
  isAce,
  resolveAceFlow,
  resolvePointTeam,
  shouldAssignPoint,
  type LiveCourtPhase,
  type PendingTouch,
} from '../model';

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

type RallyEndPreview = {
  pointTeam: TeamSide;
  reason: string;
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
  onTouchesCommitted: (touches: PendingTouch[]) => void;
  onRallyEnd: (pointTeam: TeamSide, reason?: string) => void;
  statusMessage?: string | null;
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
  onTouchesCommitted,
  onRallyEnd,
  statusMessage,
  onZoneHover,
}: ScoutingCourtProps) {
  const { t } = useTranslation();
  const courtRef = useRef<HTMLDivElement>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [selectedTeamSide, setSelectedTeamSide] = useState<TeamSide | null>(null);
  const [pendingTouch, setPendingTouch] = useState<PendingTouch | null>(null);
  const [lastTouchedPlayerId, setLastTouchedPlayerId] = useState<string | null>(null);
  const [popupAnchor, setPopupAnchor] = useState<CourtCoordinate | null>(null);
  const [aceReceiverMode, setAceReceiverMode] = useState(false);
  const [rallyEndPreview, setRallyEndPreview] = useState<RallyEndPreview | null>(null);

  const awayPlayers = resolveCourtPlayers('away', awayTeam, awayLineup);
  const homePlayers = resolveCourtPlayers('home', homeTeam, homeLineup);
  const allPlayers = useMemo(() => [...homeTeam?.players ?? [], ...awayTeam?.players ?? []], [awayTeam?.players, homeTeam?.players]);
  const previousTouch = currentRallyTouches.at(-1);
  const initialBallZone = servingTeam ? getDefaultServeStartZone(servingTeam, COURT_ZONES) : null;
  const allowedZones = getAllowedZonesForLiveCourtPhase(COURT_ZONES, courtPhase);
  const servingPlayerId = useMemo(() => {
    const servingLineup = servingTeam === 'home' ? homeLineup : servingTeam === 'away' ? awayLineup : null;
    return servingLineup?.slots.find((slot) => slot.courtPosition === 1)?.playerId ?? null;
  }, [awayLineup, homeLineup, servingTeam]);

  useEffect(() => {
    if (!isRallyActive) {
      setSelectedPlayerId(null);
      setSelectedTeamSide(null);
      setPendingTouch(null);
      setLastTouchedPlayerId(null);
      setPopupAnchor(null);
      setAceReceiverMode(false);
      setRallyEndPreview(null);
    }
  }, [isRallyActive]);

  const commitTouches = (touches: PendingTouch[]) => {
    if (touches.length === 0) {
      return;
    }

    onTouchesCommitted(touches);
    setLastTouchedPlayerId(touches.at(-1)?.playerId ?? null);
    setPendingTouch(null);
    setPopupAnchor(null);
  };

  const showRallyEndPreview = (pointTeam: TeamSide, reason: string) => {
    setRallyEndPreview({ pointTeam, reason });
    onRallyEnd(pointTeam, reason);
  };

  const commitPendingTouch = (input: { nextPlayerId?: string; nextTeamSide?: TeamSide } = {}) => {
    if (!pendingTouch) {
      return;
    }

    if (isAce(pendingTouch)) {
      setAceReceiverMode(true);
      return;
    }

    commitTouches([pendingTouch]);
    setAceReceiverMode(false);

    if (input.nextPlayerId && input.nextTeamSide) {
      setSelectedPlayerId(input.nextPlayerId);
      setSelectedTeamSide(input.nextTeamSide);
    }

    if (shouldAssignPoint(pendingTouch)) {
      const pointTeam = resolvePointTeam(pendingTouch);
      if (pointTeam) {
        showRallyEndPreview(pointTeam, `${pendingTouch.skill}_${pendingTouch.evaluation ?? 'pending'}`);
      }
      return;
    }

    setRallyEndPreview(null);
  };

  const handleZoneSnap = (zone: ScoutingZone) => {
    onSelectedZoneChange(zone);

    const nextPendingTouch = buildNextPendingTouch({
      zone,
      previousTouch,
      servingTeam,
      servingPlayerId,
      selectedPlayerId,
      selectedTeamSide,
    });

    if (!nextPendingTouch) {
      setPopupAnchor(null);
      return;
    }

    setPendingTouch((currentPendingTouch) => ({
      ...nextPendingTouch,
      evaluation: currentPendingTouch?.playerId === nextPendingTouch.playerId
        && currentPendingTouch.teamSide === nextPendingTouch.teamSide
        && currentPendingTouch.zone.id === nextPendingTouch.zone.id
        ? currentPendingTouch.evaluation ?? nextPendingTouch.evaluation
        : nextPendingTouch.evaluation,
    }));
    setSelectedPlayerId(nextPendingTouch.playerId);
    setSelectedTeamSide(nextPendingTouch.teamSide);
    setPopupAnchor(zone.center);
    setAceReceiverMode(false);
    setRallyEndPreview(null);
  };

  const { ballPosition, isDragging, handleBallPointerDown, snapToZone } = useCourtBallDrag({
    courtRef,
    snapZones: allowedZones,
    initialPosition: initialBallZone?.center ?? INITIAL_BALL_POSITION,
    selectedZone,
    onZoneSnap: handleZoneSnap,
  });

  const servingPlayerOverridePosition =
    servingTeam && selectedZone?.kind === 'serve_start' && selectedZone.teamSide === servingTeam
      ? getServingPlayerServeStartPosition(servingTeam, selectedZone)
      : null;

  const shouldShowTouchPopup = isRallyActive && selectedZone?.kind === 'in_court' && pendingTouch !== null && popupAnchor !== null;
  const pendingTouchPlayer = pendingTouch ? allPlayers.find((player) => player.id === pendingTouch.playerId) : null;
  const pendingTouchTeamLabel =
    pendingTouch?.teamSide === 'home'
      ? homeTeam?.name || t('home')
      : pendingTouch?.teamSide === 'away'
        ? awayTeam?.name || t('away')
        : t('notSpecified');
  const pendingTouchPlayerLabel = pendingTouchPlayer ? String(pendingTouchPlayer.jerseyNumber) : t('notSpecified');
  const forceSkill = currentRallyTouches.length === 0 && pendingTouch?.skill === 'serve';
  const overlayMessage = rallyEndPreview
    ? `${t('rallyEnded')} · ${t('pointTo', {
      team: rallyEndPreview.pointTeam === 'home' ? homeTeam?.name || t('home') : awayTeam?.name || t('away'),
    })}`
    : aceReceiverMode
      ? t('selectAceReceiver')
      : statusMessage;

  const handlePlayerSelection = (playerId: string, teamSide: TeamSide) => {
    if (aceReceiverMode && pendingTouch) {
      const resolvedAce = resolveAceFlow({
        serveTouch: pendingTouch,
        playerId,
        teamSide,
      });

      if (!resolvedAce) {
        return;
      }

      setSelectedPlayerId(playerId);
      setSelectedTeamSide(teamSide);
      setAceReceiverMode(false);
      commitTouches(resolvedAce.touches);
      showRallyEndPreview(resolvedAce.pointTeam, 'ace');
      return;
    }

    if (pendingTouch) {
      commitPendingTouch({ nextPlayerId: playerId, nextTeamSide: teamSide });
      return;
    }

    setSelectedPlayerId(playerId);
    setSelectedTeamSide(teamSide);
    setRallyEndPreview(null);
  };

  const handleEvaluationChange = (evaluation: SkillEvaluation) => {
    setPendingTouch((currentPendingTouch) => (
      currentPendingTouch
        ? {
            ...currentPendingTouch,
            evaluation,
          }
        : currentPendingTouch
    ));
    setAceReceiverMode(pendingTouch?.skill === 'serve' && evaluation === '#');
    setRallyEndPreview(null);
  };

  const handleSkillChange = (skill: SkillType) => {
    if (forceSkill) {
      return;
    }

    setPendingTouch((currentPendingTouch) => (
      currentPendingTouch
        ? {
            ...currentPendingTouch,
            skill,
            evaluation: getDefaultEvaluationForSkill(skill),
          }
        : currentPendingTouch
    ));
    setAceReceiverMode(false);
    setRallyEndPreview(null);
  };

  const renderPlayer = (player: CourtPlayer, teamSide: TeamSide) => {
    const isServingPlayer = servingTeam === teamSide && player.courtPosition === 1;
    const isLastTouchedPlayer = player.playerId === lastTouchedPlayerId;
    const isSelectedPlayer = player.playerId === selectedPlayerId;
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
        onSelect={handlePlayerSelection}
        isSelectedPlayer={isSelectedPlayer}
        isLastTouchedPlayer={isLastTouchedPlayer}
        isServingPlayer={isServingPlayer}
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

        {overlayMessage ? (
          <div className="scouting-court__status-overlay" aria-live="polite">
            {overlayMessage}
          </div>
        ) : null}

        {shouldShowTouchPopup && pendingTouch && popupAnchor ? (
          <BallTouchPopup
            playerLabel={pendingTouchPlayerLabel}
            teamLabel={pendingTouchTeamLabel}
            skill={pendingTouch.skill}
            selectedEvaluation={pendingTouch.evaluation}
            skillEditable={!forceSkill}
            hideConfirm
            anchor={popupAnchor}
            onSkillChange={handleSkillChange}
            onEvaluationChange={handleEvaluationChange}
          />
        ) : null}

        {awayPlayers.map((player) => renderPlayer(player, 'away'))}
        {homePlayers.map((player) => renderPlayer(player, 'home'))}
      </div>
    </section>
  );
}
