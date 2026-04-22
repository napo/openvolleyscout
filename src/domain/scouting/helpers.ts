import type { MatchFormat } from '../common/enums';
import type { TeamSide } from '../common/enums';
import type { CompletedSetSummary, ScoutingMatchConfig } from './types';

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
    maxSetsToWin: 3,
    setTargetPoints: 25,
    tieBreakTargetPoints: 15,
    enableGoldenSet: false,
    goldenSetTargetPoints: 15,
  };
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
      if (setSummary.homeScore > setSummary.awayScore) {
        totals.home += 1;
      } else if (setSummary.awayScore > setSummary.homeScore) {
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
  // TODO: Keep golden set configuration in the model, but wire the dedicated
  // golden set progression separately from the regular match flow.
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
