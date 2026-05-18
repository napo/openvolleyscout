import type { SkillEvaluation, SkillType, TeamSide } from '@src/domain/common/enums';
import type { MatchEvent } from '@src/domain/events/types';
import type { Team, Player } from '@src/domain/roster/types';
import type { CompletedSetSummary } from '@src/domain/scouting/types';
import { getSetLeadingTeam, normalizeCompletedSetSummary } from '../../../domain/scouting/helpers';
import type { BallTouch } from '@src/domain/touch/types';
import { buildDataVolleyRallyCode } from './datavolley-code';
import {
  getOppositeTeamSide,
  isTrueTerminalTouch,
  resolvePointWinnerFromTouch,
  type ScoringTouch,
} from './scoring-rules';
import { getIllegalLiberoStatsViolation } from '../live/libero';

export type TrackedSkill =
  | 'serve'
  | 'receive'
  | 'set'
  | 'attack'
  | 'block'
  | 'dig'
  | 'freeball'
  | 'cover';

type SkillStatMap = Record<TrackedSkill, SkillStats>;

export interface SkillStats {
  total: number;
  positive: number;
  perfect: number;
  errors: number;
  points: number;
  neutral: number;
  slash: number;
  exclamation: number;
  minus: number;
  plus: number;
  hash: number;
  equal: number;
}

export interface TeamStats extends SkillStatMap {
  teamSide: TeamSide;
  teamName: string;
  totalTouches: number;
  points: number;
  errors: number;
  winningTouches: number;
  aces: number;
  attackPoints: number;
  blockPoints: number;
  serveErrors: number;
  attackErrors: number;
  attackBlocked: number;
  receptionErrors: number;
}

export interface PlayerStats extends SkillStatMap {
  playerId: string;
  jerseyNumber: number | string;
  playerName: string;
  teamSide: TeamSide;
  role?: Player['role'];
  isLibero?: boolean;
  totalTouches: number;
  points: number;
  errors: number;
  aces: number;
  attackPoints: number;
  blockPoints: number;
  serveErrors: number;
  attackErrors: number;
  attackBlocked: number;
  receptionErrors: number;
}

export interface TeamServeQuickStats {
  total: number;
  aces: number;
  errors: number;
  efficiency: number | null;
}

export interface TeamReceptionQuickStats {
  total: number;
  perfect: number;
  positive: number;
  negative: number;
  errors: number;
  efficiency: number | null;
  perfectPercentage: number | null;
}

export interface TeamAttackQuickStats {
  attempts: number;
  points: number;
  errors: number;
  blocked: number;
  efficiency: number | null;
  killPercentage: number | null;
}

export interface TeamBlockQuickStats {
  attempts: number;
  points: number;
  opponentAttackAttempts: number;
  efficiency: number | null;
}

export interface TeamQuickStats {
  teamSide: TeamSide;
  teamName: string;
  serve: TeamServeQuickStats;
  reception: TeamReceptionQuickStats;
  attack: TeamAttackQuickStats;
  block: TeamBlockQuickStats;
}

export interface PlayerQuickStats {
  playerId: string;
  jerseyNumber: number | string;
  playerName: string;
  teamSide: TeamSide;
  totalPoints: number;
  attackPoints: number;
  blockPoints: number;
  aces: number;
  errors: number;
  reception: TeamReceptionQuickStats;
  attack: TeamAttackQuickStats;
}

export interface MatchStatsQuickStats {
  teams: Record<TeamSide, TeamQuickStats>;
  players: PlayerQuickStats[];
}

export type RotationNumber = 1 | 2 | 3 | 4 | 5 | 6;

export interface SideOutStats {
  sideOutAttempts: number;
  sideOutWins: number;
  sideOutPercentage: number | null;
}

export interface BreakPointStats {
  breakPointAttempts: number;
  breakPointWins: number;
  breakPointPercentage: number | null;
}

export interface RotationStats {
  rotationNumber: RotationNumber;
  sideOutAttempts: number;
  sideOutWins: number;
  sideOutPercentage: number | null;
  breakPointAttempts: number;
  breakPointWins: number;
  breakPointPercentage: number | null;
  pointsScored: number;
  pointsConceded: number;
}

export interface AdvancedStats {
  sideOut: Record<TeamSide, SideOutStats>;
  breakPoint: Record<TeamSide, BreakPointStats>;
  rotations: Record<TeamSide, RotationStats[]>;
}

export interface RallyStats {
  setNumber: number;
  rallyNumber: number;
  touches: BallTouch[];
  dataVolleyCode: string;
  servingTeam: TeamSide | null;
  pointWinner: TeamSide | null;
  terminalReason: string | null;
}

export interface SetStats {
  setNumber: number;
  homeScore: number;
  awayScore: number;
  winner: TeamSide | null;
  totalTouches: number;
  rallies: RallyStats[];
}

export interface MatchStats {
  teamStats: Record<TeamSide, TeamStats>;
  playerStats: PlayerStats[];
  setStats: SetStats[];
  rallyStats: RallyStats[];
  setsWon: Record<TeamSide, number>;
  totalTouches: number;
  quickStats: MatchStatsQuickStats;
  advancedStats: AdvancedStats;
  sideOutStats: AdvancedStats['sideOut'];
  breakPointStats: AdvancedStats['breakPoint'];
  rotationStats: AdvancedStats['rotations'];
}

