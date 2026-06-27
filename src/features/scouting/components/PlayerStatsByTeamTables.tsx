import type { PlayerRole } from '@src/domain/common/enums';
import { useTranslation } from '@src/i18n';
import type { MatchStats, PlayerStats, TeamStats } from '../model';

interface PlayerStatsByTeamTablesProps {
  stats: MatchStats;
  className?: string;
}

type PlayerTableSide = 'home' | 'away';

type PlayerStatsTableRow = {
  id: string;
  jerseyNumber: number | string;
  roleMarker: string;
  playerName: string;
  pointsTotal: number;
  pointsValue: number;
  serveTotal: number;
  serveErrors: number;
  servePoints: number;
  receiveTotal: number;
  receiveErrors: number;
  receivePositivePercentage: number | null;
  receivePerfectPercentage: number | null;
  receiveEfficiency: number | null;
  attackTotal: number;
  attackErrors: number;
  attackBlocked: number;
  attackPoints: number;
  attackPointsPercentage: number | null;
  attackEfficiency: number | null;
  blockPoints: number;
  isTotal?: boolean;
};

const TEAM_TABLE_ORDER: readonly PlayerTableSide[] = ['home', 'away'];
const EMPTY_VALUE = '-';

const ROLE_MARKERS: Record<PlayerRole, string> = {
  setter: 'S',
  outside_hitter: 'OH',
  middle_blocker: 'MB',
  opposite: 'O',
  libero: 'L',
  defensive_specialist: 'DS',
};

function safeDivide(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

function formatPercentage(value: number | null): string {
  return value === null ? EMPTY_VALUE : `${(value * 100).toFixed(1)}%`;
}

function getPlayerRoleMarker(player: PlayerStats): string {
  if (player.isLibero || player.role === 'libero') {
    return 'L';
  }

  return player.role ? ROLE_MARKERS[player.role] : EMPTY_VALUE;
}

function buildPlayerTableRow(player: PlayerStats): PlayerStatsTableRow {
  const receivePositivePercentage = safeDivide(player.receive.perfect + player.receive.positive, player.receive.total);

  return {
    id: `${player.teamSide}:${player.playerId}`,
    jerseyNumber: player.jerseyNumber,
    roleMarker: getPlayerRoleMarker(player),
    playerName: player.playerName,
    pointsTotal: player.points,
    pointsValue: player.points - player.errors,
    serveTotal: player.serve.total,
    serveErrors: player.serveErrors,
    servePoints: player.aces,
    receiveTotal: player.receive.total,
    receiveErrors: player.receptionErrors,
    receivePositivePercentage,
    receivePerfectPercentage: safeDivide(player.receive.perfect, player.receive.total),
    receiveEfficiency: safeDivide(
      player.receive.hash + player.receive.plus - player.receive.slash - player.receive.minus - player.receive.equal,
      player.receive.total,
    ),
    attackTotal: player.attack.total,
    attackErrors: player.attackErrors,
    attackBlocked: player.attackBlocked,
    attackPoints: player.attackPoints,
    attackPointsPercentage: safeDivide(player.attackPoints, player.attack.total),
    attackEfficiency: safeDivide(
      player.attackPoints - player.attackErrors - player.attackBlocked,
      player.attack.total,
    ),
    blockPoints: player.blockPoints,
  };
}

function buildTeamTotalRow(teamStats: TeamStats): PlayerStatsTableRow {
  return {
    id: `${teamStats.teamSide}:total`,
    jerseyNumber: EMPTY_VALUE,
    roleMarker: EMPTY_VALUE,
    playerName: 'total',
    pointsTotal: teamStats.points,
    pointsValue: teamStats.points - teamStats.errors,
    serveTotal: teamStats.serve.total,
    serveErrors: teamStats.serveErrors,
    servePoints: teamStats.aces,
    receiveTotal: teamStats.receive.total,
    receiveErrors: teamStats.receptionErrors,
    receivePositivePercentage: safeDivide(teamStats.receive.perfect + teamStats.receive.positive, teamStats.receive.total),
    receivePerfectPercentage: safeDivide(teamStats.receive.perfect, teamStats.receive.total),
    receiveEfficiency: safeDivide(
      teamStats.receive.hash + teamStats.receive.plus - teamStats.receive.slash - teamStats.receive.minus - teamStats.receive.equal,
      teamStats.receive.total,
    ),
    attackTotal: teamStats.attack.total,
    attackErrors: teamStats.attackErrors,
    attackBlocked: teamStats.attackBlocked,
    attackPoints: teamStats.attackPoints,
    attackPointsPercentage: safeDivide(teamStats.attackPoints, teamStats.attack.total),
    attackEfficiency: safeDivide(
      teamStats.attackPoints - teamStats.attackErrors - teamStats.attackBlocked,
      teamStats.attack.total,
    ),
    blockPoints: teamStats.blockPoints,
    isTotal: true,
  };
}

function sortPlayerRows(left: PlayerStats, right: PlayerStats): number {
  const leftNumber = Number(left.jerseyNumber);
  const rightNumber = Number(right.jerseyNumber);

  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
    return leftNumber - rightNumber;
  }

  return String(left.jerseyNumber).localeCompare(String(right.jerseyNumber));
}

