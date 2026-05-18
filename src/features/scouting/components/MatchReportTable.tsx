import { memo, useMemo } from 'react';
import { useTranslation } from '@src/i18n';
import type { MatchMetadata } from '@src/domain/match/types';
import type { MatchEvent } from '@src/domain/events/types';
import type { Team } from '@src/domain/roster/types';
import type { CompletedSetSummary, ScoutingMatchConfig } from '@src/domain/scouting/types';
import type { TeamSide } from '@src/domain/common/enums';
import type { MatchStats, PlayerStats } from '../model';
import {
  buildPlayerParticipationBySet,
  buildSetPartialScores,
  buildSetTeamStatsMap,
  computePlayerBreakPointPoints,
} from '../model/match-report';
import { getSetTargetPoints } from '@src/domain/scouting/helpers';
import { safeDivide } from '../model/match-stats';

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

function textOrDash(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') {
    return '-';
  }
  return String(value);
}

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '-';
  }

  return `${Math.round(value * 100)}%`;
}

function formatDateTime(playedAt?: string | null): string {
  if (!playedAt) {
    return '-';
  }

  const date = new Date(playedAt);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
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
  const setNumbers = useMemo(() => stats.setStats.map((setStats) => setStats.setNumber), [stats.setStats]);
  const playerParticipationBySet = useMemo(
    () => buildPlayerParticipationBySet({ eventLog, setNumbers, homeTeam, awayTeam }),
    [awayTeam, eventLog, homeTeam, setNumbers],
  );
  const setTeamStatsBySet = useMemo(
    () => buildSetTeamStatsMap({ homeTeam, awayTeam, eventLog, completedSets }, setNumbers),
    [awayTeam, completedSets, eventLog, homeTeam, setNumbers],
  );
  const breakPointPointsByPlayer = useMemo(() => computePlayerBreakPointPoints(stats), [stats]);

  const reportTitle = reportMode === 'set' ? t('setReport') : t('technicalReport');
  const homeSetsWon = stats.setStats.reduce((count, setStats) => count + (setStats.homeScore > setStats.awayScore ? 1 : 0), 0);
  const awaySetsWon = stats.setStats.reduce((count, setStats) => count + (setStats.awayScore > setStats.homeScore ? 1 : 0), 0);
  const setScoreSummary = stats.setStats.map((setStats) => `${setStats.homeScore}-${setStats.awayScore}`).join(', ');
  const headerDate = formatDateTime(metadata?.playedAt ?? null);
  const venue = metadata?.venue ?? '-';
  const competition = metadata?.competition ?? metadata?.title ?? '-';

  const teamSections: TeamSide[] = ['home', 'away'];

  const renderParticipationCell = (playerId: string, setNumber: number) => {
    const participation = playerParticipationBySet[setNumber]?.[playerId];
    if (!participation) {
      return <span className="match-report-table__empty" />;
    }

    if (participation.position !== undefined) {
      return <span>{participation.position}</span>;
    }

    if (participation.entered) {
      return <span aria-label={t('entered')}>■</span>;
    }

    return <span className="match-report-table__empty" />;
  };

  const buildPlayerRows = (teamSide: TeamSide) => {
    const roster = teamSide === 'home' ? homeTeam.players : awayTeam.players;
    return roster.map((player) => {
      const playerStats = stats.playerStats.find(
        (row) => row.playerId === player.id && row.teamSide === teamSide,
      ) ?? {
        playerId: player.id,
        jerseyNumber: player.jerseyNumber,
        playerName: player.shortName || `${player.firstName} ${player.lastName}`,
        teamSide,
        isLibero: player.isLibero,
        totalTouches: 0,
        points: 0,
        errors: 0,
        aces: 0,
        attackPoints: 0,
        blockPoints: 0,
        serveErrors: 0,
        attackErrors: 0,
        attackBlocked: 0,
        receptionErrors: 0,
        serve: { total: 0, positive: 0, perfect: 0, errors: 0, points: 0, neutral: 0, slash: 0, exclamation: 0, minus: 0, plus: 0, hash: 0, equal: 0 },
        receive: { total: 0, positive: 0, perfect: 0, errors: 0, points: 0, neutral: 0, slash: 0, exclamation: 0, minus: 0, plus: 0, hash: 0, equal: 0 },
        attack: { total: 0, positive: 0, perfect: 0, errors: 0, points: 0, neutral: 0, slash: 0, exclamation: 0, minus: 0, plus: 0, hash: 0, equal: 0 },
        block: { total: 0, positive: 0, perfect: 0, errors: 0, points: 0, neutral: 0, slash: 0, exclamation: 0, minus: 0, plus: 0, hash: 0, equal: 0 },
        dig: { total: 0, positive: 0, perfect: 0, errors: 0, points: 0, neutral: 0, slash: 0, exclamation: 0, minus: 0, plus: 0, hash: 0, equal: 0 },
        freeball: { total: 0, positive: 0, perfect: 0, errors: 0, points: 0, neutral: 0, slash: 0, exclamation: 0, minus: 0, plus: 0, hash: 0, equal: 0 },
        cover: { total: 0, positive: 0, perfect: 0, errors: 0, points: 0, neutral: 0, slash: 0, exclamation: 0, minus: 0, plus: 0, hash: 0, equal: 0 },
      } as PlayerStats;

      const participationColumns = setNumbers.map((setNumber) => (
        <td key={`participation-${setNumber}`}>{renderParticipationCell(player.id, setNumber)}</td>
      ));

      const vpm = playerStats ? playerStats.points - playerStats.errors : 0;
      const bp = breakPointPointsByPlayer[player.id] ?? 0;
      const attackEfficiency = safeDivide(
        (playerStats?.attackPoints ?? 0) - (playerStats?.attackErrors ?? 0) - (playerStats?.attackBlocked ?? 0),
        playerStats?.attack.total ?? 0,
      );
      const receptionEfficiency = safeDivide(
        (playerStats?.receive.perfect ?? 0) + (playerStats?.receive.positive ?? 0) - (playerStats?.receptionErrors ?? 0),
        playerStats?.receive.total ?? 0,
      );

      return (
        <tr key={player.id}>
          <th scope="row">
            <span className="match-report-table__player-number">{playerStats.jerseyNumber}</span>
            <span className="match-report-table__player-name">
              {playerStats.playerName}
              {player.isLibero ? <span className="match-report-table__libero">L</span> : null}
            </span>
          </th>
          {participationColumns}
          <td>{playerStats.totalTouches || 0}</td>
          <td>{bp > 0 ? bp : '-'}</td>
          <td>{playerStats ? vpm : '-'}</td>
          <td>{playerStats?.serve.total ?? 0}</td>
          <td>{playerStats?.serve.errors ?? 0}</td>
          <td>{playerStats?.aces ?? 0}</td>
          <td>{playerStats?.receive.total ?? 0}</td>
          <td>{playerStats?.receptionErrors ?? 0}</td>
          <td>{formatPercent(safeDivide(playerStats?.receive.positive ?? 0, playerStats?.receive.total ?? 0))}</td>
          <td>{formatPercent(safeDivide(playerStats?.receive.perfect ?? 0, playerStats?.receive.total ?? 0))}</td>
          <td>{formatPercent(receptionEfficiency)}</td>
          <td>{playerStats?.attack.total ?? 0}</td>
          <td>{playerStats?.attackErrors ?? 0}</td>
          <td>{playerStats?.attackBlocked ?? 0}</td>
          <td>{playerStats?.attackPoints ?? 0}</td>
          <td>{formatPercent(safeDivide(playerStats?.attackPoints ?? 0, playerStats?.attack.total ?? 0))}</td>
          <td>{formatPercent(attackEfficiency)}</td>
          <td>{playerStats?.blockPoints ?? 0}</td>
        </tr>
      );
    });
  };

  const renderTeamSection = (teamSide: TeamSide) => {
    const team = teamSide === 'home' ? homeTeam : awayTeam;
    const teamStats = stats.teamStats[teamSide];
    const sideOutPercentage = stats.advancedStats?.sideOut?.[teamSide]?.sideOutPercentage ?? null;
    const breakPointPercentage = stats.advancedStats?.breakPoint?.[teamSide]?.breakPointPercentage ?? null;
    const receptionEfficiency = safeDivide(teamStats.receive.perfect + teamStats.receive.positive - teamStats.receptionErrors, teamStats.receive.total);
    const attackEfficiency = safeDivide(teamStats.attackPoints - teamStats.attackErrors - teamStats.attackBlocked, teamStats.attack.total);

    return (
      <section className="match-report-table__section" aria-labelledby={`match-report-${teamSide}-title`}>
        <h4 id={`match-report-${teamSide}-title`} className="match-report-table__section-title">{team.name}</h4>
        <div className="match-report-table__table-wrap">
          <table className="match-report-table__table match-report-table__table--players">
            <thead>
              <tr>
                <th scope="col">{t('player')}</th>
                {setNumbers.map((setNumber) => (
                  <th key={`set-col-${setNumber}`} scope="col">{t('setLabel', { setNumber })}</th>
                ))}
                <th scope="col">{t('total')}</th>
                <th scope="col">{t('breakPointPoints')}</th>
                <th scope="col">{t('pointsWonLost')}</th>
                <th scope="col">{t('serve')}</th>
                <th scope="col">{t('serveErrors')}</th>
                <th scope="col">{t('points')}</th>
                <th scope="col">{t('reception')}</th>
                <th scope="col">{t('errors')}</th>
                <th scope="col">{t('positive')}</th>
                <th scope="col">{t('perfect')}</th>
                <th scope="col">{t('efficiency')}</th>
                <th scope="col">{t('attack')}</th>
                <th scope="col">{t('errors')}</th>
                <th scope="col">{t('blockedShort')}</th>
                <th scope="col">{t('points')}</th>
                <th scope="col">{t('pointsWonLost')}</th>
                <th scope="col">{t('blockPoints')}</th>
              </tr>
            </thead>
            <tbody>
              {buildPlayerRows(teamSide)}
              <tr className="match-report-table__totals-row">
                <th scope="row">{t('teamTotals')}</th>
                {setNumbers.map((setNumber) => (
                  <td key={`totals-blank-${setNumber}`} />
                ))}
                <td>{teamStats.totalTouches}</td>
                <td>{stats.advancedStats?.breakPoint?.[teamSide]?.breakPointWins ?? '-'}</td>
                <td>{teamStats.points - teamStats.errors}</td>
                <td>{teamStats.serve.total}</td>
                <td>{teamStats.serve.errors}</td>
                <td>{teamStats.aces}</td>
                <td>{teamStats.receive.total}</td>
                <td>{teamStats.receptionErrors}</td>
                <td>{formatPercent(safeDivide(teamStats.receive.positive, teamStats.receive.total))}</td>
                <td>{formatPercent(safeDivide(teamStats.receive.perfect, teamStats.receive.total))}</td>
                <td>{formatPercent(receptionEfficiency)}</td>
                <td>{teamStats.attack.total}</td>
                <td>{teamStats.attackErrors}</td>
                <td>{teamStats.attackBlocked}</td>
                <td>{teamStats.attackPoints}</td>
                <td>{formatPercent(safeDivide(teamStats.attackPoints, teamStats.attack.total))}</td>
                <td>{formatPercent(attackEfficiency)}</td>
                <td>{teamStats.blockPoints}</td>
              </tr>
              {teamSections.length > 0 && setNumbers.map((setNumber) => {
                const setTeamStats = setTeamStatsBySet[setNumber]?.[teamSide];
                const homeScore = stats.setStats.find((setStats) => setStats.setNumber === setNumber)?.homeScore ?? 0;
                const awayScore = stats.setStats.find((setStats) => setStats.setNumber === setNumber)?.awayScore ?? 0;
                const setPoints = teamSide === 'home' ? homeScore : awayScore;
                if (!setTeamStats) {
                  return null;
                }
                const setAttackEfficiency = safeDivide(
                  setTeamStats.attackPoints - setTeamStats.attackErrors - setTeamStats.attackBlocked,
                  setTeamStats.attack.total,
                );
                const setReceptionEfficiency = safeDivide(
                  setTeamStats.receive.perfect + setTeamStats.receive.positive - setTeamStats.receptionErrors,
                  setTeamStats.receive.total,
                );
                return (
                  <tr key={`set-breakdown-${teamSide}-${setNumber}`} className="match-report-table__set-breakdown-row">
                    <th scope="row">{t('setLabel', { setNumber })}</th>
                    {setNumbers.map(() => <td key={`breakdown-empty-${setNumber}`} />)}
                    <td>{setTeamStats.totalTouches}</td>
                    <td>{stats.advancedStats?.breakPoint?.[teamSide]?.breakPointWins ?? '-'}</td>
                    <td>{setTeamStats.points - setTeamStats.errors}</td>
                    <td>{setTeamStats.serve.total}</td>
                    <td>{setTeamStats.serve.errors}</td>
                    <td>{setTeamStats.aces}</td>
                    <td>{setTeamStats.receive.total}</td>
                    <td>{setTeamStats.receptionErrors}</td>
                    <td>{formatPercent(safeDivide(setTeamStats.receive.positive, setTeamStats.receive.total))}</td>
                    <td>{formatPercent(safeDivide(setTeamStats.receive.perfect, setTeamStats.receive.total))}</td>
                    <td>{formatPercent(setReceptionEfficiency)}</td>
                    <td>{setTeamStats.attack.total}</td>
                    <td>{setTeamStats.attackErrors}</td>
                    <td>{setTeamStats.attackBlocked}</td>
                    <td>{setTeamStats.attackPoints}</td>
                    <td>{formatPercent(safeDivide(setTeamStats.attackPoints, setTeamStats.attack.total))}</td>
                    <td>{formatPercent(setAttackEfficiency)}</td>
                    <td>{setTeamStats.blockPoints}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="match-report-table__summary-grid">
          <div className="match-report-table__summary-card">
            <strong>{t('sideOut')}</strong>
            <div>{formatPercent(sideOutPercentage)}</div>
          </div>
          <div className="match-report-table__summary-card">
            <strong>{t('breakPoint')}</strong>
            <div>{formatPercent(breakPointPercentage)}</div>
          </div>
          <div className="match-report-table__summary-card">
            <strong>{t('reception')}</strong>
            <div>{formatPercent(receptionEfficiency)}</div>
          </div>
          <div className="match-report-table__summary-card">
            <strong>{t('attack')}</strong>
            <div>{formatPercent(attackEfficiency)}</div>
          </div>
        </div>
      </section>
    );
  };

  return (
    <section className="scouting-stage-panel match-report-table" aria-labelledby="match-report-table-title">
      <header className="match-report-table__header">
        <div>
          <span className="scouting-config__section-kicker">{t('matchReport')}</span>
          <h3 id="match-report-table-title" className="match-report-table__title">{reportTitle}</h3>
        </div>
        <div className="match-report-table__score">
          <span>{t('finalScore')}</span>
          <strong>{homeSetsWon} : {awaySetsWon}</strong>
          <span>{setScoreSummary}</span>
        </div>
      </header>

      <div className="match-report-table__meta-grid">
        <div><strong>{t('competition')}</strong><div>{competition}</div></div>
        <div><strong>{t('matchDate')}</strong><div>{headerDate}</div></div>
        <div><strong>{t('venue')}</strong><div>{venue}</div></div>
        <div><strong>{t('homeTeam')}</strong><div>{homeTeam.name}</div></div>
        <div><strong>{t('awayTeam')}</strong><div>{awayTeam.name}</div></div>
      </div>

      <section className="match-report-table__section" aria-labelledby="set-summary-title">
        <h4 id="set-summary-title" className="match-report-table__section-title">{t('setReport')}</h4>
        <div className="match-report-table__table-wrap">
          <table className="match-report-table__table">
            <thead>
              <tr>
                <th>{t('setLabel', { setNumber: 0 })}</th>
                <th>{t('duration')}</th>
                <th>{t('setPartials')}</th>
                <th>{t('finalScore')}</th>
              </tr>
            </thead>
            <tbody>
              {stats.setStats.map((setStats) => {
                const partials = buildSetPartialScores(setStats, getSetTargetPoints(scoutingConfig, setStats.setNumber));
                return (
                  <tr key={`set-summary-${setStats.setNumber}`}>
                    <th scope="row">{t('setLabel', { setNumber: setStats.setNumber })}</th>
                    <td>{textOrDash(null)}</td>
                    <td>{partials.map((partial) => `${partial.target}: ${partial.score}`).join(', ')}</td>
                    <td>{setStats.homeScore}-{setStats.awayScore}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {teamSections.map((teamSide) => renderTeamSection(teamSide))}
    </section>
  );
});