export interface BuildMatchStatsInput {
  homeTeam: Team;
  awayTeam: Team;
  touches?: BallTouch[];
  eventLog?: MatchEvent[];
  liveMatch?: {
    eventLog?: MatchEvent[];
    completedSets?: CompletedSetSummary[];
    currentRallyTouches?: BallTouch[];
  };
  committedTouches?: BallTouch[];
  completedSets?: CompletedSetSummary[];
  currentRallyTouches?: BallTouch[];
  getJerseyNumber?: (playerId?: string) => number | string | undefined;
  getPlayerName?: (playerId?: string) => string | undefined;
}

function isSetScopedEvent(event: MatchEvent, setNumber: number): boolean {
  switch (event.type) {
    case 'set_started':
    case 'point_awarded':
    case 'substitution_made':
    case 'timeout_called':
    case 'set_ended':
      return event.setNumber === setNumber;
    case 'touch_recorded':
      return event.touch.setNumber === setNumber;
    case 'rally_ended':
      return event.setNumber === setNumber;
    default:
      return false;
  }
}

function filterTouchesBySet(touches: readonly BallTouch[] | undefined, setNumber: number): BallTouch[] | undefined {
  return touches?.filter((touch) => touch.setNumber === setNumber);
}

function filterCompletedSetsBySet(
  completedSets: readonly CompletedSetSummary[] | undefined,
  setNumber: number,
): CompletedSetSummary[] | undefined {
  return completedSets?.filter((setSummary) => setSummary.setNumber === setNumber);
}

export function filterMatchEventsBySet(eventLog: readonly MatchEvent[], setNumber: number): MatchEvent[] {
  return eventLog.filter((event) => isSetScopedEvent(event, setNumber));
}

const TRACKED_SKILLS: readonly TrackedSkill[] = [
  'serve',
  'receive',
  'set',
  'attack',
  'block',
  'dig',
  'freeball',
  'cover',
];

const ROTATION_NUMBERS: readonly RotationNumber[] = [1, 2, 3, 4, 5, 6];

const NEXT_ROTATION_BY_SIDE_OUT: Record<RotationNumber, RotationNumber> = {
  1: 6,
  6: 5,
  5: 4,
  4: 3,
  3: 2,
  2: 1,
};

type PointAwardedEvent = Extract<MatchEvent, { type: 'point_awarded' }>;
type SetStartedEvent = Extract<MatchEvent, { type: 'set_started' }>;

type TouchRecord = {
  touch: BallTouch;
  source: 'event' | 'touches' | 'committed' | 'current';
};

type RallyDraft = {
  setNumber: number;
  rallyNumber: number;
  touches: BallTouch[];
  pointWinner: TeamSide | null;
  terminalReason: string | null;
};

function isTrackedSkill(skill: SkillType): skill is TrackedSkill {
  return TRACKED_SKILLS.includes(skill as TrackedSkill);
}

function createSkillStatMap(): SkillStatMap {
  return TRACKED_SKILLS.reduce((stats, skill) => {
    stats[skill] = createEmptySkillStats();
    return stats;
  }, {} as SkillStatMap);
}

