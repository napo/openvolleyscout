import type { CourtPosition, SkillEvaluation, SkillType, TeamSide } from '@src/domain/common/enums';
import type { MatchEvent } from '@src/domain/events/types';
import { createActiveLineup } from '@src/domain/lineup';
import type { ActiveLineup, StartingLineup } from '@src/domain/lineup/types';
import { normalizeMatchProject } from '@src/domain/match';
import type { MatchProject } from '@src/domain/match/types';
import type { Player, Team } from '@src/domain/roster/types';
import { DEFAULT_SCOUTING_MODE } from '@src/domain/scouting';
import {
  createFullScoutingCells,
  getDefaultServeStartZoneForTeam,
  remapScoutingZonesForDisplaySides,
  type ScoutingZone,
} from '@src/domain/spatial';
import { PlayerRole } from '@src/domain/systems';
import {
  BALL_TRAJECTORY_MAX_POINTS,
  assertValidStagePoint,
  clientPointToStagePoint,
  createBallDirection,
  createBallTrajectory,
  getBallDirectionForTrajectory,
  getBallTrajectoriesForTouches,
  getBallTrajectoryOutsideCourtPoints,
  isPointOutsideScoutingCourt,
  isValidStagePoint,
  simplifyBallTrajectoryPoints,
  stagePointToSvgPoint,
  type BallTrajectory,
  updateBallTrajectoryMetadata,
} from '@src/domain/trajectory';
import {
  ADVANCED_ATTACK_TEMPOS,
  ADVANCED_ATTACK_TYPES,
  ADVANCED_BLOCK_OUTCOMES,
  ADVANCED_BLOCK_TYPES,
  ADVANCED_SERVE_TYPES,
  ADVANCED_SET_TYPES,
  isValidAttackTempo,
  isValidAttackType,
  isValidBlockOutcome,
  isValidBlockType,
  isValidServeType,
  isValidSetType,
  type AdvancedTouchDetails,
  type BallTouch,
} from '@src/domain/touch';
import { DEFAULT_DEFENSE_SYSTEM_BLOCK, DEFAULT_RECEPTION_SYSTEM_BLOCK } from '@src/config/systems';
import { buildDataVolleyRallyCode, buildDataVolleyTouchCode } from './datavolley-code';
import {
  createLiveInputState,
  resolveLiveEvaluationAction,
  useLiveTouchFlowStore,
} from '../live/stores/live-touch-flow-store';
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
} from '../live/tactical/positioning/tactical-setter-layout';
import {
  resolveTacticalCourtPlayers,
  type TacticalCourtPlayer,
} from '../live/tactical/positioning/tactical-position-resolver';
import {
  getDataVolleyZoneCoordinate,
} from '../live/tactical/positioning/datavolley-zones';
import {
  type CourtDisplaySide,
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
import {
  createLiveMatchStateFromProject,
  createLiveMatchStateFromSetStart,
  createScoutingSessionSnapshot,
} from './session';
import { rotateLineupForSideOut } from '../live/tactical/tactical-rotation';
import {
  applyLiberoReplacementToLineup,
  buildLiberoReplacementMadeEvent,
  getAutomaticLiberoReplacementProposal,
  getManualLiberoReplacementProposals,
  type LiberoReplacementProposal,
} from '../live/tactical/tactical-libero';
import {
  validateLiberoTouch,
} from '../live/libero';
import {
  POPUP_AVOIDANCE_GAP,
  computeBallTouchPopupLayout,
  createPopupPlacementRect,
  doPopupPlacementRectsOverlap,
} from '../live/popup/popup-positioning';
import {
  buildReceptionDrivenServeReceiveTouch,
  buildManualServeReceiveTouchFromServeError,
  buildServeErrorConfirmationTouch,
  canSelectReceptionDrivenServeReceiver,
  canSelectAttackBlocker,
  buildPendingTouchForZone,
  createAttackBlockerSelection,
  findNearestReceivingPlayer,
  getValidAttackBlockers,
  getServingPlayerId,
  getServingPlayerIdFromLineup,
  isReceptionDrivenServePendingTouch,
  isReceivingPlayerCloseEnoughForAutoSelection,
  isServeErrorConfirmationPendingTouch,
  isServeReleaseInReceivingCourt,
  resolveAceVictimFlow,
  resolveAttackBlockerSelection,
  resolveEvaluationFlow,
  resolveReceptionDrivenServeEvaluationFlow,
  updatePendingTouchEvaluation,
  updatePendingTouchSelection,
  updatePendingTouchSkill,
} from '../live/rally/rally-flow';
import {
  startBallDragDirection,
  updateBallDragDirectionEnd,
} from '../hooks/useCourtBallDrag';
import { buildNextPendingTouch, RECEIVE_TO_SERVE_EVALUATION, type PendingTouch } from '../model/datavolley-flow';
import { getNextSetPrefillConfig } from './next-set';
import {
  shouldRenderCourtFirstLiveRally,
  shouldRenderDeadBallEventsPanel,
} from '../live/rally/live-stage-layout';
import {
  createLiveToolbarSnapshot,
} from '../live/rally/live-toolbar-state';
import { getToolbarModeLayout } from '../live/rally/toolbar-mode-layout';
import { shouldReplaceLatestPendingTouch } from '../live/rally/rally-validation';
import {
  createBallTrajectorySvgPath,
  getBallTrajectorySvgLine,
  getBallTrajectoryRenderPoints,
  getBallTrajectoryVisualStyle,
} from '../live/trajectory/trajectory-rendering';
import type { LiveMatchState } from './index';
import { buildTouchRecordedEvent } from './rally';
import { getTeamScopedPlayerKey } from '../live/tactical/player-identity';
import { buildMatchStats, validateStatsIntegrity } from './match-stats';
import {
  canCommitPendingTouchWithDefaults,
  createLiveScoutingLayoutSnapshot,
  getLiveScoutingOrientationGuardMediaQuery,
  getLiveScoutingViewportFlags,
  getScoutingStageLayoutPolicy,
  getScoutingModeConfig,
  isLandscapeRequiredForScoutingStage,
  updateProjectScoutingMode,
} from './index';
import { useScoutingStore } from './scouting-store';

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

function createStartingLineupWithRoles(
  teamSide: TeamSide,
  roleByPosition: Record<CourtPosition, PlayerRole>,
): StartingLineup {
  const lineup = createStartingLineup(teamSide, true);

  return {
    ...lineup,
    liberoAutoMiddleReplacement: true,
    slots: COURT_POSITIONS.map((courtPosition) => ({
      courtPosition,
      playerId: `${teamSide}-p${courtPosition}`,
      tacticalRole: roleByPosition[courtPosition],
    })),
  };
}

function createFrontRowMiddleStartingLineup(teamSide: TeamSide): StartingLineup {
  return createStartingLineupWithRoles(teamSide, {
    1: PlayerRole.SETTER,
    2: PlayerRole.MIDDLE_BLOCKER_1,
    3: PlayerRole.MIDDLE_BLOCKER_2,
    4: PlayerRole.OPPOSITE,
    5: PlayerRole.OUTSIDE_HITTER_1,
    6: PlayerRole.OUTSIDE_HITTER_2,
  });
}

function createMiddleServerStartingLineup(teamSide: TeamSide): StartingLineup {
  return createStartingLineupWithRoles(teamSide, {
    1: PlayerRole.MIDDLE_BLOCKER_1,
    2: PlayerRole.SETTER,
    3: PlayerRole.MIDDLE_BLOCKER_2,
    4: PlayerRole.OPPOSITE,
    5: PlayerRole.OUTSIDE_HITTER_2,
    6: PlayerRole.OUTSIDE_HITTER_1,
  });
}

function createLineup(teamSide: TeamSide, includeLibero = false): ActiveLineup {
  return createActiveLineup(createStartingLineup(teamSide, includeLibero));
}

function createMiddleServingLineup(teamSide: TeamSide): ActiveLineup {
  const lineup = createActiveLineup({
    teamSide,
    setterPlayerId: `${teamSide}-p2`,
    liberoPlayerIds: [`${teamSide}-libero`],
    liberoAutoMiddleReplacement: false,
    benchPlayerIds: [`${teamSide}-libero`],
    displaySide: teamSide === 'home' ? 'left' : 'right',
    slots: [
      {
        courtPosition: 1,
        playerId: `${teamSide}-p1`,
        tacticalRole: PlayerRole.MIDDLE_BLOCKER_1,
      },
      {
        courtPosition: 2,
        playerId: `${teamSide}-p2`,
        tacticalRole: PlayerRole.SETTER,
      },
      {
        courtPosition: 3,
        playerId: `${teamSide}-p3`,
        tacticalRole: PlayerRole.MIDDLE_BLOCKER_2,
      },
      {
        courtPosition: 4,
        playerId: `${teamSide}-p4`,
        tacticalRole: PlayerRole.OPPOSITE,
      },
      {
        courtPosition: 5,
        playerId: `${teamSide}-p5`,
        tacticalRole: PlayerRole.OUTSIDE_HITTER_2,
      },
      {
        courtPosition: 6,
        playerId: `${teamSide}-p6`,
        tacticalRole: PlayerRole.OUTSIDE_HITTER_1,
      },
    ],
  });

  return {
    ...lineup,
    personnelState: {
      ...lineup.personnelState,
      liberoAutoMiddleReplacement: true,
    },
  };
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
    scoutingMode: 'simple',
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

function createValidationZoneReference(zone: ScoutingZone, pointOverride?: { x: number; y: number }) {
  return {
    teamSide: zone.teamSide,
    zoneId: zone.id,
    gridCoordinate: zone.gridCoordinate,
    point: pointOverride ?? zone.center,
  };
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

function createTacticalPlayerMarker(input: {
  teamSide: TeamSide;
  playerNumber: CourtPosition;
  x: number;
  y: number;
  isLibero?: boolean;
}): TacticalCourtPlayer {
  return {
    id: `${input.teamSide}-marker-${input.playerNumber}`,
    playerId: `${input.teamSide}-p${input.playerNumber}`,
    courtPosition: input.playerNumber,
    jerseyNumber: input.playerNumber,
    x: input.x,
    y: input.y,
    isSetter: input.playerNumber === 1,
    isLibero: input.isLibero,
  };
}

function getSetter(players: TacticalCourtPlayer[]): TacticalCourtPlayer {
  const setter = players.find((player) => player.isSetter);
  if (!setter) {
    throw new Error('expected setter marker');
  }

  return setter;
}

function expectTacticalMarkerInvariant(markers: TacticalCourtPlayer[], label: string): number {
  let assertions = 0;
  assertions += expectEqual(markers.length, 6, `${label} renders exactly six markers`);
  assertions += expectEqual(new Set(markers.map((player) => player.playerId)).size, markers.length, `${label} does not duplicate player ids`);

  const renderedPlayerIds = new Set(markers.map((player) => player.playerId));
  const replacedPlayerIds = markers
    .map((player) => player.replacedPlayerId)
    .filter((playerId): playerId is string => Boolean(playerId));

  assertions += expectEqual(new Set(replacedPlayerIds).size, replacedPlayerIds.length, `${label} does not duplicate replaced player ids`);

  replacedPlayerIds.forEach((replacedPlayerId) => {
    assertions += expectFalse(renderedPlayerIds.has(replacedPlayerId), `${label} hides replaced player ${replacedPlayerId}`);
  });

  return assertions;
}

function expectMarkersOnDisplaySide(
  markers: TacticalCourtPlayer[],
  displaySide: CourtDisplaySide,
  label: string,
): number {
  return markers.reduce((assertions, marker) => (
    assertions + (displaySide === 'left'
      ? expectInRange(marker.x, 0, 50, `${label} ${marker.playerId} renders on left side`)
      : expectInRange(marker.x, 50, 100, `${label} ${marker.playerId} renders on right side`))
  ), 0);
}

function getTeamSetterPosition(input: {
  teamSide: TeamSide;
  team: Team;
  lineup: ActiveLineup;
  phase: TeamTacticalPhases[TeamSide];
}): TacticalCourtPlayer {
  return getSetter(resolveTacticalCourtPlayers({
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
    selectedTeamSide: null,
    pendingTouch: null,
    awaitingAceTarget: false,
    lastTouchedPlayerId: null,
    flowContext: {
      previousTouch: null,
      servingTeam: null,
      servingPlayerId: null,
      playerTeamByScopedKey: {},
    },
    committedTouches: [],
    rallyEndRequest: null,
  });
}

function createValidationProject(): MatchProject {
  const homeTeam = createTeam('home', true);
  const awayTeam = createTeam('away', true);
  const createSelection = (team: Team) => ({
    teamId: team.id,
    teamName: team.name,
    teamCode: team.code,
    source: 'manual_entry' as const,
    staff: team.staff,
    roster: team.players.map((player) => ({
      ...player,
      source: 'manual_entry' as const,
    })),
  });

  return normalizeMatchProject({
    metadata: {
      id: 'validation-project',
      format: 'best_of_5',
      schemaVersion: 3,
    },
    homeTeam,
    awayTeam,
    homeSelection: createSelection(homeTeam),
    awaySelection: createSelection(awayTeam),
    phase: 'startup',
    events: [
      {
        id: 'validation-match-created',
        type: 'match_created',
        createdAt: 1,
      },
    ],
    createdAt: 1,
    updatedAt: 1,
  });
}

function validateScoutingModes(): number {
  let assertions = 0;
  const targetZone = getInCourtZone('away', 2, 4);
  const homeTargetZone = getInCourtZone('home', 2, 4);
  const tacticalPlayersBySide = {
    away: [
      { playerId: 'away-p1', isSetter: true },
      { playerId: 'away-p2', isSetter: false },
    ],
    home: [
      { playerId: 'home-p1', isSetter: true },
      { playerId: 'home-p2', isSetter: false },
    ],
  };
  const defaultProject = createValidationProject();
  const simpleConfig = getScoutingModeConfig('simple');
  const advancedConfig = getScoutingModeConfig('advanced');
  const simpleLayout = getToolbarModeLayout('simple', null);
  const advancedLayout = getToolbarModeLayout('advanced', null);

  assertions += expectEqual(defaultProject.scoutingSession?.scoutingMode, DEFAULT_SCOUTING_MODE, 'default scouting mode is quick');
  assertions += expectEqual(simpleConfig.toolbarDensity, 'compact', 'simple mode uses compact toolbar density');
  assertions += expectEqual(advancedConfig.toolbarDensity, 'detailed', 'advanced mode uses detailed toolbar density');
  assertions += expectEqual(canCommitPendingTouchWithDefaults('simple'), true, 'simple mode allows default skill/evaluation commit');
  assertions += expectEqual(canCommitPendingTouchWithDefaults('advanced'), false, 'advanced mode requires explicit skill/evaluation');
  assertions += expectEqual(simpleConfig.requiredExplicitInput.evaluation, false, 'simple mode reduces mandatory evaluation input');
  assertions += expectEqual(advancedConfig.requiredExplicitInput.evaluation, true, 'advanced mode keeps evaluation explicit');
  assertions += expectDeepEqual(
    simpleLayout.primarySkills,
    ['serve', 'receive', 'attack', 'block'],
    'simple toolbar promotes primary touch controls',
  );
  assertions += expectDeepEqual(
    simpleLayout.secondarySkills,
    ['set', 'dig', 'freeball', 'cover'],
    'simple toolbar keeps secondary touches available separately',
  );
  assertions += expectTruthy(
    advancedLayout.visibleSkills.includes('freeball') && advancedLayout.visibleSkills.includes('cover'),
    'advanced toolbar reserves all current skill controls',
  );

  const updatedProject = normalizeMatchProject(updateProjectScoutingMode(defaultProject, 'advanced'));
  assertions += expectEqual(updatedProject.scoutingSession?.scoutingMode, 'advanced', 'mode persists in project scouting session');

  const startedMatch = createLiveMatchStateFromSetStart({
    activeProjectId: 'validation-project',
    setNumber: 1,
    homeStartingLineup: createStartingLineup('home'),
    awayStartingLineup: createStartingLineup('away'),
    servingTeam: 'home',
    scoutingMode: 'advanced',
    existingEvents: updatedProject.events,
    createdAt: 2,
  });
  assertions += expectEqual(startedMatch.scoutingMode, 'advanced', 'mode persists in live session state');
  assertions += expectEqual(
    createScoutingSessionSnapshot(startedMatch).scoutingMode,
    'advanced',
    'mode persists in session snapshots',
  );

  const replayProject = normalizeMatchProject({
    ...updatedProject,
    events: startedMatch.eventLog,
    scoutingSession: createScoutingSessionSnapshot(startedMatch),
  });
  assertions += expectEqual(
    createLiveMatchStateFromProject(replayProject)?.scoutingMode,
    'advanced',
    'project replay keeps persisted scouting mode',
  );

  const pendingTouch = buildPendingTouchForZone({
    zone: targetZone,
    previousTouch: null,
    servingTeam: 'home',
    servingPlayerId: 'home-p1',
  });
  assertions += expectTruthy(pendingTouch, 'mode test builds pending touch');
  if (!pendingTouch) {
    return assertions;
  }

  const simpleInputState = createLiveInputState({
    selectedPlayerId: 'home-p1',
    selectedTeamSide: 'home',
    pendingBallPosition: targetZone.center,
    pendingTouch,
    scoutingMode: 'simple',
  });
  assertions += expectEqual(simpleInputState.scoutingMode, 'quick', 'legacy simple input state normalizes to quick mode');
  assertions += expectEqual(simpleInputState.requiredExplicitInput.evaluation, false, 'simple input state carries reduced requirements');
  assertions += expectEqual(simpleInputState.inferredCandidate, false, 'simple input state exposes future inferred candidate hook');
  assertions += expectEqual(simpleInputState.pendingInference, false, 'simple input state does not run inference yet');

  const advancedInputState = createLiveInputState({
    selectedPlayerId: 'home-p1',
    selectedTeamSide: 'home',
    pendingBallPosition: targetZone.center,
    pendingTouch,
    scoutingMode: 'advanced',
  });
  assertions += expectEqual(advancedInputState.scoutingMode, 'advanced', 'advanced input state records active mode');
  assertions += expectEqual(advancedInputState.requiredExplicitInput.skill, true, 'advanced input state requires explicit skill');
  assertions += expectEqual(advancedInputState.requiredExplicitInput.evaluation, true, 'advanced input state requires explicit evaluation');
  assertions += expectEqual(pendingTouch.source, 'explicit', 'explicit pending touches carry explicit source metadata');
  assertions += expectEqual(pendingTouch.inferenceReason, undefined, 'explicit pending touches do not carry inference reason');

  const simpleMandatorySetAfterReceive = buildNextPendingTouch({
    zone: targetZone,
    previousTouch: {
      id: 'receive-touch',
      playerId: 'away-p2',
      teamSide: 'away',
      skill: 'receive',
      evaluation: '+',
    },
    scoutingMode: 'simple',
    teamPlayersBySide: tacticalPlayersBySide,
  });
  assertions += expectEqual(simpleMandatorySetAfterReceive, null, 'simple mode does not require set after receive');

  const simpleAttackAfterReceive = buildNextPendingTouch({
    zone: homeTargetZone,
    previousTouch: {
      id: 'receive-touch',
      playerId: 'away-p2',
      teamSide: 'away',
      skill: 'receive',
      evaluation: '+',
    },
    selectedPlayerId: 'away-p4',
    selectedTeamSide: 'away',
    scoutingMode: 'simple',
    teamPlayersBySide: tacticalPlayersBySide,
  });
  assertions += expectTruthy(simpleAttackAfterReceive, 'simple mode receive can be followed directly by attack');
  if (simpleAttackAfterReceive) {
    assertions += expectEqual(simpleAttackAfterReceive.skill, 'attack', 'simple mode defaults next selected player after receive to attack');
    assertions += expectEqual(simpleAttackAfterReceive.source, 'explicit', 'direct attack after receive is operator-entered');
    const simpleOptionalSet = updatePendingTouchSkill(simpleAttackAfterReceive, 'set');
    assertions += expectEqual(simpleOptionalSet.skill, 'set', 'simple mode still allows explicit optional set');
    assertions += expectEqual(simpleOptionalSet.source, 'explicit', 'optional set is recorded as explicit input');
    assertions += expectEqual(simpleOptionalSet.inferenceReason, undefined, 'optional set does not carry inference metadata');
  }

  const simpleMandatoryDigAfterAttack = buildNextPendingTouch({
    zone: targetZone,
    previousTouch: {
      id: 'attack-plus-touch',
      playerId: 'home-p2',
      teamSide: 'home',
      skill: 'attack',
      evaluation: '+',
    },
    scoutingMode: 'simple',
    teamPlayersBySide: tacticalPlayersBySide,
  });
  assertions += expectEqual(simpleMandatoryDigAfterAttack, null, 'simple mode does not require dig after attack continuation');

  const simpleAttackAfterDefendedAttack = buildNextPendingTouch({
    zone: homeTargetZone,
    previousTouch: {
      id: 'attack-plus-touch',
      playerId: 'home-p2',
      teamSide: 'home',
      skill: 'attack',
      evaluation: '+',
    },
    selectedPlayerId: 'away-p4',
    selectedTeamSide: 'away',
    scoutingMode: 'simple',
    teamPlayersBySide: tacticalPlayersBySide,
  });
  assertions += expectTruthy(simpleAttackAfterDefendedAttack, 'simple mode attack + lets operator choose the next attacker');
  if (simpleAttackAfterDefendedAttack) {
    assertions += expectEqual(simpleAttackAfterDefendedAttack.skill, 'attack', 'simple mode skips mandatory dig before the next attack');
    const simpleOptionalDig = updatePendingTouchSkill(simpleAttackAfterDefendedAttack, 'dig');
    assertions += expectEqual(simpleOptionalDig.skill, 'dig', 'simple mode still allows explicit optional dig');
    assertions += expectEqual(simpleOptionalDig.source, 'explicit', 'optional dig is recorded as explicit input');
  }

  const simpleMandatoryFreeballAfterAttack = buildNextPendingTouch({
    zone: targetZone,
    previousTouch: {
      id: 'attack-minus-touch',
      playerId: 'home-p2',
      teamSide: 'home',
      skill: 'attack',
      evaluation: '-',
    },
    scoutingMode: 'simple',
    teamPlayersBySide: tacticalPlayersBySide,
  });
  assertions += expectEqual(simpleMandatoryFreeballAfterAttack, null, 'simple mode does not require freeball after negative attack');

  const simpleAttackInsteadOfFreeball = buildNextPendingTouch({
    zone: homeTargetZone,
    previousTouch: {
      id: 'attack-minus-touch',
      playerId: 'home-p2',
      teamSide: 'home',
      skill: 'attack',
      evaluation: '-',
    },
    selectedPlayerId: 'away-p4',
    selectedTeamSide: 'away',
    scoutingMode: 'simple',
    teamPlayersBySide: tacticalPlayersBySide,
  });
  assertions += expectTruthy(simpleAttackInsteadOfFreeball, 'simple mode keeps freeball optional');
  if (simpleAttackInsteadOfFreeball) {
    assertions += expectEqual(simpleAttackInsteadOfFreeball.skill, 'attack', 'simple mode does not block flow on freeball');
    assertions += expectEqual(updatePendingTouchSkill(simpleAttackInsteadOfFreeball, 'freeball').skill, 'freeball', 'operator can still choose freeball explicitly');
  }

  const simpleMandatoryCoverAfterAttack = buildNextPendingTouch({
    zone: homeTargetZone,
    previousTouch: {
      id: 'attack-recovered-block-touch',
      playerId: 'home-p2',
      teamSide: 'home',
      skill: 'attack',
      evaluation: '!',
    },
    scoutingMode: 'simple',
    teamPlayersBySide: tacticalPlayersBySide,
  });
  assertions += expectEqual(simpleMandatoryCoverAfterAttack, null, 'simple mode does not require cover after recovered blocked attack');

  const simpleAttackInsteadOfCover = buildNextPendingTouch({
    zone: homeTargetZone,
    previousTouch: {
      id: 'attack-recovered-block-touch',
      playerId: 'home-p2',
      teamSide: 'home',
      skill: 'attack',
      evaluation: '!',
    },
    selectedPlayerId: 'home-p4',
    selectedTeamSide: 'home',
    scoutingMode: 'simple',
    teamPlayersBySide: tacticalPlayersBySide,
  });
  assertions += expectTruthy(simpleAttackInsteadOfCover, 'simple mode keeps cover optional');
  if (simpleAttackInsteadOfCover) {
    assertions += expectEqual(simpleAttackInsteadOfCover.skill, 'attack', 'simple mode does not block flow on cover');
    assertions += expectEqual(updatePendingTouchSkill(simpleAttackInsteadOfCover, 'cover').skill, 'cover', 'operator can still choose cover explicitly');
  }

  const inferredSetAfterReceive = buildNextPendingTouch({
    zone: targetZone,
    previousTouch: {
      id: 'receive-touch',
      playerId: 'away-p2',
      teamSide: 'away',
      skill: 'receive',
      evaluation: '+',
    },
    scoutingMode: 'simple',
    allowSecondaryInference: true,
    teamPlayersBySide: tacticalPlayersBySide,
  });
  assertions += expectTruthy(inferredSetAfterReceive, 'simple mode can opt into inferred set metadata after receive');
  if (inferredSetAfterReceive) {
    assertions += expectEqual(inferredSetAfterReceive.skill, 'set', 'set after receive infers set skill');
    assertions += expectEqual(inferredSetAfterReceive.playerId, 'away-p1', 'set after receive uses deterministic setter when inferred');
    assertions += expectEqual(inferredSetAfterReceive.source, 'inferred', 'set after receive is marked inferred');
    assertions += expectEqual(inferredSetAfterReceive.inferenceReason, 'setter_after_receive', 'set after receive stores reason');
    assertions += expectEqual(inferredSetAfterReceive.inferredFromTouchId, 'receive-touch', 'set after receive stores source touch id');
  }

  const inferredSetAfterDig = buildNextPendingTouch({
    zone: targetZone,
    previousTouch: {
      id: 'dig-touch',
      playerId: 'away-p2',
      teamSide: 'away',
      skill: 'dig',
      evaluation: '+',
    },
    scoutingMode: 'simple',
    allowSecondaryInference: true,
    teamPlayersBySide: {
      away: [],
      home: tacticalPlayersBySide.home,
    },
  });
  assertions += expectTruthy(inferredSetAfterDig, 'simple mode can opt into inferred set after dig even without deterministic setter');
  if (inferredSetAfterDig) {
    assertions += expectEqual(inferredSetAfterDig.skill, 'set', 'set after dig infers set skill');
    assertions += expectEqual(inferredSetAfterDig.playerId, undefined, 'set after dig does not invent setter player');
    assertions += expectEqual(inferredSetAfterDig.source, 'inferred', 'set after dig is marked inferred');
    assertions += expectEqual(inferredSetAfterDig.inferenceReason, 'setter_after_dig', 'set after dig stores reason');
  }

  const inferredDigTouch = buildNextPendingTouch({
    zone: targetZone,
    previousTouch: {
      id: 'attack-plus-touch',
      playerId: 'home-p2',
      teamSide: 'home',
      skill: 'attack',
      evaluation: '+',
    },
    scoutingMode: 'simple',
    allowSecondaryInference: true,
    teamPlayersBySide: tacticalPlayersBySide,
  });
  assertions += expectTruthy(inferredDigTouch, 'simple mode can opt into inferred dig after positive attack');
  if (inferredDigTouch) {
    assertions += expectEqual(inferredDigTouch.teamSide, 'away', 'dig after positive attack goes to opponent side');
    assertions += expectEqual(inferredDigTouch.skill, 'dig', 'dig after positive attack infers dig skill');
    assertions += expectEqual(inferredDigTouch.playerId, undefined, 'dig after positive attack does not guess defender');
    assertions += expectEqual(inferredDigTouch.source, 'inferred', 'dig after positive attack is marked inferred');
    assertions += expectEqual(inferredDigTouch.inferenceReason, 'dig_after_positive_attack', 'dig after positive attack stores reason');
  }

  const inferredFreeballTouch = buildNextPendingTouch({
    zone: targetZone,
    previousTouch: {
      id: 'attack-minus-touch',
      playerId: 'home-p2',
      teamSide: 'home',
      skill: 'attack',
      evaluation: '-',
    },
    scoutingMode: 'simple',
    allowSecondaryInference: true,
    teamPlayersBySide: tacticalPlayersBySide,
  });
  assertions += expectTruthy(inferredFreeballTouch, 'simple mode can opt into inferred freeball after negative attack');
  if (inferredFreeballTouch) {
    assertions += expectEqual(inferredFreeballTouch.skill, 'freeball', 'negative attack infers freeball skill');
    assertions += expectEqual(inferredFreeballTouch.playerId, undefined, 'freeball inference does not guess player');
    assertions += expectEqual(inferredFreeballTouch.inferenceReason, 'freeball_after_negative_attack', 'freeball inference stores reason');
  }

  const inferredCoverTouch = buildNextPendingTouch({
    zone: homeTargetZone,
    previousTouch: {
      id: 'attack-recovered-block-touch',
      playerId: 'home-p2',
      teamSide: 'home',
      skill: 'attack',
      evaluation: '!',
    },
    scoutingMode: 'simple',
    allowSecondaryInference: true,
    teamPlayersBySide: tacticalPlayersBySide,
  });
  assertions += expectTruthy(inferredCoverTouch, 'simple mode can opt into inferred cover after recovered blocked attack');
  if (inferredCoverTouch) {
    assertions += expectEqual(inferredCoverTouch.teamSide, 'home', 'cover after recovered block stays on attacking side');
    assertions += expectEqual(inferredCoverTouch.skill, 'cover', 'recovered blocked attack infers cover skill');
    assertions += expectEqual(inferredCoverTouch.playerId, undefined, 'cover inference does not guess cover player');
    assertions += expectEqual(inferredCoverTouch.inferenceReason, 'cover_after_recovered_block', 'cover inference stores reason');
  }

  const advancedSetAfterReceive = buildNextPendingTouch({
    zone: targetZone,
    previousTouch: {
      id: 'advanced-receive-touch',
      playerId: 'away-p2',
      teamSide: 'away',
      skill: 'receive',
      evaluation: '+',
    },
    scoutingMode: 'advanced',
    teamPlayersBySide: tacticalPlayersBySide,
  });
  assertions += expectEqual(advancedSetAfterReceive, null, 'advanced mode does not infer pending actions');

  const advancedExplicitSetAfterReceive = buildNextPendingTouch({
    zone: targetZone,
    previousTouch: {
      id: 'explicit-receive-touch',
      playerId: 'away-p2',
      teamSide: 'away',
      skill: 'receive',
      evaluation: '+',
    },
    selectedPlayerId: 'away-p1',
    selectedTeamSide: 'away',
    scoutingMode: 'advanced',
    teamPlayersBySide: tacticalPlayersBySide,
  });
  assertions += expectTruthy(advancedExplicitSetAfterReceive, 'advanced mode allows explicit set after receive');
  if (advancedExplicitSetAfterReceive) {
    assertions += expectEqual(advancedExplicitSetAfterReceive.skill, 'set', 'advanced explicit touch keeps set in the detailed flow');
    assertions += expectEqual(advancedExplicitSetAfterReceive.source, 'explicit', 'advanced explicit set is operator-entered');
  }

  const advancedExplicitDigAfterAttack = buildNextPendingTouch({
    zone: targetZone,
    previousTouch: {
      id: 'advanced-attack-plus-touch',
      playerId: 'home-p2',
      teamSide: 'home',
      skill: 'attack',
      evaluation: '+',
    },
    selectedPlayerId: 'away-p2',
    selectedTeamSide: 'away',
    scoutingMode: 'advanced',
    teamPlayersBySide: tacticalPlayersBySide,
  });
  assertions += expectEqual(advancedExplicitDigAfterAttack?.skill, 'dig', 'advanced mode keeps explicit dig after attack continuation');

  const advancedExplicitFreeballAfterAttack = buildNextPendingTouch({
    zone: targetZone,
    previousTouch: {
      id: 'advanced-attack-minus-touch',
      playerId: 'home-p2',
      teamSide: 'home',
      skill: 'attack',
      evaluation: '-',
    },
    selectedPlayerId: 'away-p2',
    selectedTeamSide: 'away',
    scoutingMode: 'advanced',
    teamPlayersBySide: tacticalPlayersBySide,
  });
  assertions += expectEqual(advancedExplicitFreeballAfterAttack?.skill, 'freeball', 'advanced mode keeps explicit freeball after negative attack');

  const advancedExplicitCoverAfterAttack = buildNextPendingTouch({
    zone: homeTargetZone,
    previousTouch: {
      id: 'advanced-attack-recovered-block-touch',
      playerId: 'home-p2',
      teamSide: 'home',
      skill: 'attack',
      evaluation: '!',
    },
    selectedPlayerId: 'home-p2',
    selectedTeamSide: 'home',
    scoutingMode: 'advanced',
    teamPlayersBySide: tacticalPlayersBySide,
  });
  assertions += expectEqual(advancedExplicitCoverAfterAttack?.skill, 'cover', 'advanced mode keeps explicit cover after recovered blocked attack');

  if (advancedExplicitSetAfterReceive) {
    assertions += expectEqual(advancedExplicitSetAfterReceive.inferenceReason, undefined, 'explicit operator touch clears inference reason');
  }

  if (inferredDigTouch) {
    const explicitOverride = updatePendingTouchSelection(inferredDigTouch, 'away-p2', 'away');
    assertions += expectEqual(explicitOverride.source, 'explicit', 'explicit player override invalidates inferred source');
    assertions += expectEqual(explicitOverride.inferenceReason, undefined, 'explicit player override clears inference reason');
    assertions += expectEqual(
      shouldReplaceLatestPendingTouch(
        pendingTouchToBallTouch(inferredDigTouch, 2),
        explicitOverride,
        1,
        1,
      ),
      true,
      'explicit override replaces latest inferred touch instead of duplicating it',
    );

    const explicitSkillOverride = updatePendingTouchSkill(inferredDigTouch, 'freeball');
    assertions += expectEqual(explicitSkillOverride.source, 'explicit', 'explicit skill override invalidates inferred source');
    assertions += expectEqual(explicitSkillOverride.inferenceReason, undefined, 'explicit skill override clears inference reason');
  }

  const inferredReplayTouch: BallTouch = {
    id: 'replayed-inferred-dig',
    setNumber: 1,
    rallyNumber: 1,
    sequenceNumber: 1,
    teamSide: 'away',
    skill: 'dig',
    evaluation: '+',
    createdAt: 3,
    source: 'inferred',
    inferenceReason: 'dig_after_positive_attack',
    inferredFromTouchId: 'attack-plus-touch',
  };
  const replayedInferredMatch = replayLiveMatchFromEvents('validation-project', [
    createSetStartedEvent('home'),
    createRallyStartedEvent(),
    {
      id: 'replayed-inferred-event',
      type: 'touch_recorded',
      createdAt: 3,
      touch: inferredReplayTouch,
    },
  ]);
  assertions += expectEqual(
    replayedInferredMatch?.currentRallyTouches[0]?.source,
    'inferred',
    'replay preserves inferred source metadata',
  );
  assertions += expectEqual(
    replayedInferredMatch?.currentRallyTouches[0]?.inferenceReason,
    'dig_after_positive_attack',
    'replay preserves inference reason metadata',
  );
  assertions += expectEqual(
    replayedInferredMatch?.currentRallyTouches[0]?.inferredFromTouchId,
    'attack-plus-touch',
    'replay preserves inferred source touch id',
  );
  const inferredStats = buildMatchStats({
    homeTeam: createTeam('home'),
    awayTeam: createTeam('away'),
    committedTouches: [inferredReplayTouch],
  });
  assertions += expectEqual(inferredStats.teamStats.away.dig.total, 1, 'stats include inferred touches without stripping them from input');

  const simpleAce = resolveLiveEvaluationAction({
    ...pendingTouch,
    evaluation: '#',
  });
  const advancedAce = resolveLiveEvaluationAction({
    ...pendingTouch,
    evaluation: '#',
  });
  assertions += expectEqual(simpleAce.kind, 'awaiting_ace_target', 'serve # works in simple mode');
  assertions += expectEqual(advancedAce.kind, 'awaiting_ace_target', 'serve # works in advanced mode');

  const activeRallyLiveMatch = createLiveMatch({
    isRallyActive: true,
  });
  activeRallyLiveMatch.currentRallyTouches = [
    createTouch({
      id: 'active-mode-switch-touch',
      teamSide: 'home',
      playerId: 'home-p1',
      skill: 'serve',
      evaluation: '+',
    }),
  ];
  useScoutingStore.setState({
    liveMatch: activeRallyLiveMatch,
    activeConfig: null,
  });
  const touchCountBeforeModeSwitch = useScoutingStore.getState().liveMatch?.currentRallyTouches.length ?? 0;
  assertions += expectEqual(
    useScoutingStore.getState().setScoutingMode('advanced'),
    false,
    'store blocks mode switching while rally is active',
  );
  assertions += expectEqual(
    useScoutingStore.getState().liveMatch?.scoutingMode,
    'simple',
    'blocked active-rally switch preserves mode',
  );
  assertions += expectEqual(
    useScoutingStore.getState().liveMatch?.currentRallyTouches.length,
    touchCountBeforeModeSwitch,
    'blocked active-rally switch does not duplicate touches',
  );

  useScoutingStore.setState({
    liveMatch: createLiveMatch({ isRallyActive: false }),
    activeConfig: null,
  });
  assertions += expectEqual(
    useScoutingStore.getState().setScoutingMode('advanced'),
    true,
    'store switches mode safely during dead ball',
  );
  assertions += expectEqual(
    useScoutingStore.getState().liveMatch?.scoutingMode,
    'advanced',
    'dead-ball mode switch updates live match state',
  );
  useScoutingStore.setState({ liveMatch: null, activeConfig: null });

  return assertions;
}

function validateAdvancedDataVolleyDetails(): number {
  let assertions = 0;
  const targetZone = getInCourtZone('away', 2, 4);
  const serveDetails: AdvancedTouchDetails['serve'] = {
    type: 'jump_float',
    startZone: '1',
    targetZone: '5',
    direction: '1-5',
  };
  const attackDetails: AdvancedTouchDetails['attack'] = {
    tempo: 'second_tempo',
    type: 'roll_shot',
    startZone: '4',
    targetZone: '1',
    direction: 'line',
    combination: 'X2',
  };
  const setDetails: AdvancedTouchDetails['set'] = {
    type: 'back',
    tempo: 'second_tempo',
    targetPlayerId: 'home-p4',
    targetZone: '2',
  };
  const blockDetails: AdvancedTouchDetails['block'] = {
    type: 'double',
    touched: true,
    outcome: 'rebound',
  };
  const freeballDetails: AdvancedTouchDetails['freeball'] = {
    targetZone: '6',
    quality: '+',
  };
  const coverDetails: AdvancedTouchDetails['cover'] = {
    coveredAttackTouchId: 'attack-with-cover',
    targetZone: '3',
    quality: '!',
  };

  assertions += expectTruthy(ADVANCED_SERVE_TYPES.includes('jump_float'), 'serve type constants include jump float');
  assertions += expectTruthy(ADVANCED_ATTACK_TEMPOS.includes('second_tempo'), 'attack tempo constants include second tempo');
  assertions += expectTruthy(ADVANCED_ATTACK_TYPES.includes('roll_shot'), 'attack type constants include roll shot');
  assertions += expectTruthy(ADVANCED_SET_TYPES.includes('second_ball'), 'set type constants include second ball');
  assertions += expectTruthy(ADVANCED_BLOCK_TYPES.includes('double'), 'block type constants include double block');
  assertions += expectTruthy(ADVANCED_BLOCK_OUTCOMES.includes('rebound'), 'block outcome constants include rebound');
  assertions += expectEqual(isValidServeType('jump_float'), true, 'serve type validator accepts configured values');
  assertions += expectEqual(isValidServeType('probable_float'), false, 'serve type validator rejects unknown values');
  assertions += expectEqual(isValidAttackTempo('second_tempo'), true, 'attack tempo validator accepts configured values');
  assertions += expectEqual(isValidAttackType('roll_shot'), true, 'attack type validator accepts configured values');
  assertions += expectEqual(isValidSetType('back'), true, 'set type validator accepts configured values');
  assertions += expectEqual(isValidBlockType('double'), true, 'block type validator accepts configured values');
  assertions += expectEqual(isValidBlockOutcome('rebound'), true, 'block outcome validator accepts configured values');

  const serveTouch: BallTouch = {
    ...createTouch({
      id: 'advanced-serve',
      teamSide: 'home',
      playerId: 'home-p1',
      skill: 'serve',
      evaluation: '+',
    }),
    advancedDetails: {
      serve: serveDetails,
    },
  };
  const attackTouch: BallTouch = {
    ...createTouch({
      id: 'advanced-attack',
      teamSide: 'home',
      playerId: 'home-p4',
      skill: 'attack',
      evaluation: '+',
      sequenceNumber: 2,
    }),
    advancedDetails: {
      attack: attackDetails,
    },
  };
  const setTouch: BallTouch = {
    ...createTouch({
      id: 'advanced-set',
      teamSide: 'home',
      playerId: 'home-p1',
      skill: 'set',
      evaluation: '+',
      sequenceNumber: 3,
    }),
    advancedDetails: {
      set: setDetails,
    },
  };
  const blockTouch: BallTouch = {
    ...createTouch({
      id: 'advanced-block',
      teamSide: 'away',
      playerId: 'away-p3',
      skill: 'block',
      evaluation: '+',
      sequenceNumber: 4,
    }),
    advancedDetails: {
      block: blockDetails,
    },
  };
  const freeballTouch: BallTouch = {
    ...createTouch({
      id: 'advanced-freeball',
      teamSide: 'away',
      playerId: 'away-p6',
      skill: 'freeball',
      evaluation: '+',
      sequenceNumber: 5,
    }),
    advancedDetails: {
      freeball: freeballDetails,
    },
  };
  const coverTouch: BallTouch = {
    ...createTouch({
      id: 'advanced-cover',
      teamSide: 'home',
      playerId: 'home-p5',
      skill: 'cover',
      evaluation: '!',
      sequenceNumber: 6,
    }),
    advancedDetails: {
      cover: coverDetails,
    },
  };
  const legacyTouch = createTouch({
    id: 'legacy-touch-without-advanced-details',
    teamSide: 'home',
    playerId: 'home-p2',
    skill: 'receive',
    evaluation: '+',
    sequenceNumber: 7,
  });

  assertions += expectDeepEqual(serveTouch.advancedDetails?.serve, serveDetails, 'touch stores serve details');
  assertions += expectDeepEqual(attackTouch.advancedDetails?.attack, attackDetails, 'touch stores attack details');
  assertions += expectDeepEqual(setTouch.advancedDetails?.set, setDetails, 'touch stores set details');
  assertions += expectDeepEqual(blockTouch.advancedDetails?.block, blockDetails, 'touch stores block details');
  assertions += expectDeepEqual(freeballTouch.advancedDetails?.freeball, freeballDetails, 'touch stores freeball details');
  assertions += expectDeepEqual(coverTouch.advancedDetails?.cover, coverDetails, 'touch stores cover details');
  assertions += expectEqual(legacyTouch.advancedDetails, undefined, 'old touch without advanced details remains valid');

  const simplePendingTouch = buildPendingTouchForZone({
    zone: targetZone,
    previousTouch: null,
    servingTeam: 'home',
    servingPlayerId: 'home-p1',
    scoutingMode: 'simple',
  });
  assertions += expectTruthy(simplePendingTouch, 'simple mode still builds touches without advanced details');
  assertions += expectEqual(simplePendingTouch?.advancedDetails, undefined, 'simple mode does not require advanced details');

  const advancedPendingTouch = buildPendingTouchForZone({
    zone: targetZone,
    previousTouch: null,
    servingTeam: 'home',
    servingPlayerId: 'home-p1',
    scoutingMode: 'advanced',
  });
  assertions += expectTruthy(advancedPendingTouch, 'advanced mode builds pending touches');
  if (advancedPendingTouch) {
    const advancedPendingWithDetails = {
      ...advancedPendingTouch,
      advancedDetails: {
        serve: serveDetails,
      },
    };
    assertions += expectDeepEqual(
      updatePendingTouchEvaluation(advancedPendingWithDetails, '+').advancedDetails,
      advancedPendingWithDetails.advancedDetails,
      'advanced mode pending flow preserves advanced details',
    );
    assertions += expectDeepEqual(
      updatePendingTouchSkill(advancedPendingWithDetails, 'serve').advancedDetails,
      advancedPendingWithDetails.advancedDetails,
      'skill updates do not discard advanced details',
    );
  }

  const touchEvent = buildTouchRecordedEvent(attackTouch) as Extract<MatchEvent, { type: 'touch_recorded' }>;
  assertions += expectDeepEqual(touchEvent.touch.advancedDetails, attackTouch.advancedDetails, 'touch recorded event preserves advanced details');

  const serializedEvent = JSON.parse(JSON.stringify(touchEvent)) as MatchEvent;
  assertions += expectDeepEqual(
    (serializedEvent.type === 'touch_recorded' ? serializedEvent.touch.advancedDetails : undefined),
    attackTouch.advancedDetails,
    'session JSON serialization preserves advanced details',
  );

  const replayedMatch = replayLiveMatchFromEvents('validation-project', [
    createSetStartedEvent('home'),
    createRallyStartedEvent(),
    serializedEvent,
  ]);
  assertions += expectDeepEqual(
    replayedMatch?.currentRallyTouches[0]?.advancedDetails,
    attackTouch.advancedDetails,
    'replay preserves advanced details',
  );

  if (replayedMatch) {
    const sessionSnapshot = createScoutingSessionSnapshot(replayedMatch);
    assertions += expectDeepEqual(
      sessionSnapshot.currentRallyTouches[0]?.advancedDetails,
      attackTouch.advancedDetails,
      'session snapshot preserves advanced details',
    );

    const restoredProject = normalizeMatchProject({
      ...createValidationProject(),
      events: replayedMatch.eventLog,
      scoutingSession: sessionSnapshot,
    });
    assertions += expectDeepEqual(
      createLiveMatchStateFromProject(restoredProject)?.currentRallyTouches[0]?.advancedDetails,
      attackTouch.advancedDetails,
      'project session restore preserves advanced details',
    );

    const illegalFrontRowLiberoLineup = {
      ...createLineup('home', true),
      slots: createLineup('home', true).slots.map((slot) => (
        slot.courtPosition === 4
          ? { ...slot, playerId: 'home-libero', isLibero: true, replacedPlayerId: 'home-p4' }
          : slot
      )),
      personnelState: {
        ...createLineup('home', true).personnelState,
        activeLiberoState: {
          liberoPlayerId: 'home-libero',
          replacedPlayerId: 'home-p4',
          teamSide: 'home' as const,
          enteredAtRallyNumber: 1,
        },
        onCourtPlayerIds: createLineup('home', true).personnelState.onCourtPlayerIds.map((playerId) => (
          playerId === 'home-p4' ? 'home-libero' : playerId
        )),
      },
    };
    const brokenProject = normalizeMatchProject({
      ...createValidationProject(),
      events: [],
      scoutingSession: {
        ...sessionSnapshot,
        homeActiveLineup: illegalFrontRowLiberoLineup,
      },
    });
    const repairedMatch = createLiveMatchStateFromProject(brokenProject);
    assertions += expectEqual(
      repairedMatch?.homeActiveLineup?.personnelState.activeLiberoState,
      undefined,
      'fallback restore repairs illegal front-row libero state',
    );
    assertions += expectEqual(
      repairedMatch?.homeActiveLineup?.slots.find((slot) => slot.courtPosition === 4)?.playerId,
      'home-p4',
      'fallback restore returns replaced regular player for front-row libero slot',
    );
  }

  const advancedStats = buildMatchStats({
    homeTeam: createTeam('home'),
    awayTeam: createTeam('away'),
    committedTouches: [serveTouch, attackTouch, setTouch, blockTouch, freeballTouch, coverTouch, legacyTouch],
  });
  assertions += expectEqual(advancedStats.teamStats.home.attack.total, 1, 'stats still count advanced attack touch normally');
  assertions += expectEqual(advancedStats.teamStats.home.serve.total, 1, 'stats still count advanced serve touch normally');
  assertions += expectDeepEqual(attackTouch.advancedDetails?.attack, attackDetails, 'stats do not strip advanced details from source touch');

  assertions += expectEqual(
    buildDataVolleyTouchCode({ touch: serveTouch, jerseyNumber: 1 }),
    '*1Sjump_float1-5+',
    'DataVolley export can read advanced serve details',
  );
  assertions += expectEqual(
    buildDataVolleyTouchCode({ touch: attackTouch, jerseyNumber: 4 }),
    '*4Aroll_shotline+',
    'DataVolley export can read advanced attack details',
  );

  return assertions;
}

function validateBallTrajectories(): number {
  let assertions = 0;
  const serveStartZone = getServeStartZone('home', 'left');
  const targetZone = getInCourtZone('away', 2, 4);
  const outsideEndlinePoint = { x: 4, y: targetZone.center.y };
  const outsideSidelinePoint = { x: targetZone.center.x, y: 4 };
  const noisyDragPoints = Array.from({ length: 80 }, (_, index) => ({
    x: 12 + index * 0.9,
    y: 52 + Math.sin(index / 3) * 0.35,
    timestamp: index,
  }));
  const simplifiedDragPoints = simplifyBallTrajectoryPoints(noisyDragPoints);
  const outsideDirection = createBallDirection({
    start: serveStartZone.center,
    end: outsideSidelinePoint,
    courtZoneStart: serveStartZone.id,
    courtZoneEnd: targetZone.id,
  });
  const outsideTrajectory = createBallTrajectory({
    id: 'outside-serve-trajectory',
    teamSide: 'home',
    skill: 'serve',
    evaluation: '+',
    direction: outsideDirection,
  });
  const dragStartPoint = { x: 24, y: 46 };
  const dragMovePoint = { x: 58, y: 42 };
  const dragReleasePoint = { x: 82, y: 8 };
  const nextDragStartPoint = { x: 34, y: 62 };
  const stageRect = { left: 100, top: 40, width: 500, height: 250 };
  const renderedBallRect = { left: 210, top: 130, width: 40, height: 40 };
  const stageElement = {
    getBoundingClientRect: () => stageRect,
  };
  const renderedBallCenter = clientPointToStagePoint({
    clientX: renderedBallRect.left + renderedBallRect.width / 2,
    clientY: renderedBallRect.top + renderedBallRect.height / 2,
  }, stageElement);
  const offStagePointer = clientPointToStagePoint({ clientX: 720, clientY: -30 }, stageElement);
  const inStagePointer = clientPointToStagePoint({ clientX: 350, clientY: 165 }, stageElement);
  const zeroStagePoint = clientPointToStagePoint({
    clientX: 500,
    clientY: 500,
  }, {
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0 }),
  });
  const dragStartDirection = startBallDragDirection(dragStartPoint);
  const renderedCenterDirection = startBallDragDirection(renderedBallCenter);
  const dragMoveDirection = updateBallDragDirectionEnd(dragStartDirection, dragMovePoint);
  const dragReleaseDirection = updateBallDragDirectionEnd(dragMoveDirection, dragReleasePoint);
  const nextDragDirection = startBallDragDirection(nextDragStartPoint);
  const multiPointTrajectory = {
    id: 'multi-point-render-trajectory',
    teamSide: 'home' as TeamSide,
    skill: 'serve' as SkillType,
    points: [
      { x: 10, y: 20, timestamp: 1 },
      { x: 77, y: 88, timestamp: 2 },
      { x: 30, y: 40, timestamp: 3 },
    ],
  } as unknown as BallTrajectory;
  const outsideReleaseTrajectory = {
    id: 'outside-release-render-trajectory',
    teamSide: 'home' as TeamSide,
    skill: 'serve' as SkillType,
    points: [
      { ...serveStartZone.center, timestamp: 1 },
      { ...outsideEndlinePoint, timestamp: 2 },
    ],
  } as unknown as BallTrajectory;

  assertions += expectTruthy(isPointOutsideScoutingCourt(outsideEndlinePoint), 'outside endline point is outside court bounds');
  assertions += expectTruthy(isPointOutsideScoutingCourt(outsideSidelinePoint), 'outside sideline point is outside court bounds');
  assertions += expectTruthy(outsideTrajectory, 'trajectory can be created with outside-court direction data');
  assertions += expectDeepEqual(
    dragStartDirection.start,
    dragStartPoint,
    'active drag direction starts where the ball was picked up',
  );
  assertions += expectPointClose(
    renderedBallCenter,
    { x: 26, y: 44 },
    'rendered ball center is converted to SVG stage coordinates',
  );
  assertions += expectDeepEqual(
    renderedCenterDirection.start,
    renderedBallCenter,
    'direction start equals rendered ball center',
  );
  assertions += expectFalse(
    renderedCenterDirection.start.x === renderedBallRect.left || renderedCenterDirection.start.y === renderedBallRect.top,
    'direction start does not use client coordinates',
  );
  assertions += expectPointClose(
    inStagePointer,
    { x: 50, y: 50 },
    'pointer move is converted to stage coordinates',
  );
  assertions += expectPointClose(
    offStagePointer,
    { x: 100, y: 0 },
    'drag pointer coordinates are clamped inside stage bounds',
  );
  assertions += expectPointClose(zeroStagePoint, { x: 0, y: 0 }, 'zero-size stage rect falls back to stage origin');
  assertions += expectDeepEqual(stagePointToSvgPoint(inStagePointer), inStagePointer, 'SVG point conversion is identity for a 0..100 viewBox');
  assertions += expectTruthy(assertValidStagePoint(renderedBallCenter, 'validation-rendered-ball-center'), 'rendered ball center is a valid stage point');
  assertions += expectTruthy(isValidStagePoint(offStagePointer), 'clamped off-stage pointer remains a valid stage point');
  assertions += expectFalse(isValidStagePoint({ x: Number.POSITIVE_INFINITY, y: 50 }), 'non-finite stage point is rejected');
  assertions += expectDeepEqual(
    dragStartDirection.end,
    dragStartPoint,
    'active drag direction initializes end at the pickup point',
  );
  assertions += expectDeepEqual(
    dragMoveDirection.start,
    dragStartDirection.start,
    'drag move keeps direction start fixed',
  );
  assertions += expectDeepEqual(
    dragMoveDirection.end,
    dragMovePoint,
    'drag move updates only the active direction end',
  );
  assertions += expectDeepEqual(
    dragReleaseDirection.end,
    dragReleasePoint,
    'drag release freezes direction end at the release point',
  );
  assertions += expectDeepEqual(
    [dragReleaseDirection.start, dragReleaseDirection.end],
    [dragStartDirection.start, dragReleaseDirection.end],
    'pending arrow persists after drag end as start and release points',
  );
  assertions += expectDeepEqual(
    [nextDragDirection.start, nextDragDirection.end],
    [nextDragStartPoint, nextDragStartPoint],
    'next drag replaces the previous pending arrow',
  );
  assertions += expectDeepEqual(
    getBallDirectionForTrajectory(multiPointTrajectory),
    createBallDirection({
      start: multiPointTrajectory.points![0],
      end: multiPointTrajectory.points![2],
    }),
    'old trajectory first and last points convert to canonical direction',
  );
  assertions += expectEqual(
    createBallTrajectorySvgPath(multiPointTrajectory),
    'M 10 20 L 30 40',
    'trajectory rendering uses one straight SVG line command from canonical direction',
  );
  assertions += expectDeepEqual(
    getBallTrajectorySvgLine(multiPointTrajectory),
    { x1: 10, y1: 20, x2: 30, y2: 40 },
    'SVG arrow uses start and end in stage coordinates',
  );
  assertions += expectFalse(
    createBallTrajectorySvgPath(multiPointTrajectory).includes('Q'),
    'trajectory rendering does not use curved path commands',
  );
  assertions += expectFalse(
    createBallTrajectorySvgPath(multiPointTrajectory).includes('77 88'),
    'trajectory rendering does not draw intermediate legacy points',
  );
  assertions += expectFalse(
    getBallTrajectorySvgLine(multiPointTrajectory)?.x1 === renderedBallRect.left,
    'SVG arrow does not use client pixel coordinates',
  );
  assertions += expectEqual(
    getBallTrajectoryVisualStyle(multiPointTrajectory).dashArray,
    '6 5',
    'trajectory rendering uses a dashed stroke by default',
  );
  assertions += expectTruthy(
    isPointOutsideScoutingCourt(getBallTrajectoryRenderPoints(outsideReleaseTrajectory)[1]),
    'trajectory rendering preserves outside-court release coordinates',
  );
  assertions += expectEqual(
    getBallTrajectoryOutsideCourtPoints(outsideTrajectory!).length,
    2,
    'trajectory tracks outside-court start/end without clipping to court bounds',
  );
  assertions += expectTruthy(isValidStagePoint(outsideTrajectory!.direction.end), 'outside-court direction end remains inside stage bounds');
  assertions += expectTruthy(
    simplifiedDragPoints.length <= BALL_TRAJECTORY_MAX_POINTS,
    'legacy drag trajectory simplification caps noisy point history',
  );
  assertions += expectDeepEqual(
    simplifiedDragPoints[0],
    noisyDragPoints[0],
    'legacy drag simplification keeps the start point',
  );
  assertions += expectDeepEqual(
    simplifiedDragPoints.at(-1),
    noisyDragPoints.at(-1),
    'legacy drag simplification keeps the end point',
  );

  const trajectoryWithTouchId = updateBallTrajectoryMetadata(outsideTrajectory!, {
    rallyTouchId: 'trajectory-touch',
    skill: 'attack',
    evaluation: '#',
  });
  assertions += expectEqual(trajectoryWithTouchId.rallyTouchId, 'trajectory-touch', 'trajectory metadata stores rally touch id');
  assertions += expectEqual(trajectoryWithTouchId.skill, 'attack', 'trajectory metadata can update skill');

  const trajectoryTouch: BallTouch = {
    ...createTouch({
      id: 'trajectory-touch',
      teamSide: 'home',
      playerId: 'home-p1',
      skill: 'serve',
      evaluation: '+',
    }),
    zone: createValidationZoneReference(targetZone, outsideSidelinePoint),
    originZone: createValidationZoneReference(serveStartZone),
    targetZone: createValidationZoneReference(targetZone, outsideSidelinePoint),
    ballDirection: outsideDirection,
    trajectory: outsideTrajectory!,
  };
  const trajectoryEvent = buildTouchRecordedEvent(trajectoryTouch) as Extract<MatchEvent, { type: 'touch_recorded' }>;
  const serializedTrajectoryEvent = JSON.parse(JSON.stringify(trajectoryEvent)) as MatchEvent;
  const serializedExpectedTrajectory = updateBallTrajectoryMetadata(outsideTrajectory!, {
    rallyTouchId: 'trajectory-touch',
    teamSide: 'home',
    skill: 'serve',
    evaluation: '+',
  });
  assertions += expectDeepEqual(
    serializedTrajectoryEvent.type === 'touch_recorded' ? serializedTrajectoryEvent.touch.trajectory : undefined,
    serializedExpectedTrajectory,
    'touch event JSON serialization preserves trajectory data',
  );
  assertions += expectDeepEqual(
    serializedTrajectoryEvent.type === 'touch_recorded' ? serializedTrajectoryEvent.touch.ballDirection : undefined,
    outsideDirection,
    'touch event JSON serialization preserves canonical direction data',
  );

  const replayedTrajectoryMatch = replayLiveMatchFromEvents('validation-project', [
    createSetStartedEvent('home'),
    createRallyStartedEvent(),
    serializedTrajectoryEvent,
  ]);
  assertions += expectDeepEqual(
    replayedTrajectoryMatch?.currentRallyTouches[0]?.trajectory,
    serializedExpectedTrajectory,
    'replay preserves touch trajectory data',
  );
  assertions += expectDeepEqual(
    replayedTrajectoryMatch?.currentRallyTouches[0]?.ballDirection,
    outsideDirection,
    'replay preserves canonical touch direction data',
  );

  const attackDirection = createBallDirection({
    start: { x: 42, y: 44 },
    end: { x: 76, y: 28 },
    courtZoneEnd: targetZone.id,
  });
  const attackTouch: BallTouch = {
    ...createTouch({
      id: 'attack-direction-touch',
      teamSide: 'home',
      playerId: 'home-p4',
      skill: 'attack',
      evaluation: '#',
    }),
    zone: createValidationZoneReference(targetZone, attackDirection.end),
    targetZone: createValidationZoneReference(targetZone, attackDirection.end),
    ballDirection: attackDirection,
  };
  const replayedAttackDirectionMatch = replayLiveMatchFromEvents('validation-project', [
    createSetStartedEvent('home'),
    createRallyStartedEvent(),
    buildTouchRecordedEvent(attackTouch),
  ]);
  assertions += expectDeepEqual(
    replayedAttackDirectionMatch?.currentRallyTouches[0]?.ballDirection,
    attackDirection,
    'attack touch direction is preserved for future heatmaps',
  );

  const legacyTouchWithoutTrajectory: BallTouch = {
    ...createTouch({
      id: 'legacy-without-trajectory',
      teamSide: 'home',
      playerId: 'home-p1',
      skill: 'serve',
      evaluation: '+',
    }),
    zone: createValidationZoneReference(targetZone),
    originZone: createValidationZoneReference(serveStartZone),
    targetZone: createValidationZoneReference(targetZone),
  };
  const legacyReplay = replayLiveMatchFromEvents('validation-project', [
    createSetStartedEvent('home'),
    createRallyStartedEvent(),
    buildTouchRecordedEvent(legacyTouchWithoutTrajectory),
  ]);
  assertions += expectTruthy(legacyReplay, 'old replay without trajectories still loads');
  assertions += expectEqual(
    legacyReplay?.currentRallyTouches[0]?.trajectory,
    undefined,
    'old replay touch remains valid without trajectory property',
  );

  const reconstructedTrajectories = getBallTrajectoriesForTouches([legacyTouchWithoutTrajectory]);
  assertions += expectEqual(reconstructedTrajectories.length, 1, 'missing trajectory can be reconstructed from touch zones');
  assertions += expectEqual(reconstructedTrajectories[0]?.inferred, true, 'reconstructed trajectory is marked inferred');
  assertions += expectDeepEqual(
    reconstructedTrajectories[0]?.direction.end,
    targetZone.center,
    'reconstructed trajectory ends at the target point',
  );

  const trajectoryPhases = getNextTeamTacticalPhasesAfterTouch({
    phases: getInitialTeamTacticalPhases('home'),
    touch: trajectoryTouch,
    servingTeam: 'home',
  });
  const baselinePhases = getNextTeamTacticalPhasesAfterTouch({
    phases: getInitialTeamTacticalPhases('home'),
    touch: {
      ...trajectoryTouch,
      trajectory: undefined,
    },
    servingTeam: 'home',
  });
  assertions += expectDeepEqual(
    trajectoryPhases,
    baselinePhases,
    'trajectory metadata does not affect tactical transitions',
  );

  const servePendingTouch = buildPendingTouchForZone({
    zone: targetZone,
    previousTouch: null,
    servingTeam: 'home',
    servingPlayerId: 'home-p1',
  });
  assertions += expectTruthy(servePendingTouch, 'trajectory ace test builds serve touch');
  if (servePendingTouch) {
    const aceTrajectory = createBallTrajectory({
      id: 'ace-trajectory',
      teamSide: 'home',
      skill: 'serve',
      evaluation: '#',
      direction: {
        start: serveStartZone.center,
        end: targetZone.center,
      },
    });
    const aceSelection = resolveEvaluationFlow({
      ...servePendingTouch,
      ballDirection: aceTrajectory?.direction,
      trajectory: aceTrajectory ?? undefined,
      evaluation: '#',
    });
    if (aceSelection.kind === 'awaiting_ace_target') {
      const resolvedAce = resolveAceVictimFlow({
        selection: aceSelection.selection,
        playerId: 'away-p5',
        teamSide: 'away',
      });
      assertions += expectDeepEqual(
        resolvedAce?.touches[0]?.trajectory,
        aceTrajectory,
        'serve ace flow preserves serve trajectory while adding victim touch',
      );
    } else {
      throw new Error('trajectory ace test expected ace victim selection');
    }
  }

  return assertions;
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
  const awayTeam = createTeam('away', true);
  const homeLineup = createLineup('home', true);
  const awayLineup = createLineup('away', true);
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
  const homeLeftMarkers = resolveTacticalCourtPlayers({
    teamSide: 'home',
    team: homeTeam,
    lineup: homeLineup,
    phase: 'break_point_defense',
    defenseSystemBlock: DEFAULT_DEFENSE_SYSTEM_BLOCK,
    receptionSystemBlock: DEFAULT_RECEPTION_SYSTEM_BLOCK,
    displaySide: 'left',
  });
  const homeRightMarkers = resolveTacticalCourtPlayers({
    teamSide: 'home',
    team: homeTeam,
    lineup: homeLineup,
    phase: 'break_point_defense',
    defenseSystemBlock: DEFAULT_DEFENSE_SYSTEM_BLOCK,
    receptionSystemBlock: DEFAULT_RECEPTION_SYSTEM_BLOCK,
    displaySide: 'right',
  });
  const awayLeftMarkers = resolveTacticalCourtPlayers({
    teamSide: 'away',
    team: awayTeam,
    lineup: awayLineup,
    phase: 'side_out_defense',
    defenseSystemBlock: DEFAULT_DEFENSE_SYSTEM_BLOCK,
    receptionSystemBlock: DEFAULT_RECEPTION_SYSTEM_BLOCK,
    displaySide: 'left',
  });
  const awayRightMarkers = resolveTacticalCourtPlayers({
    teamSide: 'away',
    team: awayTeam,
    lineup: awayLineup,
    phase: 'side_out_defense',
    defenseSystemBlock: DEFAULT_DEFENSE_SYSTEM_BLOCK,
    receptionSystemBlock: DEFAULT_RECEPTION_SYSTEM_BLOCK,
    displaySide: 'right',
  });
  const homeReleasedMarkers = resolveTacticalCourtPlayers({
    teamSide: 'home',
    team: homeTeam,
    lineup: homeLineup,
    phase: 'break_point_setter_release',
    defenseSystemBlock: DEFAULT_DEFENSE_SYSTEM_BLOCK,
    receptionSystemBlock: DEFAULT_RECEPTION_SYSTEM_BLOCK,
    displaySide: 'right',
  });
  const awayReleasedMarkers = resolveTacticalCourtPlayers({
    teamSide: 'away',
    team: awayTeam,
    lineup: awayLineup,
    phase: 'after_reception_setter_release',
    defenseSystemBlock: DEFAULT_DEFENSE_SYSTEM_BLOCK,
    receptionSystemBlock: DEFAULT_RECEPTION_SYSTEM_BLOCK,
    displaySide: 'left',
  });
  const homeLeftSetter = getSetter(homeLeftMarkers);
  const homeRightSetter = getSetter(homeRightMarkers);
  const homeDefenseSetter = getSetter(homeRightMarkers);
  const homeReleasedSetter = getSetter(homeReleasedMarkers);
  const awayDefenseSetter = getSetter(awayLeftMarkers);
  const awayReleasedSetter = getSetter(awayReleasedMarkers);
  const createSharedIdentityTeam = (teamSide: TeamSide): Team => ({
    ...createTeam(teamSide),
    players: COURT_POSITIONS.map((courtPosition) => ({
      ...createPlayer(`shared-p${courtPosition}`, courtPosition),
      playerCode: String(courtPosition).padStart(2, '0'),
    })),
  });
  const createSharedIdentityLineup = (teamSide: TeamSide): ActiveLineup => createActiveLineup({
    ...createStartingLineup(teamSide),
    setterPlayerId: 'shared-p1',
    slots: COURT_POSITIONS.map((courtPosition) => ({
      courtPosition,
      playerId: `shared-p${courtPosition}`,
      tacticalRole: ROLE_BY_POSITION[courtPosition],
    })),
  });
  const sharedHomeMarkers = resolveTacticalCourtPlayers({
    teamSide: 'home',
    team: createSharedIdentityTeam('home'),
    lineup: createSharedIdentityLineup('home'),
    phase: 'break_point_defense',
    defenseSystemBlock: DEFAULT_DEFENSE_SYSTEM_BLOCK,
    receptionSystemBlock: DEFAULT_RECEPTION_SYSTEM_BLOCK,
    displaySide: 'left',
  });
  const sharedAwayMarkers = resolveTacticalCourtPlayers({
    teamSide: 'away',
    team: createSharedIdentityTeam('away'),
    lineup: createSharedIdentityLineup('away'),
    phase: 'side_out_defense',
    defenseSystemBlock: DEFAULT_DEFENSE_SYSTEM_BLOCK,
    receptionSystemBlock: DEFAULT_RECEPTION_SYSTEM_BLOCK,
    displaySide: 'right',
  });

  assertions += expectTruthy(homeServer, 'serve resolver renders server');
  assertions += expectPointClose(
    homeServer!,
    { x: serveStartZone.center.x + 3.2, y: serveStartZone.center.y },
    'serve resolver moves server to serve-start zone',
  );
  assertions += expectEqual(receptionMarkers.length, 6, 'reception resolver renders six markers');
  assertions += expectTacticalMarkerInvariant(servingMarkers, 'serving resolver');
  assertions += expectTacticalMarkerInvariant(receptionMarkers, 'reception resolver');
  assertions += expectTacticalMarkerInvariant(sideOutMarkers, 'side-out resolver');
  assertions += expectTacticalMarkerInvariant(breakPointMarkers, 'break-point resolver');
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
  assertions += expectTacticalMarkerInvariant(liberoMarkers, 'active libero resolver');
  assertions += expectDeepEqual(
    [liberoMarkers.length, receptionMarkers.length],
    [6, 6],
    'live court keeps a 6+6 visual count when a libero replaces one player',
  );
  assertions += expectEqual(liberoMarker?.isLibero, true, 'resolver marks active libero');
  assertions += expectEqual(liberoMarker?.replacedPlayerId, 'home-p5', 'resolver tracks replaced player');
  assertions += expectFalse(
    liberoMarkers.some((player) => player.playerId === 'home-p5'),
    'resolver hides player replaced by active libero',
  );
  assertions += expectFalse(
    liberoMarkers.some((player) => player.isLibero && ([2, 3, 4] as CourtPosition[]).includes(player.courtPosition)),
    'resolver does not render libero front-row',
  );
  assertions += expectTacticalMarkerInvariant(homeLeftMarkers, 'home left display resolver');
  assertions += expectTacticalMarkerInvariant(awayRightMarkers, 'away right display resolver');
  assertions += expectMarkersOnDisplaySide(homeLeftMarkers, 'left', 'home left display resolver');
  assertions += expectMarkersOnDisplaySide(awayRightMarkers, 'right', 'away right display resolver');
  assertions += expectTacticalMarkerInvariant(homeRightMarkers, 'home right display resolver');
  assertions += expectTacticalMarkerInvariant(awayLeftMarkers, 'away left display resolver');
  assertions += expectMarkersOnDisplaySide(homeRightMarkers, 'right', 'home right display resolver');
  assertions += expectMarkersOnDisplaySide(awayLeftMarkers, 'left', 'away left display resolver');
  assertions += expectFalse(
    homeLeftSetter.x === homeRightSetter.x && homeLeftSetter.y === homeRightSetter.y,
    'side inversion recomputes home setter coordinates',
  );
  assertions += expectClose(homeLeftSetter.x + homeRightSetter.x, 100, 'side inversion mirrors home setter x');
  assertions += expectClose(homeLeftSetter.y + homeRightSetter.y, 100, 'side inversion mirrors home setter y');
  assertions += expectEqual(homeDefenseSetter.id, homeReleasedSetter.id, 'home tactical phase keeps setter marker key stable');
  assertions += expectFalse(
    homeDefenseSetter.x === homeReleasedSetter.x && homeDefenseSetter.y === homeReleasedSetter.y,
    'home tactical phase updates marker coordinates for animation',
  );
  assertions += expectEqual(awayDefenseSetter.id, awayReleasedSetter.id, 'away tactical phase keeps setter marker key stable');
  assertions += expectFalse(
    awayDefenseSetter.x === awayReleasedSetter.x && awayDefenseSetter.y === awayReleasedSetter.y,
    'away tactical phase updates marker coordinates for animation',
  );
  assertions += expectTacticalMarkerInvariant(sharedHomeMarkers, 'home duplicate-id resolver');
  assertions += expectTacticalMarkerInvariant(sharedAwayMarkers, 'away duplicate-id resolver');
  assertions += expectEqual(
    new Set([...sharedHomeMarkers, ...sharedAwayMarkers].map((marker) => marker.playerId)).size,
    6,
    'duplicate raw player ids across teams exist in validation fixture',
  );
  assertions += expectEqual(
    new Set([
      ...sharedHomeMarkers.map((marker) => getTeamScopedPlayerKey('home', marker.playerId)),
      ...sharedAwayMarkers.map((marker) => getTeamScopedPlayerKey('away', marker.playerId)),
    ]).size,
    12,
    'team-scoped player identities keep duplicate player ids distinct across teams',
  );
  assertions += expectTruthy(
    sharedHomeMarkers.every((marker) => marker.id.startsWith('home:'))
      && sharedAwayMarkers.every((marker) => marker.id.startsWith('away:')),
    'tactical marker ids are team-scoped for React identity',
  );

  return assertions;
}

function pendingTouchToBallTouch(
  touch: ReturnType<typeof useLiveTouchFlowStore.getState>['committedTouches'][number],
  sequenceNumber: number,
): BallTouch {
  return {
    id: touch.id ?? `flow-touch-${sequenceNumber}`,
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
      point: touch.destinationPoint ?? touch.zone.center,
    },
    createdAt: sequenceNumber,
    source: touch.source,
    touchOrigin: touch.touchOrigin,
    ballDirection: touch.ballDirection,
    trajectory: touch.trajectory,
    advancedDetails: touch.advancedDetails,
    requiredExplicitInput: touch.requiredExplicitInput,
    inferredCandidate: touch.inferredCandidate,
    pendingInference: touch.pendingInference,
    inferenceReason: touch.inferenceReason,
    inferredFromTouchId: touch.inferredFromTouchId,
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

function validateReceptionDrivenServeWorkflow(): number {
  let assertions = 0;
  const targetZone = getInCourtZone('away', 2, 4);
  const homeTargetZone = getInCourtZone('home', 2, 4);
  const destinationPoint = { x: 34, y: 31 };
  const serveStartZone = getServeStartZone('home', 'left');
  const serveDirection = createBallDirection({
    start: serveStartZone.center,
    end: destinationPoint,
  });
  const serveTrajectory = createBallTrajectory({
    id: 'reception-driven-serve-trajectory',
    teamSide: 'home',
    skill: 'serve',
    evaluation: '-',
    direction: serveDirection,
  });
  const teamPlayersBySide = {
    home: [
      createTacticalPlayerMarker({ teamSide: 'home', playerNumber: 1, x: 10, y: 86 }),
      createTacticalPlayerMarker({ teamSide: 'home', playerNumber: 2, x: destinationPoint.x, y: destinationPoint.y }),
    ],
    away: [
      createTacticalPlayerMarker({ teamSide: 'away', playerNumber: 5, x: 35, y: 32 }),
      createTacticalPlayerMarker({ teamSide: 'away', playerNumber: 6, x: 70, y: 42 }),
      createTacticalPlayerMarker({ teamSide: 'away', playerNumber: 1, x: 54, y: 20 }),
    ],
  };

  assertions += expectDeepEqual(
    RECEIVE_TO_SERVE_EVALUATION,
    {
      '=': '#',
      '/': '/',
      '-': '+',
      '!': '!',
      '+': '-',
      '#': '-',
    },
    'reception-to-serve mapping is deterministic',
  );

  const nearestReceiver = findNearestReceivingPlayer({
    destinationPoint,
    receivingTeam: 'away',
    teamPlayersBySide,
  });
  assertions += expectEqual(nearestReceiver?.playerId, 'away-p5', 'serve drag selects nearest receiving-team player');
  assertions += expectTruthy(
    isReceivingPlayerCloseEnoughForAutoSelection({ destinationPoint, receiver: nearestReceiver }),
    'near receiver is eligible for automatic selection',
  );

  const farReceivingCourtDestination = { x: 14, y: 84 };
  const farNearestReceiver = findNearestReceivingPlayer({
    destinationPoint: farReceivingCourtDestination,
    receivingTeam: 'away',
    teamPlayersBySide,
  });
  assertions += expectEqual(
    isServeReleaseInReceivingCourt({ destinationPoint: farReceivingCourtDestination, servingTeam: 'home', receivingZone: targetZone }),
    true,
    'far destination can still be inside the receiving court',
  );
  assertions += expectFalse(
    isReceivingPlayerCloseEnoughForAutoSelection({
      destinationPoint: farReceivingCourtDestination,
      receiver: farNearestReceiver,
    }),
    'far receiver is not auto-selected',
  );
  assertions += expectEqual(
    buildReceptionDrivenServeReceiveTouch({
      zone: targetZone,
      destinationPoint: farReceivingCourtDestination,
      servingTeam: 'home',
      servingPlayerId: 'home-p1',
      teamPlayersBySide,
      serveTrajectory,
    }),
    null,
    'serve too far from valid receiver does not create a fake receive touch',
  );

  const pendingReceive = buildReceptionDrivenServeReceiveTouch({
    zone: targetZone,
    destinationPoint,
    servingTeam: 'home',
    servingPlayerId: 'home-p1',
    teamPlayersBySide,
    serveTrajectory,
  });
  assertions += expectTruthy(pendingReceive, 'serve release builds reception-driven pending receive');
  if (!pendingReceive) {
    return assertions;
  }

  assertions += expectTruthy(isReceptionDrivenServePendingTouch(pendingReceive), 'pending receive carries inferred serve context');
  assertions += expectEqual(pendingReceive.skill, 'receive', 'operator evaluates reception instead of serve');
  assertions += expectEqual(pendingReceive.playerId, 'away-p5', 'nearest receiver is selected on release');
  assertions += expectEqual(pendingReceive.teamSide, 'away', 'pending receiver belongs to receiving team');
  assertions += expectEqual(pendingReceive.source, 'explicit', 'pending reception remains explicit');
  assertions += expectEqual(pendingReceive.serveContext?.playerId, 'home-p1', 'pending receive remembers server');
  assertions += expectEqual(pendingReceive.serveContext?.teamSide, 'home', 'pending receive remembers serving team');
  assertions += expectDeepEqual(
    pendingReceive.serveContext?.trajectory,
    serveTrajectory,
    'pending receive keeps serve trajectory for commit',
  );
  assertions += expectDeepEqual(
    pendingReceive.serveContext?.ballDirection,
    serveDirection,
    'pending receive keeps canonical serve direction for commit',
  );
  assertions += expectEqual(
    canSelectReceptionDrivenServeReceiver(pendingReceive, 'away'),
    true,
    'receiver override accepts receiving team',
  );
  assertions += expectEqual(
    canSelectReceptionDrivenServeReceiver(pendingReceive, 'home'),
    false,
    'receiver override rejects serving team',
  );

  const outsideServeDestination = { x: targetZone.center.x, y: 4 };
  const ownCourtServeDestination = homeTargetZone.center;
  const netServeDestination = { x: 50, y: targetZone.center.y };
  assertions += expectEqual(
    isServeReleaseInReceivingCourt({ destinationPoint: destinationPoint, servingTeam: 'home' }),
    true,
    'serve release inside receiving court can select a receiver',
  );
  assertions += expectEqual(
    isServeReleaseInReceivingCourt({ destinationPoint: outsideServeDestination, servingTeam: 'home' }),
    false,
    'serve release outside receiving court cannot select a receiver',
  );
  assertions += expectEqual(
    isServeReleaseInReceivingCourt({ destinationPoint: ownCourtServeDestination, servingTeam: 'home' }),
    false,
    'serve release in own court cannot select a receiver',
  );
  assertions += expectEqual(
    isServeReleaseInReceivingCourt({ destinationPoint: netServeDestination, servingTeam: 'home' }),
    false,
    'serve release on the net boundary cannot select a receiver',
  );
  assertions += expectEqual(
    buildReceptionDrivenServeReceiveTouch({
      zone: homeTargetZone,
      destinationPoint: ownCourtServeDestination,
      servingTeam: 'home',
      servingPlayerId: 'home-p1',
      teamPlayersBySide,
      serveTrajectory,
    }),
    null,
    'own-court serve release does not create a fake receive touch',
  );

  const serveErrorTrajectory = createBallTrajectory({
    id: 'serve-error-confirmation-trajectory',
    teamSide: 'home',
    skill: 'serve',
    evaluation: '=',
    direction: {
      start: serveStartZone.center,
      end: outsideServeDestination,
    },
  });
  const serveErrorTouch = buildServeErrorConfirmationTouch({
    zone: targetZone,
    destinationPoint: outsideServeDestination,
    servingTeam: 'home',
    servingPlayerId: 'home-p1',
    serveDirection: serveErrorTrajectory?.direction,
    serveTrajectory: serveErrorTrajectory,
  });
  assertions += expectTruthy(
    isServeErrorConfirmationPendingTouch(serveErrorTouch, 'home'),
    'serve out/net confirmation is identified as a serve error touch',
  );
  assertions += expectEqual(serveErrorTouch.skill, 'serve', 'serve out/net confirmation keeps serve skill');
  assertions += expectEqual(serveErrorTouch.playerId, 'home-p1', 'serve out/net confirmation keeps the server');
  assertions += expectEqual(serveErrorTouch.evaluation, '=', 'serve out/net confirmation defaults to serve error =');
  assertions += expectEqual(serveErrorTouch.serveContext, undefined, 'serve out/net confirmation has no inferred receive context');
  assertions += expectDeepEqual(
    serveErrorTouch.trajectory,
    serveErrorTrajectory,
    'serve out/net confirmation preserves the release trajectory on the serve touch',
  );
  const serveErrorAction = resolveLiveEvaluationAction(serveErrorTouch);
  assertions += expectEqual(serveErrorAction.kind, 'rally_ended', 'confirmed serve error ends rally directly');
  if (serveErrorAction.kind === 'rally_ended') {
    assertions += expectEqual(serveErrorAction.touches.length, 1, 'serve out/net commits only the serve touch');
    assertions += expectEqual(serveErrorAction.touches[0]?.skill, 'serve', 'serve out/net does not synthesize a receive touch');
    assertions += expectEqual(serveErrorAction.preview.pointTeam, 'away', 'serve out/net awards point to receiving team');
  }

  const manualReceiverTouch = buildManualServeReceiveTouchFromServeError({
    serveErrorTouch,
    playerId: 'away-p6',
    teamSide: 'away',
  });
  assertions += expectTruthy(manualReceiverTouch, 'serve error state allows explicit manual receiver selection');
  if (manualReceiverTouch) {
    assertions += expectTruthy(isReceptionDrivenServePendingTouch(manualReceiverTouch), 'manual receiver uses reception-driven serve context');
    assertions += expectEqual(manualReceiverTouch.skill, 'receive', 'manual receiver converts serve error pending touch to receive');
    assertions += expectEqual(manualReceiverTouch.source, 'explicit', 'manual receiver is explicit operator input');
    assertions += expectEqual(manualReceiverTouch.serveContext?.playerId, 'home-p1', 'manual receiver keeps original server context');
    assertions += expectEqual(
      buildManualServeReceiveTouchFromServeError({
        serveErrorTouch,
        playerId: 'home-p2',
        teamSide: 'home',
      }),
      null,
      'manual receiver cannot be selected from serving team',
    );
  }

  const overriddenReceive = updatePendingTouchSelection(pendingReceive, 'away-p6', 'away');
  const receiveMinusResult = resolveReceptionDrivenServeEvaluationFlow({
    ...overriddenReceive,
    evaluation: '-',
  });
  assertions += expectEqual(receiveMinusResult?.kind, 'touch_committed', 'non-terminal reception commits both touches');
  if (receiveMinusResult?.kind !== 'touch_committed') {
    return assertions;
  }

  assertions += expectEqual(receiveMinusResult.touches.length, 2, 'reception-driven serve creates exactly two touches');
  assertions += expectEqual(receiveMinusResult.touches[0]?.skill, 'serve', 'inferred serve is committed first');
  assertions += expectEqual(receiveMinusResult.touches[0]?.evaluation, '+', 'receive - infers serve +');
  assertions += expectEqual(receiveMinusResult.touches[0]?.source, 'inferred', 'serve touch is inferred');
  assertions += expectEqual(
    receiveMinusResult.touches[0]?.inferenceReason,
    'serve_from_reception',
    'serve touch stores reception inference reason',
  );
  assertions += expectDeepEqual(
    receiveMinusResult.touches[0]?.trajectory,
    updateBallTrajectoryMetadata(serveTrajectory!, { evaluation: '+' }),
    'inferred serve keeps trajectory with inferred evaluation',
  );
  assertions += expectDeepEqual(
    receiveMinusResult.touches[0]?.ballDirection,
    serveDirection,
    'inferred serve keeps canonical direction',
  );
  assertions += expectEqual(receiveMinusResult.touches[1]?.skill, 'receive', 'explicit receive is committed second');
  assertions += expectEqual(receiveMinusResult.touches[1]?.playerId, 'away-p6', 'receiver override is used for receive touch');
  assertions += expectEqual(receiveMinusResult.touches[1]?.evaluation, '-', 'receive touch keeps operator evaluation');
  assertions += expectEqual(receiveMinusResult.touches[1]?.source, 'explicit', 'receive touch is explicit');

  const minusTouches = receiveMinusResult.touches.map((touch, index) => pendingTouchToBallTouch(touch, index + 1));
  const minusStats = buildMatchStats({
    homeTeam: createTeam('home'),
    awayTeam: createTeam('away'),
    committedTouches: minusTouches,
  });
  const serverStats = minusStats.playerStats.find((player) => player.playerId === 'home-p1');
  const receiverStats = minusStats.playerStats.find((player) => player.playerId === 'away-p6');
  assertions += expectEqual(minusStats.totalTouches, 2, 'stats include inferred serve and explicit receive once');
  assertions += expectEqual(minusStats.teamStats.home.serve.total, 1, 'serve stats count inferred serve');
  assertions += expectEqual(serverStats?.serve.plus, 1, 'server stats include inferred serve evaluation');
  assertions += expectEqual(minusStats.teamStats.away.receive.total, 1, 'reception stats count explicit receive');
  assertions += expectEqual(receiverStats?.receive.minus, 1, 'receiver stats include explicit reception evaluation');
  assertions += expectEqual(validateStatsIntegrity(minusStats).length, 0, 'reception-driven stats keep team/player totals consistent');

  const plusResult = resolveReceptionDrivenServeEvaluationFlow({
    ...pendingReceive,
    evaluation: '+',
  });
  assertions += expectEqual(plusResult?.kind, 'touch_committed', 'reception + keeps rally alive');
  if (plusResult?.kind === 'touch_committed') {
    assertions += expectEqual(plusResult.touches[0]?.evaluation, '-', 'receive + infers serve -');
  }

  const exclamationResult = resolveReceptionDrivenServeEvaluationFlow({
    ...pendingReceive,
    evaluation: '!',
  });
  assertions += expectEqual(exclamationResult?.kind, 'touch_committed', 'reception ! keeps rally alive');
  if (exclamationResult?.kind === 'touch_committed') {
    assertions += expectEqual(exclamationResult.touches[0]?.evaluation, '!', 'receive ! infers serve !');
  }

  const slashResult = resolveReceptionDrivenServeEvaluationFlow({
    ...pendingReceive,
    evaluation: '/',
  });
  assertions += expectEqual(slashResult?.kind, 'touch_committed', 'reception / keeps rally alive');
  if (slashResult?.kind === 'touch_committed') {
    assertions += expectEqual(slashResult.touches[0]?.evaluation, '/', 'receive / infers serve /');
    const receiveSlashTouch = pendingTouchToBallTouch(slashResult.touches[1]!, 2);
    const servingTeamNextTouch = buildNextPendingTouch({
      zone: homeTargetZone,
      previousTouch: receiveSlashTouch,
      selectedPlayerId: 'home-p2',
      selectedTeamSide: 'home',
      scoutingMode: 'simple',
      teamPlayersBySide,
    });
    assertions += expectTruthy(servingTeamNextTouch, 'serving team can play next after reception /');
    assertions += expectEqual(servingTeamNextTouch?.teamSide, 'home', 'next touch after reception / belongs to serving team');
    assertions += expectEqual(servingTeamNextTouch?.skill, 'attack', 'reception / defaults next serving-team touch to the simple primary attack flow');
    const receivingTeamNextTouch = buildNextPendingTouch({
      zone: targetZone,
      previousTouch: receiveSlashTouch,
      selectedPlayerId: 'away-p5',
      selectedTeamSide: 'away',
      scoutingMode: 'simple',
      teamPlayersBySide,
    });
    assertions += expectEqual(receivingTeamNextTouch, null, 'receiving team is not guessed for the next touch after /');
  }

  const aceResult = resolveReceptionDrivenServeEvaluationFlow({
    ...pendingReceive,
    evaluation: '=',
  });
  assertions += expectEqual(aceResult?.kind, 'rally_ended', 'receive = infers serve ace and ends rally');
  if (aceResult?.kind === 'rally_ended') {
    assertions += expectEqual(aceResult.preview.pointTeam, 'home', 'serve ace awards point to serving team');
    assertions += expectEqual(aceResult.preview.reason, 'ace', 'serve ace keeps ace reason');
    assertions += expectEqual(aceResult.touches[0]?.evaluation, '#', 'receive = infers serve #');
    assertions += expectEqual(aceResult.touches[1]?.evaluation, '=', 'ace victim receive is recorded as =');
    const aceTouches = aceResult.touches.map((touch, index) => pendingTouchToBallTouch(touch, index + 1));
    const aceStats = buildMatchStats({
      homeTeam: createTeam('home'),
      awayTeam: createTeam('away'),
      committedTouches: aceTouches,
    });
    assertions += expectEqual(aceStats.totalTouches, 2, 'ace stats do not synthesize duplicate receive touches');
    assertions += expectEqual(aceStats.teamStats.home.aces, 1, 'inferred serve # counts as ace');
    assertions += expectEqual(aceStats.teamStats.away.receptionErrors, 1, 'explicit receive = counts as reception error');
    assertions += expectEqual(validateStatsIntegrity(aceStats).length, 0, 'reception-driven ace stats pass integrity checks');
  }

  const serveErrorResult = resolveReceptionDrivenServeEvaluationFlow({
    ...pendingReceive,
    evaluation: '#',
  });
  assertions += expectEqual(serveErrorResult?.kind, 'touch_committed', 'receive # infers serve - and keeps rally alive');
  if (serveErrorResult?.kind === 'touch_committed') {
    assertions += expectEqual(serveErrorResult.touches[0]?.evaluation, '-', 'receive # infers serve -');
    assertions += expectEqual(serveErrorResult.touches[1]?.evaluation, '#', 'perfect reception is recorded as receive #');
    const receivePerfectTouch = pendingTouchToBallTouch(serveErrorResult.touches[1]!, 2);
    const nextTouchAfterPerfectReception = buildNextPendingTouch({
      zone: targetZone,
      previousTouch: receivePerfectTouch,
      selectedPlayerId: 'away-p1',
      selectedTeamSide: 'away',
      scoutingMode: 'simple',
      teamPlayersBySide,
    });
    assertions += expectTruthy(nextTouchAfterPerfectReception, 'receive # allows the rally to continue');
    assertions += expectEqual(nextTouchAfterPerfectReception?.teamSide, 'away', 'next touch after receive # stays with receiving team');
    assertions += expectEqual(nextTouchAfterPerfectReception?.skill, 'attack', 'receive # can continue directly into attack in simple mode');
  }

  const replayTouches = receiveMinusResult.touches.map((touch, index) => pendingTouchToBallTouch(touch, index + 1));
  const replayedMatch = replayLiveMatchFromEvents('validation-project', [
    createSetStartedEvent('home'),
    createRallyStartedEvent(),
    buildTouchRecordedEvent(replayTouches[0]),
    buildTouchRecordedEvent(replayTouches[1]),
  ]);
  assertions += expectTruthy(replayedMatch, 'reception-driven serve replay loads');
  assertions += expectEqual(
    replayedMatch?.currentRallyTouches[0]?.source,
    'inferred',
    'replay preserves inferred serve source',
  );
  assertions += expectEqual(
    replayedMatch?.currentRallyTouches[0]?.inferenceReason,
    'serve_from_reception',
    'replay preserves serve inference reason',
  );
  const expectedReplayServeTrajectory = replayTouches[0]?.trajectory
    ? updateBallTrajectoryMetadata(replayTouches[0].trajectory, {
        rallyTouchId: replayTouches[0].id,
        teamSide: replayTouches[0].teamSide,
        skill: replayTouches[0].skill,
        evaluation: replayTouches[0].evaluation,
      })
    : undefined;
  assertions += expectDeepEqual(
    replayedMatch?.currentRallyTouches[0]?.trajectory,
    expectedReplayServeTrajectory,
    'replay preserves serve trajectory',
  );
  assertions += expectDeepEqual(
    replayedMatch?.currentRallyTouches[0]?.ballDirection,
    replayTouches[0]?.ballDirection,
    'replay preserves serve direction',
  );
  assertions += expectEqual(
    replayedMatch?.currentRallyTouches[1]?.playerId,
    'away-p6',
    'replay preserves selected receiver',
  );

  return assertions;
}

function validateCourtFirstInputState(): number {
  let assertions = 0;
  const targetZone = getInCourtZone('away', 2, 4);
  const movedBallPosition = { x: 37, y: 44 };

  assertions += expectTruthy(
    shouldRenderCourtFirstLiveRally({
      activeStage: 'live_rally',
      hasManageActionPanel: false,
    }),
    'normal live rally input renders the court-first stage',
  );
  assertions += expectFalse(
    shouldRenderDeadBallEventsPanel({
      activeStage: 'live_rally',
      hasManageActionPanel: false,
    }),
    'normal live rally input does not open the Events panel',
  );
  assertions += expectTruthy(
    shouldRenderDeadBallEventsPanel({
      activeStage: 'live_rally',
      hasManageActionPanel: true,
    }),
    'dead-ball action drafts render the Events panel in live rally',
  );
  assertions += expectFalse(
    shouldRenderCourtFirstLiveRally({
      activeStage: 'live_rally',
      hasManageActionPanel: true,
    }),
    'Events panel replaces the court while a dead-ball action is open',
  );

  const selectedPlayerState = createLiveInputState({
    selectedPlayerId: 'home-p1',
    selectedTeamSide: 'home',
    pendingBallPosition: null,
    pendingTouch: null,
  });
  assertions += expectEqual(
    selectedPlayerState.currentInputPhase,
    'move_ball',
    'court-first input selects player without leaving court workflow',
  );
  assertions += expectEqual(selectedPlayerState.pendingTouch, null, 'selecting player alone does not create touch');
  const selectedPlayerToolbar = createLiveToolbarSnapshot({
    inputState: selectedPlayerState,
    selectedPlayer: {
      jerseyNumber: 1,
      name: 'home-p1',
      teamLabel: 'Home',
      isLibero: false,
    },
    controlsDisabled: true,
    skillEditable: true,
  });
  assertions += expectEqual(
    selectedPlayerToolbar.selectedPlayer?.jerseyNumber,
    1,
    'toolbar receives selected player from court-first input state',
  );
  assertions += expectEqual(
    selectedPlayerToolbar.phaseLabelKey,
    'dragBallToTargetZone',
    'toolbar shows move-ball phase after player selection',
  );
  assertions += expectFalse(
    selectedPlayerToolbar.usesPopupForNormalInput,
    'toolbar state does not use popup for normal rally input',
  );

  const movedBallState = createLiveInputState({
    selectedPlayerId: 'home-p1',
    selectedTeamSide: 'home',
    pendingBallPosition: movedBallPosition,
    pendingTouch: null,
  });
  assertions += expectEqual(movedBallState.currentInputPhase, 'move_ball', 'ball movement keeps move-ball phase');
  assertions += expectDeepEqual(
    movedBallState.pendingBallPosition,
    movedBallPosition,
    'pending ball position updates from court movement',
  );
  assertions += expectEqual(movedBallState.pendingTouch, null, 'ball movement alone does not create touch');

  const outsideBallPosition = { x: 3, y: 4 };
  const outsideBallState = createLiveInputState({
    selectedPlayerId: 'home-p1',
    selectedTeamSide: 'home',
    pendingBallPosition: outsideBallPosition,
    pendingTouch: null,
  });
  assertions += expectEqual(outsideBallState.currentInputPhase, 'move_ball', 'outside-court movement retains move-ball phase');
  assertions += expectDeepEqual(
    outsideBallState.pendingBallPosition,
    outsideBallPosition,
    'outside-court pending ball position is preserved',
  );

  const pendingTouch = buildPendingTouchForZone({
    zone: targetZone,
    previousTouch: null,
    servingTeam: 'home',
    servingPlayerId: 'home-p1',
    selectedPlayerId: 'home-p1',
    selectedTeamSide: 'home',
  });
  assertions += expectTruthy(pendingTouch, 'court-first input builds pending touch after target zone');

  if (pendingTouch) {
    const outsideDestination = { x: 3, y: 4 };
    const touchWithDestination = {
      ...pendingTouch,
      destinationPoint: outsideDestination,
    };
    const committedTouch = pendingTouchToBallTouch(touchWithDestination, 1);
    assertions += expectTruthy(committedTouch.zone, 'committed touch zone reference is created');
    assertions += expectDeepEqual(
      committedTouch.zone?.point,
      outsideDestination,
      'committed touch preserves latest outside-court destination point',
    );
  }

  const chooseSkillState = createLiveInputState({
    selectedPlayerId: 'home-p1',
    selectedTeamSide: 'home',
    pendingBallPosition: targetZone.center,
    pendingTouch,
  });
  assertions += expectEqual(chooseSkillState.currentInputPhase, 'choose_skill', 'pending touch starts skill choice phase');
  assertions += expectEqual(chooseSkillState.selectedSkill, 'serve', 'pending touch exposes selected skill outside popup');
  assertions += expectEqual(chooseSkillState.selectedEvaluation, '+', 'pending touch exposes selected evaluation outside popup');
  const skillToolbar = createLiveToolbarSnapshot({
    inputState: chooseSkillState,
    selectedPlayer: selectedPlayerToolbar.selectedPlayer,
    controlsDisabled: false,
    skillEditable: true,
  });
  assertions += expectEqual(skillToolbar.selectedSkill, 'serve', 'toolbar receives selected skill');
  assertions += expectEqual(skillToolbar.hasPendingTouch, true, 'toolbar tracks pending touch for skill/evaluation controls');

  const chooseEvaluationState = createLiveInputState({
    selectedPlayerId: 'home-p1',
    selectedTeamSide: 'home',
    pendingBallPosition: targetZone.center,
    pendingTouch,
    skillWasSelected: true,
  });
  assertions += expectEqual(
    chooseEvaluationState.currentInputPhase,
    'choose_evaluation',
    'skill choice advances court-first input to evaluation phase',
  );

  const committedEvaluation = resolveLiveEvaluationAction({
    ...pendingTouch!,
    evaluation: '+',
  });
  assertions += expectEqual(
    committedEvaluation.kind,
    'touch_committed',
    'toolbar evaluation selection commits non-terminal touch',
  );
  if (committedEvaluation.kind === 'touch_committed') {
    assertions += expectEqual(
      committedEvaluation.touches.length,
      1,
      'toolbar evaluation selection commits exactly one touch',
    );
  }

  const completedTouchState = createLiveInputState({
    selectedPlayerId: 'home-p1',
    selectedTeamSide: 'home',
    pendingBallPosition: targetZone.center,
    pendingTouch,
    skillWasSelected: true,
    evaluationWasSelected: true,
  });
  assertions += expectEqual(
    completedTouchState.currentInputPhase,
    'completed_touch',
    'evaluation choice marks the normal touch as completed',
  );

  const aceSelection = resolveEvaluationFlow({
    ...pendingTouch!,
    evaluation: '#',
  });
  if (aceSelection.kind === 'awaiting_ace_target') {
    const aceVictimState = createLiveInputState({
      selectedPlayerId: null,
      selectedTeamSide: aceSelection.selection.receivingTeam,
      pendingBallPosition: null,
      pendingTouch: null,
      aceVictimSelection: aceSelection.selection,
    });
    assertions += expectEqual(
      aceVictimState.currentInputPhase,
      'ace_victim_selection',
      'serve # exposes ace victim selection as the live input phase',
    );
    assertions += expectEqual(
      createLiveToolbarSnapshot({
        inputState: aceVictimState,
        selectedPlayer: null,
        controlsDisabled: true,
        skillEditable: false,
      }).phaseLabelKey,
      'aceVictimSelection',
      'toolbar shows ace victim selection phase',
    );
  } else {
    throw new Error('court-first input expected serve # to enter ace victim selection');
  }

  resetTouchFlowStore();
  useLiveTouchFlowStore.getState().updateContext({
    previousTouch: null,
    servingTeam: 'home',
    servingPlayerId: 'home-p1',
    playerTeamByScopedKey: {
      [getTeamScopedPlayerKey('home', 'home-p1')]: 'home',
    },
  });
  useLiveTouchFlowStore.getState().selectPlayer('home-p1', 'home');
  useLiveTouchFlowStore.getState().openTouch(targetZone);
  assertions += expectEqual(
    useLiveTouchFlowStore.getState().committedTouches.length,
    0,
    'skill choice setup has no committed touch before evaluation',
  );
  useLiveTouchFlowStore.getState().updatePendingSkill('serve');
  useLiveTouchFlowStore.getState().selectEvaluation('+');
  useLiveTouchFlowStore.getState().commitPendingTouch();
  assertions += expectEqual(
    useLiveTouchFlowStore.getState().committedTouches.length,
    1,
    'skill/evaluation sequence commits exactly one touch',
  );

  return assertions;
}

function validateLiveSmartphoneLayout(): number {
  let assertions = 0;
  const landscapeFlags = getLiveScoutingViewportFlags({ width: 844, height: 390 });
  const portraitFlags = getLiveScoutingViewportFlags({ width: 390, height: 844 });
  const tabletPortraitFlags = getLiveScoutingViewportFlags({ width: 768, height: 1024 });
  const compactLiveSnapshot = createLiveScoutingLayoutSnapshot({
    activeStage: 'live_rally',
    hasManageActionPanel: false,
    viewport: { width: 844, height: 390 },
  });
  const eventsPanelSnapshot = createLiveScoutingLayoutSnapshot({
    activeStage: 'live_rally',
    hasManageActionPanel: true,
    viewport: { width: 844, height: 390 },
  });
  const portraitLiveSnapshot = createLiveScoutingLayoutSnapshot({
    activeStage: 'live_rally',
    hasManageActionPanel: false,
    viewport: { width: 390, height: 844 },
  });
  const setupPortraitSnapshot = createLiveScoutingLayoutSnapshot({
    activeStage: 'set_setup',
    hasManageActionPanel: false,
    viewport: { width: 390, height: 844 },
  });

  assertions += expectEqual(landscapeFlags.isSmartphoneLandscape, true, 'layout helper detects smartphone landscape');
  assertions += expectEqual(landscapeFlags.isSmartphonePortrait, false, 'landscape viewport is not portrait guarded');
  assertions += expectEqual(portraitFlags.isSmartphonePortrait, true, 'layout helper detects smartphone portrait');
  assertions += expectEqual(tabletPortraitFlags.isSmartphonePortrait, false, 'layout helper does not treat tablet portrait as phone portrait');
  assertions += expectEqual(compactLiveSnapshot.usesUltraCompactLiveLayout, true, 'live smartphone landscape uses ultra compact mode');
  assertions += expectEqual(compactLiveSnapshot.usesLiveOrientationGuard, false, 'live smartphone landscape does not show orientation guard');
  assertions += expectEqual(portraitLiveSnapshot.usesLiveOrientationGuard, true, 'live smartphone portrait uses orientation guard');
  assertions += expectEqual(setupPortraitSnapshot.usesLiveOrientationGuard, false, 'portrait setup is not blocked by live orientation guard');
  assertions += expectEqual(isLandscapeRequiredForScoutingStage('live_rally'), true, 'live rally remains landscape-gated');
  assertions += expectEqual(isLandscapeRequiredForScoutingStage('set_setup'), false, 'set setup remains portrait-capable');
  assertions += expectEqual(getScoutingStageLayoutPolicy('set_end').orientation, 'any', 'statistics/end stages remain portrait-capable');
  assertions += expectTruthy(
    getLiveScoutingOrientationGuardMediaQuery().includes('max-width: 720px'),
    'live orientation guard media query is phone-scoped',
  );
  assertions += expectEqual(compactLiveSnapshot.rendersCourt, true, 'compact live layout renders court when no Events panel is open');
  assertions += expectEqual(compactLiveSnapshot.rendersEventsPanel, false, 'compact live layout does not render Events panel by default');
  assertions += expectEqual(eventsPanelSnapshot.rendersCourt, false, 'Events panel replaces court in compact landscape');
  assertions += expectEqual(eventsPanelSnapshot.rendersEventsPanel, true, 'Events panel renders in compact landscape');
  assertions += expectDeepEqual(
    compactLiveSnapshot.compactToolbarControls,
    {
      skills: true,
      evaluations: true,
      events: true,
      undo: true,
    },
    'compact toolbar keeps all required control groups available',
  );

  const simpleLayout = getToolbarModeLayout('simple', 'serve');
  const advancedLayout = getToolbarModeLayout('advanced', 'attack');
  assertions += expectTruthy(simpleLayout.visibleSkills.includes('serve'), 'compact toolbar simple mode keeps skill controls');
  assertions += expectTruthy(advancedLayout.visibleSkills.includes('attack'), 'compact toolbar advanced mode keeps skill controls');

  const toolbarSnapshot = createLiveToolbarSnapshot({
    inputState: createLiveInputState({
      selectedPlayerId: 'home-p1',
      selectedTeamSide: 'home',
      pendingBallPosition: { x: 50, y: 50 },
      pendingTouch: {
        playerId: 'home-p1',
        teamSide: 'home',
        skill: 'serve',
        evaluation: '+',
        zone: getInCourtZone('away', 2, 4),
      },
      scoutingMode: 'simple',
    }),
    selectedPlayer: {
      jerseyNumber: 1,
      name: 'home-p1',
      teamLabel: 'Home',
      isLibero: false,
    },
    controlsDisabled: false,
    skillEditable: true,
  });
  assertions += expectEqual(toolbarSnapshot.hasPendingTouch, true, 'toolbar compact state keeps pending touch controls active');
  assertions += expectEqual(toolbarSnapshot.controlsDisabled, false, 'toolbar compact state does not disable required controls');

  return assertions;
}

function validateServeAceFlow(): number {
  let assertions = 0;
  const targetZone = getInCourtZone('away', 2, 4);
  resetTouchFlowStore();

  useLiveTouchFlowStore.getState().updateContext({
    servingTeam: 'home',
    servingPlayerId: 'home-p1',
    playerTeamByScopedKey: {
      [getTeamScopedPlayerKey('home', 'home-p1')]: 'home',
      [getTeamScopedPlayerKey('home', 'home-p2')]: 'home',
      [getTeamScopedPlayerKey('away', 'away-p5')]: 'away',
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

  const aceStats = buildMatchStats({
    homeTeam: createTeam('home'),
    awayTeam: createTeam('away'),
    committedTouches: rallyTouches,
  });
  const serverStats = aceStats.playerStats.find((player) => player.playerId === 'home-p1');
  const receiverStats = aceStats.playerStats.find((player) => player.playerId === 'away-p5');

  assertions += expectEqual(aceStats.teamStats.home.aces, 1, 'ace flow gives serving team ace');
  assertions += expectEqual(serverStats?.aces, 1, 'ace flow gives server ace');
  assertions += expectEqual(serverStats?.points, 1, 'ace flow gives server point');
  assertions += expectEqual(aceStats.teamStats.away.receptionErrors, 1, 'ace flow gives receiving team reception error');
  assertions += expectEqual(receiverStats?.receptionErrors, 1, 'ace flow gives victim reception error');
  assertions += expectEqual(receiverStats?.receive.equal, 1, 'ace flow player table includes receive =');

  return assertions;
}

function validateAttackBlockerSelectionFlow(): number {
  let assertions = 0;
  const attackZone = getInCourtZone('home', 2, 4);
  const attackTouch: PendingTouch = {
    id: 'attack-touch-1',
    playerId: 'away-p4',
    teamSide: 'away',
    skill: 'attack',
    evaluation: '/',
    zone: attackZone,
    destinationPoint: attackZone.center,
    source: 'explicit',
    touchOrigin: 'live_scouting',
  };
  const selection = createAttackBlockerSelection(attackTouch, 'simple');
  const advancedSelection = createAttackBlockerSelection(attackTouch, 'advanced');
  const teamPlayersBySide = {
    home: [
      createTacticalPlayerMarker({ teamSide: 'home', playerNumber: 1, x: 84, y: 74 }),
      createTacticalPlayerMarker({ teamSide: 'home', playerNumber: 2, x: 58, y: 28 }),
      createTacticalPlayerMarker({ teamSide: 'home', playerNumber: 3, x: 68, y: 28, isLibero: true }),
      createTacticalPlayerMarker({ teamSide: 'home', playerNumber: 4, x: 78, y: 28 }),
      createTacticalPlayerMarker({ teamSide: 'home', playerNumber: 5, x: 72, y: 74 }),
      createTacticalPlayerMarker({ teamSide: 'home', playerNumber: 6, x: 64, y: 74 }),
    ],
    away: [
      createTacticalPlayerMarker({ teamSide: 'away', playerNumber: 1, x: 16, y: 26 }),
      createTacticalPlayerMarker({ teamSide: 'away', playerNumber: 2, x: 42, y: 72 }),
      createTacticalPlayerMarker({ teamSide: 'away', playerNumber: 3, x: 32, y: 72 }),
      createTacticalPlayerMarker({ teamSide: 'away', playerNumber: 4, x: 22, y: 72 }),
      createTacticalPlayerMarker({ teamSide: 'away', playerNumber: 5, x: 28, y: 26 }),
      createTacticalPlayerMarker({ teamSide: 'away', playerNumber: 6, x: 36, y: 26 }),
    ],
  };

  assertions += expectTruthy(selection, 'attack / in simple mode enters blocker selection');
  assertions += expectEqual(advancedSelection, null, 'attack / in advanced mode does not force blocker selection');
  assertions += expectEqual(selection?.blockingTeam, 'home', 'blocked attack asks for opponent blocking team');
  assertions += expectEqual(selection?.pointTeam, 'home', 'blocked attack point belongs to blocker team');
  if (!selection) {
    return assertions;
  }

  const validBlockers = getValidAttackBlockers({ selection, teamPlayersBySide }).map((player) => player.playerId).sort();
  assertions += expectDeepEqual(validBlockers, ['home-p2', 'home-p4'], 'valid blockers are opponent front-row non-liberos only');
  assertions += expectEqual(
    canSelectAttackBlocker({ selection, teamPlayersBySide, playerId: 'away-p4', teamSide: 'away' }),
    false,
    'attacking team player cannot be selected as blocker',
  );
  assertions += expectEqual(
    canSelectAttackBlocker({ selection, teamPlayersBySide, playerId: 'home-p6', teamSide: 'home' }),
    false,
    'opponent back-row player cannot be selected as blocker',
  );
  assertions += expectEqual(
    canSelectAttackBlocker({ selection, teamPlayersBySide, playerId: 'home-p3', teamSide: 'home' }),
    false,
    'libero cannot be selected as blocker',
  );
  assertions += expectEqual(
    resolveAttackBlockerSelection({ selection, teamPlayersBySide, playerId: 'home-p6', teamSide: 'home' }),
    null,
    'invalid blocker selection does not create inferred block touch',
  );

  const resolvedBlock = resolveAttackBlockerSelection({
    selection,
    teamPlayersBySide,
    playerId: 'home-p2',
    teamSide: 'home',
  });
  assertions += expectTruthy(resolvedBlock, 'valid blocker selection resolves attack/block composed flow');
  assertions += expectEqual(resolvedBlock?.pointTeam, 'home', 'blocker selection awards point to blocking team after selection');
  assertions += expectEqual(resolvedBlock?.reason, 'block_from_attack', 'blocker selection rally reason');
  assertions += expectEqual(resolvedBlock?.touches.length, 2, 'blocker selection commits attack and one inferred block touch');
  assertions += expectEqual(resolvedBlock?.touches[0]?.skill, 'attack', 'blocked attack touch is committed first');
  assertions += expectEqual(resolvedBlock?.touches[0]?.evaluation, '/', 'blocked attack keeps / evaluation');
  assertions += expectEqual(resolvedBlock?.touches[1]?.skill, 'block', 'inferred blocker touch uses block skill');
  assertions += expectEqual(resolvedBlock?.touches[1]?.evaluation, '#', 'inferred blocker touch uses # evaluation');
  assertions += expectEqual(resolvedBlock?.touches[1]?.source, 'inferred', 'block touch is marked inferred');
  assertions += expectEqual(resolvedBlock?.touches[1]?.inferenceReason, 'block_from_attack', 'block touch stores attack/block inference reason');
  assertions += expectEqual(resolvedBlock?.touches[1]?.inferredFromTouchId, 'attack-touch-1', 'block touch references attack touch id');

  const rallyTouches = resolvedBlock!.touches.map((touch, index) => pendingTouchToBallTouch(touch, index + 1));
  const stats = buildMatchStats({
    homeTeam: createTeam('home'),
    awayTeam: createTeam('away'),
    committedTouches: rallyTouches,
  });
  const blockerStats = stats.playerStats.find((player) => player.playerId === 'home-p2');
  const attackerStats = stats.playerStats.find((player) => player.playerId === 'away-p4');
  assertions += expectEqual(stats.teamStats.home.blockPoints, 1, 'inferred block # counts as team block point');
  assertions += expectEqual(blockerStats?.blockPoints, 1, 'selected blocker receives block point');
  assertions += expectEqual(blockerStats?.block.hash, 1, 'selected blocker receives block # stat');
  assertions += expectEqual(stats.teamStats.away.attackBlocked, 1, 'attacking team receives blocked attack count');
  assertions += expectEqual(attackerStats?.attackBlocked, 1, 'attacker receives blocked attack count');

  const replayedPoint = replayLiveMatchFromEvents('validation-project', [
    createSetStartedEvent('away'),
    createRallyStartedEvent(),
    ...rallyTouches.map((touch) => buildTouchRecordedEvent(touch)),
    createPointAwardedEvent('home'),
  ]);
  assertions += expectEqual(replayedPoint?.homeScore, 1, 'blocking team gets exactly one point after blocker selection');
  assertions += expectEqual(replayedPoint?.awayScore, 0, 'blocked attack does not duplicate opponent point');
  assertions += expectEqual(replayedPoint?.currentRallyPointWinner, 'home', 'replay has one current rally point winner');
  assertions += expectEqual(replayedPoint?.currentRallyTouches.length, 2, 'replay stores no duplicate touch for composed block');

  return assertions;
}

function validateLiberoFlows(): number {
  let assertions = 0;
  const homeTeam = createTeam('home', true);
  const homeLineup = createLineup('home', true);
  const liveMatch = createLiveMatch({ homeLineup, servingTeam: 'away' });
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
  const frontRowGuardMarkers = resolveTacticalCourtPlayers({
    teamSide: 'home',
    team: homeTeam,
    lineup: rotatedLineup,
    phase: 'side_out_defense',
    defenseSystemBlock: DEFAULT_DEFENSE_SYSTEM_BLOCK,
    receptionSystemBlock: DEFAULT_RECEPTION_SYSTEM_BLOCK,
  });
  assertions += expectTacticalMarkerInvariant(frontRowGuardMarkers, 'front-row libero visual guard');
  assertions += expectFalse(
    frontRowGuardMarkers.some((player) => player.playerId === 'home-libero' || player.isLibero),
    'visual resolver never renders active libero in front row',
  );
  assertions += expectEqual(
    frontRowGuardMarkers.find((player) => player.courtPosition === 4)?.playerId,
    'home-p5',
    'visual resolver restores legal player when libero reaches front row',
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

  const renderedPlayers = resolveTacticalCourtPlayers({
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
  assertions += expectTacticalMarkerInvariant(renderedPlayers, 'confirmed libero exit 6+6');

  const illegalFrontRowLineup: ActiveLineup = {
    ...homeLineup,
    slots: homeLineup.slots.map((slot) => (
      slot.courtPosition === 3
        ? {
            ...slot,
            playerId: 'home-libero',
            isLibero: true,
            replacedPlayerId: 'home-p3',
          }
        : slot
    )),
    personnelState: {
      ...homeLineup.personnelState,
      onCourtPlayerIds: homeLineup.personnelState.onCourtPlayerIds.map((playerId) => (
        playerId === 'home-p3' ? 'home-libero' : playerId
      )),
      benchPlayerIds: ['home-p3'],
      activeLiberoState: undefined,
    },
  };
  const illegalFrontRowMarkers = resolveTacticalCourtPlayers({
    teamSide: 'home',
    team: homeTeam,
    lineup: illegalFrontRowLineup,
    phase: 'side_out_defense',
    defenseSystemBlock: DEFAULT_DEFENSE_SYSTEM_BLOCK,
    receptionSystemBlock: DEFAULT_RECEPTION_SYSTEM_BLOCK,
  });
  assertions += expectFalse(
    illegalFrontRowMarkers.some((player) => player.playerId === 'home-libero' || player.isLibero),
    'hard tactical guard suppresses an illegal front-row libero marker',
  );
  assertions += expectEqual(
    illegalFrontRowMarkers.find((player) => player.courtPosition === 3)?.playerId,
    'home-p3',
    'hard tactical guard restores replaced legal player when possible',
  );

  const replayStartedMatch = createLiveMatchStateFromSetStart({
    activeProjectId: 'validation-project',
    setNumber: 1,
    homeStartingLineup: createStartingLineup('home', true),
    awayStartingLineup: createStartingLineup('away'),
    servingTeam: 'away',
    createdAt: 1,
  });
  const replayEntryEvent = buildLiberoReplacementMadeEvent(replayStartedMatch, positionFiveProposal!);
  const replayAfterEntry = replayLiveMatchFromEvents('validation-project', [
    ...replayStartedMatch.eventLog,
    replayEntryEvent,
  ]);
  const replayAfterSideOut = replayLiveMatchFromEvents('validation-project', [
    ...(replayAfterEntry?.eventLog ?? []),
    createRallyStartedEvent(),
    createPointAwardedEvent('home'),
    {
      id: 'front-row-libero-rally-ended',
      type: 'rally_ended',
      createdAt: 4,
      setNumber: 1,
      rallyNumber: 1,
    },
  ]);
  const replayAfterSideOutWithAuto = replayAfterSideOut && replayAfterSideOut.homeActiveLineup
    ? {
        ...replayAfterSideOut,
        homeActiveLineup: {
          ...replayAfterSideOut.homeActiveLineup,
          personnelState: {
            ...replayAfterSideOut.homeActiveLineup.personnelState,
            liberoAutoMiddleReplacement: true,
          },
        },
      }
    : replayAfterSideOut;
  const replayExitProposal = replayAfterSideOutWithAuto
    ? getAutomaticLiberoReplacementProposal(replayAfterSideOutWithAuto, 'home')
    : null;
  const replayAfterExit = replayAfterSideOutWithAuto && replayExitProposal
    ? replayLiveMatchFromEvents('validation-project', [
        ...replayAfterSideOutWithAuto.eventLog,
        buildLiberoReplacementMadeEvent(replayAfterSideOutWithAuto, replayExitProposal),
      ])
    : null;
  assertions += expectEqual(replayExitProposal?.reason, 'front_row_exit', 'replay proposes legal libero exit after side-out front-row transition');
  assertions += expectEqual(replayAfterExit?.homeActiveLineup?.personnelState.activeLiberoState, undefined, 'replay preserves confirmed legal libero exit');
  assertions += expectEqual(
    replayAfterExit?.homeActiveLineup?.slots.find((slot) => slot.playerId === 'home-p5')?.courtPosition,
    4,
    'replay restores replaced player after confirmed libero exit',
  );

  return assertions;
}

function validateLiberoRulesEngine(): number {
  let assertions = 0;
  const secondLiberoStartingLineup: StartingLineup = {
    ...createStartingLineup('home', true),
    liberoPlayerIds: ['home-libero', 'home-libero-2'],
    benchPlayerIds: ['home-libero', 'home-libero-2'],
  };
  const homeTeamWithTwoLiberos = createTeam('home', true);
  homeTeamWithTwoLiberos.players.push(createPlayer('home-libero-2', 98, true));
  const homeLineup = createActiveLineup(secondLiberoStartingLineup);
  const liveMatch = createLiveMatch({ homeLineup });
  const positionFiveProposal = getManualLiberoReplacementProposals(liveMatch, 'home')
    .find((proposal) => proposal.playerOutId === 'home-p5');
  assertions += expectTruthy(positionFiveProposal, 'rules engine legal back-row libero entry proposal exists');
  const enteredLineup = applyLiberoReplacementToLineup(
    homeLineup,
    buildLiberoReplacementEvent(liveMatch, positionFiveProposal!),
  );
  assertions += expectTruthy(enteredLineup, 'rules engine applies legal back-row libero entry');

  const sameRallyLiveMatch = createLiveMatch({ homeLineup: enteredLineup!, currentRallyNumber: 1 });
  assertions += expectDeepEqual(
    getManualLiberoReplacementProposals(sameRallyLiveMatch, 'home'),
    [],
    'rules engine blocks repeated libero replacements in same rally',
  );
  const sameRallySecondLiberoEvent: Extract<MatchEvent, { type: 'libero_replacement_made' }> = {
    id: 'same-rally-second-libero',
    type: 'libero_replacement_made',
    createdAt: 1,
    setNumber: 1,
    rallyNumber: 1,
    teamSide: 'home',
    liberoPlayerId: 'home-libero-2',
    replacedPlayerId: 'home-p5',
    replacedPlayerRole: PlayerRole.OUTSIDE_HITTER_2,
    playerOutId: 'home-libero',
    playerInId: 'home-libero-2',
    action: 'second_libero_enters',
  };
  assertions += expectEqual(
    applyLiberoReplacementToLineup(enteredLineup!, sameRallySecondLiberoEvent),
    null,
    'rules engine rejects same-rally libero-to-libero swap',
  );

  const nextRallyLiveMatch = createLiveMatch({ homeLineup: enteredLineup!, currentRallyNumber: 2 });
  const secondLiberoProposal = getManualLiberoReplacementProposals(nextRallyLiveMatch, 'home')
    .find((proposal) => proposal.action === 'second_libero_enters');
  assertions += expectTruthy(secondLiberoProposal, 'rules engine offers second libero swap after a rally');
  assertions += expectEqual(secondLiberoProposal?.replacedPlayerId, 'home-p5', 'second libero proposal inherits replaced player');
  const secondLiberoLineup = applyLiberoReplacementToLineup(
    enteredLineup!,
    buildLiberoReplacementEvent(nextRallyLiveMatch, secondLiberoProposal!),
  );
  assertions += expectTruthy(secondLiberoLineup, 'rules engine applies libero-to-libero swap');
  assertions += expectEqual(
    secondLiberoLineup?.personnelState.activeLiberoState?.liberoPlayerId,
    'home-libero-2',
    'second libero becomes the active libero',
  );
  assertions += expectEqual(
    secondLiberoLineup?.personnelState.activeLiberoState?.replacedPlayerId,
    'home-p5',
    'second libero keeps original replaced player relation',
  );

  const pairingViolationEvent: Extract<MatchEvent, { type: 'libero_replacement_made' }> = {
    id: 'pairing-violation-libero-exit',
    type: 'libero_replacement_made',
    createdAt: 2,
    setNumber: 1,
    rallyNumber: 3,
    teamSide: 'home',
    liberoPlayerId: 'home-libero-2',
    replacedPlayerId: 'home-p5',
    replacedPlayerRole: PlayerRole.OUTSIDE_HITTER_2,
    playerOutId: 'home-libero-2',
    playerInId: 'home-p6',
    action: 'regular_returns',
  };
  assertions += expectEqual(
    applyLiberoReplacementToLineup(secondLiberoLineup!, pairingViolationEvent),
    null,
    'rules engine enforces libero replacement pairing on exit',
  );

  const servingLiberoLineup = createActiveLineup(createMiddleServerStartingLineup('home'), {
    servingTeam: 'home',
    allowLiberoServe: true,
  });
  const servingLiberoLiveMatch = createLiveMatch({ homeLineup: servingLiberoLineup, servingTeam: 'home', currentRallyNumber: 2 });
  const serviceExitProposal = getAutomaticLiberoReplacementProposal(servingLiberoLiveMatch, 'home');
  assertions += expectEqual(serviceExitProposal?.action, 'regular_returns', 'rules engine proposes libero exit before serve');
  assertions += expectEqual(serviceExitProposal?.reason, 'service_exit', 'rules engine service restriction proposal reason');
  assertions += expectEqual(
    validateLiberoTouch({
      lineups: {
        homeActiveLineup: servingLiberoLineup,
        awayActiveLineup: createLineup('away'),
      },
      teamSide: 'home',
      playerId: 'home-libero',
      skill: 'serve',
    }).violation,
    'libero_illegal_serve',
    'rules engine rejects libero serve touch',
  );
  assertions += expectEqual(
    validateLiberoTouch({
      lineups: {
        homeActiveLineup: secondLiberoLineup!,
        awayActiveLineup: createLineup('away'),
      },
      teamSide: 'home',
      playerId: 'home-libero-2',
      skill: 'block',
    }).violation,
    'libero_illegal_block',
    'rules engine rejects libero block touch',
  );
  assertions += expectEqual(
    validateLiberoTouch({
      lineups: {
        homeActiveLineup: secondLiberoLineup!,
        awayActiveLineup: createLineup('away'),
      },
      teamSide: 'home',
      playerId: 'home-libero-2',
      skill: 'attack',
    }).violation,
    'libero_illegal_attack',
    'rules engine rejects simplified libero attack touch',
  );

  const illegalStats = buildMatchStats({
    homeTeam: homeTeamWithTwoLiberos,
    awayTeam: createTeam('away'),
    committedTouches: [
      createTouch({
        id: 'legal-libero-receive',
        teamSide: 'home',
        playerId: 'home-libero',
        skill: 'receive',
        evaluation: '+',
        sequenceNumber: 1,
      }),
      createTouch({
        id: 'illegal-libero-block',
        teamSide: 'home',
        playerId: 'home-libero',
        skill: 'block',
        evaluation: '#',
        sequenceNumber: 2,
      }),
      createTouch({
        id: 'illegal-libero-serve',
        teamSide: 'home',
        playerId: 'home-libero',
        skill: 'serve',
        evaluation: '#',
        sequenceNumber: 3,
      }),
    ],
  });
  const liberoStats = illegalStats.playerStats.find((player) => player.playerId === 'home-libero');
  assertions += expectEqual(liberoStats?.receive.total, 1, 'legal libero receive counts normally');
  assertions += expectEqual(liberoStats?.block.total, 0, 'illegal libero block is excluded from stats');
  assertions += expectEqual(liberoStats?.serve.total, 0, 'illegal libero serve is excluded from stats');
  assertions += expectEqual(illegalStats.teamStats.home.blockPoints, 0, 'illegal libero block point is excluded from team stats');
  assertions += expectEqual(illegalStats.teamStats.home.aces, 0, 'illegal libero serve ace is excluded from team stats');

  return assertions;
}

function validateInitialLiberoAutoMiddleSetup(): number {
  let assertions = 0;
  const homeStartingLineup = {
    ...createStartingLineup('home', true),
    liberoAutoMiddleReplacement: true,
  };
  const awayStartingLineup = {
    ...createStartingLineup('away', true),
    liberoAutoMiddleReplacement: true,
  };
  const startedMatch = createLiveMatchStateFromSetStart({
    activeProjectId: 'validation-project',
    setNumber: 1,
    homeStartingLineup,
    awayStartingLineup,
    servingTeam: 'home',
    createdAt: 1,
  });
  const awayLineup = startedMatch.awayActiveLineup;
  const awayLiberoSlot = awayLineup?.slots.find((slot) => slot.playerId === 'away-libero');
  const replayedMatch = replayLiveMatchFromEvents('validation-project', startedMatch.eventLog);
  const replayedAwayLiberoSlot = replayedMatch?.awayActiveLineup?.slots.find((slot) => slot.playerId === 'away-libero');

  assertions += expectTruthy(awayLiberoSlot, 'initial receiving team libero auto-middle replacement is active');
  assertions += expectEqual(awayLiberoSlot?.courtPosition, 6, 'initial receiving libero replaces the back-row middle');
  assertions += expectEqual(awayLiberoSlot?.isLibero, true, 'initial receiving libero slot is marked as libero');
  assertions += expectEqual(awayLiberoSlot?.replacedPlayerId, 'away-p6', 'initial receiving libero slot stores replacedPlayerId');
  assertions += expectEqual(
    awayLineup?.personnelState.activeLiberoState?.liberoPlayerId,
    'away-libero',
    'initial active libero state stores libero player',
  );
  assertions += expectEqual(
    awayLineup?.personnelState.activeLiberoState?.replacedPlayerId,
    'away-p6',
    'initial active libero state stores replaced player',
  );
  assertions += expectTruthy(
    awayLineup?.personnelState.onCourtPlayerIds.includes('away-libero'),
    'initial receiving personnel puts libero on court',
  );
  assertions += expectFalse(
    awayLineup?.personnelState.onCourtPlayerIds.includes('away-p6'),
    'initial receiving personnel removes replaced middle from court',
  );
  assertions += expectTruthy(
    awayLineup?.personnelState.benchPlayerIds.includes('away-p6'),
    'initial receiving personnel moves replaced middle to bench',
  );
  assertions += expectEqual(
    replayedAwayLiberoSlot?.replacedPlayerId,
    'away-p6',
    'replay preserves initial receiving libero replacement',
  );

  const receivingMarkers = resolveTacticalCourtPlayers({
    teamSide: 'away',
    team: createTeam('away', true),
    lineup: awayLineup,
    phase: 'reception',
    defenseSystemBlock: DEFAULT_DEFENSE_SYSTEM_BLOCK,
    receptionSystemBlock: DEFAULT_RECEPTION_SYSTEM_BLOCK,
  });
  const receivingLiberoMarker = receivingMarkers.find((player) => player.playerId === 'away-libero');
  assertions += expectTruthy(receivingLiberoMarker, 'rendered tactical markers show initial receiving libero');
  assertions += expectEqual(receivingLiberoMarker?.isLibero, true, 'rendered initial receiving marker is libero');
  assertions += expectEqual(
    receivingLiberoMarker?.replacedPlayerId,
    'away-p6',
    'rendered initial receiving marker tracks replaced middle',
  );
  assertions += expectFalse(
    receivingMarkers.some((player) => player.playerId === 'away-p6'),
    'rendered tactical markers hide replaced middle',
  );

  const frontRowMiddleLineup = createActiveLineup(createFrontRowMiddleStartingLineup('home'), { servingTeam: 'away' });
  assertions += expectEqual(
    frontRowMiddleLineup.personnelState.activeLiberoState,
    undefined,
    'initial setup does not replace a front-row middle',
  );
  assertions += expectFalse(
    frontRowMiddleLineup.slots.some((slot) => slot.isLibero),
    'initial setup leaves libero off court when only middles are front row',
  );

  const servingMiddleStartingLineup = createMiddleServerStartingLineup('home');
  const servingMiddleLineup = createActiveLineup(servingMiddleStartingLineup, { servingTeam: 'home' });
  const unknownServingContextLineup = createActiveLineup(servingMiddleStartingLineup);
  const liberoServingAllowedLineup = createActiveLineup(servingMiddleStartingLineup, {
    servingTeam: 'home',
    allowLiberoServe: true,
  });

  assertions += expectEqual(
    servingMiddleLineup.personnelState.activeLiberoState,
    undefined,
    'initial setup does not replace serving middle in zone 1',
  );
  assertions += expectEqual(
    servingMiddleLineup.slots.find((slot) => slot.courtPosition === 1)?.playerId,
    'home-p1',
    'serving middle remains in zone 1 before serve',
  );
  assertions += expectEqual(
    unknownServingContextLineup.personnelState.activeLiberoState,
    undefined,
    'initial setup avoids zone 1 libero replacement without serving context',
  );
  assertions += expectEqual(
    liberoServingAllowedLineup.slots.find((slot) => slot.courtPosition === 1)?.playerId,
    'home-libero',
    'initial setup can replace zone 1 middle when libero serving is allowed',
  );
  assertions += expectEqual(
    liberoServingAllowedLineup.personnelState.activeLiberoState?.replacedPlayerId,
    'home-p1',
    'initial libero serving replacement tracks replaced middle',
  );

  return assertions;
}

function validateAutomaticLiberoEntryAfterSideOut(): number {
  let assertions = 0;

  (['home', 'away'] as const).forEach((teamSide) => {
    const opponentTeamSide = teamSide === 'home' ? 'away' : 'home';
    const lineup = createMiddleServingLineup(teamSide);
    const servingLiveMatch = createLiveMatch({
      homeLineup: teamSide === 'home' ? lineup : createLineup('home'),
      awayLineup: teamSide === 'away' ? lineup : createLineup('away'),
      servingTeam: teamSide,
    });
    const afterSideOutLiveMatch = createLiveMatch({
      homeLineup: teamSide === 'home' ? lineup : createLineup('home'),
      awayLineup: teamSide === 'away' ? lineup : createLineup('away'),
      servingTeam: opponentTeamSide,
      currentRallyNumber: 2,
    });

    assertions += expectEqual(
      getAutomaticLiberoReplacementProposal(servingLiveMatch, teamSide),
      null,
      `${teamSide} libero is not proposed to serve for middle in position 1`,
    );

    const proposal = getAutomaticLiberoReplacementProposal(afterSideOutLiveMatch, teamSide);
    assertions += expectTruthy(proposal, `${teamSide} libero entry is proposed after losing serve`);
    assertions += expectEqual(proposal?.reason, 'middle_back_row', `${teamSide} libero entry reason after side-out`);
    assertions += expectEqual(proposal?.action, 'libero_enters', `${teamSide} libero entry action after side-out`);
    assertions += expectEqual(proposal?.playerOutId, `${teamSide}-p1`, `${teamSide} middle exits after side-out`);
    assertions += expectEqual(proposal?.playerInId, `${teamSide}-libero`, `${teamSide} libero enters after side-out`);

    if (!proposal) {
      return;
    }

    const replacedLineup = applyLiberoReplacementToLineup(
      lineup,
      buildLiberoReplacementEvent(afterSideOutLiveMatch, proposal),
    );
    assertions += expectTruthy(replacedLineup, `${teamSide} automatic libero entry applies after confirmation`);
    assertions += expectEqual(
      replacedLineup?.personnelState.activeLiberoState?.replacedPlayerId,
      `${teamSide}-p1`,
      `${teamSide} active libero state tracks replaced middle`,
    );
    assertions += expectEqual(
      replacedLineup?.slots.find((slot) => slot.courtPosition === 1)?.playerId,
      `${teamSide}-libero`,
      `${teamSide} libero appears immediately in middle server slot`,
    );
  });

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
  const sideOutZoneOnePlayerId = receivingWinReplay?.awayActiveLineup?.slots.find((slot) => slot.courtPosition === 1)?.playerId;
  const sideOutZoneTwoPlayerId = receivingWinReplay?.awayActiveLineup?.slots.find((slot) => slot.courtPosition === 2)?.playerId;
  assertions += expectEqual(
    receivingWinReplay?.awayActiveLineup?.slots.find((slot) => slot.playerId === 'away-p1')?.courtPosition,
    6,
    'receiving team winning rally rotates lineup',
  );
  assertions += expectEqual(
    getServingPlayerIdFromLineup(receivingWinReplay?.awayActiveLineup, 'away'),
    sideOutZoneOnePlayerId,
    'side-out server is selected from post-rotation zone 1',
  );
  assertions += expectFalse(
    getServingPlayerIdFromLineup(receivingWinReplay?.awayActiveLineup, 'away') === sideOutZoneTwoPlayerId,
    'side-out server is never selected from post-rotation zone 2',
  );
  assertions += expectEqual(receivingWinReplay?.servingTeam, 'away', 'receiving team becomes serving team after side-out');

  const servingWinReplay = replayLiveMatchFromEvents('validation-project', [
    createSetStartedEvent('home'),
    createRallyStartedEvent(),
    createPointAwardedEvent('home'),
  ]);
  assertions += expectTruthy(servingWinReplay, 'serving-team point replay succeeds');
  const servingWinServerBefore = createStartingLineup('home').slots.find((slot) => slot.courtPosition === 1)?.playerId;
  assertions += expectEqual(
    servingWinReplay?.homeActiveLineup?.slots.find((slot) => slot.playerId === 'home-p1')?.courtPosition,
    1,
    'serving team winning rally does not rotate lineup',
  );
  assertions += expectEqual(
    getServingPlayerIdFromLineup(servingWinReplay?.homeActiveLineup, 'home'),
    servingWinServerBefore,
    'serving team winning point keeps the same server',
  );
  assertions += expectEqual(servingWinReplay?.servingTeam, 'home', 'serving team stays serving after break point');

  const configuredSideSetStarted: Extract<MatchEvent, { type: 'set_started' }> = {
    ...createSetStartedEvent('home'),
    homeLineup: {
      ...createStartingLineup('home'),
      displaySide: 'right',
    },
    awayLineup: {
      ...createStartingLineup('away'),
      displaySide: 'left',
    },
  };
  const sideAssignmentReplay = replayLiveMatchFromEvents('validation-project', [
    configuredSideSetStarted,
    createRallyStartedEvent(),
    createPointAwardedEvent('away'),
  ]);
  assertions += expectEqual(sideAssignmentReplay?.awayScore, 1, 'court-side assignment does not change score logic');
  assertions += expectEqual(sideAssignmentReplay?.servingTeam, 'away', 'court-side assignment does not change side-out serving logic');
  assertions += expectEqual(
    getServingPlayerIdFromLineup(sideAssignmentReplay?.awayActiveLineup, 'away'),
    sideAssignmentReplay?.awayActiveLineup?.slots.find((slot) => slot.courtPosition === 1)?.playerId,
    'court-side assignment still selects server from logical zone 1',
  );
  const configuredHomeMarkers = resolveTacticalCourtPlayers({
    teamSide: 'home',
    team: createTeam('home'),
    lineup: createActiveLineup(configuredSideSetStarted.homeLineup),
    phase: 'break_point_defense',
    defenseSystemBlock: DEFAULT_DEFENSE_SYSTEM_BLOCK,
    receptionSystemBlock: DEFAULT_RECEPTION_SYSTEM_BLOCK,
    displaySide: configuredSideSetStarted.homeLineup.displaySide,
  });
  const configuredAwayMarkers = resolveTacticalCourtPlayers({
    teamSide: 'away',
    team: createTeam('away'),
    lineup: createActiveLineup(configuredSideSetStarted.awayLineup),
    phase: 'side_out_defense',
    defenseSystemBlock: DEFAULT_DEFENSE_SYSTEM_BLOCK,
    receptionSystemBlock: DEFAULT_RECEPTION_SYSTEM_BLOCK,
    displaySide: configuredSideSetStarted.awayLineup.displaySide,
  });
  assertions += expectTacticalMarkerInvariant(configuredHomeMarkers, 'initial home/right markers');
  assertions += expectTacticalMarkerInvariant(configuredAwayMarkers, 'initial away/left markers');
  assertions += expectMarkersOnDisplaySide(configuredHomeMarkers, 'right', 'initial home/right markers');
  assertions += expectMarkersOnDisplaySide(configuredAwayMarkers, 'left', 'initial away/left markers');
  assertions += expectEqual(
    getServingPlayerId(configuredAwayMarkers, 'away'),
    getServingPlayerIdFromLineup(createActiveLineup(configuredSideSetStarted.awayLineup), 'away'),
    'visual side inversion keeps logical zone 1 server identity',
  );

  const configuredDefaultZones = remapScoutingZonesForDisplaySides(SCOUTING_ZONES, {
    home: 'right',
    away: 'left',
  });
  const configuredInvertedZones = remapScoutingZonesForDisplaySides(SCOUTING_ZONES, {
    home: 'left',
    away: 'right',
  });
  assertions += expectInRange(
    getDefaultServeStartZoneForTeam('home', configuredDefaultZones)?.center.x ?? -1,
    50,
    100,
    'home/right setup places home serve start on the right',
  );
  assertions += expectInRange(
    getDefaultServeStartZoneForTeam('away', configuredDefaultZones)?.center.x ?? -1,
    0,
    50,
    'away/left setup places away serve start on the left',
  );
  assertions += expectInRange(
    getDefaultServeStartZoneForTeam('home', configuredInvertedZones)?.center.x ?? 101,
    0,
    50,
    'home/left setup places home serve start on the left',
  );
  assertions += expectInRange(
    getDefaultServeStartZoneForTeam('away', configuredInvertedZones)?.center.x ?? -1,
    50,
    100,
    'away/right setup places away serve start on the right',
  );

  const invertedAwayTargetZone = configuredInvertedZones.find((zone) => (
    zone.kind === 'in_court'
    && zone.teamSide === 'away'
    && zone.gridCoordinate.row === 2
    && zone.gridCoordinate.column === 4
  ));
  const invertedHomeOwnZone = configuredInvertedZones.find((zone) => (
    zone.kind === 'in_court'
    && zone.teamSide === 'home'
    && zone.gridCoordinate.row === 2
    && zone.gridCoordinate.column === 4
  ));
  assertions += expectTruthy(invertedAwayTargetZone, 'home-left setup exposes away target zones on the right');
  if (invertedAwayTargetZone) {
    assertions += expectInRange(invertedAwayTargetZone.center.x, 50, 100, 'away target zone follows configured right side');
    assertions += expectEqual(
      isServeReleaseInReceivingCourt({
        destinationPoint: invertedAwayTargetZone.center,
        servingTeam: 'home',
        receivingZone: invertedAwayTargetZone,
      }),
      true,
      'reception court check follows configured receiving side',
    );
    assertions += expectTruthy(
      buildReceptionDrivenServeReceiveTouch({
        zone: invertedAwayTargetZone,
        destinationPoint: invertedAwayTargetZone.center,
        servingTeam: 'home',
        servingPlayerId: 'home-p1',
        teamPlayersBySide: {
          home: [createTacticalPlayerMarker({ teamSide: 'home', playerNumber: 1, x: 14, y: 80 })],
          away: [createTacticalPlayerMarker({
            teamSide: 'away',
            playerNumber: 5,
            x: invertedAwayTargetZone.center.x,
            y: invertedAwayTargetZone.center.y,
          })],
        },
      }),
      'home-left setup can create reception on away/right court',
    );
  }
  if (invertedHomeOwnZone) {
    assertions += expectEqual(
      isServeReleaseInReceivingCourt({
        destinationPoint: invertedHomeOwnZone.center,
        servingTeam: 'home',
        receivingZone: invertedHomeOwnZone,
      }),
      false,
      'home-left setup does not treat own left court as receiving court',
    );
  }

  const nextSetPrefill = getNextSetPrefillConfig({
    eventLog: [configuredSideSetStarted],
    nextSetNumber: 2,
  });
  assertions += expectEqual(nextSetPrefill?.homeStartingLineup.displaySide, 'left', 'post-set inversion flips home display side');
  assertions += expectEqual(nextSetPrefill?.awayStartingLineup.displaySide, 'right', 'post-set inversion flips away display side');
  if (nextSetPrefill) {
    const invertedHomeMarkers = resolveTacticalCourtPlayers({
      teamSide: 'home',
      team: createTeam('home'),
      lineup: createActiveLineup(nextSetPrefill.homeStartingLineup),
      phase: 'break_point_defense',
      defenseSystemBlock: DEFAULT_DEFENSE_SYSTEM_BLOCK,
      receptionSystemBlock: DEFAULT_RECEPTION_SYSTEM_BLOCK,
      displaySide: nextSetPrefill.homeStartingLineup.displaySide,
    });
    const invertedAwayMarkers = resolveTacticalCourtPlayers({
      teamSide: 'away',
      team: createTeam('away'),
      lineup: createActiveLineup(nextSetPrefill.awayStartingLineup),
      phase: 'side_out_defense',
      defenseSystemBlock: DEFAULT_DEFENSE_SYSTEM_BLOCK,
      receptionSystemBlock: DEFAULT_RECEPTION_SYSTEM_BLOCK,
      displaySide: nextSetPrefill.awayStartingLineup.displaySide,
    });
    assertions += expectTacticalMarkerInvariant(invertedHomeMarkers, 'post-set inverted home markers');
    assertions += expectTacticalMarkerInvariant(invertedAwayMarkers, 'post-set inverted away markers');
    assertions += expectMarkersOnDisplaySide(invertedHomeMarkers, 'left', 'post-set inverted home markers');
    assertions += expectMarkersOnDisplaySide(invertedAwayMarkers, 'right', 'post-set inverted away markers');
  }

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

  assertions += validateScoutingModes();
  assertions += validateAdvancedDataVolleyDetails();
  assertions += validateBallTrajectories();
  assertions += validateDataVolleyZoneCoordinates();
  assertions += validateTacticalRoleMapping();
  assertions += validateTacticalLayoutModules();
  assertions += validateTacticalPositionResolver();
  assertions += validateRallyFlowHelpers();
  assertions += validateReceptionDrivenServeWorkflow();
  assertions += validateCourtFirstInputState();
  assertions += validateLiveSmartphoneLayout();
  assertions += validateServeAceFlow();
  assertions += validateAttackBlockerSelectionFlow();
  assertions += validateLiberoFlows();
  assertions += validateLiberoRulesEngine();
  assertions += validateInitialLiberoAutoMiddleSetup();
  assertions += validateAutomaticLiberoEntryAfterSideOut();
  assertions += validateSetterReleaseTransitions();
  assertions += validateTacticalTransitions();
  assertions += validatePopupPlacement();

  return { assertions };
}
