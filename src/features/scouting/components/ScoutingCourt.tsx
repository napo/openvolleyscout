import { memo, useCallback, useMemo, useRef } from 'react';
import type { SkillEvaluation, SkillType, TeamSide } from '@src/domain/common/enums';
import {
  createFullScoutingCells,
  getDisplayScoutingBounds,
  getDisplayScoutingPoint,
  type ScoutingCourtOrientation,
  type ScoutingZone,
} from '@src/domain/spatial';
import {
  type BallDirection,
  type BallTrajectory,
} from '@src/domain/trajectory';
import { useTranslation } from '@src/i18n';
import { useAppStore } from '@src/app/store/app-store';
import { BallToken } from './BallToken';
import { BallTrajectoryOverlay } from './BallTrajectoryOverlay';
import { BallTouchPopup } from './BallTouchPopup';
import { PlayerMarker } from './PlayerMarker';
import { useCourtBallDrag } from '../hooks/useCourtBallDrag';
import { getZoneCode } from '../model/datavolley-code';
import { isBallNearNet } from '../live/rally/rally-flow';
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
  clickableZones?: ScoutingZone[];
  selectedZone: ScoutingZone | null;
  initialBallPosition: CourtCoordinate;
  selectedPlayerId: string | null;
  selectedTeamSide: TeamSide | null;
  disabledPlayerTeamSides?: TeamSide[];
  selectablePlayerKeys?: readonly string[] | null;
  awaitingSelectionPlayerKeys?: readonly string[] | null;
  touchPopup: ScoutingCourtTouchPopup | null;
  trajectories?: BallTrajectory[];
  pendingTrajectory?: BallTrajectory | null;
  overlayMessage?: string | null;
  overlayActionLabel?: string | null;
  overlaySecondaryActionLabel?: string | null;
  isBallDraggable?: boolean;
  homeLiberoPlayerId?: string | null;
  awayLiberoPlayerId?: string | null;
  isRallyActive?: boolean;
  forceNetHighlight?: boolean;
  orientation?: ScoutingCourtOrientation;
  onZoneSnap: (
    zone: ScoutingZone,
    destinationPoint?: CourtCoordinate,
    ballDirection?: BallDirection,
  ) => void;
  onPlayerSelect: (playerId: string, teamSide: TeamSide) => void;
  onOverlayAction?: () => void;
  onOverlaySecondaryAction?: () => void;
  onBallPointerDown?: () => void;
  pendingBallPosition?: CourtCoordinate | null;
  onBallPositionChange?: (position: CourtCoordinate) => void;
  onZoneHover?: (zone: ScoutingZone | null) => void;
};

const COURT_ZONES = createFullScoutingCells();

function getDisplayBallDirection(direction: BallDirection): BallDirection {
  return {
    ...direction,
    start: getDisplayScoutingPoint(direction.start, 'vertical'),
    end: getDisplayScoutingPoint(direction.end, 'vertical'),
    via: direction.via?.map((point) => getDisplayScoutingPoint(point, 'vertical')),
  };
}

function getDisplayTrajectory(trajectory: BallTrajectory): BallTrajectory {
  return {
    ...trajectory,
    direction: getDisplayBallDirection(trajectory.direction),
  };
}

