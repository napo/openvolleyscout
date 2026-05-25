import { useMemo, useState } from 'react';
import { createActiveLineup } from '@src/domain/lineup';
import type { StartingLineup } from '@src/domain/lineup/types';
import type { TeamSide } from '@src/domain/common/enums';
import type { Team, Player } from '@src/domain/roster/types';
import type { ScoutingZone, ScoutingZoneReference } from '@src/domain/spatial';
import type { BallTouch } from '@src/domain/touch/types';
import { PlayerRole } from '@src/domain/systems';
import { LiveRallyStage } from '../components/LiveRallyStage';
import type { PendingTouch } from '../model';
import { getInitialTeamTacticalPhases } from '../live/tactical/tactical-transition';
import '../scouting-screen.css';

const SERVING_TEAM: TeamSide = 'home';

const LINEUP_ROLES = [
  PlayerRole.SETTER,
  PlayerRole.OPPOSITE,
  PlayerRole.MIDDLE_BLOCKER_1,
  PlayerRole.OUTSIDE_HITTER_1,
  PlayerRole.MIDDLE_BLOCKER_2,
  PlayerRole.OUTSIDE_HITTER_2,
] as const;

function createPlayer(teamSide: TeamSide, index: number): Player {
  const jerseyNumber = index + 1;

  return {
    id: `${teamSide}-smoke-player-${jerseyNumber}`,
    jerseyNumber,
    firstName: teamSide === 'home' ? 'Home' : 'Away',
    lastName: `Player ${jerseyNumber}`,
    shortName: `${teamSide === 'home' ? 'H' : 'A'}${jerseyNumber}`,
    playerCode: `${teamSide.toUpperCase()}${jerseyNumber}`,
    isCaptain: jerseyNumber === 1,
    isLibero: false,
  };
}

function createTeam(teamSide: TeamSide): Team {
  return {
    id: `${teamSide}-smoke-team`,
    code: teamSide === 'home' ? 'HOM' : 'AWY',
    name: teamSide === 'home' ? 'Smoke Home' : 'Smoke Away',
    players: Array.from({ length: 6 }, (_, index) => createPlayer(teamSide, index)),
    staff: {
      headCoach: '',
      assistantCoach: '',
    },
  };
}

function createStartingLineup(
  teamSide: TeamSide,
  team: Team,
  displaySide: 'left' | 'right',
): StartingLineup {
  return {
    teamSide,
    setterPlayerId: team.players[0]?.id,
    liberoPlayerIds: [],
    liberoAutoMiddleReplacement: false,
    benchPlayerIds: [],
    displaySide,
    slots: team.players.slice(0, 6).map((player, index) => ({
      courtPosition: (index + 1) as 1 | 2 | 3 | 4 | 5 | 6,
      playerId: player.id,
      tacticalRole: LINEUP_ROLES[index],
    })),
  };
}

function createZoneReference(zone: ScoutingZone, point = zone.center): ScoutingZoneReference {
  return {
    teamSide: zone.teamSide,
    zoneId: zone.id,
    gridCoordinate: zone.gridCoordinate,
    point,
  };
}

function createSmokeTouch(touch: PendingTouch, sequenceNumber: number): BallTouch {
  const destinationPoint = touch.destinationPoint ?? touch.zone.center;

  return {
    id: `dev-smoke-touch-${Date.now()}-${sequenceNumber}`,
    setNumber: 1,
    rallyNumber: 1,
    sequenceNumber,
    teamSide: touch.teamSide,
    playerId: touch.playerId,
    skill: touch.skill,
    evaluation: touch.evaluation,
    zone: createZoneReference(touch.zone),
    targetZone: createZoneReference(touch.zone, destinationPoint),
    ballDirection: touch.ballDirection,
    trajectory: touch.trajectory,
    createdAt: Date.now(),
    source: touch.source,
    touchOrigin: touch.touchOrigin,
    requiredExplicitInput: touch.requiredExplicitInput,
    inferredCandidate: touch.inferredCandidate,
    pendingInference: touch.pendingInference,
    inferenceReason: touch.inferenceReason,
    inferredFromTouchId: touch.inferredFromTouchId,
  };
}

