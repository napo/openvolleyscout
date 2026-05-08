import type { MatchFormat } from '../common/enums';
import type { TeamSide } from '../common/enums';
import type { MatchEvent } from '../events/types';
import type {
  CompletedSetSummary,
  GoldenSetScoreSummary,
  ScoutingMatchConfig,
  ScoutingMatchStatus,
} from './types';

interface LegacyScoutingMatchConfig {
  matchFormat?: MatchFormat;
  maxSetsToWin?: number;
  setTargetScore?: number;
  tieBreakTargetScore?: number;
  goldenSetEnabled?: boolean;
  goldenSetTargetScore?: number;
}

export function createDefaultScoutingMatchConfig(matchFormat: MatchFormat): ScoutingMatchConfig {
  return {
    matchFormat,
    maxSetsToWin: getDefaultMaxSetsToWin(matchFormat),
    setTargetPoints: 25,
    tieBreakTargetPoints: 15,
    enableGoldenSet: false,
    goldenSetTargetPoints: 15,
  };
}

function getDefaultMaxSetsToWin(matchFormat: MatchFormat): number {
  switch (matchFormat) {
    case 'best_of_3':
      return 2;
    case 'best_of_7':
      return 4;
    case 'best_of_5':
    default:
      return 3;
  }
}

export function normalizeScoutingMatchConfig(
  config: Partial<ScoutingMatchConfig & LegacyScoutingMatchConfig> | undefined,
  matchFormat: MatchFormat,
): ScoutingMatchConfig | undefined {
  if (!config) {
    return undefined;
  }

  const defaults = createDefaultScoutingMatchConfig(matchFormat);

  return {
    matchFormat,
    maxSetsToWin: config?.maxSetsToWin ?? defaults.maxSetsToWin,
    setTargetPoints: config?.setTargetPoints ?? config?.setTargetScore ?? defaults.setTargetPoints,
    tieBreakTargetPoints: config?.tieBreakTargetPoints ?? config?.tieBreakTargetScore ?? defaults.tieBreakTargetPoints,
    enableGoldenSet: config?.enableGoldenSet ?? config?.goldenSetEnabled ?? defaults.enableGoldenSet,
    goldenSetTargetPoints: config?.goldenSetTargetPoints ?? config?.goldenSetTargetScore ?? defaults.goldenSetTargetPoints,
  };
}

export function getCompletedSetsWinnerCount(completedSets: CompletedSetSummary[]) {
  return completedSets.reduce(
    (totals, setSummary) => {
      const winningTeam = setSummary.winningTeam ?? getSetLeadingTeam(setSummary.homeScore, setSummary.awayScore);

      if (winningTeam === 'home') {
        totals.home += 1;
      } else if (winningTeam === 'away') {
        totals.away += 1;
      }

      return totals;
    },
    { home: 0, away: 0 },
  );
}

export function getDecidingSetNumber(config: ScoutingMatchConfig) {
  return Math.max(1, (config.maxSetsToWin * 2) - 1);
}

export function isTieBreakSet(config: ScoutingMatchConfig, setNumber: number) {
  return setNumber >= getDecidingSetNumber(config);
}

export function getSetTargetPoints(config: ScoutingMatchConfig, setNumber: number) {
  return isTieBreakSet(config, setNumber)
    ? config.tieBreakTargetPoints
    : config.setTargetPoints;
}

export function getSetLeadingTeam(homeScore: number, awayScore: number): TeamSide | null {
  if (homeScore === awayScore) {
    return null;
  }

  return homeScore > awayScore ? 'home' : 'away';
}

export function isSetComplete(
  config: ScoutingMatchConfig,
  setNumber: number,
  homeScore: number,
  awayScore: number,
) {
  const targetPoints = getSetTargetPoints(config, setNumber);
  const leadingScore = Math.max(homeScore, awayScore);
  const scoreDifference = Math.abs(homeScore - awayScore);

  return leadingScore >= targetPoints && scoreDifference >= 2;
}

export function getSetWinningTeam(
  config: ScoutingMatchConfig,
  setNumber: number,
  homeScore: number,
  awayScore: number,
) {
  if (!isSetComplete(config, setNumber, homeScore, awayScore)) {
    return null;
  }

  return getSetLeadingTeam(homeScore, awayScore);
}

export function isMatchComplete(
  config: ScoutingMatchConfig,
  completedSets: CompletedSetSummary[],
) {
  const setsWon = getCompletedSetsWinnerCount(completedSets);

  return setsWon.home >= config.maxSetsToWin || setsWon.away >= config.maxSetsToWin;
}

