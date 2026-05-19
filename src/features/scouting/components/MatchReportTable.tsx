import { memo, useMemo } from 'react';
import { useTranslation } from '@src/i18n';
import type { MatchMetadata } from '@src/domain/match/types';
import type { MatchEvent } from '@src/domain/events/types';
import type { Team } from '@src/domain/roster/types';
import type { CompletedSetSummary, ScoutingMatchConfig } from '@src/domain/scouting/types';
import type { MatchStats } from '../model';
import {
  buildDataVolleyMatchReport,
  type DataVolleyMatchReport,
  type MatchReportPlayerRow,
  type MatchReportTeamTable,
} from '../model/match-report';

interface MatchReportTableProps {
  homeTeam: Team;
  awayTeam: Team;
  metadata?: MatchMetadata | null;
  scoutingConfig: ScoutingMatchConfig;
  eventLog: MatchEvent[];
  completedSets: CompletedSetSummary[];
  stats: MatchStats;
  reportMode?: 'match' | 'set';
}

function formatPercent(value: number | null): string {
  return value === null || Number.isNaN(value) ? '-' : `${Math.round(value * 100)}%`;
}

function MetricCell({ children }: { children: number | string }) {
  return <td>{children}</td>;
}

function PlayerNameCell({ row }: { row: MatchReportPlayerRow }) {
  return (
    <th scope="row">
      <span className="match-report-table__player-number">{row.jerseyNumber}</span>
      <span className="match-report-table__player-name">
        {row.playerName}
        {row.isLibero ? <span className="match-report-table__libero">L</span> : null}
      </span>
    </th>
  );
}

function PlayerMetricRow({
  row,
  isTotal = false,
}: {
  row: MatchReportPlayerRow;
  isTotal?: boolean;
}) {
  return (
    <tr className={isTotal ? 'match-report-table__totals-row' : undefined}>
      <PlayerNameCell row={row} />
      <td title={row.liberoDetail || undefined}>{row.entryLabel}</td>
      <MetricCell>{row.serve.total}</MetricCell>
      <MetricCell>{row.serve.errors}</MetricCell>
      <MetricCell>{row.serve.aces}</MetricCell>
      <MetricCell>{formatPercent(row.serve.efficiency)}</MetricCell>
      <MetricCell>{row.receive.total}</MetricCell>
      <MetricCell>{row.receive.errors}</MetricCell>
      <MetricCell>{row.receive.perfect}</MetricCell>
      <MetricCell>{row.receive.positive}</MetricCell>
      <MetricCell>{formatPercent(row.receive.efficiency)}</MetricCell>
      <MetricCell>{row.attack.total}</MetricCell>
      <MetricCell>{row.attack.kills}</MetricCell>
      <MetricCell>{row.attack.errors}</MetricCell>
      <MetricCell>{row.attack.blocked}</MetricCell>
      <MetricCell>{formatPercent(row.attack.efficiency)}</MetricCell>
      <MetricCell>{row.block.points}</MetricCell>
      <MetricCell>{row.block.touches}</MetricCell>
      <MetricCell>{row.dig.total}</MetricCell>
      <MetricCell>{row.dig.positive}</MetricCell>
      <MetricCell>{row.set.total}</MetricCell>
      <MetricCell>{row.set.positive}</MetricCell>
    </tr>
  );
}

