import type { CourtPosition, SkillEvaluation, SkillType, TeamSide } from '@src/domain/common/enums';
import type { MatchEvent } from '@src/domain/events/types';
import { createActiveLineup } from '@src/domain/lineup';
import type { ActiveLineup, StartingLineup } from '@src/domain/lineup/types';
import { normalizeMatchProject } from '@src/domain/match';
import type { MatchProject } from '@src/domain/match/types';
import type { Player, Team } from '@src/domain/roster/types';
import { DEFAULT_SCOUTING_MODE } from '@src/domain/scouting';
import { createFullScoutingCells, type ScoutingZone } from '@src/domain/spatial';
import { PlayerRole } from '@src/domain/systems';
import type { BallTouch } from '@src/domain/touch/types';
import { DEFAULT_DEFENSE_SYSTEM_BLOCK, DEFAULT_RECEPTION_SYSTEM_BLOCK } from '@src/config/systems';
import { buildDataVolleyRallyCode } from './datavolley-code';
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
  buildPendingTouchForZone,
  resolveAceVictimFlow,
  resolveEvaluationFlow,
} from '../live/rally/rally-flow';
import { buildNextPendingTouch } from '../model/datavolley-flow';
import {
  shouldRenderCourtFirstLiveRally,
  shouldRenderDeadBallEventsPanel,
} from '../live/rally/live-stage-layout';
import {
  createLiveToolbarSnapshot,
} from '../live/rally/live-toolbar-state';
import { getToolbarModeLayout } from '../live/rally/toolbar-mode-layout';
import { shouldReplaceLatestPendingTouch } from '../live/rally/rally-validation';
import type { LiveMatchState } from './index';
import { buildMatchStats } from './match-stats';
import {
  canCommitPendingTouchWithDefaults,
  getScoutingModeConfig,
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
  const defaultProject = createValidationProject();
  const simpleConfig = getScoutingModeConfig('simple');
  const advancedConfig = getScoutingModeConfig('advanced');
  const simpleLayout = getToolbarModeLayout('simple', null);
  const advancedLayout = getToolbarModeLayout('advanced', null);

  assertions += expectEqual(defaultProject.scoutingSession?.scoutingMode, DEFAULT_SCOUTING_MODE, 'default scouting mode is simple');
  assertions += expectEqual(simpleConfig.toolbarDensity, 'compact', 'simple mode uses compact toolbar density');
  assertions += expectEqual(advancedConfig.toolbarDensity, 'detailed', 'advanced mode uses detailed toolbar density');
  assertions += expectEqual(canCommitPendingTouchWithDefaults('simple'), true, 'simple mode allows default skill/evaluation commit');
  assertions += expectEqual(canCommitPendingTouchWithDefaults('advanced'), false, 'advanced mode requires explicit skill/evaluation');
  assertions += expectEqual(simpleConfig.requiredExplicitInput.evaluation, false, 'simple mode reduces mandatory evaluation input');
  assertions += expectEqual(advancedConfig.requiredExplicitInput.evaluation, true, 'advanced mode keeps evaluation explicit');
  assertions += expectTruthy(
    simpleLayout.visibleSkills.length < advancedLayout.visibleSkills.length,
    'simple toolbar shows fewer visible skill controls',
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
  assertions += expectEqual(simpleInputState.scoutingMode, 'simple', 'simple input state records active mode');
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
  assertions += expectEqual(pendingTouch.source, 'explicit', 'pending touches are explicit until inference exists');

  const inferredDigTouch = buildNextPendingTouch({
    zone: targetZone,
    previousTouch: {
      playerId: 'home-p2',
      teamSide: 'home',
      skill: 'attack',
      evaluation: '!',
      zone: targetZone,
    },
    selectedPlayerId: 'away-p1',
    selectedTeamSide: 'away',
  });
  assertions += expectTruthy(inferredDigTouch, 'simple mode can infer deterministic dig after positive attack');
  if (inferredDigTouch) {
    assertions += expectEqual(inferredDigTouch.skill, 'dig', 'implicit inference selects dig after opponent attack kills');
  }

  const inferredSetTouch = buildNextPendingTouch({
    zone: targetZone,
    previousTouch: {
      playerId: 'away-p1',
      teamSide: 'away',
      skill: 'receive',
      evaluation: '+',
      zone: targetZone,
    },
    selectedPlayerId: 'away-p2',
    selectedTeamSide: 'away',
  });
  assertions += expectTruthy(inferredSetTouch, 'simple mode can infer deterministic set after reception');
  if (inferredSetTouch) {
    assertions += expectEqual(inferredSetTouch.skill, 'set', 'implicit inference selects set after receive');
  }

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
      point: touch.destinationPoint ?? touch.zone.center,
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
    playerTeamById: {
      'home-p1': 'home',
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

  assertions += validateScoutingModes();
  assertions += validateDataVolleyZoneCoordinates();
  assertions += validateTacticalRoleMapping();
  assertions += validateTacticalLayoutModules();
  assertions += validateTacticalPositionResolver();
  assertions += validateRallyFlowHelpers();
  assertions += validateCourtFirstInputState();
  assertions += validateServeAceFlow();
  assertions += validateLiberoFlows();
  assertions += validateLiberoRulesEngine();
  assertions += validateInitialLiberoAutoMiddleSetup();
  assertions += validateAutomaticLiberoEntryAfterSideOut();
  assertions += validateSetterReleaseTransitions();
  assertions += validateTacticalTransitions();
  assertions += validatePopupPlacement();

  return { assertions };
}