export function DevLiveScoutingSmokePage() {
  const [currentRallyTouches, setCurrentRallyTouches] = useState<BallTouch[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>('Dev smoke: drag the ball to verify the arrow.');
  const homeTeam = useMemo(() => createTeam('home'), []);
  const awayTeam = useMemo(() => createTeam('away'), []);
  const homeStartingLineup = useMemo(() => createStartingLineup('home', homeTeam, 'right'), [homeTeam]);
  const awayStartingLineup = useMemo(() => createStartingLineup('away', awayTeam, 'left'), [awayTeam]);
  const homeLineup = useMemo(
    () => createActiveLineup(homeStartingLineup, { servingTeam: SERVING_TEAM }),
    [homeStartingLineup],
  );
  const awayLineup = useMemo(
    () => createActiveLineup(awayStartingLineup, { servingTeam: SERVING_TEAM }),
    [awayStartingLineup],
  );
  const teamTacticalPhases = useMemo(() => getInitialTeamTacticalPhases(SERVING_TEAM), []);

  return (
    <main className="scouting-screen scouting-screen--fixed scouting-screen--operational scouting-screen--dev-smoke">
      <div className="scouting-screen__container scouting-screen__container--fixed">
        <section className="scouting-screen__header scouting-screen__header--compact scouting-screen__header--operational">
          <div className="scouting-screen__header-main scouting-screen__matchbar">
            <div className="scouting-screen__team scouting-screen__team--away">
              <strong className="scouting-screen__team-name">{awayTeam.name}</strong>
            </div>
            <div className="scouting-screen__scoreboard">
              <div className="scouting-screen__scoreboard-main">
                <span className="scouting-screen__score-label">Dev smoke</span>
                <div className="scouting-screen__score-value">
                  <span className="scouting-screen__score-row">
                    <span className="scouting-screen__score-row-label">Sets</span>
                    <strong>0-0</strong>
                  </span>
                  <span className="scouting-screen__score-row">
                    <span className="scouting-screen__score-row-label">Points</span>
                    <strong>0-0</strong>
                  </span>
                </div>
              </div>
            </div>
            <div className="scouting-screen__team scouting-screen__team--home">
              <strong className="scouting-screen__team-name">{homeTeam.name}</strong>
            </div>
          </div>
          <div className="scouting-screen__meta-row">
            <div className="scouting-screen__score-meta">
              <span>Manual fixture</span>
              <span>6 + 6 players</span>
              <span>Touch arrows: {currentRallyTouches.length}</span>
            </div>
          </div>
        </section>

        <section className="scouting-screen__stage-shell scouting-screen__stage-shell--operational">
          <LiveRallyStage
            awayTeam={awayTeam}
            homeTeam={homeTeam}
            awayLineup={awayLineup}
            homeLineup={homeLineup}
            awayDisplaySide="left"
            homeDisplaySide="right"
            teamTacticalPhases={teamTacticalPhases}
            servingTeam={SERVING_TEAM}
            scoutingMode="simple"
            courtPhase="waiting_to_serve"
            isRallyActive
            currentRallyTouches={currentRallyTouches}
            selectedZone={null}
            onSelectedZoneChange={() => undefined}
            onTouchesCommitted={(touches) => {
              setCurrentRallyTouches((currentTouches) => [
                ...currentTouches,
                ...touches.map((touch, index) => createSmokeTouch(touch, currentTouches.length + index + 1)),
              ]);
              setStatusMessage('Touch committed. Drag again to verify the previous arrow clears.');
            }}
            onRallyEnd={(teamSide) => {
              setStatusMessage(`Rally end preview for ${teamSide}.`);
            }}
            statusMessage={statusMessage}
          />
        </section>
      </div>
    </main>
  );
}
