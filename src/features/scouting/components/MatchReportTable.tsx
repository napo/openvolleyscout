import { memo, useMemo } from 'react';
import { useTranslation } from '@src/i18n';
import openVolleyScoutLogo from '@src/assets/openvolleyscout.svg';
import type { MatchMetadata } from '@src/domain/match/types';
import type { MatchEvent } from '@src/domain/events/types';
import type { Team } from '@src/domain/roster/types';
import type { SetLineupSnapshot } from '@src/domain/lineup';
import type { CompletedSetSummary, ScoutingMatchConfig } from '@src/domain/scouting/types';
import type { MatchStats } from '../model';
import {
  buildMatchTabellinoReport,
  type MatchTabellinoReport,
  type MatchReportBottomSummaryBlock,
  type MatchReportEntryMarker,
  type MatchReportParticipationSetHeader,
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

  if (marker.kind === 'starter') {
    // Setter: light background (overrides dark starter)
    if (marker.isSetter) {
      classes.push('match-report__set-marker--setter');
    }
    // Captain: white background (overrides both starter and setter)
    if (marker.isCaptain) {
      classes.push('match-report__set-marker--captain');
    }
  }

  return classes.join(' ');
}

function renderMarkerLabel(marker: MatchReportEntryMarker) {
  if (marker.kind !== 'starter') {
    return null;
  }

  return marker.label;
}