export function safeDivide(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

export function createEmptySkillStats(): SkillStats {
  return {
    total: 0,
    positive: 0,
    perfect: 0,
    errors: 0,
    points: 0,
    neutral: 0,
    slash: 0,
    exclamation: 0,
    minus: 0,
    plus: 0,
    hash: 0,
    equal: 0,
  };
}

function buildTeamQuickStats(teamStats: TeamStats, opponentStats: TeamStats): TeamQuickStats {
  const serve = teamStats.serve;
  const reception = teamStats.receive;
  const attack = teamStats.attack;
  const block = teamStats.block;

  return {
    teamSide: teamStats.teamSide,
    teamName: teamStats.teamName,
    serve: {
      total: serve.total,
      aces: teamStats.aces,
      errors: teamStats.serveErrors,
      efficiency: safeDivide(teamStats.aces - teamStats.serveErrors, serve.total),
    },
    reception: {
      total: reception.total,
      perfect: reception.perfect,
      positive: reception.positive,
      negative: reception.minus,
      errors: teamStats.receptionErrors,
      efficiency: safeDivide(reception.perfect + reception.positive, reception.total),
      perfectPercentage: safeDivide(reception.perfect, reception.total),
    },
    attack: {
      attempts: attack.total,
      points: teamStats.attackPoints,
      errors: teamStats.attackErrors,
      blocked: teamStats.attackBlocked,
      efficiency: safeDivide(
        teamStats.attackPoints - teamStats.attackErrors - teamStats.attackBlocked,
        attack.total,
      ),
      killPercentage: safeDivide(teamStats.attackPoints, attack.total),
    },
    block: {
      attempts: block.total,
      points: teamStats.blockPoints,
      opponentAttackAttempts: opponentStats.attack.total,
      efficiency: safeDivide(teamStats.blockPoints, opponentStats.attack.total),
    },
  };
}

function buildPlayerQuickStats(playerStats: PlayerStats): PlayerQuickStats {
  return {
    playerId: playerStats.playerId,
    jerseyNumber: playerStats.jerseyNumber,
    playerName: playerStats.playerName,
    teamSide: playerStats.teamSide,
    totalPoints: playerStats.points,
    attackPoints: playerStats.attackPoints,
    blockPoints: playerStats.blockPoints,
    aces: playerStats.aces,
    errors: playerStats.errors,
    reception: {
      total: playerStats.receive.total,
      perfect: playerStats.receive.perfect,
      positive: playerStats.receive.positive,
      negative: playerStats.receive.minus,
      errors: playerStats.receptionErrors,
      efficiency: safeDivide(playerStats.receive.perfect + playerStats.receive.positive, playerStats.receive.total),
      perfectPercentage: safeDivide(playerStats.receive.perfect, playerStats.receive.total),
    },
    attack: {
      attempts: playerStats.attack.total,
      points: playerStats.attackPoints,
      errors: playerStats.attackErrors,
      blocked: playerStats.attackBlocked,
      efficiency: safeDivide(
        playerStats.attackPoints - playerStats.attackErrors - playerStats.attackBlocked,
        playerStats.attack.total,
      ),
      killPercentage: safeDivide(playerStats.attackPoints, playerStats.attack.total),
    },
  };
}

export function buildMatchStatsQuickStats(input: {
  teamStats: Record<TeamSide, TeamStats>;
  playerStats: readonly PlayerStats[];
}): MatchStatsQuickStats {
  return {
    teams: {
      away: buildTeamQuickStats(input.teamStats.away, input.teamStats.home),
      home: buildTeamQuickStats(input.teamStats.home, input.teamStats.away),
    },
    players: input.playerStats.map(buildPlayerQuickStats),
  };
}

function createEmptySideOutStats(): SideOutStats {
  return {
    sideOutAttempts: 0,
    sideOutWins: 0,
    sideOutPercentage: null,
  };
}

function createEmptyBreakPointStats(): BreakPointStats {
  return {
    breakPointAttempts: 0,
    breakPointWins: 0,
    breakPointPercentage: null,
  };
}

function createEmptyRotationStats(rotationNumber: RotationNumber): RotationStats {
  return {
    rotationNumber,
    sideOutAttempts: 0,
    sideOutWins: 0,
    sideOutPercentage: null,
    breakPointAttempts: 0,
    breakPointWins: 0,
    breakPointPercentage: null,
    pointsScored: 0,
    pointsConceded: 0,
  };
}

function createRotationStatsByNumber(): Record<RotationNumber, RotationStats> {
  return ROTATION_NUMBERS.reduce((stats, rotationNumber) => {
    stats[rotationNumber] = createEmptyRotationStats(rotationNumber);
    return stats;
  }, {} as Record<RotationNumber, RotationStats>);
}

function createEmptyAdvancedStats(): AdvancedStats {
  return {
    sideOut: {
      away: createEmptySideOutStats(),
      home: createEmptySideOutStats(),
    },
    breakPoint: {
      away: createEmptyBreakPointStats(),
      home: createEmptyBreakPointStats(),
    },
    rotations: {
      away: ROTATION_NUMBERS.map(createEmptyRotationStats),
      home: ROTATION_NUMBERS.map(createEmptyRotationStats),
    },
  };
}

function getInitialRotationNumber(setStartedEvent: SetStartedEvent | undefined, teamSide: TeamSide): RotationNumber {
  const lineup = teamSide === 'home' ? setStartedEvent?.homeLineup : setStartedEvent?.awayLineup;
  const setterPlayerId = lineup?.setterPlayerId;
  if (!lineup || !setterPlayerId) {
    return 1;
  }

  const setterSlot = lineup.slots.find((slot) => slot.playerId === setterPlayerId);
  return ROTATION_NUMBERS.includes(setterSlot?.courtPosition as RotationNumber)
    ? setterSlot?.courtPosition as RotationNumber
    : 1;
}

function getInitialRotationState(setStartedEvent: SetStartedEvent | undefined): Record<TeamSide, RotationNumber> {
  return {
    away: getInitialRotationNumber(setStartedEvent, 'away'),
    home: getInitialRotationNumber(setStartedEvent, 'home'),
  };
}

function rotateRotationAfterSideOut(rotationNumber: RotationNumber): RotationNumber {
  return NEXT_ROTATION_BY_SIDE_OUT[rotationNumber];
}

function finalizeAdvancedStats(stats: AdvancedStats): AdvancedStats {
  (['away', 'home'] as const).forEach((teamSide) => {
    const sideOut = stats.sideOut[teamSide];
    sideOut.sideOutPercentage = safeDivide(sideOut.sideOutWins, sideOut.sideOutAttempts);

    const breakPoint = stats.breakPoint[teamSide];
    breakPoint.breakPointPercentage = safeDivide(breakPoint.breakPointWins, breakPoint.breakPointAttempts);

    stats.rotations[teamSide].forEach((rotation) => {
      rotation.sideOutPercentage = safeDivide(rotation.sideOutWins, rotation.sideOutAttempts);
      rotation.breakPointPercentage = safeDivide(rotation.breakPointWins, rotation.breakPointAttempts);
    });
  });

  return stats;
}

function getSetStartedEventBySetNumber(setStartedEvents: readonly SetStartedEvent[]): Map<number, SetStartedEvent> {
  const eventsBySetNumber = new Map<number, SetStartedEvent>();

  setStartedEvents.forEach((event) => {
    if (!eventsBySetNumber.has(event.setNumber)) {
      eventsBySetNumber.set(event.setNumber, event);
    }
  });

  return eventsBySetNumber;
}

function getPointEventByRallyKey(pointEvents: readonly PointAwardedEvent[]): Map<string, PointAwardedEvent> {
  const eventsByRallyKey = new Map<string, PointAwardedEvent>();

  pointEvents.forEach((event) => {
    eventsByRallyKey.set(createPointEventRallyKey(event), event);
  });

  return eventsByRallyKey;
}

export function buildAdvancedStats(input: {
  rallyStats: readonly RallyStats[];
  setStartedEvents: readonly SetStartedEvent[];
  pointEvents: readonly PointAwardedEvent[];
}): AdvancedStats {
  const stats = createEmptyAdvancedStats();
  const rotationStatsBySide: Record<TeamSide, Record<RotationNumber, RotationStats>> = {
    away: createRotationStatsByNumber(),
    home: createRotationStatsByNumber(),
  };
  const setStartedEventBySetNumber = getSetStartedEventBySetNumber(input.setStartedEvents);
  const pointEventByRallyKey = getPointEventByRallyKey(input.pointEvents);
  let activeSetNumber: number | null = null;
  let currentRotations: Record<TeamSide, RotationNumber> = getInitialRotationState(undefined);

  input.rallyStats
    .slice()
    .sort((left, right) => left.setNumber - right.setNumber || left.rallyNumber - right.rallyNumber)
    .forEach((rally) => {
      if (rally.setNumber !== activeSetNumber) {
        activeSetNumber = rally.setNumber;
        currentRotations = getInitialRotationState(setStartedEventBySetNumber.get(rally.setNumber));
      }

      if (!rally.servingTeam || !rally.pointWinner) {
        return;
      }

      const servingTeam = rally.servingTeam;
      const receivingTeam = getOppositeTeamSide(servingTeam);
      const pointWinner = rally.pointWinner;
      const pointLoser = getOppositeTeamSide(pointWinner);
      const servingRotation = currentRotations[servingTeam];
      const receivingRotation = currentRotations[receivingTeam];
      const winnerRotation = currentRotations[pointWinner];
      const loserRotation = currentRotations[pointLoser];

      stats.sideOut[receivingTeam].sideOutAttempts += 1;
      stats.breakPoint[servingTeam].breakPointAttempts += 1;
      rotationStatsBySide[receivingTeam][receivingRotation].sideOutAttempts += 1;
      rotationStatsBySide[servingTeam][servingRotation].breakPointAttempts += 1;
      rotationStatsBySide[pointWinner][winnerRotation].pointsScored += 1;
      rotationStatsBySide[pointLoser][loserRotation].pointsConceded += 1;

      if (pointWinner === receivingTeam) {
        stats.sideOut[receivingTeam].sideOutWins += 1;
        rotationStatsBySide[receivingTeam][receivingRotation].sideOutWins += 1;
      }

      if (pointWinner === servingTeam) {
        stats.breakPoint[servingTeam].breakPointWins += 1;
        rotationStatsBySide[servingTeam][servingRotation].breakPointWins += 1;
      }

      const pointEvent = pointEventByRallyKey.get(createRallyKey(rally.setNumber, rally.rallyNumber));
      if (pointWinner === receivingTeam && !pointEvent?.skipRotation) {
        currentRotations[pointWinner] = rotateRotationAfterSideOut(currentRotations[pointWinner]);
      }
    });

  stats.rotations = {
    away: ROTATION_NUMBERS.map((rotationNumber) => rotationStatsBySide.away[rotationNumber]),
    home: ROTATION_NUMBERS.map((rotationNumber) => rotationStatsBySide.home[rotationNumber]),
  };

  return finalizeAdvancedStats(stats);
}

function isSkillPointEvaluation(evaluation: SkillEvaluation | undefined, skill: SkillType): boolean {
  return evaluation === '#' && isTrackedSkill(skill) && isTrueTerminalTouch({
    teamSide: 'home',
    skill,
    evaluation,
  });
}

export function updateSkillStats(stats: SkillStats, touch: Pick<BallTouch, 'evaluation' | 'skill'>): SkillStats;
export function updateSkillStats(
  stats: SkillStats,
  evaluation: SkillEvaluation | undefined,
  skill: SkillType,
): SkillStats;
export function updateSkillStats(
  stats: SkillStats,
  touchOrEvaluation: Pick<BallTouch, 'evaluation' | 'skill'> | SkillEvaluation | undefined,
  skill?: SkillType,
): SkillStats {
  const touch = typeof touchOrEvaluation === 'object' && touchOrEvaluation !== null
    ? touchOrEvaluation
    : {
        evaluation: touchOrEvaluation,
        skill: skill ?? 'serve',
      };

  stats.total += 1;

  if (!touch.evaluation) {
    stats.neutral += 1;
    return stats;
  }

  switch (touch.evaluation) {
    case '#':
      stats.hash += 1;
      stats.perfect += 1;
      if (isSkillPointEvaluation(touch.evaluation, touch.skill)) {
        stats.points += 1;
      }
      break;
    case '+':
      stats.plus += 1;
      stats.positive += 1;
      break;
    case '-':
      stats.minus += 1;
      break;
    case '!':
      stats.exclamation += 1;
      stats.neutral += 1;
      break;
    case '/':
      stats.slash += 1;
      stats.neutral += 1;
      break;
    case '=':
      stats.equal += 1;
      stats.errors += 1;
      break;
  }

  return stats;
}

export function createEmptyTeamStats(teamSide: TeamSide, teamName: string): TeamStats {
  return {
    ...createSkillStatMap(),
    teamSide,
    teamName,
    totalTouches: 0,
    points: 0,
    errors: 0,
    winningTouches: 0,
    aces: 0,
    attackPoints: 0,
    blockPoints: 0,
    serveErrors: 0,
    attackErrors: 0,
    attackBlocked: 0,
    receptionErrors: 0,
  };
}

function getPlayerFallbackName(playerId: string): string {
  return `Player ${playerId}`;
}

function findPlayer(team: Team, playerId?: string): Player | undefined {
  if (!playerId) return undefined;

  return team.players.find((player) => player.id === playerId);
}

function getPlayerDisplayNameFromPlayer(player: Player): string {
  return player.shortName || [player.firstName, player.lastName].filter(Boolean).join(' ') || player.playerCode;
}

export function getPlayerDisplayName(team: Team, playerId?: string): string {
  const player = findPlayer(team, playerId);
  if (!player) {
    return playerId ? getPlayerFallbackName(playerId) : '';
  }

  return getPlayerDisplayNameFromPlayer(player);
}

export function getPlayerJerseyNumber(team: Team, playerId?: string): number | string | undefined {
  return findPlayer(team, playerId)?.jerseyNumber;
}

export function createEmptyPlayerStats(player: Player, teamSide: TeamSide): PlayerStats {
  return {
    ...createSkillStatMap(),
    playerId: player.id,
    jerseyNumber: player.jerseyNumber,
    playerName: getPlayerDisplayNameFromPlayer(player),
    teamSide,
    role: player.role,
    isLibero: player.isLibero,
    totalTouches: 0,
    points: 0,
    errors: 0,
    aces: 0,
    attackPoints: 0,
    blockPoints: 0,
    serveErrors: 0,
    attackErrors: 0,
    attackBlocked: 0,
    receptionErrors: 0,
  };
}

function createUnknownPlayerStats(input: {
  teamSide: TeamSide;
  playerId: string;
  jerseyNumber?: number | string;
  playerName?: string;
}): PlayerStats {
  return {
    ...createSkillStatMap(),
    playerId: input.playerId,
    jerseyNumber: input.jerseyNumber ?? '??',
    playerName: input.playerName ?? getPlayerFallbackName(input.playerId),
    teamSide: input.teamSide,
    totalTouches: 0,
    points: 0,
    errors: 0,
    aces: 0,
    attackPoints: 0,
    blockPoints: 0,
    serveErrors: 0,
    attackErrors: 0,
    attackBlocked: 0,
    receptionErrors: 0,
  };
}

function isTerminalWinningTouchForTouchTeam(touch: Pick<BallTouch, 'teamSide' | 'skill' | 'evaluation'>): boolean {
  return resolvePointWinnerFromTouch(touch) === touch.teamSide;
}

function applyOwnTouchToCounters(
  counters: {
    totalTouches: number;
    points: number;
    errors: number;
    winningTouches?: number;
    aces: number;
    attackPoints: number;
    blockPoints: number;
    serveErrors: number;
    attackErrors: number;
    attackBlocked: number;
    receptionErrors: number;
  },
  touch: BallTouch,
  options: {
    countPoints: boolean;
  },
) {
  counters.totalTouches += 1;

  if (touch.evaluation === '=') {
    counters.errors += 1;
  }

  if (isTerminalWinningTouchForTouchTeam(touch)) {
    if (options.countPoints) {
      counters.points += 1;
    }
    if ('winningTouches' in counters) {
      counters.winningTouches = (counters.winningTouches ?? 0) + 1;
    }
  }

  if (touch.skill === 'serve') {
    if (touch.evaluation === '#') counters.aces += 1;
    if (touch.evaluation === '=') counters.serveErrors += 1;
  }

  if (touch.skill === 'receive' && touch.evaluation === '=') {
    counters.receptionErrors += 1;
  }

  if (touch.skill === 'attack') {
    if (touch.evaluation === '#') counters.attackPoints += 1;
    if (touch.evaluation === '=') counters.attackErrors += 1;
    if (touch.evaluation === '/') counters.attackBlocked += 1;
  }

  if (touch.skill === 'block' && touch.evaluation === '#') {
    counters.blockPoints += 1;
  }
}

function getTeamForSide(input: Pick<BuildMatchStatsInput, 'homeTeam' | 'awayTeam'>, teamSide: TeamSide): Team {
  return teamSide === 'home' ? input.homeTeam : input.awayTeam;
}

export function applyTouchToTeamStats(
  teamStats: TeamStats,
  touch: BallTouch,
  options: { countPoints?: boolean } = {},
): TeamStats {
  const countPoints = options.countPoints ?? true;
  if (countPoints && isTrackedSkill(touch.skill) && resolvePointWinnerFromTouch(touch) === teamStats.teamSide) {
    teamStats.points += 1;
  }

  if (touch.teamSide !== teamStats.teamSide || !isTrackedSkill(touch.skill)) {
    return teamStats;
  }

  updateSkillStats(teamStats[touch.skill], touch);
  applyOwnTouchToCounters(teamStats, touch, { countPoints: false });

  return teamStats;
}

export function applyTouchToPlayerStats(playerStats: PlayerStats, touch: BallTouch): PlayerStats {
  if (touch.playerId !== playerStats.playerId || touch.teamSide !== playerStats.teamSide || !isTrackedSkill(touch.skill)) {
    return playerStats;
  }

  updateSkillStats(playerStats[touch.skill], touch);
  applyOwnTouchToCounters(playerStats, touch, { countPoints: true });

  return playerStats;
}

function createTouchKey(touch: BallTouch): string {
  return touch.id || [
    touch.setNumber,
    touch.rallyNumber,
    touch.sequenceNumber,
    touch.teamSide,
    touch.playerId ?? '',
    touch.skill,
    touch.createdAt,
  ].join(':');
}

function createPlayerStatsKey(teamSide: TeamSide, playerId: string): string {
  return `${teamSide}:${playerId}`;
}

function createRallyKey(setNumber: number, rallyNumber: number): string {
  return `${setNumber}:${rallyNumber}`;
}

function createTouchRallyKey(touch: Pick<BallTouch, 'setNumber' | 'rallyNumber'>): string {
  return createRallyKey(touch.setNumber, touch.rallyNumber);
}

function createPointEventRallyKey(event: Pick<Extract<MatchEvent, { type: 'point_awarded' }>, 'setNumber' | 'rallyNumber'>): string {
  return createRallyKey(event.setNumber, event.rallyNumber);
}

function collectTouchRecords(input: BuildMatchStatsInput): TouchRecord[] {
  const records: TouchRecord[] = [];
  const seenTouchKeys = new Set<string>();

  const addTouch = (touch: BallTouch, source: TouchRecord['source']) => {
    const key = createTouchKey(touch);
    if (seenTouchKeys.has(key)) {
      return;
    }

    seenTouchKeys.add(key);
    records.push({ touch, source });
  };

  const eventLogs = [
    ...(input.eventLog ? [input.eventLog] : []),
    ...(input.liveMatch?.eventLog ? [input.liveMatch.eventLog] : []),
  ];

  eventLogs
    .flat()
    .filter((event): event is Extract<MatchEvent, { type: 'touch_recorded' }> => event.type === 'touch_recorded')
    .forEach((event) => addTouch(event.touch, 'event'));

  input.touches?.forEach((touch) => addTouch(touch, 'touches'));
  input.committedTouches?.forEach((touch) => addTouch(touch, 'committed'));
  input.liveMatch?.currentRallyTouches?.forEach((touch) => addTouch(touch, 'current'));
  input.currentRallyTouches?.forEach((touch) => addTouch(touch, 'current'));

  return records;
}

function collectPointEvents(input: BuildMatchStatsInput): PointAwardedEvent[] {
  const pointEventsById = new Map<string, PointAwardedEvent>();
  const eventLogs = [
    ...(input.eventLog ? [input.eventLog] : []),
    ...(input.liveMatch?.eventLog ? [input.liveMatch.eventLog] : []),
  ];

  eventLogs
    .flat()
    .filter((event): event is PointAwardedEvent => event.type === 'point_awarded')
    .forEach((event) => {
      pointEventsById.set(event.id, event);
    });

  return [...pointEventsById.values()].sort((left, right) => (
    left.setNumber - right.setNumber
    || left.rallyNumber - right.rallyNumber
    || left.createdAt - right.createdAt
  ));
}

function getOfficialTouches(input: BuildMatchStatsInput, touches: readonly BallTouch[]): BallTouch[] {
  return touches.filter((touch) => {
    const violation = getIllegalLiberoStatsViolation({
      homeTeam: input.homeTeam,
      awayTeam: input.awayTeam,
      touch,
    });
    if (!violation) {
      return true;
    }

    console.warn(
      `[OpenVolleyScout] Excluding illegal libero touch from official stats: ${violation}`,
      touch,
    );
    return false;
  });
}

function collectSetStartedEvents(input: BuildMatchStatsInput): SetStartedEvent[] {
  const setStartedEventsById = new Map<string, SetStartedEvent>();
  const eventLogs = [
    ...(input.eventLog ? [input.eventLog] : []),
    ...(input.liveMatch?.eventLog ? [input.liveMatch.eventLog] : []),
  ];

  eventLogs
    .flat()
    .filter((event): event is SetStartedEvent => event.type === 'set_started')
    .forEach((event) => {
      setStartedEventsById.set(event.id, event);
    });

  return [...setStartedEventsById.values()].sort((left, right) => (
    left.setNumber - right.setNumber
    || left.createdAt - right.createdAt
  ));
}

function countTeamPoints(input: {
  teamSide: TeamSide;
  touches: readonly BallTouch[];
  pointEvents?: readonly PointAwardedEvent[];
}): number {
  const pointEventRallyKeys = new Set(input.pointEvents?.map(createPointEventRallyKey) ?? []);
  const terminalTouchByRally = new Map<string, BallTouch>();

  input.touches
    .filter((touch) => isTrackedSkill(touch.skill) && isTrueTerminalTouch(touch))
    .sort((left, right) => (
      left.setNumber - right.setNumber
      || left.rallyNumber - right.rallyNumber
      || left.sequenceNumber - right.sequenceNumber
      || left.createdAt - right.createdAt
    ))
    .forEach((touch) => {
      const rallyKey = createTouchRallyKey(touch);
      if (!pointEventRallyKeys.has(rallyKey)) {
        terminalTouchByRally.set(rallyKey, touch);
      }
    });

  const eventPoints = input.pointEvents?.filter((event) => event.teamSide === input.teamSide).length ?? 0;
  const terminalTouchPoints = [...terminalTouchByRally.values()].filter((touch) => (
    resolvePointWinnerFromTouch(touch) === input.teamSide
  )).length;

  return eventPoints + terminalTouchPoints;
}

export function buildTeamStats(input: {
  teamSide: TeamSide;
  team: Team;
  touches: readonly BallTouch[];
  pointEvents?: readonly PointAwardedEvent[];
}): TeamStats {
  const stats = createEmptyTeamStats(input.teamSide, input.team.name);

  input.touches.forEach((touch) => {
    applyTouchToTeamStats(stats, touch, { countPoints: false });
  });

  stats.points = countTeamPoints({
    teamSide: input.teamSide,
    touches: input.touches,
    pointEvents: input.pointEvents,
  });

  return stats;
}

export function buildPlayerStats(input: {
  homeTeam: Team;
  awayTeam: Team;
  touches: readonly BallTouch[];
  getJerseyNumber?: (playerId?: string) => number | string | undefined;
  getPlayerName?: (playerId?: string) => string | undefined;
}): PlayerStats[] {
  const playerStatsById = new Map<string, PlayerStats>();

  const addRosterPlayers = (teamSide: TeamSide, team: Team) => {
    team.players.forEach((player) => {
      playerStatsById.set(createPlayerStatsKey(teamSide, player.id), createEmptyPlayerStats(player, teamSide));
    });
  };

  addRosterPlayers('away', input.awayTeam);
  addRosterPlayers('home', input.homeTeam);

  input.touches.forEach((touch) => {
    if (!touch.playerId || !isTrackedSkill(touch.skill)) {
      return;
    }

    const team = getTeamForSide(input, touch.teamSide);
    const player = findPlayer(team, touch.playerId);
    const statsKey = createPlayerStatsKey(touch.teamSide, touch.playerId);
    const stats = playerStatsById.get(statsKey)
      ?? (player
        ? createEmptyPlayerStats(player, touch.teamSide)
        : createUnknownPlayerStats({
            teamSide: touch.teamSide,
            playerId: touch.playerId,
            jerseyNumber: input.getJerseyNumber?.(touch.playerId),
            playerName: input.getPlayerName?.(touch.playerId),
          }));

    applyTouchToPlayerStats(stats, touch);
    playerStatsById.set(statsKey, stats);
  });

  return [...playerStatsById.values()].sort((left, right) => {
    if (left.teamSide !== right.teamSide) {
      return left.teamSide === 'away' ? -1 : 1;
    }

    const leftNumber = Number(left.jerseyNumber);
    const rightNumber = Number(right.jerseyNumber);
    if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
      return leftNumber - rightNumber;
    }

    return String(left.jerseyNumber).localeCompare(String(right.jerseyNumber));
  });
}

