import type { CourtPosition, SkillEvaluation, SkillType, TeamSide } from '@src/domain/common/enums';
import type { MatchEvent } from '@src/domain/events/types';
import { createActiveLineup } from '@src/domain/lineup';
import type { ActiveLineup, StartingLineup } from '@src/domain/lineup/types';
import type { Player, Team } from '@src/domain/roster/types';
import { createFullScoutingCells, type ScoutingZone } from '@src/domain/spatial';
import { PlayerRole } from '@src/domain/systems';
import type { BallTouch } from '@src/domain/touch/types';
import { DEFAULT_DEFENSE_SYSTEM_BLOCK, DEFAULT_RECEPTION_SYSTEM_BLOCK } from '@src/config/systems';
import { buildDataVolleyRallyCode } from './datavolley-code';
import { useLiveTouchFlowStore } from '../live/stores/live-touch-flow-store';
import {
  getInitialTeamTacticalPhases,
  getNextTeamTacticalPhasesAfterTouch,
  type TeamTacticalPhases,
} from '../live/tactical/tactical-transition';
import {
  SETTER_RELEASE_COORDINATE,
  SETTER_RELEASE_ZONE,
  getSetterReleaseCoordinate,
  getSetterReturnToDefenseTarget,
} from '../live/tactical/tactical-setter-release';
import {
  getPlayerTacticalPositions,
  resolveTacticalCourtPlayers,
  type TacticalCourtPlayer,
} from '../live/tactical/tactical-positions';
import {
  getDataVolleyZoneCoordinate,
} from '../live/tactical/positioning/datavolley-zones';
import {
  getCourtPositionCoordinate,
  mapHalfCourtSystemPointToLiveCourt,
} from '../live/tactical/positioning/court-coordinates';
import {
  mirrorLiveCourtPoint,
} from '../live/tactical/positioning/tactical-mirroring';
import {
  getCurrentSetterRotation,
  getTeamRolePlayerMap,
  mapRolesToPlayers,
} from '../live/tactical/positioning/tactical-role-mapping';
import {
  getDefenseLayoutPositions,
} from '../live/tactical/positioning/tactical-defense-layout';
import {
  getReceptionLayoutPositions,
} from '../live/tactical/positioning/tactical-reception-layout';
import { replayLiveMatchFromEvents } from './replay';
import { rotateLineupForSideOut } from '../live/tactical/tactical-rotation';
import {
  applyLiberoReplacementToLineup,
  buildLiberoReplacementMadeEvent,
  getAutomaticLiberoReplacementProposal,
  getManualLiberoReplacementProposals,
  type LiberoReplacementProposal,
} from '../live/tactical/tactical-libero';
import {
  POPUP_AVOIDANCE_GAP,
  computeBallTouchPopupLayout,
  createPopupPlacementRect,
  doPopupPlacementRectsOverlap,
} from '../live/popup/popup-positioning';
import {
  buildPendingTouchForZone,
  resolveAceVictimFlow,
  resolveEvaluationFlow,
} from '../live/rally/rally-flow';
import { shouldReplaceLatestPendingTouch } from '../live/rally/rally-validation';
import type { LiveMatchState } from './index';

type ValidationResult = {
  assertions: number;
};

const ROLE_BY_POSITION: Record<CourtPosition, PlayerRole> = {
  1: PlayerRole.SETTER,
  2: PlayerRole.OUTSIDE_HITTER_1,
  3: PlayerRole.MIDDLE_BLOCKER_2,
  4: PlayerRole.OPPOSITE,
  5: PlayerRole.OUTSIDE_HITTER_2,
  6: PlayerRole.MIDDLE_BLOCKER_1,
};

const COURT_POSITIONS: readonly CourtPosition[] = [1, 2, 3, 4, 5, 6];
const SCOUTING_ZONES = createFullScoutingCells();

function expectEqual<T>(actual: T, expected: T, label: string): number {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }

  return 1;
}

function expectTruthy(value: unknown, label: string): number {
  if (!value) {
    throw new Error(`${label}: expected a truthy value`);
  }

  return 1;
}

function expectFalse(value: unknown, label: string): number {
  if (value) {
    throw new Error(`${label}: expected false`);
  }

  return 1;
}

function expectDeepEqual<T>(actual: T, expected: T, label: string): number {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }

  return 1;
}

