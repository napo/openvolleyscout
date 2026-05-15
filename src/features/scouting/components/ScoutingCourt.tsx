import { useEffect, useMemo, useRef, useState } from 'react';
import type { SkillEvaluation, SkillType, TeamSide } from '@src/domain/common/enums';
import type { ActiveLineup } from '@src/domain/lineup/types';
import type { Team } from '@src/domain/roster/types';
import { createFullScoutingCells, getDefaultServeStartZone, type ScoutingZone } from '@src/domain/spatial';
import type { DefenseSystemBlock, ReceptionSystemBlock } from '@src/domain/systems';
import type { BallTouch } from '@src/domain/touch/types';
import { useTranslation } from '@src/i18n';
import { BallToken } from './BallToken';
import { BallTouchPopup } from './BallTouchPopup';
import { PlayerMarker } from './PlayerMarker';
import { useCourtBallDrag } from '../hooks/useCourtBallDrag';
import {
  buildNextPendingTouch,
  getPlayerTacticalPositions,
  getAllowedZonesForLiveCourtPhase,
  getDefaultEvaluationForSkill,
  getScoringOppositeTeamSide,
  getTeamTacticalPhase,
  resolveRallyOutcomeFromTouch,
  type LiveCourtPhase,
  type PendingTouch,
  type TacticalCourtPlayer,
  type TeamTacticalPhases,
} from '../model';

type CourtCoordinate = {
  x: number;
  y: number;
};

type RallyEndPreview = {
  pointTeam: TeamSide;
  reason: string;
};

type AceVictimSelection = {
  serveTouch: PendingTouch;
  receivingTeam: TeamSide;
  pointTeam: TeamSide;
};

type ScoutingCourtProps = {
  awayTeam: Team | null;
  homeTeam: Team | null;
  awayLineup: ActiveLineup | null;
  homeLineup: ActiveLineup | null;
  defenseSystemBlock?: DefenseSystemBlock | null;
  receptionSystemBlock?: ReceptionSystemBlock | null;
  teamTacticalPhases: TeamTacticalPhases;
  servingTeam: TeamSide | null;
  courtPhase: LiveCourtPhase;
  isRallyActive: boolean;
  currentRallyTouches: BallTouch[];
  selectedZone: ScoutingZone | null;
  onSelectedZoneChange: (zone: ScoutingZone | null) => void;
  onTouchesCommitted: (touches: PendingTouch[]) => void;
  onRallyEnd: (pointTeam: TeamSide, reason?: string) => void;
  onAceVictimSelectionChange?: (isSelecting: boolean) => void;
  statusMessage?: string | null;
  onZoneHover?: (zone: ScoutingZone | null) => void;
};

const COURT_ZONES = createFullScoutingCells();
const NO_ALLOWED_ZONES: ScoutingZone[] = [];
const INITIAL_BALL_POSITION = { x: 50, y: 50 };