function EntryMarkersCell({ row, setNumber }: { row: MatchReportPlayerRow; setNumber: number }) {
  const markers = row.entryMarkers.filter((marker) => marker.setNumber === setNumber);

  if (markers.length === 0) {
    return <td className="match-report-table__entry-cell"><span className="match-report-table__empty">&nbsp;</span></td>;
  }

  return (
    <td className="match-report-table__entry-cell">
      {markers.map((marker) => (
        <span
          key={`${marker.setNumber}-${marker.kind}`}
          className={getSetMarkerClassName(marker)}
          title={marker.title}
          aria-label={marker.title}
        >
          {renderMarkerLabel(marker)}
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
  setHeaders,
  isTotal = false,
}: {
  row: MatchReportPlayerRow;
  setHeaders: readonly MatchReportParticipationSetHeader[];
  isTotal?: boolean;
}) {
  return (
    <tr className={isTotal ? 'match-report-table__totals-row' : undefined}>
      <td className="match-report-table__jersey-cell">{isTotal ? '' : row.jerseyNumber}</td>
      <PlayerNameCell row={row} />
      {setHeaders.map((setHeader) => (
        <EntryMarkersCell key={setHeader.setNumber} row={row} setNumber={setHeader.setNumber} />
      ))}
      <MetricCell>{row.pointsWon}</MetricCell>
      <MetricCell>{row.serve.total}</MetricCell>
      <MetricCell>{row.serve.errors}</MetricCell>
      <MetricCell>{row.serve.aces}</MetricCell>
      <MetricCell>{formatPercent(row.serve.efficiency)}</MetricCell>
      <MetricCell>{row.receive.total}</MetricCell>
      <MetricCell>{row.receive.errors}</MetricCell>
      <MetricCell>{formatPercent(row.receive.positiveRate)}</MetricCell>
      <MetricCell>{formatPercent(row.receive.efficiency)}</MetricCell>
      <MetricCell>{row.attack.total}</MetricCell>
      <MetricCell>{row.attack.errors}</MetricCell>
      <MetricCell>{row.attack.blocked}</MetricCell>
      <MetricCell>{row.attack.kills}</MetricCell>
      <MetricCell>{formatPercent(row.attack.killRate)}</MetricCell>
      <MetricCell>{formatPercent(row.attack.efficiency)}</MetricCell>
      <MetricCell>{row.block.points}</MetricCell>
    </tr>
  );
}

function SetSummaryRow({
  row,
  setHeaders,
}: {
  row: TabellinoSetSummaryRow;
  setHeaders: readonly MatchReportParticipationSetHeader[];
}) {
  const { t } = useTranslation();

  return (
    <tr className="match-report-table__set-summary-row">
      <td className="match-report-table__jersey-cell" />
      <th scope="row">
        {t('setLabel', { setNumber: row.setNumber })}
        <small>{row.setScore}-{row.opponentScore}{row.durationLabel ? ` / ${row.durationLabel}` : ''}</small>
      </th>
      <td className="match-report-table__entry-cell" colSpan={setHeaders.length}>{row.partialScoreLabel}</td>
      <MetricCell>{row.pointsWon}</MetricCell>
      <MetricCell>{row.serve.total}</MetricCell>
      <MetricCell>{row.serve.errors}</MetricCell>
      <MetricCell>{row.serve.aces}</MetricCell>
      <MetricCell>{formatPercent(row.serve.efficiency)}</MetricCell>
      <MetricCell>{row.receive.total}</MetricCell>
      <MetricCell>{row.receive.errors}</MetricCell>
      <MetricCell>{formatPercent(row.receive.positiveRate)}</MetricCell>
      <MetricCell>{formatPercent(row.receive.efficiency)}</MetricCell>
      <MetricCell>{row.attack.total}</MetricCell>
      <MetricCell>{row.attack.errors}</MetricCell>
      <MetricCell>{row.attack.blocked}</MetricCell>
      <MetricCell>{row.attack.kills}</MetricCell>
      <MetricCell>{formatPercent(row.attack.killRate)}</MetricCell>
      <MetricCell>{formatPercent(row.attack.efficiency)}</MetricCell>
      <MetricCell>{row.block.points}</MetricCell>
    </tr>
  );
}

function SetNumberHeader({ header }: { header: MatchReportParticipationSetHeader }) {
  const className = [
    'match-report-table__set-number',
    header.startedServing ? 'match-report-table__set-number--serving' : '',
  ].filter(Boolean).join(' ');

  return (
    <th scope="col" className="match-report-table__set-number-header" title={header.title}>
      <span className={className} aria-label={header.title}>{header.label}</span>
    </th>
  );
}

function TabellinoColgroup({ tabellino }: { tabellino: TabellinoTeamTable }) {
  return (
    <colgroup>
      <col className="match-report-table__col-jersey" />
      <col className="match-report-table__col-player" />
      {tabellino.setHeaders.map((setHeader) => (
        <col key={setHeader.setNumber} className="match-report-table__col-set" />
      ))}
      <col className="match-report-table__col-won" />
      {Array.from({ length: 15 }, (_, index) => (
        <col key={index} className="match-report-table__col-metric" />
      ))}
    </colgroup>
  );
}

function SetSummarySection({ tabellino }: { tabellino: TabellinoTeamTable }) {
  const { t } = useTranslation();

  if (tabellino.setRows.length === 0) {
    return null;
  }

  const renderSetRow = (row: TabellinoSetSummaryRow, isTotal = false) => (
    <tr
      key={isTotal ? 'total' : `set-${row.setNumber}`}
      className={isTotal ? 'match-report-table__set-summary-total' : 'match-report-table__set-summary-row'}
    >
      <th scope="row">
        {isTotal ? t('totalShort') : t('setLabel', { setNumber: row.setNumber })}
        {!isTotal && row.durationLabel ? <small> {row.setScore}-{row.opponentScore} / {row.durationLabel}</small> : null}
        {!isTotal && !row.durationLabel ? <small> {row.setScore}-{row.opponentScore}</small> : null}
      </th>
      {/* Won/Ser/Atk/Blo */}
      <MetricCell>{row.directPoints}</MetricCell>
      <MetricCell>{row.ser}</MetricCell>
      <MetricCell>{row.atk}</MetricCell>
      <MetricCell>{row.blo}</MetricCell>
      {/* Op.Err */}
      <MetricCell>{row.opponentErrors}</MetricCell>
      {/* Serve: Tot/Err/Ace/srvEff%/BP% */}
      <MetricCell>{row.serve.total}</MetricCell>
      <MetricCell>{row.serve.errors}</MetricCell>
      <MetricCell>{row.serve.aces}</MetricCell>
      <MetricCell>{formatPercent(row.serve.efficiency)}</MetricCell>
      <MetricCell>{isTotal ? '-' : formatPercent(row.breakPointRate)}</MetricCell>
      {/* Reception: Tot/Err/Pos%/recEff%/SO% */}
      <MetricCell>{row.receive.total}</MetricCell>
      <MetricCell>{row.receive.errors}</MetricCell>
      <MetricCell>{formatPercent(row.receive.positiveRate)}</MetricCell>
      <MetricCell>{formatPercent(row.receive.efficiency)}</MetricCell>
      <MetricCell>{isTotal ? '-' : formatPercent(row.sideOutRate)}</MetricCell>
      {/* Attack: Tot/Err/Blo/Kill/K%/attEff% */}
      <MetricCell>{row.attack.total}</MetricCell>
      <MetricCell>{row.attack.errors}</MetricCell>
      <MetricCell>{row.attack.blocked}</MetricCell>
      <MetricCell>{row.attack.kills}</MetricCell>
      <MetricCell>{formatPercent(row.attack.killRate)}</MetricCell>
      <MetricCell>{formatPercent(row.attack.efficiency)}</MetricCell>
      {/* Blo */}
      <MetricCell>{row.block.points}</MetricCell>
    </tr>
  );

  return (
    <div className="match-report-table__set-section-wrap">
      <table className="match-report-table__set-section">
        <colgroup>
          <col className="match-report-table__col-set-label" />
          {/* Won/Ser/Atk/Blo */}
          {Array.from({ length: 4 }, (_, i) => <col key={`dp${i}`} className="match-report-table__col-metric" />)}
          {/* Op.Err */}
          <col className="match-report-table__col-metric" />
          {/* Serve cols: Tot/Err/Ace/srvEff%/BP% */}
          {Array.from({ length: 5 }, (_, i) => <col key={`srv${i}`} className="match-report-table__col-metric" />)}
          {/* Reception cols: Tot/Err/Pos%/recEff%/SO% */}
          {Array.from({ length: 5 }, (_, i) => <col key={`rec${i}`} className="match-report-table__col-metric" />)}
          {/* Attack cols: Tot/Err/Blo/Kill/K%/attEff% */}
          {Array.from({ length: 6 }, (_, i) => <col key={`atk${i}`} className="match-report-table__col-metric" />)}
          {/* Block */}
          <col className="match-report-table__col-metric" />
        </colgroup>
        <thead>
          <tr>
            <th scope="col" rowSpan={2}>{t('setShort')}</th>
            <th scope="colgroup" colSpan={4} className="match-report-table__skill-group-header">{t('wonShort')}</th>
            <th scope="col" rowSpan={2} className="match-report-table__skill-group-header">{t('opponentErrorsShort')}</th>
            <th scope="colgroup" colSpan={5} className="match-report-table__skill-group-header">{t('serve')}</th>
            <th scope="colgroup" colSpan={5} className="match-report-table__skill-group-header">{t('reception')}</th>
            <th scope="colgroup" colSpan={6} className="match-report-table__skill-group-header">{t('attack')}</th>
            <th scope="colgroup" colSpan={1} className="match-report-table__skill-group-header">{t('block')}</th>
          </tr>
          <tr>
            {/* Won sub-headers */}
            <th scope="col">{t('totalShort')}</th>
            <th scope="col">{t('serShort')}</th>
            <th scope="col">{t('atkShort')}</th>
            <th scope="col">{t('bloShort')}</th>
            {/* Serve sub-headers */}
            <th scope="col">{t('totalShort')}</th>
            <th scope="col">{t('errorsShort')}</th>
            <th scope="col">{t('aces')}</th>
            <th scope="col">{t('efficiencyPercentShort')}</th>
            <th scope="col">{t('breakPointPercentShort')}</th>
            {/* Reception sub-headers */}
            <th scope="col">{t('totalShort')}</th>
            <th scope="col">{t('errorsShort')}</th>
            <th scope="col">{t('positivePercentShort')}</th>
            <th scope="col">{t('efficiencyPercentShort')}</th>
            <th scope="col">{t('sideOutPercentShort')}</th>
            {/* Attack sub-headers */}
            <th scope="col">{t('totalShort')}</th>
            <th scope="col">{t('errorsShort')}</th>
            <th scope="col">{t('bloShort')}</th>
            <th scope="col">{t('killShort')}</th>
            <th scope="col">{t('killRateShort')}</th>
            <th scope="col">{t('efficiencyPercentShort')}</th>
            {/* Block sub-header */}
            <th scope="col">{t('bloShort')}</th>
          </tr>
        </thead>
        <tbody>
          {tabellino.setRows.map((row) => renderSetRow(row, false))}
          {renderSetRow(tabellino.setTotals, true)}
        </tbody>
      </table>
    </div>
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
          <TabellinoColgroup tabellino={tabellino} />
          <thead>
            <tr>
              <th scope="col" rowSpan={2}>#</th>
              <th scope="col" rowSpan={2}>{t('player')}</th>
              <th scope="colgroup" colSpan={tabellino.setHeaders.length} className="match-report-table__set-group-header">
                {t('setShort')}
              </th>
              <th scope="col" rowSpan={2}>{t('wonShort')}</th>
              <th scope="colgroup" colSpan={4} className="match-report-table__skill-group-header">{t('serve')}</th>
              <th scope="colgroup" colSpan={4} className="match-report-table__skill-group-header">{t('reception')}</th>
              <th scope="colgroup" colSpan={6} className="match-report-table__skill-group-header">{t('attack')}</th>
              <th scope="colgroup" colSpan={1} className="match-report-table__skill-group-header">{t('block')}</th>
            </tr>
            <tr>
              {tabellino.setHeaders.map((setHeader) => (
                <SetNumberHeader key={setHeader.setNumber} header={setHeader} />
              ))}
              <th scope="col">{t('totalShort')}</th>
              <th scope="col">{t('errorsShort')}</th>
              <th scope="col">{t('aces')}</th>
              <th scope="col">{t('efficiencyPercentShort')}</th>
              <th scope="col">{t('totalShort')}</th>
              <th scope="col">{t('errorsShort')}</th>
              <th scope="col">{t('positivePercentShort')}</th>
              <th scope="col">{t('efficiencyPercentShort')}</th>
              <th scope="col">{t('totalShort')}</th>
              <th scope="col">{t('errorsShort')}</th>
              <th scope="col">{t('bloShort')}</th>
              <th scope="col">{t('killShort')}</th>
              <th scope="col">{t('killRateShort')}</th>
              <th scope="col">{t('efficiencyPercentShort')}</th>
              <th scope="col">{t('bloShort')}</th>
            </tr>
          </thead>
          <tbody>
            {tabellino.rows.map((row) => (
              <PlayerMetricRow key={row.playerId} row={row} setHeaders={tabellino.setHeaders} />
            ))}
            <PlayerMetricRow
              row={{ ...tabellino.totals, playerName: t('teamTotals'), entryMarkers: [] }}
              setHeaders={tabellino.setHeaders}
              isTotal
            />
            {tabellino.setRows.map((setRow) => (
              <SetSummaryRow key={`set-${setRow.setNumber}`} row={setRow} setHeaders={tabellino.setHeaders} />
            ))}
          </tbody>
        </table>
      </div>

      <SetSummarySection tabellino={tabellino} />
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

function getBottomSummaryTitle(block: MatchReportBottomSummaryBlock, t: ReturnType<typeof useTranslation>['t']): string {
  switch (block.id) {
    case 'side_out_direct':
      return t('matchReportSideOutDirect');
    case 'counterattack':
      return t('matchReportCounterattack');
    case 'receive_points':
      return t('matchReportReceivePoints');
    case 'serve_break_point':
      return t('matchReportServeBreakPoint');
  }
}

function getBottomSummarySubtitle(block: MatchReportBottomSummaryBlock, t: ReturnType<typeof useTranslation>['t']): string {
  switch (block.id) {
    case 'side_out_direct':
      return t('matchReportSideOutDirectHint');
    case 'counterattack':
      return t('matchReportCounterattackHint');
    case 'receive_points':
      return t('matchReportReceivePointsHint');
    case 'serve_break_point':
      return t('matchReportServeBreakPointHint');
  }
}

function BottomSummaryBlocks({ report }: { report: MatchTabellinoReport }) {
  const { t } = useTranslation();

  return (
    <section className="match-report-table__bottom-summary" aria-label={t('matchReportBottomSummary')}>
      {report.bottomSummaryBlocks.map((block) => (
        <table key={block.id} className="match-report-table__bottom-summary-table">
          <caption>
            <strong>{getBottomSummaryTitle(block, t)}</strong>
            <span>{getBottomSummarySubtitle(block, t)}</span>
          </caption>
          <thead>
            <tr>
              <th scope="col">{t('team')}</th>
              <th scope="col">{t('pointsShort')}</th>
              <th scope="col">{t('attemptsShort')}</th>
              <th scope="col">{t('efficiencyPercentShort')}</th>
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row) => (
              <tr key={row.teamSide}>
                <th scope="row">{row.teamName}</th>
                <td>{row.points}</td>
                <td>{row.attempts}</td>
                <td>{formatPercent(row.percentage)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ))}
    </section>
  );
}

function ReportFooter({ report }: { report: MatchTabellinoReport }) {
  const { t } = useTranslation();

  return (
    <footer className="match-report-table__footer">
      <img src={openVolleyScoutLogo} alt="" aria-hidden="true" className="match-report-table__footer-logo" />
      <span>
        {t('matchReportFooterLine', {
          appName: report.footer.appName,
          version: report.footer.version,
          repositoryUrl: report.footer.repositoryUrl,
        })}
      </span>
    </footer>
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

      <BottomSummaryBlocks report={report} />
      <ReportFooter report={report} />
    </section>
  );
});