function TeamReportTable({ team }: { team: MatchReportTeamTable }) {
  const { t } = useTranslation();
  const sideLabel = team.teamSide === 'home' ? t('homeTeam') : t('awayTeam');

  return (
    <section className="match-report-table__team" aria-labelledby={`match-report-${team.teamSide}-${team.setNumber}`}>
      <header className="match-report-table__team-header">
        <div>
          <h5 id={`match-report-${team.teamSide}-${team.setNumber}`} className="match-report-table__team-title">
            {team.teamName}
          </h5>
          <span>{sideLabel} / {t('setLabel', { setNumber: team.setNumber })}</span>
        </div>
        <strong>{team.setScore}-{team.opponentScore}</strong>
      </header>

      <div className="match-report-table__table-wrap">
        <table className="match-report-table__table match-report-table__table--datavolley">
          <thead>
            <tr>
              <th scope="col" rowSpan={2}>{t('player')}</th>
              <th scope="col" rowSpan={2}>{t('entry')}</th>
              <th scope="colgroup" colSpan={4}>{t('serve')}</th>
              <th scope="colgroup" colSpan={5}>{t('reception')}</th>
              <th scope="colgroup" colSpan={5}>{t('attack')}</th>
              <th scope="colgroup" colSpan={2}>{t('block')}</th>
              <th scope="colgroup" colSpan={2}>{t('dig')}</th>
              <th scope="colgroup" colSpan={2}>{t('set')}</th>
            </tr>
            <tr>
              <th scope="col">{t('totalShort')}</th>
              <th scope="col">{t('errorsShort')}</th>
              <th scope="col">{t('aces')}</th>
              <th scope="col">{t('efficiencyPercentShort')}</th>
              <th scope="col">{t('totalShort')}</th>
              <th scope="col">{t('errorsShort')}</th>
              <th scope="col">#</th>
              <th scope="col">+</th>
              <th scope="col">{t('efficiencyPercentShort')}</th>
              <th scope="col">{t('totalShort')}</th>
              <th scope="col">{t('pointsShort')}</th>
              <th scope="col">{t('errorsShort')}</th>
              <th scope="col">{t('blockedShort')}</th>
              <th scope="col">{t('efficiencyPercentShort')}</th>
              <th scope="col">{t('pointsShort')}</th>
              <th scope="col">{t('totalShort')}</th>
              <th scope="col">{t('totalShort')}</th>
              <th scope="col">+</th>
              <th scope="col">{t('totalShort')}</th>
              <th scope="col">+</th>
            </tr>
          </thead>
          <tbody>
            {team.rows.map((row) => (
              <PlayerMetricRow key={row.playerId} row={row} />
            ))}
            <PlayerMetricRow row={{ ...team.totals, playerName: t('teamTotals') }} isTotal />
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ReportHeader({ report, reportMode }: { report: DataVolleyMatchReport; reportMode: 'match' | 'set' }) {
  const { t } = useTranslation();
  const title = reportMode === 'set' ? t('setReport') : t('technicalReport');

  return (
    <header className="match-report-table__header">
      <div>
        <span className="scouting-config__section-kicker">{t('matchReport')}</span>
        <h3 id="match-report-table-title" className="match-report-table__title">{title}</h3>
        <p className="match-report-table__subtitle">
          {report.competition} / {report.dateLabel} / {report.venue}
        </p>
      </div>
      <div className="match-report-table__score">
        <span>{report.homeTeamName}</span>
        <strong>{report.homeSetsWon} : {report.awaySetsWon}</strong>
        <span>{report.awayTeamName}</span>
        <small>{report.setScoreSummary}</small>
      </div>
    </header>
  );
}

export const MatchReportTable = memo(function MatchReportTable({
  homeTeam,
  awayTeam,
  metadata,
  scoutingConfig,
  eventLog,
  completedSets,
  stats,
  reportMode = 'match',
}: MatchReportTableProps) {
  const { t } = useTranslation();
  const report = useMemo(() => buildDataVolleyMatchReport({
    homeTeam,
    awayTeam,
    metadata,
    scoutingConfig,
    eventLog,
    completedSets,
    stats,
  }), [awayTeam, completedSets, eventLog, homeTeam, metadata, scoutingConfig, stats]);

  return (
    <section className="scouting-stage-panel match-report-table" aria-labelledby="match-report-table-title">
      <ReportHeader report={report} reportMode={reportMode} />

      <div className="match-report-table__sets">
        {report.sets.map((set) => (
          <section key={set.setNumber} className="match-report-table__set" aria-labelledby={`match-report-set-${set.setNumber}`}>
            <header className="match-report-table__set-header">
              <div>
                <h4 id={`match-report-set-${set.setNumber}`}>{t('setLabel', { setNumber: set.setNumber })}</h4>
                <span>{t('duration')}: {set.durationLabel ?? '-'}</span>
              </div>
              <strong>{set.homeScore} : {set.awayScore}</strong>
            </header>
            <TeamReportTable team={set.home} />
            <TeamReportTable team={set.away} />
          </section>
        ))}
      </div>
    </section>
  );
});