function getTerminalReasonFromTouch(touch: ScoringTouch): string | null {
  return isTrueTerminalTouch(touch) && touch.evaluation ? `${touch.skill}_${touch.evaluation}` : null;
}

function getOrCreateRallyDraft(
  drafts: Map<string, RallyDraft>,
  setNumber: number,
  rallyNumber: number,
): RallyDraft {
  const key = createRallyKey(setNumber, rallyNumber);
  const existingDraft = drafts.get(key);
  if (existingDraft) {
    return existingDraft;
  }

  const nextDraft: RallyDraft = {
    setNumber,
    rallyNumber,
    touches: [],
    pointWinner: null,
    terminalReason: null,
  };
  drafts.set(key, nextDraft);
  return nextDraft;
}

function getFirstServeTeam(touches: readonly BallTouch[]): TeamSide | null {
  return touches.find((touch) => touch.skill === 'serve')?.teamSide ?? null;
}

function assignServingTeamsToRallies(
  rallies: readonly Omit<RallyStats, 'servingTeam'>[],
  setStartedEvents: readonly SetStartedEvent[],
): RallyStats[] {
  const setStartedEventBySetNumber = getSetStartedEventBySetNumber(setStartedEvents);
  let activeSetNumber: number | null = null;
  let currentServingTeam: TeamSide | null = null;

  return rallies.map((rally) => {
    if (rally.setNumber !== activeSetNumber) {
      activeSetNumber = rally.setNumber;
      currentServingTeam = setStartedEventBySetNumber.get(rally.setNumber)?.servingTeam ?? null;
    }

    const firstServeTeam = getFirstServeTeam(rally.touches);
    const servingTeam = currentServingTeam ?? firstServeTeam;

    if (!currentServingTeam && firstServeTeam) {
      currentServingTeam = firstServeTeam;
    }

    if (servingTeam && rally.pointWinner) {
      currentServingTeam = rally.pointWinner;
    }

    return {
      ...rally,
      servingTeam,
    };
  });
}

