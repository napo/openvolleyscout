import { useTranslation } from '@src/i18n';
import type { PlayerStats, TrackedSkill } from '@src/features/scouting/model/match-stats';
import { formatCount, type SkillPointsErrors } from '../metrics/dashboard-metrics';

const SKILLS_TO_SHOW: TrackedSkill[] = ['serve', 'attack', 'block', 'receive'];

function computePointsErrors(playerStats: PlayerStats): SkillPointsErrors[] {
  return SKILLS_TO_SHOW.map((skill) => ({
    skill,
    points: playerStats[skill].points,
    errors: playerStats[skill].errors,
    total: playerStats[skill].total,
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

function PlayerPointsErrors({
  data,
  playerName,
  maxValue,
  skillLabels,
}: {
  data: SkillPointsErrors[];
  playerName: string;
  maxValue: number;
  skillLabels: Record<TrackedSkill, string>;
}) {
  const { t } = useTranslation();

  return (
    <div className="perf-dashboard__pe-team">
      <h4 className="perf-dashboard__pe-team-title">{playerName}</h4>
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

export function PlayerPointsErrorsWidget({
  player,
}: {
  player: PlayerStats;
}) {
  const { t } = useTranslation();

  if (!player?.serve) {
    return (
      <section className="perf-dashboard__section" aria-label={t('pointsErrorsBySkill')}>
        <h3 className="perf-dashboard__section-title">{t('pointsErrorsBySkill')}</h3>
        <p className="perf-dashboard__empty">{t('noChartData')}</p>
      </section>
    );
  }

  const playerName = `${player.playerName} - #${player.jerseyNumber}`;

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

  const data = computePointsErrors(player);
  const maxValue = Math.max(...data.map((d) => Math.max(d.points, d.errors)), 1);

  return (
    <section className="perf-dashboard__section" aria-label={t('pointsErrorsBySkill')}>
      <h3 className="perf-dashboard__section-title">{t('pointsErrorsBySkill')}</h3>
      <PlayerPointsErrors
        data={data}
        playerName={playerName}
        maxValue={maxValue}
        skillLabels={skillLabels}
      />
    </section>
  );
}