export function ScoutingCourt({
  awayTeam,
  homeTeam,
  awayLineup,
  homeLineup,
  defenseSystemBlock,
  receptionSystemBlock,
  teamTacticalPhases,
  servingTeam,
  courtPhase,
  isRallyActive,
  currentRallyTouches,
  selectedZone,
  onSelectedZoneChange,
  onTouchesCommitted,
  onRallyEnd,
  onAceVictimSelectionChange,
  statusMessage,
  onZoneHover,
}: ScoutingCourtProps) {
  const { t } = useTranslation();
  const courtRef = useRef<HTMLDivElement>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [selectedTeamSide, setSelectedTeamSide] = useState<TeamSide | null>(null);
  const [pendingTouch, setPendingTouch] = useState<PendingTouch | null>(null);
  const [popupAnchor, setPopupAnchor] = useState<CourtCoordinate | null>(null);
  const [rallyEndPreview, setRallyEndPreview] = useState<RallyEndPreview | null>(null);
  const [aceVictimSelection, setAceVictimSelection] = useState<AceVictimSelection | null>(null);

  const allPlayers = useMemo(() => [...homeTeam?.players ?? [], ...awayTeam?.players ?? []], [awayTeam?.players, homeTeam?.players]);
  const previousTouch =
    currentRallyTouches.length > 0
      ? currentRallyTouches[currentRallyTouches.length - 1]
      : undefined;
  const initialBallZone = servingTeam ? getDefaultServeStartZone(servingTeam, COURT_ZONES) : null;
  const allowedZones = aceVictimSelection
    ? NO_ALLOWED_ZONES
    : getAllowedZonesForLiveCourtPhase(COURT_ZONES, courtPhase);
  const activeServeStartZone = useMemo(() => {
    if (selectedZone?.kind === 'serve_start') {
      return selectedZone;
    }

    if (!servingTeam || currentRallyTouches.length > 0) {
      return null;
    }

    return getDefaultServeStartZone(servingTeam, COURT_ZONES);
  }, [currentRallyTouches.length, selectedZone, servingTeam]);
  const awayPlayers = useMemo(() => getPlayerTacticalPositions({
    teamSide: 'away',
    team: awayTeam,
    lineup: awayLineup,
    phase: getTeamTacticalPhase({ teamSide: 'away', phases: teamTacticalPhases, servingTeam }),
    defenseSystemBlock,
    receptionSystemBlock,
    serveStartZone: activeServeStartZone,
  }), [
    activeServeStartZone,
    awayLineup,
    awayTeam,
    defenseSystemBlock,
    receptionSystemBlock,
    servingTeam,
    teamTacticalPhases,
  ]);
  const homePlayers = useMemo(() => getPlayerTacticalPositions({
    teamSide: 'home',
    team: homeTeam,
    lineup: homeLineup,
    phase: getTeamTacticalPhase({ teamSide: 'home', phases: teamTacticalPhases, servingTeam }),
    defenseSystemBlock,
    receptionSystemBlock,
    serveStartZone: activeServeStartZone,
  }), [
    activeServeStartZone,
    defenseSystemBlock,
    homeLineup,
    homeTeam,
    receptionSystemBlock,
    servingTeam,
    teamTacticalPhases,
  ]);
  const teamPlayersBySide = useMemo(() => ({
    away: awayPlayers,
    home: homePlayers,
  }), [awayPlayers, homePlayers]);
  const servingPlayerId = useMemo(() => {
    if (!servingTeam) {
      return null;
    }

    return teamPlayersBySide[servingTeam].find((player) => player.courtPosition === 1)?.playerId ?? null;
  }, [servingTeam, teamPlayersBySide]);

  useEffect(() => {
    if (!servingPlayerId || !servingTeam || selectedPlayerId || pendingTouch) {
      return;
    }

    if (currentRallyTouches.length > 0) {
      return;
    }

    setSelectedPlayerId(servingPlayerId);
    setSelectedTeamSide(servingTeam);
  }, [currentRallyTouches.length, pendingTouch, selectedPlayerId, servingPlayerId, servingTeam]);

  useEffect(() => {
    if (!isRallyActive) {
      setSelectedPlayerId(servingPlayerId ?? null);
      setSelectedTeamSide(servingTeam ?? null);
      setPendingTouch(null);
      setPopupAnchor(null);
      setRallyEndPreview(null);
      setAceVictimSelection(null);
    }
  }, [isRallyActive, servingPlayerId, servingTeam]);

  useEffect(() => {
    onAceVictimSelectionChange?.(Boolean(aceVictimSelection));
  }, [aceVictimSelection, onAceVictimSelectionChange]);

  const commitTouches = (touches: PendingTouch[]) => {
    if (touches.length === 0) {
      return;
    }

    onTouchesCommitted(touches);
    setPendingTouch(null);
    setPopupAnchor(null);
  };

  const showRallyEndPreview = (pointTeam: TeamSide, reason: string) => {
    setRallyEndPreview({ pointTeam, reason });
  };

  const commitPendingTouch = (input: { nextPlayerId?: string; nextTeamSide?: TeamSide } = {}) => {
    if (!pendingTouch) {
      return;
    }

    commitTouches([pendingTouch]);

    if (input.nextPlayerId && input.nextTeamSide) {
      setSelectedPlayerId(input.nextPlayerId);
      setSelectedTeamSide(input.nextTeamSide);
    }

    const outcome = resolveRallyOutcomeFromTouch(pendingTouch);
    if (outcome.kind === 'point') {
      showRallyEndPreview(outcome.pointTeam, outcome.reason);
      return;
    }

    setRallyEndPreview(null);
  };

  const handleZoneSnap = (zone: ScoutingZone) => {
    if (aceVictimSelection) {
      return;
    }

    onSelectedZoneChange(zone);

    if (zone.kind !== 'in_court') {
      setPopupAnchor(null);
      return;
    }

    const nextPendingTouch = pendingTouch
      ? {
          ...pendingTouch,
          zone,
        }
      : buildNextPendingTouch({
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
    setRallyEndPreview(null);
  };

  const { ballPosition, isDragging, handleBallPointerDown, snapToZone } = useCourtBallDrag({
    courtRef,
    snapZones: allowedZones,
    initialPosition: initialBallZone?.center ?? INITIAL_BALL_POSITION,
    selectedZone,
    onZoneSnap: handleZoneSnap,
  });

  const shouldShowTouchPopup = !aceVictimSelection && selectedZone?.kind === 'in_court' && pendingTouch !== null && popupAnchor !== null;
  const pendingTouchPlayer = pendingTouch ? allPlayers.find((player) => player.id === pendingTouch.playerId) : null;
  const pendingTouchTeamLabel =
    pendingTouch?.teamSide === 'home'
      ? homeTeam?.name || t('home')
      : pendingTouch?.teamSide === 'away'
        ? awayTeam?.name || t('away')
        : t('notSpecified');
  const pendingTouchPlayerLabel = pendingTouchPlayer ? String(pendingTouchPlayer.jerseyNumber) : t('notSpecified');
  const forceSkill = currentRallyTouches.length === 0 && pendingTouch?.skill === 'serve';
  const popupTeamOptions = useMemo(() => ([
    { teamSide: 'away' as const, label: awayTeam?.name || t('away') },
    { teamSide: 'home' as const, label: homeTeam?.name || t('home') },
  ]), [awayTeam?.name, homeTeam?.name, t]);
  const popupPlayerOptions = useMemo(() => {
    const activePlayers = selectedTeamSide ? teamPlayersBySide[selectedTeamSide] : [];
    return activePlayers.map((player) => ({
      playerId: player.playerId,
      label: String(player.jerseyNumber),
    }));
  }, [selectedTeamSide, teamPlayersBySide]);
  const popupAvoidPoints = useMemo(() => {
    const points: CourtCoordinate[] = [];
    if (popupAnchor) {
      points.push(popupAnchor);
    }

    if (pendingTouch) {
      const pendingPlayer = teamPlayersBySide[pendingTouch.teamSide].find((player) => player.playerId === pendingTouch.playerId);
      if (pendingPlayer) {
        points.push({ x: pendingPlayer.x, y: pendingPlayer.y });
      }
    }

    return points;
  }, [pendingTouch, popupAnchor, teamPlayersBySide]);
  const overlayMessage = rallyEndPreview
    ? `${t('rallyEnded')} · ${t('confirmPoint')}`
    : aceVictimSelection
      ? t('selectAceVictimPlayer')
    : statusMessage ?? (() => {
      if (!selectedZone || (selectedZone.kind !== 'serve_start' && currentRallyTouches.length === 0 && !pendingTouch)) {
        return t('selectServeStartZone');
      }

      if (selectedZone.kind === 'serve_start' && !pendingTouch) {
        return t('dragBallToTargetZone');
      }

      if (pendingTouch) {
        return t('selectNextTouchPlayer');
      }

      if (selectedPlayerId) {
        return t('dragBallToOpponentCourt');
      }

      return t('dragBallToTargetZone');
    })();

  const handlePlayerSelection = (playerId: string, teamSide: TeamSide) => {
    if (aceVictimSelection) {
      if (teamSide !== aceVictimSelection.receivingTeam) {
        return;
      }

      const receiveTouch: PendingTouch = {
        playerId,
        teamSide,
        skill: 'receive',
        evaluation: '=',
        zone: aceVictimSelection.serveTouch.zone,
      };

      setSelectedPlayerId(playerId);
      setSelectedTeamSide(teamSide);
      setAceVictimSelection(null);
      setRallyEndPreview(null);
      commitTouches([aceVictimSelection.serveTouch, receiveTouch]);
      onRallyEnd(aceVictimSelection.pointTeam, 'ace');
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
    if (!pendingTouch) {
      return;
    }

    const nextPendingTouch = {
      ...pendingTouch,
      evaluation,
    };

    if (nextPendingTouch.skill === 'serve' && evaluation === '#') {
      const receivingTeam = getScoringOppositeTeamSide(nextPendingTouch.teamSide);
      setPendingTouch(null);
      setPopupAnchor(null);
      setSelectedPlayerId(null);
      setSelectedTeamSide(receivingTeam);
      setAceVictimSelection({
        serveTouch: nextPendingTouch,
        receivingTeam,
        pointTeam: nextPendingTouch.teamSide,
      });
      setRallyEndPreview(null);
      return;
    }

    const outcome = resolveRallyOutcomeFromTouch(nextPendingTouch);

    if (outcome.kind === 'point') {
      commitTouches([nextPendingTouch]);
      showRallyEndPreview(outcome.pointTeam, outcome.reason);
      return;
    }

    setPendingTouch(nextPendingTouch);
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
    setRallyEndPreview(null);
  };

  const syncPendingTouchSelection = (nextPlayerId: string, nextTeamSide: TeamSide) => {
    setSelectedPlayerId(nextPlayerId);
    setSelectedTeamSide(nextTeamSide);
    setPendingTouch((currentPendingTouch) => (
      currentPendingTouch
        ? {
            ...currentPendingTouch,
            playerId: nextPlayerId,
            teamSide: nextTeamSide,
          }
        : currentPendingTouch
    ));
    setRallyEndPreview(null);
  };

  const handlePopupTeamChange = (nextTeamSide: TeamSide) => {
    const nextPlayers = teamPlayersBySide[nextTeamSide];
    if (nextPlayers.length === 0) {
      return;
    }

    const matchingPlayer = nextPlayers.find((player) => player.playerId === selectedPlayerId) ?? nextPlayers[0];
    syncPendingTouchSelection(matchingPlayer.playerId, nextTeamSide);
  };

  const handlePopupPlayerChange = (nextPlayerId: string) => {
    if (!selectedTeamSide) {
      return;
    }

    syncPendingTouchSelection(nextPlayerId, selectedTeamSide);
  };

  const handleRallyEndConfirm = () => {
    if (!rallyEndPreview) {
      return;
    }

    onRallyEnd(rallyEndPreview.pointTeam, rallyEndPreview.reason);
    setRallyEndPreview(null);
  };

  const renderPlayer = (player: TacticalCourtPlayer, teamSide: TeamSide) => {
    const isSelectedForTouch = player.playerId === selectedPlayerId && teamSide === selectedTeamSide;
    const isDisabledForAceVictim = Boolean(aceVictimSelection && teamSide !== aceVictimSelection.receivingTeam);
    const replacedPlayer = player.replacedPlayerId
      ? allPlayers.find((item) => item.id === player.replacedPlayerId)
      : null;
    const replacingPlayerLabel = player.isLibero && player.replacedPlayerId
      ? t('liberoFor', {
          player: replacedPlayer ? `#${replacedPlayer.jerseyNumber}` : player.replacedPlayerId,
        })
      : undefined;

    return (
      <PlayerMarker
        key={player.id}
        playerId={player.playerId}
        jerseyNumber={player.jerseyNumber}
        x={player.x}
        y={player.y}
        teamSide={teamSide}
        onSelect={handlePlayerSelection}
        isSetter={player.isSetter}
        isLibero={player.isLibero}
        isSelectedForTouch={isSelectedForTouch}
        isDisabled={isDisabledForAceVictim}
        replacingPlayerLabel={replacingPlayerLabel}
      />
    );
  };

  return (
    <>
      {overlayMessage ? (
        <div className="live-rally-stage__suggestion" aria-live="polite">
          <span>{overlayMessage}</span>
          {rallyEndPreview ? (
            <button
              type="button"
              className="btn-primary btn-small live-rally-stage__suggestion-action"
              onClick={handleRallyEndConfirm}
            >
              {t('confirmPoint')}
            </button>
          ) : null}
        </div>
      ) : null}

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
            onPointerDown={aceVictimSelection ? undefined : handleBallPointerDown}
            ariaLabel={t('volleyballToken')}
          />

          {shouldShowTouchPopup && pendingTouch && popupAnchor ? (
            <BallTouchPopup
              teamSide={selectedTeamSide ?? pendingTouch.teamSide}
              teamOptions={popupTeamOptions}
              playerId={selectedPlayerId ?? pendingTouch.playerId}
              playerOptions={popupPlayerOptions}
              playerLabel={pendingTouchPlayerLabel}
              teamLabel={pendingTouchTeamLabel}
              skill={pendingTouch.skill}
              selectedEvaluation={pendingTouch.evaluation}
              skillEditable={!forceSkill}
              hideConfirm
              anchor={popupAnchor}
              ballPosition={ballPosition}
              avoidPoints={popupAvoidPoints}
              onTeamChange={handlePopupTeamChange}
              onPlayerChange={handlePopupPlayerChange}
              onSkillChange={handleSkillChange}
              onEvaluationChange={handleEvaluationChange}
            />
          ) : null}

          {awayPlayers.map((player) => renderPlayer(player, 'away'))}
          {homePlayers.map((player) => renderPlayer(player, 'home'))}
        </div>
      </section>
    </>
  );
}