function expectClose(actual: number, expected: number, label: string, tolerance = 0.001): number {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${label}: expected ${expected}, received ${actual}`);
  }

  return 1;
}

function expectInRange(actual: number, min: number, max: number, label: string): number {
  if (actual < min || actual > max) {
    throw new Error(`${label}: expected ${actual} to be between ${min} and ${max}`);
  }

  return 1;
}

function createPlayer(id: string, jerseyNumber: number, isLibero = false): Player {
  return {
    id,
    jerseyNumber,
    firstName: id,
    lastName: 'Test',
    shortName: id,
    playerCode: String(jerseyNumber).padStart(2, '0'),
    isLibero,
  };
}

function createTeam(teamSide: TeamSide, includeLibero = false): Team {
  const players = COURT_POSITIONS.map((courtPosition) => (
    createPlayer(`${teamSide}-p${courtPosition}`, courtPosition)
  ));

  if (includeLibero) {
    players.push(createPlayer(`${teamSide}-libero`, 99, true));
  }

  return {
    id: `${teamSide}-team`,
    code: teamSide.toUpperCase(),
    name: `${teamSide} Team`,
    players,
    staff: {
      headCoach: '',
      assistantCoach: '',
    },
  };
}

function createStartingLineup(teamSide: TeamSide, includeLibero = false): StartingLineup {
  return {
    teamSide,
    setterPlayerId: `${teamSide}-p1`,
    liberoPlayerIds: includeLibero ? [`${teamSide}-libero`] : [],
    liberoAutoMiddleReplacement: false,
    benchPlayerIds: includeLibero ? [`${teamSide}-libero`] : [],
    displaySide: teamSide === 'home' ? 'left' : 'right',
    slots: COURT_POSITIONS.map((courtPosition) => ({
      courtPosition,
      playerId: `${teamSide}-p${courtPosition}`,
      tacticalRole: ROLE_BY_POSITION[courtPosition],
    })),
  };
}

function createLineup(teamSide: TeamSide, includeLibero = false): ActiveLineup {
  return createActiveLineup(createStartingLineup(teamSide, includeLibero));
}

function createLiveMatch(input: {
  homeLineup?: ActiveLineup;
  awayLineup?: ActiveLineup;
  servingTeam?: TeamSide;
  currentRallyNumber?: number;
  isRallyActive?: boolean;
} = {}): LiveMatchState {
  return {
    activeProjectId: 'validation-project',
    currentSetNumber: 1,
    currentRallyNumber: input.currentRallyNumber ?? 1,
    homeScore: 0,
    awayScore: 0,
    servingTeam: input.servingTeam ?? 'home',
    homeActiveLineup: input.homeLineup ?? createLineup('home'),
    awayActiveLineup: input.awayLineup ?? createLineup('away'),
    isSetStarted: true,
    isRallyActive: input.isRallyActive ?? false,
    currentRallyTouches: [],
    currentRallyPointWinner: null,
    currentBallPath: null,
    completedSets: [],
    startedAt: 1,
    updatedAt: 1,
    eventLog: [],
  };
}

function buildLiberoReplacementEvent(
  liveMatch: LiveMatchState,
  proposal: LiberoReplacementProposal,
): Extract<MatchEvent, { type: 'libero_replacement_made' }> {
  return buildLiberoReplacementMadeEvent(liveMatch, proposal) as Extract<MatchEvent, { type: 'libero_replacement_made' }>;
}

function getInCourtZone(teamSide: TeamSide, row: number, column: number): ScoutingZone {
  const zone = SCOUTING_ZONES.find((item) => item.id === `${teamSide}-r${row}c${column}`);
  if (!zone) {
    throw new Error(`missing scouting zone ${teamSide}-r${row}c${column}`);
  }

  return zone;
}

function getServeStartZone(teamSide: TeamSide, lane: 'left' | 'center' | 'right'): ScoutingZone {
  const zone = SCOUTING_ZONES.find((item) => item.id === `${teamSide}-serve-${lane}`);
  if (!zone) {
    throw new Error(`missing scouting zone ${teamSide}-serve-${lane}`);
  }

  return zone;
}

function createTouch(input: {
  id: string;
  teamSide: TeamSide;
  playerId: string;
  skill: SkillType;
  evaluation: SkillEvaluation;
  sequenceNumber?: number;
  rallyNumber?: number;
}): BallTouch {
  return {
    id: input.id,
    setNumber: 1,
    rallyNumber: input.rallyNumber ?? 1,
    sequenceNumber: input.sequenceNumber ?? 1,
    teamSide: input.teamSide,
    playerId: input.playerId,
    skill: input.skill,
    evaluation: input.evaluation,
    createdAt: input.sequenceNumber ?? 1,
  };
}

function getSetter(players: TacticalCourtPlayer[]): TacticalCourtPlayer {
  const setter = players.find((player) => player.isSetter);
  if (!setter) {
    throw new Error('expected setter marker');
  }

  return setter;
}

function getTeamSetterPosition(input: {
  teamSide: TeamSide;
  team: Team;
  lineup: ActiveLineup;
  phase: TeamTacticalPhases[TeamSide];
}): TacticalCourtPlayer {
  return getSetter(getPlayerTacticalPositions({
    teamSide: input.teamSide,
    team: input.team,
    lineup: input.lineup,
    phase: input.phase,
    defenseSystemBlock: DEFAULT_DEFENSE_SYSTEM_BLOCK,
    receptionSystemBlock: DEFAULT_RECEPTION_SYSTEM_BLOCK,
  }));
}

function expectPointClose(
  actual: { x: number; y: number },
  expected: { x: number; y: number },
  label: string,
): number {
  let assertions = 0;
  assertions += expectClose(actual.x, expected.x, `${label} x`);
  assertions += expectClose(actual.y, expected.y, `${label} y`);
  return assertions;
}

function resetTouchFlowStore() {
  useLiveTouchFlowStore.setState({
    currentPhase: 'idle',
    selectedPlayerId: null,
    pendingTouch: null,
    awaitingAceTarget: false,
    lastTouchedPlayerId: null,
    flowContext: {
      previousTouch: null,
      servingTeam: null,
      servingPlayerId: null,
      playerTeamById: {},
    },
    committedTouches: [],
    rallyEndRequest: null,
  });
}

function validateDataVolleyZoneCoordinates(): number {
  let assertions = 0;
  const zone2c = getDataVolleyZoneCoordinate('2c');
  const zone1a = getDataVolleyZoneCoordinate('1a');
  const unknownZone = getDataVolleyZoneCoordinate('unknown');
  const away2c = mapHalfCourtSystemPointToLiveCourt('away', zone2c);
  const home2c = mapHalfCourtSystemPointToLiveCourt('home', zone2c);

  assertions += expectPointClose(zone2c, { x: 82, y: 34 }, 'DataVolley 2c coordinate');
  assertions += expectPointClose(zone1a, { x: 82, y: 52 }, 'DataVolley 1a coordinate');
  assertions += expectPointClose(unknownZone, { x: 50, y: 50 }, 'unknown DataVolley zone fallback');
  assertions += expectPointClose(home2c, mirrorLiveCourtPoint(away2c), 'DataVolley live-court mirroring');

  return assertions;
}

function validateTacticalRoleMapping(): number {
  let assertions = 0;
  const team = createTeam('home');
  const roleSequence = DEFAULT_RECEPTION_SYSTEM_BLOCK.roleSequence;
  const sequencedSlots = COURT_POSITIONS.map((courtPosition) => ({
    courtPosition,
    playerId: `home-p${courtPosition}`,
  }));
  const sequencedRoleMap = mapRolesToPlayers({
    roleSequence,
    lineupSlots: sequencedSlots,
    teamPlayers: team.players,
  });
  const lineup = createLineup('home');
  const rotatedLineup = rotateLineupForSideOut(lineup);
  const rotatedRoleMap = getTeamRolePlayerMap({
    roleSequence,
    lineup: rotatedLineup,
    teamPlayers: team.players,
  });

  assertions += expectEqual(sequencedRoleMap.get(PlayerRole.SETTER)?.id, 'home-p1', 'role sequence maps setter to first slot');
  assertions += expectEqual(sequencedRoleMap.get(PlayerRole.OUTSIDE_HITTER_1)?.id, 'home-p2', 'role sequence maps S1/OH1');
  assertions += expectEqual(sequencedRoleMap.get(PlayerRole.MIDDLE_BLOCKER_2)?.id, 'home-p3', 'role sequence maps C2/MB2');
  assertions += expectEqual(sequencedRoleMap.get(PlayerRole.OPPOSITE)?.id, 'home-p4', 'role sequence maps opposite');
  assertions += expectEqual(sequencedRoleMap.get(PlayerRole.OUTSIDE_HITTER_2)?.id, 'home-p5', 'role sequence maps S2/OH2');
  assertions += expectEqual(sequencedRoleMap.get(PlayerRole.MIDDLE_BLOCKER_1)?.id, 'home-p6', 'role sequence maps C1/MB1');
  assertions += expectEqual(getCurrentSetterRotation(rotatedLineup, roleSequence), 6, 'setter rotation follows side-out rotation');
  assertions += expectEqual(rotatedRoleMap.get(PlayerRole.SETTER)?.id, 'home-p1', 'explicit tactical roles remain stable after rotation');

  return assertions;
}

function validateTacticalLayoutModules(): number {
  let assertions = 0;
  const breakPointRotationOne = getDefenseLayoutPositions({
    phase: 'break_point_defense',
    rotation: 1,
    defenseSystemBlock: DEFAULT_DEFENSE_SYSTEM_BLOCK,
  });
  const breakPointRotationFour = getDefenseLayoutPositions({
    phase: 'break_point_defense',
    rotation: 4,
    defenseSystemBlock: DEFAULT_DEFENSE_SYSTEM_BLOCK,
  });
  const sideOutRotationOne = getDefenseLayoutPositions({
    phase: 'side_out_defense',
    rotation: 1,
    defenseSystemBlock: DEFAULT_DEFENSE_SYSTEM_BLOCK,
  });
  const receptionRotationOne = getReceptionLayoutPositions({
    rotation: 1,
    receptionSystemBlock: DEFAULT_RECEPTION_SYSTEM_BLOCK,
  });
  const receptionRotationThree = getReceptionLayoutPositions({
    rotation: 3,
    receptionSystemBlock: DEFAULT_RECEPTION_SYSTEM_BLOCK,
  });
  const breakPointSetter = breakPointRotationOne.find((position) => position.role === PlayerRole.SETTER);
  const frontRowSetter = breakPointRotationFour.find((position) => position.role === PlayerRole.SETTER);
  const sideOutOpposite = sideOutRotationOne.find((position) => position.role === PlayerRole.OPPOSITE);
  const sideOutSetter = sideOutRotationOne.find((position) => position.role === PlayerRole.SETTER);
  const receptionSetterOne = receptionRotationOne.find((position) => position.role === PlayerRole.SETTER);
  const receptionSetterThree = receptionRotationThree.find((position) => position.role === PlayerRole.SETTER);
  const setterReturnTarget = getSetterReturnToDefenseTarget({
    teamSide: 'away',
    phase: 'side_out_defense',
    rotation: 1,
    defenseSystemBlock: DEFAULT_DEFENSE_SYSTEM_BLOCK,
  });

  assertions += expectEqual(breakPointRotationOne.length, 6, 'break-point defense has six configured positions');
  assertions += expectEqual(breakPointSetter?.dataVolleyZone, '9a', 'break-point rotation 1 setter defense zone');
  assertions += expectEqual(frontRowSetter?.dataVolleyZone, '2b', 'break-point rotation 4 setter defense zone');
  assertions += expectEqual(sideOutOpposite?.dataVolleyZone, '4b', 'side-out rotation 1 opposite defense zone');
  assertions += expectEqual(receptionRotationOne.length, 6, 'reception has six configured positions');
  assertions += expectEqual(receptionSetterOne?.dataVolleyZone, '9a', 'reception rotation 1 setter support zone');
  assertions += expectEqual(receptionSetterThree?.dataVolleyZone, '3', 'reception rotation 3 setter zone');
  assertions += expectTruthy(setterReturnTarget, 'setter return-to-defense target exists');
  assertions += expectPointClose(
    setterReturnTarget!,
    mapHalfCourtSystemPointToLiveCourt('away', { x: sideOutSetter!.x, y: sideOutSetter!.y }),
    'setter return-to-defense target uses configured defense',
  );

  return assertions;
}

function validateTacticalPositionResolver(): number {
  let assertions = 0;
  const homeTeam = createTeam('home', true);
  const awayTeam = createTeam('away');
  const homeLineup = createLineup('home', true);
  const awayLineup = createLineup('away');
  const serveStartZone = getServeStartZone('home', 'left');
  const servingMarkers = resolveTacticalCourtPlayers({
    teamSide: 'home',
    team: homeTeam,
    lineup: homeLineup,
    phase: 'serving_prepare',
    defenseSystemBlock: DEFAULT_DEFENSE_SYSTEM_BLOCK,
    receptionSystemBlock: DEFAULT_RECEPTION_SYSTEM_BLOCK,
    serveStartZone,
  });
  const homeServer = servingMarkers.find((player) => player.courtPosition === 1);
  const receptionMarkers = resolveTacticalCourtPlayers({
    teamSide: 'away',
    team: awayTeam,
    lineup: awayLineup,
    phase: 'reception',
    defenseSystemBlock: DEFAULT_DEFENSE_SYSTEM_BLOCK,
    receptionSystemBlock: DEFAULT_RECEPTION_SYSTEM_BLOCK,
  });
  const sideOutMarkers = resolveTacticalCourtPlayers({
    teamSide: 'away',
    team: awayTeam,
    lineup: awayLineup,
    phase: 'side_out_defense',
    defenseSystemBlock: DEFAULT_DEFENSE_SYSTEM_BLOCK,
    receptionSystemBlock: DEFAULT_RECEPTION_SYSTEM_BLOCK,
  });
  const breakPointMarkers = resolveTacticalCourtPlayers({
    teamSide: 'home',
    team: homeTeam,
    lineup: homeLineup,
    phase: 'break_point_defense',
    defenseSystemBlock: DEFAULT_DEFENSE_SYSTEM_BLOCK,
    receptionSystemBlock: DEFAULT_RECEPTION_SYSTEM_BLOCK,
  });
  const receptionSetterConfig = getReceptionLayoutPositions({
    rotation: 1,
    receptionSystemBlock: DEFAULT_RECEPTION_SYSTEM_BLOCK,
  }).find((position) => position.role === PlayerRole.SETTER);
  const sideOutSetterTarget = getSetterReturnToDefenseTarget({
    teamSide: 'away',
    phase: 'side_out_defense',
    rotation: 1,
    defenseSystemBlock: DEFAULT_DEFENSE_SYSTEM_BLOCK,
  });
  const homeBreakPointSetterConfig = getDefenseLayoutPositions({
    phase: 'break_point_defense',
    rotation: 1,
    defenseSystemBlock: DEFAULT_DEFENSE_SYSTEM_BLOCK,
  }).find((position) => position.role === PlayerRole.SETTER);
  const liveMatch = createLiveMatch({ homeLineup });
  const liberoProposal = getManualLiberoReplacementProposals(liveMatch, 'home')
    .find((proposal) => proposal.playerOutId === 'home-p5');
  assertions += expectTruthy(liberoProposal, 'resolver libero replacement proposal exists');
  if (!liberoProposal) {
    return assertions;
  }

  const liberoLineup = applyLiberoReplacementToLineup(
    homeLineup,
    buildLiberoReplacementEvent(liveMatch, liberoProposal),
  );
  const liberoMarkers = resolveTacticalCourtPlayers({
    teamSide: 'home',
    team: homeTeam,
    lineup: liberoLineup,
    phase: 'side_out_defense',
    defenseSystemBlock: DEFAULT_DEFENSE_SYSTEM_BLOCK,
    receptionSystemBlock: DEFAULT_RECEPTION_SYSTEM_BLOCK,
  });
  const liberoMarker = liberoMarkers.find((player) => player.playerId === 'home-libero');

  assertions += expectTruthy(homeServer, 'serve resolver renders server');
  assertions += expectPointClose(
    homeServer!,
    { x: serveStartZone.center.x + 3.2, y: serveStartZone.center.y },
    'serve resolver moves server to serve-start zone',
  );
  assertions += expectEqual(receptionMarkers.length, 6, 'reception resolver renders six markers');
  assertions += expectPointClose(
    getSetter(receptionMarkers),
    mapHalfCourtSystemPointToLiveCourt('away', { x: receptionSetterConfig!.x, y: receptionSetterConfig!.y }),
    'reception resolver uses reception system coordinate',
  );
  assertions += expectPointClose(getSetter(sideOutMarkers), sideOutSetterTarget!, 'side-out resolver uses defense target');
  assertions += expectPointClose(
    getSetter(breakPointMarkers),
    mapHalfCourtSystemPointToLiveCourt('home', { x: homeBreakPointSetterConfig!.x, y: homeBreakPointSetterConfig!.y }),
    'defense resolver mirrors home defense coordinate',
  );
  assertions += expectTruthy(liberoMarker, 'resolver renders active libero replacement');
  assertions += expectEqual(liberoMarker?.isLibero, true, 'resolver marks active libero');
  assertions += expectEqual(liberoMarker?.replacedPlayerId, 'home-p5', 'resolver tracks replaced player');
  assertions += expectFalse(
    liberoMarkers.some((player) => player.isLibero && ([2, 3, 4] as CourtPosition[]).includes(player.courtPosition)),
    'resolver does not render libero front-row',
  );

  return assertions;
}

function pendingTouchToBallTouch(
  touch: ReturnType<typeof useLiveTouchFlowStore.getState>['committedTouches'][number],
  sequenceNumber: number,
): BallTouch {
  return {
    id: `flow-touch-${sequenceNumber}`,
    setNumber: 1,
    rallyNumber: 1,
    sequenceNumber,
    teamSide: touch.teamSide,
    playerId: touch.playerId,
    skill: touch.skill,
    evaluation: touch.evaluation,
    zone: {
      teamSide: touch.zone.teamSide,
      zoneId: touch.zone.id,
      gridCoordinate: touch.zone.gridCoordinate,
      point: touch.zone.center,
    },
    createdAt: sequenceNumber,
  };
}

function validateRallyFlowHelpers(): number {
  let assertions = 0;
  const targetZone = getInCourtZone('away', 2, 4);
  const servePendingTouch = buildPendingTouchForZone({
    zone: targetZone,
    previousTouch: null,
    servingTeam: 'home',
    servingPlayerId: 'home-p1',
  });

  assertions += expectTruthy(servePendingTouch, 'rally flow builds opening serve touch');
  assertions += expectEqual(servePendingTouch?.skill, 'serve', 'opening touch is serve');
  assertions += expectEqual(servePendingTouch?.teamSide, 'home', 'opening serve uses serving team');

  const aceResult = resolveEvaluationFlow({
    ...servePendingTouch!,
    evaluation: '#',
  });
  assertions += expectEqual(aceResult.kind, 'awaiting_ace_target', 'serve # routes through ace victim flow');
  if (aceResult.kind !== 'awaiting_ace_target') {
    return assertions;
  }

  assertions += expectEqual(aceResult.selection.receivingTeam, 'away', 'ace victim is selected from receiving team');
  assertions += expectEqual(
    resolveAceVictimFlow({
      selection: aceResult.selection,
      playerId: 'home-p2',
      teamSide: 'home',
    }),
    null,
    'rally flow rejects same-team ace victim',
  );

  const resolvedAce = resolveAceVictimFlow({
    selection: aceResult.selection,
    playerId: 'away-p5',
    teamSide: 'away',
  });
  assertions += expectTruthy(resolvedAce, 'rally flow accepts receiving-team ace victim');
  assertions += expectEqual(resolvedAce?.touches.length, 2, 'rally flow produces serve and receive touches for ace');
  assertions += expectEqual(resolvedAce?.pointTeam, 'home', 'rally flow awards ace point to server');

  const committedServe = pendingTouchToBallTouch(servePendingTouch!, 1);
  assertions += expectTruthy(
    shouldReplaceLatestPendingTouch(committedServe, servePendingTouch!, 1, 1),
    'rally validation allows overwriting matching pending touch',
  );
  assertions += expectFalse(
    shouldReplaceLatestPendingTouch(
      committedServe,
      {
        ...servePendingTouch!,
        skill: 'receive',
      },
      1,
      1,
    ),
    'rally validation rejects overwriting a different skill',
  );

  return assertions;
}

function validateServeAceFlow(): number {
  let assertions = 0;
  const targetZone = getInCourtZone('away', 2, 4);
  resetTouchFlowStore();

  useLiveTouchFlowStore.getState().updateContext({
    servingTeam: 'home',
    servingPlayerId: 'home-p1',
    playerTeamById: {
      'home-p1': 'home',
      'home-p2': 'home',
      'away-p5': 'away',
    },
  });
  useLiveTouchFlowStore.getState().openTouch(targetZone);
  useLiveTouchFlowStore.getState().selectEvaluation('#');

  const awaitingState = useLiveTouchFlowStore.getState();
  assertions += expectEqual(awaitingState.currentPhase, 'awaiting_ace_target', 'serve ace enters victim selection');
  assertions += expectEqual(awaitingState.awaitingAceTarget, true, 'serve ace awaits receiving victim');
  assertions += expectEqual(awaitingState.pendingTouch?.skill, 'serve', 'pending ace touch remains serve');
  assertions += expectEqual(awaitingState.pendingTouch?.evaluation, '#', 'pending ace touch keeps # evaluation');
  assertions += expectEqual(awaitingState.committedTouches.length, 0, 'ace serve is not committed before victim selection');
  assertions += expectEqual(awaitingState.rallyEndRequest, null, 'ace point is not awarded before victim selection');

  const serveTouch = pendingTouchToBallTouch(awaitingState.pendingTouch!, 1);
  const phasesBeforeVictim = getNextTeamTacticalPhasesAfterTouch({
    phases: getInitialTeamTacticalPhases('home'),
    touch: serveTouch,
    servingTeam: 'home',
  });
  assertions += expectEqual(phasesBeforeVictim.home, 'serving_prepare', 'serve # does not move server to defense before victim');
  assertions += expectEqual(phasesBeforeVictim.away, 'reception', 'serve # does not move receiving team before victim');

  useLiveTouchFlowStore.getState().handleAceTarget('home-p2', 'home');
  const rejectedState = useLiveTouchFlowStore.getState();
  assertions += expectEqual(rejectedState.currentPhase, 'awaiting_ace_target', 'serving-team ace victim is rejected');
  assertions += expectEqual(rejectedState.committedTouches.length, 0, 'serving-team ace victim creates no touches');

  useLiveTouchFlowStore.getState().handleAceTarget('away-p5', 'away');
  const resolvedState = useLiveTouchFlowStore.getState();
  assertions += expectEqual(resolvedState.currentPhase, 'rally_ended', 'ace victim selection ends rally');
  assertions += expectEqual(resolvedState.rallyEndRequest?.pointTeam, 'home', 'ace awards point to serving team');
  assertions += expectEqual(resolvedState.rallyEndRequest?.reason, 'ace', 'ace rally end reason');
  assertions += expectEqual(resolvedState.committedTouches.length, 2, 'ace flow commits serve and receive touches');
  assertions += expectEqual(resolvedState.committedTouches[0]?.skill, 'serve', 'ace flow commits serve first');
  assertions += expectEqual(resolvedState.committedTouches[0]?.evaluation, '#', 'ace flow commits serve #');
  assertions += expectEqual(resolvedState.committedTouches[1]?.skill, 'receive', 'ace flow commits receive victim');
  assertions += expectEqual(resolvedState.committedTouches[1]?.evaluation, '=', 'ace flow commits receive error');

  const rallyTouches = resolvedState.committedTouches.map(pendingTouchToBallTouch);
  const dataVolleyCode = buildDataVolleyRallyCode({
    touches: rallyTouches,
    getJerseyNumber: (playerId) => {
      const jerseyByPlayerId: Record<string, number> = {
        'home-p1': 1,
        'away-p5': 5,
      };
      return playerId ? jerseyByPlayerId[playerId] : undefined;
    },
  });
  assertions += expectTruthy(/S.*#/.test(dataVolleyCode), 'DataVolley ace sequence contains serve #');
  assertions += expectTruthy(/R.*=/.test(dataVolleyCode), 'DataVolley ace sequence contains receive =');

  return assertions;
}

function validateLiberoFlows(): number {
  let assertions = 0;
  const homeTeam = createTeam('home', true);
  const homeLineup = createLineup('home', true);
  const liveMatch = createLiveMatch({ homeLineup });
  const manualProposals = getManualLiberoReplacementProposals(liveMatch, 'home');
  const proposalPositions = manualProposals
    .map((proposal) => homeLineup.slots.find((slot) => slot.playerId === proposal.playerOutId)?.courtPosition)
    .sort();

  assertions += expectDeepEqual(proposalPositions, [1, 5, 6], 'manual libero proposals are limited to back row');

  ([1, 5, 6] as const).forEach((courtPosition) => {
    const proposal = manualProposals.find((item) => item.playerOutId === `home-p${courtPosition}`);
    assertions += expectTruthy(proposal, `libero can replace back-row position ${courtPosition}`);
    const event = buildLiberoReplacementEvent(liveMatch, proposal!);
    const replacedLineup = applyLiberoReplacementToLineup(homeLineup, event);
    assertions += expectTruthy(replacedLineup, `libero replacement applies at position ${courtPosition}`);
    assertions += expectEqual(
      replacedLineup?.personnelState.activeLiberoState?.replacedPlayerId,
      `home-p${courtPosition}`,
      `libero tracks replaced player at position ${courtPosition}`,
    );
  });

  ([2, 3, 4] as const).forEach((courtPosition) => {
    const frontRowEvent: Extract<MatchEvent, { type: 'libero_replacement_made' }> = {
      id: `front-row-libero-${courtPosition}`,
      type: 'libero_replacement_made',
      createdAt: courtPosition,
      setNumber: 1,
      rallyNumber: 1,
      teamSide: 'home',
      liberoPlayerId: 'home-libero',
      replacedPlayerId: `home-p${courtPosition}`,
      replacedPlayerRole: ROLE_BY_POSITION[courtPosition],
      playerOutId: `home-p${courtPosition}`,
      playerInId: 'home-libero',
      action: 'libero_enters',
    };
    assertions += expectEqual(
      applyLiberoReplacementToLineup(homeLineup, frontRowEvent),
      null,
      `libero cannot replace front-row position ${courtPosition}`,
    );
  });

  const positionFiveProposal = manualProposals.find((proposal) => proposal.playerOutId === 'home-p5');
  assertions += expectTruthy(positionFiveProposal, 'position 5 libero proposal exists');
  const enteredLineup = applyLiberoReplacementToLineup(
    homeLineup,
    buildLiberoReplacementEvent(liveMatch, positionFiveProposal!),
  );
  assertions += expectTruthy(enteredLineup, 'libero enters for front-row exit scenario');
  const rotatedLineup = rotateLineupForSideOut(enteredLineup!);
  const autoExitLineup = {
    ...rotatedLineup,
    personnelState: {
      ...rotatedLineup.personnelState,
      liberoAutoMiddleReplacement: true,
    },
  };
  const activeLiberoSlot = rotatedLineup.slots.find((slot) => slot.playerId === 'home-libero');

  assertions += expectEqual(activeLiberoSlot?.courtPosition, 4, 'replaced player rotation reaches front row');
  assertions += expectEqual(
    rotatedLineup.personnelState.activeLiberoState?.mustExitBeforeFrontRow,
    true,
    'libero front-row exit is marked before confirmation',
  );
  assertions += expectEqual(
    rotatedLineup.personnelState.activeLiberoState?.liberoPlayerId,
    'home-libero',
    'libero remains active until Events confirmation',
  );

  const exitLiveMatch = createLiveMatch({ homeLineup: rotatedLineup, currentRallyNumber: 2 });
  exitLiveMatch.homeActiveLineup = autoExitLineup;
  const exitProposal = getAutomaticLiberoReplacementProposal(exitLiveMatch, 'home');
  assertions += expectEqual(exitProposal?.action, 'regular_returns', 'automatic libero exit confirmation is requested');
  assertions += expectEqual(exitProposal?.reason, 'front_row_exit', 'automatic libero exit reason');

  const confirmedLineup = applyLiberoReplacementToLineup(
    autoExitLineup,
    buildLiberoReplacementEvent(exitLiveMatch, exitProposal!),
  );
  assertions += expectTruthy(confirmedLineup, 'confirmed libero exit applies');
  assertions += expectEqual(confirmedLineup?.personnelState.activeLiberoState, undefined, 'libero state clears after confirmation');
  assertions += expectEqual(
    confirmedLineup?.slots.find((slot) => slot.playerId === 'home-p5')?.courtPosition,
    4,
    'original replaced player returns after confirmation',
  );

  const renderedPlayers = getPlayerTacticalPositions({
    teamSide: 'home',
    team: homeTeam,
    lineup: confirmedLineup,
    phase: 'side_out_defense',
    defenseSystemBlock: DEFAULT_DEFENSE_SYSTEM_BLOCK,
    receptionSystemBlock: DEFAULT_RECEPTION_SYSTEM_BLOCK,
  });
  assertions += expectFalse(
    renderedPlayers.some((player) => player.playerId === 'home-libero' || player.isLibero),
    'libero is not rendered on court after confirmed exit',
  );

  return assertions;
}

function validateSetterReleaseTransitions(): number {
  let assertions = 0;
  const homeTeam = createTeam('home');
  const awayTeam = createTeam('away');
  const homeLineup = createLineup('home');
  const awayLineup = createLineup('away');
  let phases = getInitialTeamTacticalPhases('home');
  const receiveTouch = createTouch({
    id: 'away-receive-plus',
    teamSide: 'away',
    playerId: 'away-p5',
    skill: 'receive',
    evaluation: '+',
    sequenceNumber: 1,
  });

  phases = getNextTeamTacticalPhasesAfterTouch({
    phases,
    touch: receiveTouch,
    servingTeam: 'home',
  });
  assertions += expectEqual(phases.away, 'after_reception_setter_release', 'reception touch moves setter to release phase');
  assertions += expectPointClose(
    getTeamSetterPosition({
      teamSide: 'away',
      team: awayTeam,
      lineup: awayLineup,
      phase: phases.away,
    }),
    getSetterReleaseCoordinate('away'),
    'away setter release after reception',
  );

  const digPhases = getNextTeamTacticalPhasesAfterTouch({
    phases: {
      home: 'break_point_defense',
      away: 'side_out_defense',
    },
    touch: createTouch({
      id: 'home-dig-plus',
      teamSide: 'home',
      playerId: 'home-p6',
      skill: 'dig',
      evaluation: '+',
    }),
    servingTeam: 'home',
  });
  assertions += expectEqual(digPhases.home, 'break_point_setter_release', 'dig touch moves setter to release phase');
  assertions += expectPointClose(
    getTeamSetterPosition({
      teamSide: 'home',
      team: homeTeam,
      lineup: homeLineup,
      phase: digPhases.home,
    }),
    getSetterReleaseCoordinate('home'),
    'home setter release after dig',
  );

  assertions += expectEqual(SETTER_RELEASE_ZONE, '2c', 'setter release keeps DataVolley zone label');
  assertions += expectInRange(SETTER_RELEASE_COORDINATE.x, 60, 70, 'setter release lateral coordinate between zones 3 and 2');
  assertions += expectInRange(SETTER_RELEASE_COORDINATE.y, 0, 12, 'setter release depth is close to net');
  const awayRelease = getSetterReleaseCoordinate('away');
  const homeRelease = getSetterReleaseCoordinate('home');
  assertions += expectInRange(awayRelease.x, 44, 48, 'away release is under net');
  assertions += expectInRange(awayRelease.y, 58, 70, 'away release is between zone 3 and 2');
  assertions += expectInRange(homeRelease.x, 52, 56, 'home release is under net');
  assertions += expectInRange(homeRelease.y, 30, 42, 'home release is mirrored between zone 3 and 2');
  assertions += expectClose(50 - awayRelease.x, homeRelease.x - 50, 'setter release mirrors net distance');
  assertions += expectClose(awayRelease.y + homeRelease.y, 100, 'setter release mirrors lateral lane');

  const releaseSetter = getTeamSetterPosition({
    teamSide: 'away',
    team: awayTeam,
    lineup: awayLineup,
    phase: 'after_reception_setter_release',
  });
  const configuredDefenseSetter = getTeamSetterPosition({
    teamSide: 'away',
    team: awayTeam,
    lineup: awayLineup,
    phase: 'side_out_defense',
  });
  assertions += expectFalse(
    releaseSetter.x === configuredDefenseSetter.x && releaseSetter.y === configuredDefenseSetter.y,
    'setter release differs from configured defense position',
  );

  const setTouch = createTouch({
    id: 'away-set-plus',
    teamSide: 'away',
    playerId: 'away-p1',
    skill: 'set',
    evaluation: '+',
    sequenceNumber: 2,
  });
  phases = getNextTeamTacticalPhasesAfterTouch({
    phases,
    touch: setTouch,
    previousTouch: receiveTouch,
    servingTeam: 'home',
  });
  assertions += expectEqual(phases.away, 'after_reception_setter_release', 'setter stays released after same-team set');

  const attackTouch = createTouch({
    id: 'away-attack-plus',
    teamSide: 'away',
    playerId: 'away-p2',
    skill: 'attack',
    evaluation: '+',
    sequenceNumber: 3,
  });
  phases = getNextTeamTacticalPhasesAfterTouch({
    phases,
    touch: attackTouch,
    previousTouch: setTouch,
    servingTeam: 'home',
  });
  assertions += expectEqual(phases.away, 'side_out_defense', 'setter leaves release when ball is sent to opponent side');
  assertions += expectPointClose(
    getTeamSetterPosition({
      teamSide: 'away',
      team: awayTeam,
      lineup: awayLineup,
      phase: phases.away,
    }),
    configuredDefenseSetter,
    'setter returns to configured side-out defense',
  );

  const opponentDigTouch = createTouch({
    id: 'home-opponent-dig',
    teamSide: 'home',
    playerId: 'home-p6',
    skill: 'dig',
    evaluation: '+',
    sequenceNumber: 4,
  });
  phases = getNextTeamTacticalPhasesAfterTouch({
    phases,
    touch: opponentDigTouch,
    previousTouch: attackTouch,
    servingTeam: 'home',
  });
  assertions += expectEqual(phases.away, 'side_out_defense', 'setter remains in defense after opponent touch');

  return assertions;
}

function createSetStartedEvent(servingTeam: TeamSide): Extract<MatchEvent, { type: 'set_started' }> {
  return {
    id: `set-started-${servingTeam}`,
    type: 'set_started',
    setNumber: 1,
    createdAt: 1,
    homeLineup: createStartingLineup('home'),
    awayLineup: createStartingLineup('away'),
    servingTeam,
  };
}

function createRallyStartedEvent(): Extract<MatchEvent, { type: 'rally_started' }> {
  return {
    id: 'rally-started',
    type: 'rally_started',
    createdAt: 2,
  };
}

function createPointAwardedEvent(teamSide: TeamSide): Extract<MatchEvent, { type: 'point_awarded' }> {
  return {
    id: `point-${teamSide}`,
    type: 'point_awarded',
    createdAt: 3,
    setNumber: 1,
    rallyNumber: 1,
    teamSide,
  };
}

function validateTacticalTransitions(): number {
  let assertions = 0;
  const serveContinuesPhases = getNextTeamTacticalPhasesAfterTouch({
    phases: getInitialTeamTacticalPhases('home'),
    touch: createTouch({
      id: 'home-serve-plus',
      teamSide: 'home',
      playerId: 'home-p1',
      skill: 'serve',
      evaluation: '+',
    }),
    servingTeam: 'home',
  });
  assertions += expectEqual(serveContinuesPhases.home, 'break_point_defense', 'continued serve moves server into break-point defense');

  const serveAcePhases = getNextTeamTacticalPhasesAfterTouch({
    phases: getInitialTeamTacticalPhases('home'),
    touch: createTouch({
      id: 'home-serve-ace',
      teamSide: 'home',
      playerId: 'home-p1',
      skill: 'serve',
      evaluation: '#',
    }),
    servingTeam: 'home',
  });
  assertions += expectDeepEqual(serveAcePhases, getInitialTeamTacticalPhases('home'), 'serve # does not reposition before ace victim');

  const receivingWinReplay = replayLiveMatchFromEvents('validation-project', [
    createSetStartedEvent('home'),
    createRallyStartedEvent(),
    createPointAwardedEvent('away'),
  ]);
  assertions += expectTruthy(receivingWinReplay, 'receiving-team point replay succeeds');
  assertions += expectEqual(
    receivingWinReplay?.awayActiveLineup?.slots.find((slot) => slot.playerId === 'away-p1')?.courtPosition,
    6,
    'receiving team winning rally rotates lineup',
  );
  assertions += expectEqual(receivingWinReplay?.servingTeam, 'away', 'receiving team becomes serving team after side-out');

  const servingWinReplay = replayLiveMatchFromEvents('validation-project', [
    createSetStartedEvent('home'),
    createRallyStartedEvent(),
    createPointAwardedEvent('home'),
  ]);
  assertions += expectTruthy(servingWinReplay, 'serving-team point replay succeeds');
  assertions += expectEqual(
    servingWinReplay?.homeActiveLineup?.slots.find((slot) => slot.playerId === 'home-p1')?.courtPosition,
    1,
    'serving team winning rally does not rotate lineup',
  );
  assertions += expectEqual(servingWinReplay?.servingTeam, 'home', 'serving team stays serving after break point');

  let phases = getInitialTeamTacticalPhases('home');
  const receiveTouch = createTouch({
    id: 'away-receive-transition',
    teamSide: 'away',
    playerId: 'away-p5',
    skill: 'receive',
    evaluation: '+',
    sequenceNumber: 1,
  });
  phases = getNextTeamTacticalPhasesAfterTouch({ phases, touch: receiveTouch, servingTeam: 'home' });
  assertions += expectEqual(phases.away, 'after_reception_setter_release', 'receiving team does not switch to defense on reception');

  const setTouch = createTouch({
    id: 'away-set-transition',
    teamSide: 'away',
    playerId: 'away-p1',
    skill: 'set',
    evaluation: '+',
    sequenceNumber: 2,
  });
  phases = getNextTeamTacticalPhasesAfterTouch({
    phases,
    touch: setTouch,
    previousTouch: receiveTouch,
    servingTeam: 'home',
  });
  assertions += expectEqual(phases.away, 'after_reception_setter_release', 'receiving team stays released before ball crosses');

  phases = getNextTeamTacticalPhasesAfterTouch({
    phases,
    touch: createTouch({
      id: 'away-attack-transition',
      teamSide: 'away',
      playerId: 'away-p2',
      skill: 'attack',
      evaluation: '+',
      sequenceNumber: 3,
    }),
    previousTouch: setTouch,
    servingTeam: 'home',
  });
  assertions += expectEqual(phases.away, 'side_out_defense', 'receiving team switches to side-out defense after ball crosses');

  return assertions;
}

function validatePopupPlacement(): number {
  let assertions = 0;
  const popupWidth = 240;
  const popupHeight = 180;
  const ballRect = createPopupPlacementRect(430, 210, 60, 60);
  const layout = computeBallTouchPopupLayout({
    surfaceWidth: 900,
    surfaceHeight: 500,
    popupWidth,
    popupHeight,
    teamSide: 'away',
    anchor: { x: 50, y: 50 },
    ballPosition: { x: 50, y: 50 },
    ballRect,
    avoidPoints: [{ x: 50, y: 50 }],
  });
  const popupRect = createPopupPlacementRect(layout.left, layout.top, popupWidth, Math.min(popupHeight, layout.maxHeight));

  assertions += expectFalse(
    doPopupPlacementRectsOverlap(popupRect, ballRect, POPUP_AVOIDANCE_GAP),
    'popup placement avoids overlapping ball anchor',
  );
  assertions += expectInRange(layout.left, 0, 900 - popupWidth, 'popup left stays inside court surface');
  assertions += expectInRange(layout.top, 0, 500 - Math.min(popupHeight, layout.maxHeight), 'popup top stays inside court surface');

  return assertions;
}

export function validateLiveScoutingFlowsFixture(): ValidationResult {
  let assertions = 0;

  assertions += validateDataVolleyZoneCoordinates();
  assertions += validateTacticalRoleMapping();
  assertions += validateTacticalLayoutModules();
  assertions += validateTacticalPositionResolver();
  assertions += validateRallyFlowHelpers();
  assertions += validateServeAceFlow();
  assertions += validateLiberoFlows();
  assertions += validateSetterReleaseTransitions();
  assertions += validateTacticalTransitions();
  assertions += validatePopupPlacement();

  return { assertions };
}
