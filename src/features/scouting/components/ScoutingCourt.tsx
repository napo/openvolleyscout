import { memo, useMemo, useRef } from 'react';
import type { SkillEvaluation, SkillType, TeamSide } from '@src/domain/common/enums';
import type { Player } from '@src/domain/roster/types';
import { createFullScoutingCells, type ScoutingZone } from '@src/domain/spatial';
import { useTranslation } from '@src/i18n';
import { BallToken } from './BallToken';
import { BallTouchPopup } from './BallTouchPopup';
import { PlayerMarker } from './PlayerMarker';
import { useCourtBallDrag } from '../hooks/useCourtBallDrag';
import type { CourtCoordinate } from '../live/rally/rally-flow';
import type { TacticalCourtPlayer } from '../live/tactical/tactical-positions';

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
  awayPlayers: TacticalCourtPlayer[];
  homePlayers: TacticalCourtPlayer[];
  allPlayers: Player[];
  allowedZones: ScoutingZone[];
  selectedZone: ScoutingZone | null;
  initialBallPosition: CourtCoordinate;
  selectedPlayerId: string | null;
  selectedTeamSide: TeamSide | null;
  disabledPlayerTeamSides?: TeamSide[];
  touchPopup: ScoutingCourtTouchPopup | null;
  overlayMessage?: string | null;
  overlayActionLabel?: string | null;
  isBallDraggable?: boolean;
  onZoneSnap: (zone: ScoutingZone) => void;
  onPlayerSelect: (playerId: string, teamSide: TeamSide) => void;
  onOverlayAction?: () => void;
  onZoneHover?: (zone: ScoutingZone | null) => void;
};

const COURT_ZONES = createFullScoutingCells();

export const ScoutingCourt = memo(function ScoutingCourt({
  awayPlayers,
  homePlayers,
  allPlayers,
  allowedZones,
  selectedZone,
  initialBallPosition,
  selectedPlayerId,
  selectedTeamSide,
  disabledPlayerTeamSides = [],
  touchPopup,
  overlayMessage,
  overlayActionLabel,
  isBallDraggable = true,
  onZoneSnap,
  onPlayerSelect,
  onOverlayAction,
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

  const { ballPosition, isDragging, handleBallPointerDown, snapToZone } = useCourtBallDrag({
    courtRef,
    snapZones: allowedZones,
    initialPosition: initialBallPosition,
    selectedZone,
    onZoneSnap,
  });

  const renderPlayer = (player: TacticalCourtPlayer, teamSide: TeamSide) => {
    const isSelectedForTouch = player.playerId === selectedPlayerId && teamSide === selectedTeamSide;
    const isDisabled = disabledPlayerTeamSideSet.has(teamSide);
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
        onSelect={onPlayerSelect}
        isSetter={player.isSetter}
        isLibero={player.isLibero}
        isSelectedForTouch={isSelectedForTouch}
        isDisabled={isDisabled}
        replacingPlayerLabel={replacingPlayerLabel}
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
            {COURT_ZONES.map((zone) => {
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
        </div>
      </section>
    </>
  );
});
