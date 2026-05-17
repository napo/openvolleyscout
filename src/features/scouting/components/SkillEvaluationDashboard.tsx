import type { SkillEvaluation, TeamSide } from '@src/domain/common/enums';
import { useTranslation } from '@src/i18n';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { MatchStats } from '../model';
import {
  EVALUATION_BY_DATA_KEY,
  SKILL_CHARTS,
  buildTeamEvaluationRows,
  type EvaluationChartRow,
  type SkillChartConfig,
} from './skill-evaluation-chart-data';
import './skill-evaluation-dashboard.css';

interface SkillEvaluationDashboardProps {
  stats: MatchStats;
}

type TooltipPayloadItem = {
  dataKey?: string | number;
  value?: number;
  color?: string;
  payload?: Record<string, number | string>;
};

const EVALUATION_COLORS: Record<SkillEvaluation, string> = {
  '#': '#16a34a',
  '+': '#22c55e',
  '!': '#a3e635',
  '-': '#eab308',
  '/': '#f97316',
  '=': '#dc2626',
};

function formatPercentage(value: number): string {
  return `${value.toFixed(1)}%`;
}

function DistributionTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
}) {
  const { t } = useTranslation();
  if (!active || !payload?.length) {
    return null;
  }

  return (
    <div className="skill-evaluation-dashboard__tooltip">
      {payload
        .filter((item) => typeof item.dataKey === 'string')
        .map((item) => {
          const dataKey = String(item.dataKey);
          const evaluation = EVALUATION_BY_DATA_KEY[dataKey];
          if (!evaluation) {
            return null;
          }

          const count = Number(item.payload?.[`${dataKey}Count`] ?? 0);
          const percentage = typeof item.value === 'number' ? item.value : 0;

          return (
            <span key={evaluation}>
              <strong style={{ color: EVALUATION_COLORS[evaluation] }}>{evaluation}</strong>
              {` ${t('count')}: ${count} · ${t('percentage')}: ${formatPercentage(percentage)}`}
            </span>
          );
        })}
    </div>
  );
}

function HistogramTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: EvaluationChartRow }>;
}) {
  const { t } = useTranslation();
  const row = payload?.[0]?.payload;
  if (!active || !row) {
    return null;
  }

  return (
    <div className="skill-evaluation-dashboard__tooltip">
      <span>
        <strong style={{ color: EVALUATION_COLORS[row.evaluation] }}>{row.evaluation}</strong>
        {` ${t('count')}: ${row.count} · ${t('percentage')}: ${formatPercentage(row.percentageValue)}`}
      </span>
    </div>
  );
}

function SkillEvaluationCard({
  stats,
  teamSide,
  config,
}: {
  stats: MatchStats;
  teamSide: TeamSide;
  config: SkillChartConfig;
}) {
  const { t } = useTranslation();
  const rows = buildTeamEvaluationRows(stats, teamSide, config);
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const distributionData = [{
    label: t(config.labelKey),
    ...rows.reduce<Record<string, number>>((data, row) => {
      data[row.dataKey] = row.percentageValue;
      data[`${row.dataKey}Count`] = row.count;
      return data;
    }, {}),
  }];

  return (
    <article className="skill-evaluation-dashboard__card">
      <header className="skill-evaluation-dashboard__card-header">
        <h5 className="skill-evaluation-dashboard__card-title">{t(config.labelKey)}</h5>
        <span className="skill-evaluation-dashboard__total">{total}</span>
      </header>

      {total > 0 ? (
        <>
          <div className="skill-evaluation-dashboard__chart skill-evaluation-dashboard__chart--distribution">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={distributionData}
                layout="vertical"
                margin={{ top: 4, right: 0, bottom: 4, left: 0 }}
              >
                <XAxis type="number" domain={[0, 100]} hide />
                <YAxis type="category" dataKey="label" hide />
                <Tooltip content={<DistributionTooltip />} cursor={false} />
                {rows.map((row) => (
                  <Bar
                    key={row.evaluation}
                    dataKey={row.dataKey}
                    stackId={config.skill}
                    fill={EVALUATION_COLORS[row.evaluation]}
                    isAnimationActive
                    animationDuration={520}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="skill-evaluation-dashboard__legend" aria-label={t('evaluationDistribution')}>
            {rows.map((row) => (
              <span key={row.evaluation} className="skill-evaluation-dashboard__legend-item">
                <span
                  className="skill-evaluation-dashboard__legend-swatch"
                  style={{ background: EVALUATION_COLORS[row.evaluation] }}
                  aria-hidden="true"
                />
                {row.evaluation}
                <strong>{formatPercentage(row.percentageValue)}</strong>
              </span>
            ))}
          </div>

          <div className="skill-evaluation-dashboard__chart skill-evaluation-dashboard__chart--histogram">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} margin={{ top: 10, right: 8, bottom: 0, left: -18 }}>
                <CartesianGrid stroke="rgba(71, 85, 105, 0.16)" vertical={false} />
                <XAxis dataKey="evaluation" tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                <Tooltip content={<HistogramTooltip />} cursor={{ fill: 'rgba(15, 23, 42, 0.04)' }} />
                <Bar dataKey="count" radius={[5, 5, 0, 0]} isAnimationActive animationDuration={520}>
                  {rows.map((row) => (
                    <Cell key={row.evaluation} fill={EVALUATION_COLORS[row.evaluation]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      ) : (
        <p className="skill-evaluation-dashboard__empty">{t('noChartData')}</p>
      )}
    </article>
  );
}

function TeamEvaluationCharts({
  stats,
  teamSide,
}: {
  stats: MatchStats;
  teamSide: TeamSide;
}) {
  const { t } = useTranslation();
  const teamName = stats.teamStats[teamSide].teamName;
  const titleKey = teamSide === 'home' ? 'homeTeamCharts' : 'awayTeamCharts';

  return (
    <section className="skill-evaluation-dashboard__team" aria-label={t(titleKey, { team: teamName })}>
      <h5 className="skill-evaluation-dashboard__team-title">{t(titleKey, { team: teamName })}</h5>
      <div className="skill-evaluation-dashboard__grid">
        {SKILL_CHARTS.map((config) => (
          <SkillEvaluationCard key={`${teamSide}-${config.skill}`} stats={stats} teamSide={teamSide} config={config} />
        ))}
      </div>
    </section>
  );
}

export function SkillEvaluationDashboard({ stats }: SkillEvaluationDashboardProps) {
  const { t } = useTranslation();

  return (
    <section className="skill-evaluation-dashboard" aria-labelledby="skill-evaluation-dashboard-title">
      <header className="skill-evaluation-dashboard__header">
        <h4 id="skill-evaluation-dashboard-title" className="skill-evaluation-dashboard__title">
          {t('evaluationCharts')}
        </h4>
      </header>

      <TeamEvaluationCharts stats={stats} teamSide="home" />
      <TeamEvaluationCharts stats={stats} teamSide="away" />
    </section>
  );
}
