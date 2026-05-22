import { memo, useMemo } from 'react';
import { useTranslation } from '@src/i18n';
import type { MatchMetadata } from '@src/domain/match/types';
import type { MatchEvent } from '@src/domain/events/types';
import type { Team } from '@src/domain/roster/types';
import type { SetLineupSnapshot } from '@src/domain/lineup';
import type { CompletedSetSummary, ScoutingMatchConfig } from '@src/domain/scouting/types';
import type { MatchStats } from '../model';
import {
  buildMatchTabellinoReport,
  type MatchTabellinoReport,
  type MatchReportEntryMarker,
  type MatchReportPlayerRow,
  type TabellinoTeamTable,
  type TabellinoSetSummaryRow,
} from '../model/match-report';

interface MatchReportTableProps {
  homeTeam: Team;
  awayTeam: Team;
  metadata?: MatchMetadata | null;
  scoutingConfig: ScoutingMatchConfig;
  eventLog: MatchEvent[];
  completedSets: CompletedSetSummary[];
  stats: MatchStats;
  lineupSnapshots?: readonly SetLineupSnapshot[];
}

function formatPercent(value: number | null): string {
  return value === null || Number.isNaN(value) ? '-' : `${Math.round(value * 100)}%`;
}

function MetricCell({ children }: { children: number | string }) {
  return <td>{children}</td>;
}

function getSetMarkerClassName(marker: MatchReportEntryMarker): string {
  const markerKind = marker.kind === 'libero' ? 'libero-entry' : marker.kind;
  const classes = [
    'match-report-table__entry-marker',
    `match-report-table__entry-marker--${marker.kind}`,
    'match-report__set-marker',
    `match-report__set-marker--${markerKind}`,
  ];

  if (marker.kind === 'starter' && marker.isSetter) {
    classes.push('match-report__set-marker--setter');
  }

  return classes.join(' ');
}

function renderMarkerLabel(marker: MatchReportEntryMarker, firstServerLabel: string) {
  if (marker.kind !== 'starter') {
    return null;
  }

  return (
    <>
      {marker.label}
      {marker.isFirstServer ? <sup>{firstServerLabel}</sup> : null}
    </>
  );
}

function EntryMarkersCell({ row }: { row: MatchReportPlayerRow }) {
  const { t } = useTranslation();

  if (row.entryMarkers.length === 0) {
    return <td className="match-report-table__entry-cell">{row.entryLabel}</td>;
  }

  return (
    <td className="match-report-table__entry-cell">
      {row.entryMarkers.map((marker, index) => (
        <span
          // Entry markers can repeat across sets, so include the ordered index.
          key={`${marker.setNumber}-${marker.kind}-${marker.label}-${index}`}
          className={getSetMarkerClassName(marker)}
          title={marker.title}
          aria-label={marker.title}
        >
          {renderMarkerLabel(marker, t('firstServerShort'))}
        </span>
      ))}
    </td>
  );
}

function PlayerNameCell({ row }: { row: MatchReportPlayerRow }) {
  const { t } = useTranslation();

  return (
    <th scope="row" className="match-report-table__player-cell">
      <span className="match-report-table__player-name">
        {row.playerName}
        {row.isCaptain ? <span className="match-report-table__captain" title={t('captain')}>{t('captainShort')}</span> : null}
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
      <td className="match-report-table__jersey-cell">{isTotal ? '' : row.jerseyNumber}</td>
      <PlayerNameCell row={row} />
      <EntryMarkersCell row={row} />
      <MetricCell>{row.breakPointPoints}</MetricCell>
      <MetricCell>{row.pointsWonLostLabel}</MetricCell>
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
    </tr>
  );
}

function SetSummaryRow({ row }: { row: TabellinoSetSummaryRow }) {
  const { t } = useTranslation();

  return (
    <tr className="match-report-table__set-summary-row">
      <td className="match-report-table__jersey-cell" />
      <th scope="row">
        {t('setLabel', { setNumber: row.setNumber })}
        <small>{row.setScore}-{row.opponentScore}{row.durationLabel ? ` / ${row.durationLabel}` : ''}</small>
      </th>
      <td>{row.partialScoreLabel}</td>
      <MetricCell>{row.breakPointPoints}</MetricCell>
      <MetricCell>{row.pointsWonLostLabel}</MetricCell>
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
    </tr>
  );
}

