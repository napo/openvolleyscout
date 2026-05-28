import { useMemo } from 'react';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { SkillEvaluation, TeamSide } from '@src/domain/common/enums';
import { useTranslation } from '@src/i18n';
import type { MatchStats, SkillStats, TrackedSkill } from '@src/features/scouting/model/match-stats';
import type { DashboardFilters } from '../filters/dashboard-filters';
import { getFilteredTeamStats, getTeamsToShow } from '../selectors/dashboard-selectors';

const EVALUATION_COLORS: Record<SkillEvaluation, string> = {
  '#': '#16a34a',
  '+': '#22c55e',
  '!': '#a3e635',
  '-': '#eab308',
  '/': '#f97316',
  '=': '#dc2626',
};

const DASHBOARD_SKILLS: TrackedSkill[] = ['serve', 'receive', 'attack', 'block'];

const SKILL_EVALUATIONS: Record<TrackedSkill, SkillEvaluation[]> = {
  serve: ['#', '/', '+', '!', '-', '='],
  receive: ['#', '+', '!', '-', '/', '='],
  attack: ['#', '+', '!', '-', '/', '='],
  block: ['#', '/', '-', '='],
  set: ['#', '+', '!', '-', '/', '='],
  dig: ['#', '+', '!', '-', '/', '='],
  freeball: ['#', '+', '!', '-', '/', '='],
  cover: ['#', '+', '!', '-', '/', '='],
};

const EVAL_DATA_KEYS: Record<SkillEvaluation, string> = {
  '#': 'hash',
  '+': 'plus',
  '!': 'exclamation',
  '-': 'minus',
  '/': 'slash',
  '=': 'equal',
};

const EVAL_BY_KEY: Record<string, SkillEvaluation> = Object.entries(EVAL_DATA_KEYS).reduce<Record<string, SkillEvaluation>>(
  (m, [ev, key]) => { m[key] = ev as SkillEvaluation; return m; },
  {},
);

function getEvalCount(stats: SkillStats, ev: SkillEvaluation): number {
  switch (ev) {
    case '#': return stats.hash;
    case '+': return stats.plus;
    case '!': return stats.exclamation;
    case '-': return stats.minus;
    case '/': return stats.slash;
    case '=': return stats.equal;
  }
}

type TooltipItem = { dataKey?: string | number; value?: number; payload?: Record<string, number>; color?: string };

function EvalTooltip({ active, payload }: { active?: boolean; payload?: TooltipItem[] }) {
  const { t } = useTranslation();
  if (!active || !payload?.length) return null;
  return (
    <div className="perf-dashboard__eval-tooltip">
      {payload
        .filter((item) => typeof item.dataKey === 'string')
        .map((item) => {
          const key = String(item.dataKey);
          const ev = EVAL_BY_KEY[key];
          if (!ev) return null;
          const count = Number(item.payload?.[`${key}Count`] ?? 0);
          const pct = typeof item.value === 'number' ? item.value : 0;
          return (
            <span key={ev}>
              <strong style={{ color: EVALUATION_COLORS[ev] }}>{ev}</strong>
              {` ${t('count')}: ${count} · ${t('percentage')}: ${pct.toFixed(1)}%`}
            </span>
          );
        })}
    </div>
  );
}

function SkillBar({
  skillStats,
  skill,
  teamSide,
  label,
}: {
  skillStats: SkillStats;
  skill: TrackedSkill;
  teamSide: TeamSide;
  label: string;
}) {
  const { t } = useTranslation();
  const evals = SKILL_EVALUATIONS[skill] ?? ['#', '+', '!', '-', '/', '='];
  const counts = evals.map((ev) => getEvalCount(skillStats, ev));
  const total = counts.reduce((s, c) => s + c, 0);

  const chartData = useMemo(() => [{
    label,
    ...evals.reduce<Record<string, number>>((d, ev, i) => {
      const key = EVAL_DATA_KEYS[ev];
      d[key] = total > 0 ? (counts[i] / total) * 100 : 0;
      d[`${key}Count`] = counts[i];
      return d;
    }, {}),
  }], [evals, counts, total, label]);

  return (
    <article className="perf-dashboard__eval-card">
      <header className="perf-dashboard__eval-card-header">
        <span className="perf-dashboard__eval-card-title">{label}</span>
        <span className="perf-dashboard__eval-total">{total}</span>
      </header>
      {total > 0 ? (
        <>
          <div className="perf-dashboard__eval-bar">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                <XAxis type="number" domain={[0, 100]} hide />
                <YAxis type="category" dataKey="label" hide />
                <Tooltip content={<EvalTooltip />} cursor={false} />
                {evals.map((ev) => (
                  <Bar
                    key={ev}
                    dataKey={EVAL_DATA_KEYS[ev]}
                    stackId={`${teamSide}-${skill}`}
                    fill={EVALUATION_COLORS[ev]}
                    isAnimationActive
                    animationDuration={520}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="perf-dashboard__eval-legend">
            {evals.map((ev, i) => (
              <span key={ev} className="perf-dashboard__eval-legend-item">
                <span className="perf-dashboard__eval-swatch" style={{ background: EVALUATION_COLORS[ev] }} />
                {ev}
                <strong>{total > 0 ? `${((counts[i] / total) * 100).toFixed(1)}%` : '-'}</strong>
              </span>
            ))}
          </div>
        </>
      ) : (
        <p className="perf-dashboard__empty">{t('noChartData')}</p>
      )}
    </article>
  );
}

export function EvaluationDistributionWidget({
  stats,
  filters,
}: {
  stats: MatchStats;
  filters: DashboardFilters;
}) {
  const { t } = useTranslation();
  const teamsToShow = getTeamsToShow(filters);

  const skillLabels: Record<TrackedSkill, string> = {
    serve: t('serve'),
    receive: t('reception'),
    attack: t('attack'),
    block: t('block'),
    set: t('set'),
    dig: t('dig'),
    freeball: t('freeball'),
    cover: t('cover'),
  };

  return (
    <section className="perf-dashboard__section" aria-label={t('evaluationCharts')}>
      <h3 className="perf-dashboard__section-title">{t('evaluationCharts')}</h3>
      {teamsToShow.map((teamSide) => {
        const filteredStats = getFilteredTeamStats(stats, filters, teamSide);
        const teamName = filteredStats.teamName;
        return (
          <div key={teamSide} className="perf-dashboard__team-section">
            <h4 className="perf-dashboard__team-section-title">{teamName}</h4>
            <div className="perf-dashboard__eval-grid">
              {DASHBOARD_SKILLS.map((skill) => (
                <SkillBar
                  key={skill}
                  skillStats={filteredStats.skillStats[skill]}
                  skill={skill}
                  teamSide={teamSide}
                  label={skillLabels[skill]}
                />
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}