function buildRallyStats(
  input: BuildMatchStatsInput,
  touches: readonly BallTouch[],
  pointEvents: readonly PointAwardedEvent[],
  setStartedEvents: readonly SetStartedEvent[],
): RallyStats[] {
  const drafts = new Map<string, RallyDraft>();

  touches.forEach((touch) => {
    getOrCreateRallyDraft(drafts, touch.setNumber, touch.rallyNumber).touches.push(touch);
  });

  pointEvents.forEach((event) => {
    const draft = getOrCreateRallyDraft(drafts, event.setNumber, event.rallyNumber);
    draft.pointWinner = event.teamSide;
    draft.terminalReason = event.reason ?? null;
  });

  const rallies = [...drafts.values()]
    .map((draft) => {
      const sortedTouches = draft.touches.slice().sort((left, right) => (
        left.sequenceNumber - right.sequenceNumber || left.createdAt - right.createdAt
      ));
      const terminalTouch = sortedTouches
        .slice()
        .reverse()
        .find((touch) => isTrackedSkill(touch.skill) && isTrueTerminalTouch(touch));
      const pointWinner = draft.pointWinner ?? (terminalTouch ? resolvePointWinnerFromTouch(terminalTouch) : null);
      const terminalReason = draft.terminalReason ?? (terminalTouch ? getTerminalReasonFromTouch(terminalTouch) : null);

      return {
        setNumber: draft.setNumber,
        rallyNumber: draft.rallyNumber,
        touches: sortedTouches,
        dataVolleyCode: buildDataVolleyRallyCode({
          touches: sortedTouches,
          getJerseyNumber: (playerId?: string) => {
            const externalJerseyNumber = input.getJerseyNumber?.(playerId);
            if (externalJerseyNumber !== undefined) {
              return externalJerseyNumber;
            }

            const homeJerseyNumber = getPlayerJerseyNumber(input.homeTeam, playerId);
            return homeJerseyNumber ?? getPlayerJerseyNumber(input.awayTeam, playerId);
          },
        }),
        pointWinner,
        terminalReason,
      };
    })
    .sort((left, right) => left.setNumber - right.setNumber || left.rallyNumber - right.rallyNumber);

  return assignServingTeamsToRallies(rallies, setStartedEvents);
}

