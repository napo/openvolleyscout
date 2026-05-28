import { useTranslation } from '@src/i18n';
import type { MatchStats } from '@src/features/scouting/model/match-stats';
import type { DashboardFilters } from '../filters/dashboard-filters';
import { computeFilteredPerformanceBySet } from '../metrics/dashboard-metrics';

export function PerformanceBySetWidget({
  stats,
  filters,
}: {
  stats: MatchStats;
  filters: Pick<DashboardFilters, 'team' | 'player' | 'role' | 'source' | 'rallyPhase'>;
}) {
  const { t } = useTranslation();
  const rows = computeFilteredPerformanceBySet(stats, filters);

  if (rows.length === 0) {
    return (
      <section className="perf-dashboard__section" aria-label={t('performanceBySet')}>
        <h3 className="perf-dashboard__section-title">{t('performanceBySet')}</h3>
        <p className="perf-dashboard__empty">{t('noChartData')}</p>
      </section>
    );
  }

  const homeTeamName = stats.teamStats.home.teamName;
  const awayTeamName = stats.teamStats.away.teamName;

  return (
    <section className="perf-dashboard__section" aria-label={t('performanceBySet')}>
      <h3 className="perf-dashboard__section-title">{t('performanceBySet')}</h3>
      <div className="perf-dashboard__set-table-wrap">
        <table className="perf-dashboard__set-table">
          <thead>
            <tr>
              <th rowSpan={2} scope="col">{t('setShort')}</th>
              <th rowSpan={2} scope="col">{t('homeScore')}</th>
              <th rowSpan={2} scope="col">{t('awayScore')}</th>
              <th colSpan={2} scope="colgroup">{t('aces')}</th>
              <th colSpan={2} scope="colgroup">{t('attackPoints')}</th>
              <th colSpan={2} scope="colgroup">{t('blockPoints')}</th>
              <th colSpan={2} scope="colgroup">{t('serveErrors')}</th>
              <th colSpan={2} scope="colgroup">{t('receptionErrors')}</th>
              <th colSpan={2} scope="colgroup">{t('attackErrors')}</th>
            </tr>
            <tr>
              <th scope="col">{homeTeamName.slice(0, 3).toUpperCase()}</th>
              <th scope="col">{awayTeamName.slice(0, 3).toUpperCase()}</th>
              <th scope="col">{homeTeamName.slice(0, 3).toUpperCase()}</th>
              <th scope="col">{awayTeamName.slice(0, 3).toUpperCase()}</th>
              <th scope="col">{homeTeamName.slice(0, 3).toUpperCase()}</th>
              <th scope="col">{awayTeamName.slice(0, 3).toUpperCase()}</th>
              <th scope="col">{homeTeamName.slice(0, 3).toUpperCase()}</th>
              <th scope="col">{awayTeamName.slice(0, 3).toUpperCase()}</th>
              <th scope="col">{homeTeamName.slice(0, 3).toUpperCase()}</th>
              <th scope="col">{awayTeamName.slice(0, 3).toUpperCase()}</th>
              <th scope="col">{homeTeamName.slice(0, 3).toUpperCase()}</th>
              <th scope="col">{awayTeamName.slice(0, 3).toUpperCase()}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.setNumber} className={row.winner ? `perf-dashboard__set-row--winner-${row.winner}` : ''}>
                <td className="perf-dashboard__set-number">{row.setNumber}</td>
                <td className={row.winner === 'home' ? 'perf-dashboard__set-score--winner' : ''}>{row.homeScore}</td>
                <td className={row.winner === 'away' ? 'perf-dashboard__set-score--winner' : ''}>{row.awayScore}</td>
                <td>{row.homeAces}</td>
                <td>{row.awayAces}</td>
                <td>{row.homeAttackPoints}</td>
                <td>{row.awayAttackPoints}</td>
                <td>{row.homeBlockPoints}</td>
                <td>{row.awayBlockPoints}</td>
                <td>{row.homeServeErrors}</td>
                <td>{row.awayServeErrors}</td>
                <td>{row.homeReceptionErrors}</td>
                <td>{row.awayReceptionErrors}</td>
                <td>{row.homeAttackErrors}</td>
                <td>{row.awayAttackErrors}</td>
              </tr>
            ))}
          </tbody>
          {rows.length > 1 && (
            <tfoot>
              <tr className="perf-dashboard__set-totals">
                <td>{t('totalShort')}</td>
                <td>{rows.reduce((s, r) => s + r.homeScore, 0)}</td>
                <td>{rows.reduce((s, r) => s + r.awayScore, 0)}</td>
                <td>{rows.reduce((s, r) => s + r.homeAces, 0)}</td>
                <td>{rows.reduce((s, r) => s + r.awayAces, 0)}</td>
                <td>{rows.reduce((s, r) => s + r.homeAttackPoints, 0)}</td>
                <td>{rows.reduce((s, r) => s + r.awayAttackPoints, 0)}</td>
                <td>{rows.reduce((s, r) => s + r.homeBlockPoints, 0)}</td>
                <td>{rows.reduce((s, r) => s + r.awayBlockPoints, 0)}</td>
                <td>{rows.reduce((s, r) => s + r.homeServeErrors, 0)}</td>
                <td>{rows.reduce((s, r) => s + r.awayServeErrors, 0)}</td>
                <td>{rows.reduce((s, r) => s + r.homeReceptionErrors, 0)}</td>
                <td>{rows.reduce((s, r) => s + r.awayReceptionErrors, 0)}</td>
                <td>{rows.reduce((s, r) => s + r.homeAttackErrors, 0)}</td>
                <td>{rows.reduce((s, r) => s + r.awayAttackErrors, 0)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  );
}
