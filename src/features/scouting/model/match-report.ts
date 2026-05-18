import { getSetTargetPoints } from '@src/domain/scouting/helpers';
import type { MatchEvent } from '@src/domain/events/types';
import type { MatchMetadata } from '@src/domain/match/types';
import type { Team } from '@src/domain/roster/types';
import type { StartingLineup } from '@src/domain/lineup/types';
import type { CompletedSetSummary, ScoutingMatchConfig } from '@src/domain/scouting/types';
import type { TeamSide } from '@src/domain/common/enums';
import type { BallTouch } from '@src/domain/touch/types';
import type { BuildMatchStatsInput, MatchStats, SetStats, TeamStats } from './match-stats';
import { buildSetMatchStats, safeDivide } from './match-stats';
import { resolvePointWinnerFromTouch, isTrueTerminalTouch } from './scoring-rules';

export type MatchReportPlayerParticipation = {
  position?: number;
  entered: boolean;
};

export type MatchReportParticipationBySet = Record<number, Record<string, MatchReportPlayerParticipation>>;

function isSetStartedEvent(event: MatchEvent): event is Extract<MatchEvent, { type: 'set_started' }> {
  return event.type === 'set_started';
}

function isSubstitutionEvent(event: MatchEvent): event is Extract<MatchEvent, { type: 'substitution_made' }> {
  return event.type === 'substitution_made';
}

function isLiberoReplacementEvent(event: MatchEvent): event is Extract<MatchEvent, { type: 'libero_replacement_made' }> {
  return event.type === 'libero_replacement_made';
}

export function getSetPartialTargets(targetPoints: number): number[] {
  if (targetPoints > 15) {
    return [
      Math.round(targetPoints / 3),
      Math.round((targetPoints * 2) / 3),
      Math.max(targetPoints - 4, 1),
    ];
  }

  return [
    Math.round(targetPoints / 3),
    Math.round((targetPoints * 2) / 3),
  ];
}

export function buildSetPartialScores(setStats: SetStats, targetPoints: number) {
  const targets = getSetPartialTargets(targetPoints);
  const progression = setStats.rallies.reduce(
    (acc, rally) => {
      const pointWinner = rally.pointWinner ?? (() => {
        const terminalTouch = rally.touches.slice().reverse().find((touch) => isTrueTerminalTouch(touch));
        return terminalTouch ? resolvePointWinnerFromTouch(terminalTouch) : null;
      })();

      if (pointWinner === 'home') {
        acc.home += 1;
      }

      if (pointWinner === 'away') {
        acc.away += 1;
      }

      acc.values.push({ home: acc.home, away: acc.away });
      return acc;
    },
    { home: 0, away: 0, values: [] as Array<{ home: number; away: number }> },
  );

  return targets.map((target) => {
    const reached = progression.values.find((score) => score.home >= target || score.away >= target);
    return {
      target,
      score: reached ? `${reached.home}-${reached.away}` : '-',
    };
  });
}