function getCompletedSets(input: BuildMatchStatsInput): CompletedSetSummary[] {
  const eventLogs = [
    ...(input.eventLog ? [input.eventLog] : []),
    ...(input.liveMatch?.eventLog ? [input.liveMatch.eventLog] : []),
  ];
  const setEndedSummaries = eventLogs
    .flat()
    .filter((event): event is Extract<MatchEvent, { type: 'set_ended' }> => event.type === 'set_ended')
    .map((event) => ({
      setNumber: event.setNumber,
      homeScore: event.homeScore,
      awayScore: event.awayScore,
      winningTeam: event.winningTeam,
      completedAt: event.createdAt,
    }));

  const summariesBySet = new Map<number, CompletedSetSummary>();
  input.liveMatch?.completedSets?.forEach((summary) => summariesBySet.set(summary.setNumber, normalizeCompletedSetSummary(summary)));
  input.completedSets?.forEach((summary) => summariesBySet.set(summary.setNumber, normalizeCompletedSetSummary(summary)));
  setEndedSummaries.forEach((summary) => summariesBySet.set(summary.setNumber, normalizeCompletedSetSummary(summary)));

  return [...summariesBySet.values()].sort((left, right) => left.setNumber - right.setNumber);
}

function buildSetStats(
  completedSets: readonly CompletedSetSummary[],
  rallyStats: readonly RallyStats[],
  pointEvents: readonly PointAwardedEvent[],
): SetStats[] {
  const setNumbers = new Set<number>();
  completedSets.forEach((setSummary) => setNumbers.add(setSummary.setNumber));
  rallyStats.forEach((rally) => setNumbers.add(rally.setNumber));
  pointEvents.forEach((event) => setNumbers.add(event.setNumber));

  return [...setNumbers]
    .sort((left, right) => left - right)
    .map((setNumber) => {
      const completedSet = completedSets.find((summary) => summary.setNumber === setNumber);
      const setRallies = rallyStats.filter((rally) => rally.setNumber === setNumber);
      const scoreSource = setRallies
        .map((rally) => rally.pointWinner)
        .filter((teamSide): teamSide is TeamSide => Boolean(teamSide));
      const pointScore = scoreSource.reduce(
        (score, teamSide) => ({
          home: score.home + (teamSide === 'home' ? 1 : 0),
          away: score.away + (teamSide === 'away' ? 1 : 0),
        }),
        { home: 0, away: 0 },
      );
      const homeScore = completedSet?.homeScore ?? pointScore.home;
      const awayScore = completedSet?.awayScore ?? pointScore.away;
      const winner = completedSet?.winningTeam ?? getSetLeadingTeam(homeScore, awayScore);

      return {
        setNumber,
        homeScore,
        awayScore,
        winner,
        totalTouches: setRallies.reduce((total, rally) => total + rally.touches.length, 0),
        rallies: setRallies,
      };
    });
}

