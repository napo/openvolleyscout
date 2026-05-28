import type { TeamSide } from '@src/domain/common/enums';
import type { MatchStats, TrackedSkill } from '@src/features/scouting/model/match-stats';
import { TRACKED_SKILLS, SKILL_STAT_TOTAL_KEYS } from '@src/features/scouting/model/match-stats';
import { getFilteredPlayerStats } from '../selectors/dashboard-selectors';
import type { DashboardFilters } from '../filters/dashboard-filters';

export interface DashboardValidationIssue {
  code: 'filtered_player_team_mismatch' | 'filtered_total_exceeds_match' | 'filtered_total_negative';
  teamSide: TeamSide;
  skill?: TrackedSkill;
  metric: string;
  message: string;
}

function createIssue(
  input: Omit<DashboardValidationIssue, 'message'> & { message?: string },
): DashboardValidationIssue {
  const skillLabel = input.skill ? ` ${input.skill}` : '';
  return {
    ...input,
    message: input.message ?? `${input.teamSide}${skillLabel} ${input.metric} inconsistency`,
  };
}

export function validateDashboardFilteredTotals(
  stats: MatchStats,
  filters: DashboardFilters,
): DashboardValidationIssue[] {
  const issues: DashboardValidationIssue[] = [];
  const filteredPlayers = getFilteredPlayerStats(stats, filters);

  (['home', 'away'] as const).forEach((teamSide) => {
    const teamPlayers = filteredPlayers.filter((p) => p.teamSide === teamSide);
    const teamStats = stats.teamStats[teamSide];

    TRACKED_SKILLS.forEach((skill) => {
      SKILL_STAT_TOTAL_KEYS.forEach((metric) => {
        const filteredTotal = teamPlayers.reduce((sum, p) => sum + p[skill][metric], 0);
        const matchTotal = teamStats[skill][metric];

        if (filteredTotal < 0) {
          issues.push(createIssue({
            code: 'filtered_total_negative',
            teamSide,
            skill,
            metric,
          }));
        }

        if (filteredTotal > matchTotal) {
          issues.push(createIssue({
            code: 'filtered_total_exceeds_match',
            teamSide,
            skill,
            metric,
            message: `${teamSide} ${skill} ${metric}: filtered ${filteredTotal} exceeds match total ${matchTotal}`,
          }));
        }
      });
    });
  });

  return issues;
}

export function validatePlayerVsTeamConsistency(
  stats: MatchStats,
  playerId: string,
): DashboardValidationIssue[] {
  const issues: DashboardValidationIssue[] = [];
  const player = stats.playerStats.find((p) => p.playerId === playerId);

  if (!player) return issues;

  const teamStats = stats.teamStats[player.teamSide];

  TRACKED_SKILLS.forEach((skill) => {
    SKILL_STAT_TOTAL_KEYS.forEach((metric) => {
      const playerValue = player[skill][metric];
      const teamValue = teamStats[skill][metric];

      if (playerValue > teamValue) {
        issues.push(createIssue({
          code: 'filtered_total_exceeds_match',
          teamSide: player.teamSide,
          skill,
          metric,
          message: `Player ${player.playerName} ${skill} ${metric} (${playerValue}) exceeds team total (${teamValue})`,
        }));
      }
    });
  });

  return issues;
}

export function validateInferredExplicitBalance(
  stats: MatchStats,
): DashboardValidationIssue[] {
  const issues: DashboardValidationIssue[] = [];
  const touches = stats.rallyStats.flatMap((r) => r.touches);

  (['home', 'away'] as const).forEach((teamSide) => {
    const teamTouches = touches.filter((t) => t.teamSide === teamSide);
    const explicitCount = teamTouches.filter((t) => (t.source ?? 'explicit') === 'explicit').length;
    const inferredCount = teamTouches.filter((t) => t.source === 'inferred').length;
    const total = explicitCount + inferredCount;

    if (total !== teamTouches.length) {
      issues.push(createIssue({
        code: 'filtered_total_negative',
        teamSide,
        metric: 'source_balance',
        message: `${teamSide}: explicit(${explicitCount}) + inferred(${inferredCount}) != total(${teamTouches.length})`,
      }));
    }
  });

  return issues;
}

export function isDashboardConsistentWithMatchReport(
  stats: MatchStats,
  filters: DashboardFilters,
): boolean {
  return validateDashboardFilteredTotals(stats, filters).length === 0;
}