export const ScoutingCourt = memo(function ScoutingCourt({
  zones = COURT_ZONES,
  awayPlayers,
  homePlayers,
  allowedZones,
  clickableZones,
  selectedZone,
  initialBallPosition,
  selectedPlayerId,
  selectedTeamSide,
  disabledPlayerTeamSides = [],
  selectablePlayerKeys = null,
  awaitingSelectionPlayerKeys = null,
  touchPopup,
  trajectories = [],
  pendingTrajectory = null,
  overlayMessage,
  overlayActionLabel,
  overlaySecondaryActionLabel,
  isBallDraggable = true,
  homeLiberoPlayerId = null,
  awayLiberoPlayerId = null,
  isRallyActive = false,
  forceNetHighlight = false,
  orientation = 'horizontal',
  onZoneSnap,
  onPlayerSelect,
  onOverlayAction,
  onOverlaySecondaryAction,
  onBallPointerDown,
  pendingBallPosition,
  onBallPositionChange,
  onZoneHover,
}: ScoutingCourtProps) {
  const { t } = useTranslation();
  const showDebugSubzones = useAppStore((state) => state.showDebugSubzones);
  const courtRef = useRef<HTMLDivElement>(null);
  const effectiveClickableZones = clickableZones ?? allowedZones;
  const clickableZoneIds = useMemo(
    () => new Set(effectiveClickableZones.map((zone) => zone.id)),
    [effectiveClickableZones],
  );
  const disabledPlayerTeamSideSet = useMemo(
    () => new Set(disabledPlayerTeamSides),
    [disabledPlayerTeamSides],
  );
  const selectablePlayerKeySet = useMemo(
    () => (selectablePlayerKeys ? new Set(selectablePlayerKeys) : null),
    [selectablePlayerKeys],
  );
  const awaitingSelectionPlayerKeySet = useMemo(
    () => (awaitingSelectionPlayerKeys ? new Set(awaitingSelectionPlayerKeys) : null),
    [awaitingSelectionPlayerKeys],
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
    orientation,
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
  const displayTrajectories = useMemo(() => (
    orientation === 'vertical' ? visibleTrajectories.map(getDisplayTrajectory) : visibleTrajectories
  ), [orientation, visibleTrajectories]);
  const displayActiveDragTrajectory = useMemo(() => (
    activeDragTrajectory && orientation === 'vertical'
      ? getDisplayTrajectory(activeDragTrajectory)
      : activeDragTrajectory
  ), [activeDragTrajectory, orientation]);

  const renderPlayer = (player: ScoutingCourtPlayerMarker, teamSide: TeamSide) => {
    const isSelectedForTouch = player.playerId === selectedPlayerId && teamSide === selectedTeamSide;
    const playerKey = getTeamScopedPlayerKey(teamSide, player.playerId);
    const isDisabled = disabledPlayerTeamSideSet.has(teamSide)
      || (selectablePlayerKeySet !== null && !selectablePlayerKeySet.has(playerKey));
    const isAwaitingSelection = awaitingSelectionPlayerKeySet !== null && awaitingSelectionPlayerKeySet.has(playerKey);
    const displayPosition = getDisplayScoutingPoint({ x: player.x, y: player.y }, orientation);

    return (
      <PlayerMarker
        key={playerKey}
        playerId={player.playerId}
        jerseyNumber={player.jerseyNumber}
        x={displayPosition.x}
        y={displayPosition.y}
        teamSide={teamSide}
        onSelect={onPlayerSelect}
        isSetter={player.isSetter}
        isLibero={player.isLibero}
        isSelectedForTouch={isSelectedForTouch}
        isAwaitingSelection={isAwaitingSelection}
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
          {overlaySecondaryActionLabel && onOverlaySecondaryAction ? (
            <button
              type="button"
              className="btn-secondary btn-small live-rally-stage__suggestion-action"
              onClick={onOverlaySecondaryAction}
            >
              {overlaySecondaryActionLabel}
            </button>
          ) : null}
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
        <div
          ref={courtRef}
          className={`scouting-court__surface${orientation === 'vertical' ? ' scouting-court__surface--vertical' : ''}`}
        >
          <div className="scouting-court__glow" />
          <div className="scouting-court__court-area" />
          <BallTrajectoryOverlay
            trajectories={displayTrajectories}
            activeTrajectory={displayActiveDragTrajectory}
          />
          <div className="scouting-court__line scouting-court__line--outer" />
          <div className="scouting-court__line scouting-court__line--midline" />
          <div className="scouting-court__zone-block scouting-court__zone-block--away-back" />
          <div className="scouting-court__zone-block scouting-court__zone-block--away-front" />
          <div className="scouting-court__zone-block scouting-court__zone-block--home-front" />
          <div className="scouting-court__zone-block scouting-court__zone-block--home-back" />
          <div className="scouting-court__line scouting-court__line--attack-left" />
          <div className="scouting-court__line scouting-court__line--attack-right" />
          <div className={`scouting-court__net${forceNetHighlight || (isDragging && isBallNearNet(ballPosition.x)) ? ' is-ball-near-net' : ''}`} />

          <div className="scouting-court__zone-layer">
            {zones.map((zone) => {
              const isZoneAllowed = clickableZoneIds.has(zone.id);
              const displayBounds = getDisplayScoutingBounds(zone.bounds, orientation);

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
                    left: `${displayBounds.x}%`,
                    top: `${displayBounds.y}%`,
                    width: `${displayBounds.width}%`,
                    height: `${displayBounds.height}%`,
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
                >
                  {showDebugSubzones ? (
                    <span className="scouting-court__zone-debug-label">
                      {getZoneCode({
                        teamSide: zone.kind === 'serve_start' ? zone.teamSide : (zone.center.x < 50 ? 'away' : 'home'),
                        zoneId: zone.id,
                        gridCoordinate: zone.gridCoordinate,
                        point: zone.center,
                      })}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          <BallToken
            x={getDisplayScoutingPoint(ballPosition, orientation).x}
            y={getDisplayScoutingPoint(ballPosition, orientation).y}
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
              anchor={getDisplayScoutingPoint(touchPopup.anchor, orientation)}
              ballPosition={getDisplayScoutingPoint(ballPosition, orientation)}
              avoidPoints={touchPopup.avoidPoints.map((point) => getDisplayScoutingPoint(point, orientation))}
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
