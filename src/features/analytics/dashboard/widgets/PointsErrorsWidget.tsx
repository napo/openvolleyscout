import type { TeamSide } from '@src/domain/common/enums';
import { useTranslation } from '@src/i18n';
import type { MatchStats, TrackedSkill } from '@src/features/scouting/model/match-stats';
import type { DashboardFilters } from '../filters/dashboard-filters';
import { getFilteredTeamStats, getTeamsToShow } from '../selectors/dashboard-selectors';
import { formatCount, type SkillPointsErrors } from '../metrics/dashboard-metrics';

const SKILLS_TO_SHOW: TrackedSkill[] = ['serve', 'attack', 'block', 'receive'];

function computePointsErrors(
  skillStats: ReturnType<typeof getFilteredTeamStats>['skillStats'],
): SkillPointsErrors[] {
  return SKILLS_TO_SHOW.map((skill) => ({
    skill,
    points: skillStats[skill].points,
    errors: skillStats[skill].errors,
    total: skillStats[skill].total,
  }));
}

function SkillBar({
  label,
  points,
  errors,
  total,
  maxValue,
}: {
  label: string;
  points: number;
  errors: number;
  total: number;
  maxValue: number;
}) {
  const pointsWidth = maxValue > 0 ? (points / maxValue) * 100 : 0;
  const errorsWidth = maxValue > 0 ? (errors / maxValue) * 100 : 0;

  return (
    <div className="perf-dashboard__pe-row">
      <span className="perf-dashboard__pe-label">{label}</span>
      <div className="perf-dashboard__pe-bars">
        <div className="perf-dashboard__pe-bar-group">
          <div
            className="perf-dashboard__pe-bar perf-dashboard__pe-bar--points"
            style={{ width: `${pointsWidth}%` }}
          />
          <span className="perf-dashboard__pe-bar-count">{formatCount(points)}</span>
        </div>
        <div className="perf-dashboard__pe-bar-group">
          <div
            className="perf-dashboard__pe-bar perf-dashboard__pe-bar--errors"
            style={{ width: `${errorsWidth}%` }}
          />
          <span className="perf-dashboard__pe-bar-count">{formatCount(errors)}</span>
        </div>
      </div>
      <span className="perf-dashboard__pe-total">{formatCount(total)}</span>
    </div>
  );
}

function TeamPointsErrors({
  teamSide,
  data,
  teamName,
  maxValue,
  skillLabels,
}: {
  teamSide: TeamSide;
  data: SkillPointsErrors[];
  teamName: string;
  maxValue: number;
  skillLabels: Record<TrackedSkill, string>;
}) {
  const { t } = useTranslation();

  return (
    <div className="perf-dashboard__pe-team">
      <h4 className="perf-dashboard__pe-team-title">{teamName}</h4>
      <div className="perf-dashboard__pe-legend">
        <span className="perf-dashboard__pe-legend-item perf-dashboard__pe-legend-item--points">
          {t('points')}
        </span>
        <span className="perf-dashboard__pe-legend-item perf-dashboard__pe-legend-item--errors">
          {t('errors')}
        </span>
      </div>
      {data.map((row) => (
        <SkillBar
          key={row.skill}
          label={skillLabels[row.skill]}
          points={row.points}
          errors={row.errors}
          total={row.total}
          maxValue={maxValue}
        />
      ))}
    </div>
  );
}

export function PointsErrorsWidget({
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

  const teamData = teamsToShow.map((teamSide) => {
    const filtered = getFilteredTeamStats(stats, filters, teamSide);
    return {
      teamSide,
      teamName: filtered.teamName,
      data: computePointsErrors(filtered.skillStats),
    };
  });

  const maxValue = teamData.reduce((max, { data }) => {
    const teamMax = Math.max(...data.map((d) => Math.max(d.points, d.errors)));
    return Math.max(max, teamMax);
  }, 1);

  return (
    <section className="perf-dashboard__section" aria-label={t('pointsErrorsBySkill')}>
      <h3 className="perf-dashboard__section-title">{t('pointsErrorsBySkill')}</h3>
      <div className="perf-dashboard__pe-grid">
        {teamData.map(({ teamSide, teamName, data }) => (
          <TeamPointsErrors
            key={teamSide}
            teamSide={teamSide}
            data={data}
            teamName={teamName}
            maxValue={maxValue}
            skillLabels={skillLabels}
          />
        ))}
      </div>
    </section>
  );
}