export function normalizeCompletedSetSummary(
  completedSet: Partial<CompletedSetSummary> & Pick<CompletedSetSummary, 'setNumber' | 'homeScore' | 'awayScore'>,
): CompletedSetSummary {
  return {
    setNumber: completedSet.setNumber,
    homeScore: completedSet.homeScore,
    awayScore: completedSet.awayScore,
    winningTeam: completedSet.winningTeam ?? getSetLeadingTeam(completedSet.homeScore, completedSet.awayScore),
    completedAt: completedSet.completedAt ?? Date.now(),
  };
}

export function normalizeGoldenSetScore(
  goldenSetScore: Partial<GoldenSetScoreSummary> & Pick<GoldenSetScoreSummary, 'homeScore' | 'awayScore'>,
): GoldenSetScoreSummary {
  return {
    setNumber: goldenSetScore.setNumber,
    homeScore: goldenSetScore.homeScore,
    awayScore: goldenSetScore.awayScore,
    winningTeam: goldenSetScore.winningTeam ?? getSetLeadingTeam(goldenSetScore.homeScore, goldenSetScore.awayScore),
    completedAt: goldenSetScore.completedAt,
  };
}

export function getCompletedSetsFromEvents(events: readonly MatchEvent[] | undefined): CompletedSetSummary[] {
  return (events ?? [])
    .filter((event): event is Extract<MatchEvent, { type: 'set_ended' }> => event.type === 'set_ended')
    .map((event) => normalizeCompletedSetSummary({
      setNumber: event.setNumber,
      homeScore: event.homeScore,
      awayScore: event.awayScore,
      winningTeam: event.winningTeam,
      completedAt: event.createdAt,
    }))
    .sort((left, right) => left.setNumber - right.setNumber || left.completedAt - right.completedAt);
}

export function mergeCompletedSets(
  ...completedSetGroups: Array<readonly CompletedSetSummary[] | undefined>
): CompletedSetSummary[] {
  const summariesBySetNumber = new Map<number, CompletedSetSummary>();

  completedSetGroups.flatMap((group) => group ?? []).forEach((completedSet) => {
    summariesBySetNumber.set(completedSet.setNumber, normalizeCompletedSetSummary(completedSet));
  });

  return [...summariesBySetNumber.values()].sort((left, right) => (
    left.setNumber - right.setNumber || left.completedAt - right.completedAt
  ));
}

export function splitCompletedSetsForResult(
  config: ScoutingMatchConfig | undefined,
  completedSets: readonly CompletedSetSummary[],
): {
  regularSets: CompletedSetSummary[];
  goldenSetScore: GoldenSetScoreSummary | null;
} {
  const normalizedCompletedSets = mergeCompletedSets(completedSets);
  if (!config?.enableGoldenSet) {
    return {
      regularSets: normalizedCompletedSets,
      goldenSetScore: null,
    };
  }

  const regularSets: CompletedSetSummary[] = [];
  let normalMatchComplete = false;

  for (const completedSet of normalizedCompletedSets) {
    if (normalMatchComplete) {
      return {
        regularSets,
        goldenSetScore: normalizeGoldenSetScore(completedSet),
      };
    }

    regularSets.push(completedSet);
    normalMatchComplete = isMatchComplete(config, regularSets);
  }

  return {
    regularSets,
    goldenSetScore: null,
  };
}

export function getMatchWinnerSide(input: {
  config?: ScoutingMatchConfig;
  completedSets: readonly CompletedSetSummary[];
  goldenSetScore?: GoldenSetScoreSummary | null;
}): TeamSide | null {
  const goldenSetScore = input.goldenSetScore
    ? normalizeGoldenSetScore(input.goldenSetScore)
    : splitCompletedSetsForResult(input.config, input.completedSets).goldenSetScore;

  if (goldenSetScore) {
    return goldenSetScore.winningTeam;
  }

  const regularSets = splitCompletedSetsForResult(input.config, input.completedSets).regularSets;
  const setsWon = getCompletedSetsWinnerCount(regularSets);

  if (setsWon.home === setsWon.away) {
    return null;
  }

  return setsWon.home > setsWon.away ? 'home' : 'away';
}

export function getScoutingMatchStatus(input: {
  config?: ScoutingMatchConfig;
  completedSets: readonly CompletedSetSummary[];
  isSetStarted?: boolean;
  eventCount?: number;
}): ScoutingMatchStatus {
  const regularSets = splitCompletedSetsForResult(input.config, input.completedSets).regularSets;

  if (input.config && isMatchComplete(input.config, regularSets)) {
    return 'completed';
  }

  if ((input.eventCount ?? 0) > 1 || input.isSetStarted || regularSets.length > 0) {
    return 'in_progress';
  }

  return 'not_started';
}