function getSetsWon(completedSets: readonly CompletedSetSummary[]): Record<TeamSide, number> {
  return completedSets.reduce(
    (setsWon, setSummary) => {
      const winningTeam = setSummary.winningTeam ?? getSetLeadingTeam(setSummary.homeScore, setSummary.awayScore);
      if (!winningTeam) {
        return setsWon;
      }

      setsWon[winningTeam] += 1;

      return setsWon;
    },
    { home: 0, away: 0 },
  );
}

export function buildMatchStats(input: BuildMatchStatsInput): MatchStats {
  const touchRecords = collectTouchRecords(input);
  const touches = getOfficialTouches(input, touchRecords.map((record) => record.touch));
  const pointEvents = collectPointEvents(input);
  const setStartedEvents = collectSetStartedEvents(input);
  const completedSets = getCompletedSets(input);
  const rallyStats = buildRallyStats(input, touches, pointEvents, setStartedEvents);
  const teamStats: Record<TeamSide, TeamStats> = {
    away: buildTeamStats({
      teamSide: 'away',
      team: input.awayTeam,
      touches,
      pointEvents,
    }),
    home: buildTeamStats({
      teamSide: 'home',
      team: input.homeTeam,
      touches,
      pointEvents,
    }),
  };
  const playerStats = buildPlayerStats({
    awayTeam: input.awayTeam,
    homeTeam: input.homeTeam,
    touches,
    getJerseyNumber: input.getJerseyNumber,
    getPlayerName: input.getPlayerName,
  });
  const advancedStats = buildAdvancedStats({
    rallyStats,
    setStartedEvents,
    pointEvents,
  });

  return {
    teamStats,
    playerStats,
    setStats: buildSetStats(completedSets, rallyStats, pointEvents),
    rallyStats,
    setsWon: getSetsWon(completedSets),
    totalTouches: touches.length,
    quickStats: buildMatchStatsQuickStats({ teamStats, playerStats }),
    advancedStats,
    sideOutStats: advancedStats.sideOut,
    breakPointStats: advancedStats.breakPoint,
    rotationStats: advancedStats.rotations,
  };
}

export function buildSetMatchStats(input: BuildMatchStatsInput, setNumber: number): MatchStats {
  return buildMatchStats({
    ...input,
    touches: filterTouchesBySet(input.touches, setNumber),
    committedTouches: filterTouchesBySet(input.committedTouches, setNumber),
    currentRallyTouches: filterTouchesBySet(input.currentRallyTouches, setNumber),
    completedSets: filterCompletedSetsBySet(input.completedSets, setNumber),
    eventLog: input.eventLog ? filterMatchEventsBySet(input.eventLog, setNumber) : undefined,
    liveMatch: input.liveMatch
      ? {
          ...input.liveMatch,
          eventLog: input.liveMatch.eventLog
            ? filterMatchEventsBySet(input.liveMatch.eventLog, setNumber)
            : undefined,
          completedSets: filterCompletedSetsBySet(input.liveMatch.completedSets, setNumber),
          currentRallyTouches: filterTouchesBySet(input.liveMatch.currentRallyTouches, setNumber),
        }
      : undefined,
  });
}
