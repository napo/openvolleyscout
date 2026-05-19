import type { SkillEvaluation, TeamSide } from '@src/domain/common/enums';
import type { MatchStats, SkillStats } from '../model';
import type { TranslationKey } from '@src/i18n';

export type DashboardSkill = 'attack' | 'serve' | 'receive';

export type SkillChartConfig = {
  skill: DashboardSkill;
  labelKey: TranslationKey;
  evaluations: SkillEvaluation[];
};

export type EvaluationChartRow = {
  evaluation: SkillEvaluation;
  dataKey: string;
  count: number;
  percentage: number;
  percentageValue: number;
};

export const SKILL_CHARTS: SkillChartConfig[] = [
  {
    skill: 'serve',
    labelKey: 'serve',
    evaluations: ['#', '/', '+', '!', '-', '='],
  },
  {
    skill: 'receive',
    labelKey: 'reception',
    evaluations: ['#', '+', '!', '-', '/', '='],
  },
  {
    skill: 'attack',
    labelKey: 'attack',
    evaluations: ['#', '+', '!', '-', '/', '='],
  },
];

export const EVALUATION_DATA_KEYS: Record<SkillEvaluation, string> = {
  '#': 'hash',
  '+': 'plus',
  '!': 'exclamation',
  '-': 'minus',
  '/': 'slash',
  '=': 'equal',
};

export const EVALUATION_BY_DATA_KEY = Object.entries(EVALUATION_DATA_KEYS).reduce<Record<string, SkillEvaluation>>(
  (map, [evaluation, dataKey]) => {
    map[dataKey] = evaluation as SkillEvaluation;
    return map;
  },
  {},
);

export function getEvaluationCount(stats: SkillStats, evaluation: SkillEvaluation): number {
  switch (evaluation) {
    case '#':
      return stats.hash;
    case '+':
      return stats.plus;
    case '!':
      return stats.exclamation;
    case '-':
      return stats.minus;
    case '/':
      return stats.slash;
    case '=':
      return stats.equal;
  }
}

export function buildTeamEvaluationRows(
  stats: MatchStats,
  teamSide: TeamSide,
  config: SkillChartConfig,
): EvaluationChartRow[] {
  const skillStats = stats.teamStats[teamSide][config.skill];
  const counts = config.evaluations.map((evaluation) => getEvaluationCount(skillStats, evaluation));
  const total = counts.reduce((sum, count) => sum + count, 0);

  return config.evaluations.map((evaluation, index) => {
    const count = counts[index];
    const percentage = total > 0 ? count / total : 0;

    return {
      evaluation,
      dataKey: EVALUATION_DATA_KEYS[evaluation],
      count,
      percentage,
      percentageValue: percentage * 100,
    };
  });
}
