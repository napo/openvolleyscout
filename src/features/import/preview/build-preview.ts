import type { DataVolleyImportPreview } from './types';
import type { ParsedDataVolleyMatch } from '../parser';
import type { DataVolleyTeamPersistencePreview } from '../persistence';
import { SET_SCORE_MISMATCH_CODE } from '../mapping/datavolley-to-ovs';

interface DataVolleyImportPreviewOptions {
  warnings?: DataVolleyImportPreview['warnings'];
  teamPersistence?: DataVolleyTeamPersistencePreview[];
}

function countSetsWon(parsed: ParsedDataVolleyMatch): { homeSets: number; awaySets: number } {
  return parsed.sets.reduce(
    (score, set) => {
      if (!set.score || set.score.home === set.score.away) return score;
      if (set.score.home > set.score.away) {
        score.homeSets += 1;
      } else {
        score.awaySets += 1;
      }
      return score;
    },
    {
      homeSets: 0,
      awaySets: 0,
    },
  );
}

export function buildDataVolleyImportPreview(
  parsed: ParsedDataVolleyMatch,
  options: DataVolleyImportPreviewOptions = {},
): DataVolleyImportPreview {
  const homeTeam = parsed.teams.find((team) => team.side === 'home');
  const awayTeam = parsed.teams.find((team) => team.side === 'away');
  const warnings = options.warnings ?? parsed.warnings;
  const diagnostics = warnings.reduce(
    (totals, warning) => {
      if (warning.severity === 'error') {
        totals.errors += 1;
      } else if (warning.severity === 'warning') {
        totals.warnings += 1;
      }
      return totals;
    },
    {
      warnings: 0,
      errors: 0,
    },
  );

  return {
    homeTeamName: homeTeam?.name ?? 'Home Team',
    awayTeamName: awayTeam?.name ?? 'Away Team',
    score: countSetsWon(parsed),
    // Unplayed slots without a score (e.g. no fifth set) are not shown.
    sets: parsed.sets.filter((set) => set.played || set.score).map((set) => ({
      setNumber: set.setNumber,
      score: set.score,
      played: set.played,
      duration: set.duration,
    })),
    playerCounts: {
      home: parsed.players.filter((player) => player.side === 'home').length,
      away: parsed.players.filter((player) => player.side === 'away').length,
    },
    parsedActionsCount: parsed.actions.length,
    parsedRowsCount: parsed.scoutRows.length,
    warningsCount: diagnostics.warnings,
    errorsCount: diagnostics.errors,
    warnings,
    scoreMismatchSets: [...new Set(warnings
      .filter((warning) => warning.code?.startsWith(`${SET_SCORE_MISMATCH_CODE}:`))
      .map((warning) => Number(warning.code!.slice(SET_SCORE_MISMATCH_CODE.length + 1))))]
      .sort((a, b) => a - b),
    teamPersistence: options.teamPersistence ?? [],
  };
}