function TabellinoTeamTable({ tabellino }: { tabellino: TabellinoTeamTable }) {
  const { t } = useTranslation();
  const sideLabel = tabellino.teamSide === 'home' ? t('homeTeam') : t('awayTeam');

  return (
    <section className="match-report-table__team" aria-labelledby={`match-report-tabellino-${tabellino.teamSide}`}>
      <header className="match-report-table__team-header">
        <div>
          <h5 id={`match-report-tabellino-${tabellino.teamSide}`} className="match-report-table__team-title">
            {tabellino.teamName}
          </h5>
          <span>{sideLabel}</span>
        </div>
      </header>

      <div className="match-report-table__table-wrap">
        <table className="match-report-table__table match-report-table__table--datavolley">
          <thead>
            <tr>
              <th scope="col" rowSpan={2}>#</th>
              <th scope="col" rowSpan={2}>{t('player')}</th>
              <th scope="col" rowSpan={2}>{t('positionEntryShort')}</th>
              <th scope="col" rowSpan={2}>BP</th>
              <th scope="col" rowSpan={2}>{t('valueMinusErrors')}</th>
              <th scope="colgroup" colSpan={4}>{t('serve')}</th>
              <th scope="colgroup" colSpan={5}>{t('reception')}</th>
              <th scope="colgroup" colSpan={5}>{t('attack')}</th>
              <th scope="colgroup" colSpan={2}>{t('block')}</th>
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
            </tr>
          </thead>
          <tbody>
            {tabellino.rows.map((row) => (
              <PlayerMetricRow key={row.playerId} row={row} />
            ))}
            <PlayerMetricRow row={{ ...tabellino.totals, playerName: t('teamTotals'), entryMarkers: [] }} isTotal />
            {tabellino.setRows.map((setRow) => (
              <SetSummaryRow key={`set-${setRow.setNumber}`} row={setRow} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function HeaderSetSummaries({ report }: { report: MatchTabellinoReport }) {
  const { t } = useTranslation();

  return (
    <table className="match-report-table__set-summary">
      <thead>
        <tr>
          <th scope="col">{t('sets')}</th>
          <th scope="col">{t('setScore')}</th>
          <th scope="col">{t('duration')}</th>
          <th scope="col">{t('setPartials')}</th>
        </tr>
      </thead>
      <tbody>
        {report.setSummaries.map((setSummary) => (
          <tr key={setSummary.setNumber}>
            <th scope="row">{t('setLabel', { setNumber: setSummary.setNumber })}</th>
            <td>{setSummary.scoreLabel}</td>
            <td>{setSummary.durationLabel ?? '-'}</td>
            <td>{setSummary.partialScoreLabel}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ReportHeader({ report }: { report: MatchTabellinoReport }) {
  const { t } = useTranslation();

  return (
    <header className="match-report-table__header">
      <div>
        <h3 id="match-report-table-title" className="match-report-table__title">{t('matchReport')}</h3>
        <dl className="match-report-table__meta">
          <div><dt>{t('competition')}</dt><dd>{report.competition}</dd></div>
          <div><dt>{t('matchDate')}</dt><dd>{report.dateLabel}</dd></div>
          <div><dt>{t('venue')}</dt><dd>{report.venue}</dd></div>
          <div><dt>{t('homeTeam')}</dt><dd>{report.homeTeamName}</dd></div>
          <div><dt>{t('awayTeam')}</dt><dd>{report.awayTeamName}</dd></div>
        </dl>
        <p className="match-report-table__legend">{t('matchReportLegend')}</p>
        <HeaderSetSummaries report={report} />
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
  lineupSnapshots,
}: MatchReportTableProps) {
  const report = useMemo(() => buildMatchTabellinoReport({
    homeTeam,
    awayTeam,
    metadata,
    scoutingConfig,
    eventLog,
    completedSets,
    stats,
    lineupSnapshots,
  }), [awayTeam, completedSets, eventLog, homeTeam, lineupSnapshots, metadata, scoutingConfig, stats]);

  return (
    <section className="match-report-table" aria-labelledby="match-report-table-title">
      <ReportHeader report={report} />

      <div className="match-report-table__tabelline">
        <TabellinoTeamTable tabellino={report.homeTabellino} />
        <TabellinoTeamTable tabellino={report.awayTabellino} />
      </div>
    </section>
  );
});
