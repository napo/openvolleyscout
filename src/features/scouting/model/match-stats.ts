import type { SkillEvaluation, SkillType, TeamSide } from '@src/domain/common/enums';
import type { MatchEvent } from '@src/domain/events/types';
import type { Team, Player } from '@src/domain/roster/types';
import type { CompletedSetSummary } from '@src/domain/scouting/types';
import type { BallTouch } from '@src/domain/touch/types';
import { buildDataVolleyRallyCode } from './datavolley-code';
import {
  isTrueTerminalTouch,
  resolvePointWinnerFromTouch,
  type ScoringTouch,
} from './scoring-rules';

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

export interface RallyStats {
  setNumber: number;
  rallyNumber: number;
  touches: BallTouch[];
  dataVolleyCode: string;
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

function collectPointEvents(input: BuildMatchStatsInput): Extract<MatchEvent, { type: 'point_awarded' }>[] {
  const pointEventsById = new Map<string, Extract<MatchEvent, { type: 'point_awarded' }>>();
  const eventLogs = [
    ...(input.eventLog ? [input.eventLog] : []),
    ...(input.liveMatch?.eventLog ? [input.liveMatch.eventLog] : []),
  ];

  eventLogs
    .flat()
    .filter((event): event is Extract<MatchEvent, { type: 'point_awarded' }> => event.type === 'point_awarded')
    .forEach((event) => {
      pointEventsById.set(event.id, event);
    });

  return [...pointEventsById.values()].sort((left, right) => (
    left.setNumber - right.setNumber
    || left.rallyNumber - right.rallyNumber
    || left.createdAt - right.createdAt
  ));
}

function countTeamPoints(input: {
  teamSide: TeamSide;
  touches: readonly BallTouch[];
  pointEvents?: readonly Extract<MatchEvent, { type: 'point_awarded' }>[];
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
  pointEvents?: readonly Extract<MatchEvent, { type: 'point_awarded' }>[];
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
      playerStatsById.set(player.id, createEmptyPlayerStats(player, teamSide));
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
    const stats = playerStatsById.get(touch.playerId)
      ?? (player
        ? createEmptyPlayerStats(player, touch.teamSide)
        : createUnknownPlayerStats({
            teamSide: touch.teamSide,
            playerId: touch.playerId,
            jerseyNumber: input.getJerseyNumber?.(touch.playerId),
            playerName: input.getPlayerName?.(touch.playerId),
          }));

    applyTouchToPlayerStats(stats, touch);
    playerStatsById.set(touch.playerId, stats);
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

function buildRallyStats(
  input: BuildMatchStatsInput,
  touches: readonly BallTouch[],
  pointEvents: readonly Extract<MatchEvent, { type: 'point_awarded' }>[],
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

  return [...drafts.values()]
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
      completedAt: event.createdAt,
    }));

  const summariesBySet = new Map<number, CompletedSetSummary>();
  setEndedSummaries.forEach((summary) => summariesBySet.set(summary.setNumber, summary));
  input.liveMatch?.completedSets?.forEach((summary) => summariesBySet.set(summary.setNumber, summary));
  input.completedSets?.forEach((summary) => summariesBySet.set(summary.setNumber, summary));

  return [...summariesBySet.values()].sort((left, right) => left.setNumber - right.setNumber);
}

function buildSetStats(
  completedSets: readonly CompletedSetSummary[],
  rallyStats: readonly RallyStats[],
  pointEvents: readonly Extract<MatchEvent, { type: 'point_awarded' }>[],
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
      const winner = homeScore === awayScore ? null : homeScore > awayScore ? 'home' : 'away';

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
      if (setSummary.homeScore === setSummary.awayScore) {
        return setsWon;
      }

      if (setSummary.homeScore > setSummary.awayScore) {
        setsWon.home += 1;
      } else {
        setsWon.away += 1;
      }

      return setsWon;
    },
    { home: 0, away: 0 },
  );
}

export function buildMatchStats(input: BuildMatchStatsInput): MatchStats {
  const touchRecords = collectTouchRecords(input);
  const touches = touchRecords.map((record) => record.touch);
  const pointEvents = collectPointEvents(input);
  const completedSets = getCompletedSets(input);
  const rallyStats = buildRallyStats(input, touches, pointEvents);

  return {
    teamStats: {
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
    },
    playerStats: buildPlayerStats({
      awayTeam: input.awayTeam,
      homeTeam: input.homeTeam,
      touches,
      getJerseyNumber: input.getJerseyNumber,
      getPlayerName: input.getPlayerName,
    }),
    setStats: buildSetStats(completedSets, rallyStats, pointEvents),
    rallyStats,
    setsWon: getSetsWon(completedSets),
    totalTouches: touches.length,
  };
}
