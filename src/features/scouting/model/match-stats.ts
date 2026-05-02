import type { SkillEvaluation, SkillType, TeamSide } from '@src/domain/common/enums';
import type { MatchEvent } from '@src/domain/events/types';
import type { Team, Player } from '@src/domain/roster/types';
import type { CompletedSetSummary } from '@src/domain/scouting/types';
import type { BallTouch } from '@src/domain/touch/types';
import { buildDataVolleyRallyCode } from './datavolley-code';
import { isPositiveNonTerminalSkill } from './scoring-rules';

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
  eventLog?: MatchEvent[];
  committedTouches?: BallTouch[];
  completedSets?: CompletedSetSummary[];
  currentRallyTouches?: BallTouch[];
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
  source: 'event' | 'committed' | 'current';
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

function isWinningTouchEvaluation(evaluation: SkillEvaluation | undefined, skill: SkillType): boolean {
  return evaluation === '#' && isTrackedSkill(skill) && !isPositiveNonTerminalSkill(skill);
}

export function updateSkillStats(
  stats: SkillStats,
  evaluation: SkillEvaluation | undefined,
  skill: SkillType,
): SkillStats {
  stats.total += 1;

  if (!evaluation) {
    stats.neutral += 1;
    return stats;
  }

  switch (evaluation) {
    case '#':
      stats.hash += 1;
      stats.perfect += 1;
      if (isWinningTouchEvaluation(evaluation, skill)) {
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

function createEmptyTeamStats(teamSide: TeamSide, team: Team): TeamStats {
  return {
    ...createSkillStatMap(),
    teamSide,
    teamName: team.name,
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

export function getPlayerDisplayName(team: Team, playerId?: string): string {
  const player = findPlayer(team, playerId);
  if (!player) {
    return playerId ? getPlayerFallbackName(playerId) : '';
  }

  return player.shortName || [player.firstName, player.lastName].filter(Boolean).join(' ') || player.playerCode;
}

export function getPlayerJerseyNumber(team: Team, playerId?: string): number | string | undefined {
  return findPlayer(team, playerId)?.jerseyNumber;
}

function createEmptyPlayerStats(teamSide: TeamSide, team: Team, player: Player): PlayerStats {
  return {
    ...createSkillStatMap(),
    playerId: player.id,
    jerseyNumber: player.jerseyNumber,
    playerName: getPlayerDisplayName(team, player.id),
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

function createUnknownPlayerStats(teamSide: TeamSide, playerId: string): PlayerStats {
  return {
    ...createSkillStatMap(),
    playerId,
    jerseyNumber: '??',
    playerName: getPlayerFallbackName(playerId),
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

function applyTouchToCounters(
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
) {
  counters.totalTouches += 1;

  if (touch.evaluation === '=') {
    counters.errors += 1;
  }

  if (isWinningTouchEvaluation(touch.evaluation, touch.skill)) {
    counters.points += 1;
    counters.winningTouches = (counters.winningTouches ?? 0) + 1;
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

  input.eventLog
    ?.filter((event): event is Extract<MatchEvent, { type: 'touch_recorded' }> => event.type === 'touch_recorded')
    .forEach((event) => addTouch(event.touch, 'event'));

  input.committedTouches?.forEach((touch) => addTouch(touch, 'committed'));
  input.currentRallyTouches?.forEach((touch) => addTouch(touch, 'current'));

  return records;
}

export function buildTeamStats(input: {
  teamSide: TeamSide;
  team: Team;
  touches: readonly BallTouch[];
  pointEvents?: readonly Extract<MatchEvent, { type: 'point_awarded' }>[];
}): TeamStats {
  const stats = createEmptyTeamStats(input.teamSide, input.team);

  input.pointEvents?.forEach((event) => {
    if (event.teamSide === input.teamSide) {
      stats.points += 1;
    }
  });

  input.touches.forEach((touch) => {
    if (touch.teamSide !== input.teamSide || !isTrackedSkill(touch.skill)) {
      return;
    }

    updateSkillStats(stats[touch.skill], touch.evaluation, touch.skill);
    const touchPointCount = stats.points;
    applyTouchToCounters(stats, touch);
    stats.points = touchPointCount;
  });

  return stats;
}

export function buildPlayerStats(input: {
  homeTeam: Team;
  awayTeam: Team;
  touches: readonly BallTouch[];
}): PlayerStats[] {
  const playerStatsById = new Map<string, PlayerStats>();

  const addRosterPlayers = (teamSide: TeamSide, team: Team) => {
    team.players.forEach((player) => {
      playerStatsById.set(player.id, createEmptyPlayerStats(teamSide, team, player));
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
        ? createEmptyPlayerStats(touch.teamSide, team, player)
        : createUnknownPlayerStats(touch.teamSide, touch.playerId));

    updateSkillStats(stats[touch.skill], touch.evaluation, touch.skill);
    applyTouchToCounters(stats, touch);
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

function createRallyKey(setNumber: number, rallyNumber: number): string {
  return `${setNumber}:${rallyNumber}`;
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

      return {
        setNumber: draft.setNumber,
        rallyNumber: draft.rallyNumber,
        touches: sortedTouches,
        dataVolleyCode: buildDataVolleyRallyCode({
          touches: sortedTouches,
          getJerseyNumber: (playerId?: string) => {
            const homeJerseyNumber = getPlayerJerseyNumber(input.homeTeam, playerId);
            return homeJerseyNumber ?? getPlayerJerseyNumber(input.awayTeam, playerId);
          },
        }),
        pointWinner: draft.pointWinner,
        terminalReason: draft.terminalReason,
      };
    })
    .sort((left, right) => left.setNumber - right.setNumber || left.rallyNumber - right.rallyNumber);
}

function getCompletedSets(input: BuildMatchStatsInput): CompletedSetSummary[] {
  const setEndedSummaries = input.eventLog
    ?.filter((event): event is Extract<MatchEvent, { type: 'set_ended' }> => event.type === 'set_ended')
    .map((event) => ({
      setNumber: event.setNumber,
      homeScore: event.homeScore,
      awayScore: event.awayScore,
      completedAt: event.createdAt,
    })) ?? [];

  const summariesBySet = new Map<number, CompletedSetSummary>();
  setEndedSummaries.forEach((summary) => summariesBySet.set(summary.setNumber, summary));
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
      const pointScore = pointEvents.reduce(
        (score, event) => {
          if (event.setNumber !== setNumber) {
            return score;
          }

          return {
            home: score.home + (event.teamSide === 'home' ? 1 : 0),
            away: score.away + (event.teamSide === 'away' ? 1 : 0),
          };
        },
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
  const pointEvents = input.eventLog
    ?.filter((event): event is Extract<MatchEvent, { type: 'point_awarded' }> => event.type === 'point_awarded') ?? [];
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
    }),
    setStats: buildSetStats(completedSets, rallyStats, pointEvents),
    rallyStats,
    setsWon: getSetsWon(completedSets),
    totalTouches: touches.length,
  };
}