export function getSetDurationLabel(setNumber: number, eventLog: MatchEvent[]): string | null {
  const startedAt = eventLog.find((event) => isSetStartedEvent(event) && event.setNumber === setNumber)?.createdAt;
  const endedAt = eventLog.find((event) => event.type === 'set_ended' && event.setNumber === setNumber)?.createdAt;

  if (startedAt === undefined || endedAt === undefined || endedAt <= startedAt) {
    return null;
  }

  const durationMillis = endedAt - startedAt;
  const minutes = Math.floor(durationMillis / 60000);
  const seconds = Math.floor((durationMillis % 60000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function buildPlayerParticipationBySet(input: {
  eventLog: MatchEvent[];
  setNumbers: number[];
  homeTeam: Team;
  awayTeam: Team;
}): MatchReportParticipationBySet {
  return input.setNumbers.reduce((sets, setNumber) => {
    const setStartedEvent = input.eventLog.find(
      (event): event is Extract<MatchEvent, { type: 'set_started' }> => isSetStartedEvent(event) && event.setNumber === setNumber,
    );
    const teamParticipation: Record<string, MatchReportPlayerParticipation> = {};
    const startedPositionsByTeam: Record<TeamSide, Map<string, number>> = {
      home: new Map<string, number>(),
      away: new Map<string, number>(),
    };
    const enteredByTeam: Record<TeamSide, Set<string>> = {
      home: new Set<string>(),
      away: new Set<string>(),
    };

    if (setStartedEvent) {
      setStartedEvent.homeLineup.slots.forEach((slot: StartingLineup['slots'][number]) => {
        if (slot.playerId) {
          startedPositionsByTeam.home.set(slot.playerId, slot.courtPosition);
        }
      });
      setStartedEvent.awayLineup.slots.forEach((slot: StartingLineup['slots'][number]) => {
        if (slot.playerId) {
          startedPositionsByTeam.away.set(slot.playerId, slot.courtPosition);
        }
      });
    }

    input.eventLog.forEach((event) => {
      if (event.type !== 'substitution_made' && event.type !== 'libero_replacement_made') {
        return;
      }
      if (event.setNumber !== setNumber) {
        return;
      }

      if (event.type === 'substitution_made') {
        enteredByTeam[event.teamSide].add(event.playerInId);
      }

      if (event.type === 'libero_replacement_made') {
        enteredByTeam[event.teamSide].add(event.playerInId);
      }
    });

    [input.homeTeam, input.awayTeam].forEach((team) => {
      team.players.forEach((player) => {
        const teamSide = team === input.homeTeam ? 'home' : 'away';
        teamParticipation[player.id] = {
          position: startedPositionsByTeam[teamSide].get(player.id),
          entered: enteredByTeam[teamSide].has(player.id),
        };
      });
    });

    sets[setNumber] = teamParticipation;
    return sets;
  }, {} as MatchReportParticipationBySet);
}

export function buildSetTeamStatsMap(input: BuildMatchStatsInput, setNumbers: number[]): Record<number, Record<TeamSide, TeamStats>> {
  return setNumbers.reduce((map, setNumber) => {
    const setStats = buildSetMatchStats(input, setNumber);
    map[setNumber] = setStats.teamStats;
    return map;
  }, {} as Record<number, Record<TeamSide, TeamStats>>);
}

function getRallyTerminalTouch(touches: readonly BallTouch[]): BallTouch | undefined {
  return touches.slice().reverse().find((touch) => isTrueTerminalTouch(touch));
}

export function computePlayerBreakPointPoints(stats: MatchStats): Record<string, number> {
  return stats.setStats.reduce((map, setStats) => {
    setStats.rallies.forEach((rally) => {
      const servingTeam = rally.servingTeam;
      const pointWinner = rally.pointWinner ?? (() => {
        const terminalTouch = getRallyTerminalTouch(rally.touches);
        return terminalTouch ? resolvePointWinnerFromTouch(terminalTouch) : null;
      })();

      if (!servingTeam || pointWinner !== servingTeam) {
        return;
      }

      const terminalTouch = getRallyTerminalTouch(rally.touches);
      if (!terminalTouch || terminalTouch.teamSide !== servingTeam || !terminalTouch.playerId) {
        return;
      }

      const count = map[terminalTouch.playerId] ?? 0;
      map[terminalTouch.playerId] = count + 1;
    });

    return map;
  }, {} as Record<string, number>);
}

function sanitizeFilenameSegment(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export function createMatchReportFilename(
  homeTeamName: string,
  awayTeamName: string,
  playedAt?: string,
): string {
  const date = playedAt ? new Date(playedAt) : new Date();
  const safeDate = Number.isNaN(date.getTime()) ? new Date().toISOString().slice(0, 10) : date.toISOString().slice(0, 10);
  return `${sanitizeFilenameSegment(homeTeamName)}-vs-${sanitizeFilenameSegment(awayTeamName)}-${safeDate}-report.html`;
}

function formatPercentValue(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '-';
  }
  return `${Math.round(value * 100)}%`;
}

function formatDateTime(playedAt?: string): string {
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

function textOrDash(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') {
    return '-';
  }
  return String(value);
}

const htmlStyle = `
  body { font-family: Inter, ui-sans-serif, system-ui, sans-serif; margin: 0; padding: 24px; color: #0f172a; background: #f8fafc; }
  h1, h2, h3, h4 { margin: 0; }
  h1 { font-size: 1.8rem; margin-bottom: 0.5rem; }
  h2 { font-size: 1.2rem; margin-top: 1.5rem; margin-bottom: 0.75rem; }
  .report-header { display: grid; gap: 0.5rem; margin-bottom: 1.5rem; }
  .report-meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 0.75rem; font-size: 0.95rem; color: #475569; }
  .report-score { display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: baseline; margin-top: 0.75rem; }
  .report-score strong { font-size: 2rem; color: #0f172a; }
  .report-table-wrap { overflow-x: auto; }
  .report-table { width: 100%; border-collapse: collapse; margin-top: 0.5rem; font-size: 0.82rem; }
  .report-table th, .report-table td { border: 1px solid #cbd5e1; padding: 0.55rem 0.7rem; text-align: right; white-space: nowrap; }
  .report-table th { background: #f8fafc; color: #475569; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; }
  .report-table td { background: #ffffff; color: #0f172a; }
  .report-table td:first-child, .report-table th:first-child { text-align: left; }
  .report-section { margin-top: 1.5rem; }
  .report-section-title { margin-bottom: 0.75rem; font-size: 1rem; color: #0f172a; }
  .report-summary-grid { display: grid; gap: 0.75rem; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); margin-top: 0.75rem; }
  .summary-card { padding: 0.9rem; border: 1px solid #cbd5e1; border-radius: 0.75rem; background: #ffffff; }
  .summary-card strong { display: block; margin-top: 0.35rem; font-size: 1.15rem; color: #0f172a; }
  .small-pill { display: inline-flex; align-items: center; justify-content: center; min-width: 1.8rem; height: 1.8rem; border-radius: 999px; background: #e2e8f0; color: #475569; font-size: 0.75rem; font-weight: 700; }
  .player-row__name { display: flex; align-items: center; gap: 0.4rem; }
  .player-row__libero { display: inline-flex; align-items: center; justify-content: center; width: 1.5rem; height: 1.5rem; border-radius: 999px; background: #f1f5f9; color: #334155; font-size: 0.7rem; }
`;

export function downloadMatchReportHtml(html: string, filename: string) {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function printMatchReportHtml(html: string) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    return;
  }

  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => {
    printWindow.print();
  }, 250);
}

export function buildMatchReportHtml(input: {
  homeTeam: Team;
  awayTeam: Team;
  metadata?: MatchMetadata | null;
  scoutingConfig: ScoutingMatchConfig;
  eventLog: MatchEvent[];
  completedSets: CompletedSetSummary[];
  stats: MatchStats;
}): string {
  const title = input.stats.setStats.length === 1 ? 'Set report' : 'Match report';
  const setScoreSummary = input.stats.setStats.map((setStats) => `${setStats.homeScore}-${setStats.awayScore}`).join(', ');
  const setNumbers = input.stats.setStats.map((setStats) => setStats.setNumber);
  const setTeamStatsBySet = buildSetTeamStatsMap(
    {
      homeTeam: input.homeTeam,
      awayTeam: input.awayTeam,
      eventLog: input.eventLog,
      completedSets: input.completedSets,
    },
    setNumbers,
  );

  const playedAt = input.metadata?.playedAt;
  const competition = input.metadata?.competition ?? input.metadata?.title ?? '-';
  const venue = input.metadata?.venue ?? '-';
  const timing = playedAt ? formatDateTime(playedAt) : '-';
  const headerRows = `
    <div class="report-header">
      <div>
        <h1>${title}</h1>
        <div class="report-meta">
          <div><strong>Competition</strong><div>${competition}</div></div>
          <div><strong>Date</strong><div>${timing}</div></div>
          <div><strong>Venue</strong><div>${venue}</div></div>
          <div><strong>Home team</strong><div>${input.homeTeam.name}</div></div>
          <div><strong>Away team</strong><div>${input.awayTeam.name}</div></div>
        </div>
      </div>
      <div class="report-score">
        <span>${input.homeTeam.name}</span>
        <strong>${input.stats.setStats.reduce((total, set) => total + (set.homeScore > set.awayScore ? 1 : 0), 0)} : ${input.stats.setStats.reduce((total, set) => total + (set.awayScore > set.homeScore ? 1 : 0), 0)}</strong>
        <span>${setScoreSummary}</span>
      </div>
    </div>
  `;

  const rowsBySet = input.stats.setStats.map((setStats) => {
    const partials = buildSetPartialScores(setStats, getSetTargetPoints(input.scoutingConfig, setStats.setNumber));
    return `
      <tr>
        <td>${setStats.setNumber}</td>
        <td>${textOrDash(getSetDurationLabel(setStats.setNumber, input.eventLog))}</td>
        <td>${partials.map((partial) => `${partial.target}: ${partial.score}`).join(', ')}</td>
        <td>${setStats.homeScore}-${setStats.awayScore}</td>
      </tr>
    `;
  }).join('');

  const totalsRows = ['home', 'away'] as const;
  const teamRows = totalsRows.map((teamSide) => {
    const teamStats = input.stats.teamStats[teamSide];
    const sideOutPercent = input.stats.sideOutStats?.[teamSide]?.sideOutPercentage ?? null;
    const breakPointPercent = input.stats.breakPointStats?.[teamSide]?.breakPointPercentage ?? null;
    return `
      <tr>
        <th scope="row">${teamSide === 'home' ? input.homeTeam.name : input.awayTeam.name}</th>
        <td>${teamStats.points}</td>
        <td>${teamStats.aces}</td>
        <td>${teamStats.receive.total}</td>
        <td>${teamStats.receptionErrors}</td>
        <td>${formatPercentValue(safeDivide(teamStats.receive.positive, teamStats.receive.total))}</td>
        <td>${formatPercentValue(safeDivide(teamStats.attackPoints, teamStats.attack.total))}</td>
        <td>${formatPercentValue(sideOutPercent)}</td>
        <td>${formatPercentValue(breakPointPercent)}</td>
      </tr>
    `;
  }).join('');

  const setDetailRows = setNumbers.map((setNumber) => {
    const teamStats = setTeamStatsBySet[setNumber];
    return `
      <tr>
        <th scope="row">Set ${setNumber}</th>
        <td>${teamStats.home.points}</td>
        <td>${teamStats.away.points}</td>
        <td>${teamStats.home.receive.total}</td>
        <td>${teamStats.away.receive.total}</td>
        <td>${teamStats.home.attackPoints}</td>
        <td>${teamStats.away.attackPoints}</td>
      </tr>
    `;
  }).join('');

  return `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${title}</title>
<style>${htmlStyle}</style>
</head>
<body>
${headerRows}
  <section class="report-section">
    <h2 class="report-section-title">Set summary</h2>
    <div class="report-table-wrap">
      <table class="report-table">
        <thead>
          <tr><th>Set</th><th>Duration</th><th>Intermediate scores</th><th>Final score</th></tr>
        </thead>
        <tbody>${rowsBySet}</tbody>
      </table>
    </div>
  </section>
  <section class="report-section">
    <h2 class="report-section-title">Team totals</h2>
    <div class="report-table-wrap">
      <table class="report-table">
        <thead>
          <tr>
            <th>Team</th>
            <th>Points</th>
            <th>Aces</th>
            <th>Receptions</th>
            <th>Reception errors</th>
            <th>Reception %</th>
            <th>Attack %</th>
            <th>Side-out %</th>
            <th>Break-point %</th>
          </tr>
        </thead>
        <tbody>${teamRows}</tbody>
      </table>
    </div>
  </section>
  <section class="report-section">
    <h2 class="report-section-title">Set detail</h2>
    <div class="report-table-wrap">
      <table class="report-table">
        <thead>
          <tr>
            <th>Set</th>
            <th>Home points</th>
            <th>Away points</th>
            <th>Home receptions</th>
            <th>Away receptions</th>
            <th>Home attack points</th>
            <th>Away attack points</th>
          </tr>
        </thead>
        <tbody>${setDetailRows}</tbody>
      </table>
    </div>
  </section>
</body>
</html>
`;
}