function PlayerStatsTeamTable({
  stats,
  teamSide,
}: {
  stats: MatchStats;
  teamSide: PlayerTableSide;
}) {
  const { t } = useTranslation();
  const teamStats = stats.teamStats[teamSide];
  const rows = stats.playerStats
    .filter((player) => player.teamSide === teamSide)
    .slice()
    .sort(sortPlayerRows)
    .map(buildPlayerTableRow);
  const rowsWithTotal = [...rows, buildTeamTotalRow(teamStats)];

  return (
    <article className="player-stats-by-team__team">
      <h5 className="player-stats-by-team__title">{teamStats.teamName}</h5>
      <div className="player-stats-by-team__table-wrap">
        <table className="player-stats-by-team__table">
          <thead>
            <tr>
              <th scope="colgroup" colSpan={3}>{t('player')}</th>
              <th scope="colgroup" colSpan={2}>{t('points')}</th>
              <th scope="colgroup" colSpan={3}>{t('serve')}</th>
              <th scope="colgroup" colSpan={5}>{t('reception')}</th>
              <th scope="colgroup" colSpan={6}>{t('attack')}</th>
              <th scope="colgroup" colSpan={1}>{t('block')}</th>
            </tr>
            <tr>
              <th scope="col">{t('jerseyNumber')}</th>
              <th scope="col">{t('roleMarker')}</th>
              <th scope="col">{t('player')}</th>
              <th scope="col">{t('totalShort')}</th>
              <th scope="col">{t('valueMinusErrors')}</th>
              <th scope="col">{t('totalShort')}</th>
              <th scope="col">{t('errorsShort')}</th>
              <th scope="col">{t('pointsShort')}</th>
              <th scope="col">{t('totalShort')}</th>
              <th scope="col">{t('errorsShort')}</th>
              <th scope="col">{t('positivePercentShort')}</th>
              <th scope="col">{t('perfectPercentShort')}</th>
              <th scope="col">{t('efficiencyPercentShort')}</th>
              <th scope="col">{t('totalShort')}</th>
              <th scope="col">{t('errorsShort')}</th>
              <th scope="col">{t('blockedShort')}</th>
              <th scope="col">{t('pointsShort')}</th>
              <th scope="col">{t('pointsPercentShort')}</th>
              <th scope="col">{t('efficiencyPercentShort')}</th>
              <th scope="col">{t('pointsShort')}</th>
            </tr>
          </thead>
          <tbody>
            {rowsWithTotal.map((row) => (
              <tr key={row.id} className={row.isTotal ? 'player-stats-by-team__total-row' : undefined}>
                <td>{row.jerseyNumber}</td>
                <td>{row.roleMarker}</td>
                <th scope="row">{row.isTotal ? t('total') : row.playerName}</th>
                <td>{row.pointsTotal}</td>
                <td>{row.pointsValue}</td>
                <td>{row.serveTotal}</td>
                <td>{row.serveErrors}</td>
                <td>{row.servePoints}</td>
                <td>{row.receiveTotal}</td>
                <td>{row.receiveErrors}</td>
                <td>{formatPercentage(row.receivePositivePercentage)}</td>
                <td>{formatPercentage(row.receivePerfectPercentage)}</td>
                <td>{formatPercentage(row.receiveEfficiency)}</td>
                <td>{row.attackTotal}</td>
                <td>{row.attackErrors}</td>
                <td>{row.attackBlocked}</td>
                <td>{row.attackPoints}</td>
                <td>{formatPercentage(row.attackPointsPercentage)}</td>
                <td>{formatPercentage(row.attackEfficiency)}</td>
                <td>{row.blockPoints}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

export function PlayerStatsByTeamTables({ stats, className }: PlayerStatsByTeamTablesProps) {
  return (
    <div className={`player-stats-by-team${className ? ` ${className}` : ''}`}>
      {TEAM_TABLE_ORDER.map((teamSide) => (
        <PlayerStatsTeamTable key={teamSide} stats={stats} teamSide={teamSide} />
      ))}
    </div>
  );
}
