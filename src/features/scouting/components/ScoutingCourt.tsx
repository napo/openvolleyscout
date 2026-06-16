import { memo, useCallback, useMemo, useRef } from 'react';
import type { SkillEvaluation, SkillType, TeamSide } from '@src/domain/common/enums';
import { createFullScoutingCells, type ScoutingZone } from '@src/domain/spatial';
import {
  type BallDirection,
  type BallTrajectory,
} from '@src/domain/trajectory';
import { useTranslation } from '@src/i18n';
import { BallToken } from './BallToken';
import { BallTrajectoryOverlay } from './BallTrajectoryOverlay';
import { BallTouchPopup } from './BallTouchPopup';
import { PlayerMarker } from './PlayerMarker';
import { useCourtBallDrag } from '../hooks/useCourtBallDrag';
import type { CourtCoordinate } from '../live/rally/rally-flow';
import type { TacticalCourtPlayer } from '../live/tactical/positioning/tactical-position-resolver';
import { getTeamScopedPlayerKey } from '../live/tactical/player-identity';

export type ScoutingCourtPlayerMarker = TacticalCourtPlayer & {
  replacingPlayerLabel?: string;
};

type PopupTeamOption = {
  teamSide: TeamSide;
  label: string;
};

type PopupPlayerOption = {
  playerId: string;
  label: string;
};

export type ScoutingCourtTouchPopup = {
  teamSide: TeamSide;
  teamOptions: PopupTeamOption[];
  playerId: string;
  playerOptions: PopupPlayerOption[];
  playerLabel: string;
  teamLabel: string;
  skill: SkillType;
  selectedEvaluation?: SkillEvaluation;
  skillEditable: boolean;
  anchor: CourtCoordinate;
  avoidPoints: CourtCoordinate[];
  onTeamChange: (teamSide: TeamSide) => void;
  onPlayerChange: (playerId: string) => void;
  onSkillChange: (skill: SkillType) => void;
  onEvaluationChange: (evaluation: SkillEvaluation) => void;
};

type ScoutingCourtProps = {
  zones?: ScoutingZone[];
  awayPlayers: ScoutingCourtPlayerMarker[];
  homePlayers: ScoutingCourtPlayerMarker[];
  allowedZones: ScoutingZone[];
  selectedZone: ScoutingZone | null;
  initialBallPosition: CourtCoordinate;
  selectedPlayerId: string | null;
  selectedTeamSide: TeamSide | null;
  disabledPlayerTeamSides?: TeamSide[];
  selectablePlayerKeys?: readonly string[] | null;
  touchPopup: ScoutingCourtTouchPopup | null;
  trajectories?: BallTrajectory[];
  pendingTrajectory?: BallTrajectory | null;
  overlayMessage?: string | null;
  overlayActionLabel?: string | null;
  isBallDraggable?: boolean;
  homeLiberoPlayerId?: string | null;
  awayLiberoPlayerId?: string | null;
  isRallyActive?: boolean;
  onZoneSnap: (
    zone: ScoutingZone,
    destinationPoint?: CourtCoordinate,
    ballDirection?: BallDirection,
  ) => void;
  onPlayerSelect: (playerId: string, teamSide: TeamSide) => void;
  onOverlayAction?: () => void;
  onBallPointerDown?: () => void;
  pendingBallPosition?: CourtCoordinate | null;
  onBallPositionChange?: (position: CourtCoordinate) => void;
  onZoneHover?: (zone: ScoutingZone | null) => void;
};

const COURT_ZONES = createFullScoutingCells();

