import type { MatchFormat } from '../common/enums';
import type { CompletedSetSummary, ScoutingMatchConfig } from './types';

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

export function createDefaultScoutingMatchConfig(matchFormat: MatchFormat): ScoutingMatchConfig {
  return {
    matchFormat,
    maxSetsToWin: getDefaultMaxSetsToWin(matchFormat),
    setTargetScore: 25,
    tieBreakTargetScore: 15,
    goldenSetEnabled: false,
    goldenSetTargetScore: 15,
  };
}

export function normalizeScoutingMatchConfig(
  config: Partial<ScoutingMatchConfig> | undefined,
  matchFormat: MatchFormat,
): ScoutingMatchConfig {
  const defaults = createDefaultScoutingMatchConfig(matchFormat);

  return {
    matchFormat,
    maxSetsToWin: config?.maxSetsToWin ?? defaults.maxSetsToWin,
    setTargetScore: config?.setTargetScore ?? defaults.setTargetScore,
    tieBreakTargetScore: config?.tieBreakTargetScore ?? defaults.tieBreakTargetScore,
    goldenSetEnabled: config?.goldenSetEnabled ?? defaults.goldenSetEnabled,
    goldenSetTargetScore: config?.goldenSetTargetScore ?? defaults.goldenSetTargetScore,
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