export const ScoutingCourt = memo(function ScoutingCourt({
  zones = COURT_ZONES,
  awayPlayers,
  homePlayers,
  allowedZones,
  selectedZone,
  initialBallPosition,
  selectedPlayerId,
  selectedTeamSide,
  disabledPlayerTeamSides = [],
  selectablePlayerKeys = null,
  touchPopup,
  trajectories = [],
  pendingTrajectory = null,
  overlayMessage,
  overlayActionLabel,
  isBallDraggable = true,
  homeLiberoPlayerId = null,
  awayLiberoPlayerId = null,
  isRallyActive = false,
  onZoneSnap,
  onPlayerSelect,
  onOverlayAction,
  onBallPointerDown,
  pendingBallPosition,
  onBallPositionChange,
  onZoneHover,
}: ScoutingCourtProps) {
  const { t } = useTranslation();
  const courtRef = useRef<HTMLDivElement>(null);
  const allowedZoneIds = useMemo(
    () => new Set(allowedZones.map((zone) => zone.id)),
    [allowedZones],
  );
  const disabledPlayerTeamSideSet = useMemo(
    () => new Set(disabledPlayerTeamSides),
    [disabledPlayerTeamSides],
  );
  const selectablePlayerKeySet = useMemo(
    () => (selectablePlayerKeys ? new Set(selectablePlayerKeys) : null),
    [selectablePlayerKeys],
  );
  const handleCourtBallPointerDown = useCallback(() => {
    onBallPointerDown?.();
  }, [onBallPointerDown]);

  const { ballPosition, isDragging, dragDirection, handleBallPointerDown, snapToZone } = useCourtBallDrag({
    courtRef,
    snapZones: allowedZones,
    initialPosition: initialBallPosition,
    selectedZone,
    pendingPosition: pendingBallPosition,
    onZoneSnap,
    onBallPointerDown: handleCourtBallPointerDown,
    onBallPositionChange,
  });
  const activeDragTrajectory = useMemo(() => (
    dragDirection
      ? {
          id: 'active-ball-drag',
          teamSide: selectedTeamSide ?? pendingTrajectory?.teamSide,
          skill: touchPopup?.skill ?? pendingTrajectory?.skill,
          evaluation: touchPopup?.selectedEvaluation ?? pendingTrajectory?.evaluation,
          direction: dragDirection,
        } satisfies BallTrajectory
      : null
  ), [
    dragDirection,
    pendingTrajectory?.evaluation,
    pendingTrajectory?.skill,
    pendingTrajectory?.teamSide,
    selectedTeamSide,
    touchPopup?.selectedEvaluation,
    touchPopup?.skill,
  ]);
  const visibleTrajectories = useMemo(() => {
    if (activeDragTrajectory) {
      return [activeDragTrajectory];
    }

    if (pendingTrajectory) {
      return [pendingTrajectory];
    }

    const latestCommittedTrajectory = trajectories.at(-1);

    return latestCommittedTrajectory ? [latestCommittedTrajectory] : [];
  }, [activeDragTrajectory, pendingTrajectory, trajectories]);

  const renderPlayer = (player: ScoutingCourtPlayerMarker, teamSide: TeamSide) => {
    const isSelectedForTouch = player.playerId === selectedPlayerId && teamSide === selectedTeamSide;
    const playerKey = getTeamScopedPlayerKey(teamSide, player.playerId);
    const isDisabled = disabledPlayerTeamSideSet.has(teamSide)
      || (selectablePlayerKeySet !== null && !selectablePlayerKeySet.has(playerKey));

    return (
      <PlayerMarker
        key={playerKey}
        playerId={player.playerId}
        jerseyNumber={player.jerseyNumber}
        x={player.x}
        y={player.y}
        teamSide={teamSide}
        onSelect={onPlayerSelect}
        isSetter={player.isSetter}
        isLibero={player.isLibero}
        isSelectedForTouch={isSelectedForTouch}
        isDisabled={isDisabled}
        replacingPlayerLabel={player.replacingPlayerLabel}
      />
    );
  };

  return (
    <>
      {overlayMessage ? (
        <div className="live-rally-stage__suggestion" aria-live="polite">
          <span>{overlayMessage}</span>
          {overlayActionLabel && onOverlayAction ? (
            <button
              type="button"
              className="btn-primary btn-small live-rally-stage__suggestion-action"
              onClick={onOverlayAction}
            >
              {overlayActionLabel}
            </button>
          ) : null}
        </div>
      ) : null}

      <section className="scouting-court" aria-label={t('volleyballCourt')}>
        <div ref={courtRef} className="scouting-court__surface">
          <div className="scouting-court__glow" />
          <div className="scouting-court__court-area" />
          <BallTrajectoryOverlay
            trajectories={visibleTrajectories}
            activeTrajectory={activeDragTrajectory}
          />
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
            {zones.map((zone) => {
              const isZoneAllowed = allowedZoneIds.has(zone.id);

              return (
                <button
                  key={zone.id}
                  type="button"
                  className={`scouting-court__zone scouting-court__zone--${zone.kind}${
                    selectedZone?.id === zone.id ? ' is-selected' : ''
                  }${
                    !isZoneAllowed ? ' is-disabled' : ''
                  }`}
                  style={{
                    left: `${zone.bounds.x}%`,
                    top: `${zone.bounds.y}%`,
                    width: `${zone.bounds.width}%`,
                    height: `${zone.bounds.height}%`,
                  }}
                  data-team-side={zone.teamSide}
                  data-zone-id={zone.id}
                  disabled={!isZoneAllowed}
                  onPointerEnter={() => onZoneHover?.(zone)}
                  onFocus={() => onZoneHover?.(zone)}
                  onPointerLeave={() => onZoneHover?.(null)}
                  onBlur={() => onZoneHover?.(null)}
                  onClick={() => snapToZone(zone)}
                  aria-label={`${zone.teamSide === 'home' ? t('home') : t('away')} ${zone.id}`}
                />
              );
            })}
          </div>

          <BallToken
            x={ballPosition.x}
            y={ballPosition.y}
            isDragging={isDragging}
            onPointerDown={isBallDraggable ? handleBallPointerDown : undefined}
            ariaLabel={t('volleyballToken')}
          />

          {touchPopup ? (
            <BallTouchPopup
              teamSide={touchPopup.teamSide}
              teamOptions={touchPopup.teamOptions}
              playerId={touchPopup.playerId}
              playerOptions={touchPopup.playerOptions}
              playerLabel={touchPopup.playerLabel}
              teamLabel={touchPopup.teamLabel}
              skill={touchPopup.skill}
              selectedEvaluation={touchPopup.selectedEvaluation}
              skillEditable={touchPopup.skillEditable}
              hideConfirm
              anchor={touchPopup.anchor}
              ballPosition={ballPosition}
              avoidPoints={touchPopup.avoidPoints}
              onTeamChange={touchPopup.onTeamChange}
              onPlayerChange={touchPopup.onPlayerChange}
              onSkillChange={touchPopup.onSkillChange}
              onEvaluationChange={touchPopup.onEvaluationChange}
            />
          ) : null}

          {awayPlayers.map((player) => renderPlayer(player, 'away'))}
          {homePlayers.map((player) => renderPlayer(player, 'home'))}

          {isRallyActive && awayLiberoPlayerId ? (
            <button
              type="button"
              className="scouting-court__libero-btn scouting-court__libero-btn--away"
              onClick={() => onPlayerSelect(awayLiberoPlayerId, 'away')}
              title={t('quickLiberoAway')}
            >
              {t('quickLiberoAway')}
            </button>
          ) : null}

          {isRallyActive && homeLiberoPlayerId ? (
            <button
              type="button"
              className="scouting-court__libero-btn scouting-court__libero-btn--home"
              onClick={() => onPlayerSelect(homeLiberoPlayerId, 'home')}
              title={t('quickLiberoHome')}
            >
              {t('quickLiberoHome')}
            </button>
          ) : null}
        </div>
      </section>
    </>
  );
});
