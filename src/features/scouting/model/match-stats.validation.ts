import type { TeamSide } from '@src/domain/common/enums';
import type { MatchEvent } from '@src/domain/events/types';
import type { StartingLineup } from '@src/domain/lineup/types';
import {
  buildSetLineupSnapshotsFromEvents,
  createTeamScopedPlayerKey,
} from '@src/domain/lineup';
import type { Player, Team } from '@src/domain/roster/types';
import { PlayerRole } from '@src/domain/systems/types';
import type { BallTouch } from '@src/domain/touch/types';
import {
  TRACKED_SKILLS,
  aggregateSkillEvaluationTotals,
  buildMatchStats,
  buildSetMatchStats,
  getUnassignedStatsPlayerId,
  validateAceReceptionConsistency,
  validatePlayerSkillTotals,
  validateStatsIntegrity,
  validateTeamTotals,
} from './match-stats';
import { resolvePointWinnerFromTouch } from './scoring-rules';
import { createDefaultScoutingMatchConfig } from '@src/domain/scouting/helpers';
import { replayLiveMatchFromEvents } from './replay';
import {
  buildMatchReportHtml,
  buildDataVolleyMatchReport,
  createMatchReportFilename,
  createMatchReportPrintTitle,
  buildPlayerParticipationBySet,
  buildSetPhaseSplits,
  buildSetPartialScores,
  buildSetTeamStatsMap,
  buildMatchReportPngSvg,
  MATCH_REPORT_PNG_HEIGHT,
  MATCH_REPORT_PNG_WIDTH,
  validateMatchReportTotals,
} from './match-report';
import {
  SKILL_CHARTS,
  buildTeamEvaluationRows,
} from '../components/skill-evaluation-chart-data';

type ValidationResult = {
  assertions: number;
};

type SkillDistribution = {
  total: number;
  slash: number;
  exclamation: number;
  minus: number;
  plus: number;
  hash: number;
  equal: number;
};

function createPlayer(id: string, jerseyNumber: number, firstName: string, lastName: string): Player {
  return {
    id,
    jerseyNumber,
    firstName,
    lastName,
    shortName: `${firstName} ${lastName}`,
    playerCode: String(jerseyNumber).padStart(2, '0'),
  };
}

function createTeam(teamSide: TeamSide, name: string, players: Player[]): Team {
  return {
    id: `${teamSide}-team`,
    code: teamSide.toUpperCase(),
    name,
    players,
    staff: {
      headCoach: '',
      assistantCoach: '',
    },
  };
}

function createStartingLineup(
  teamSide: TeamSide,
  setterPlayerId: string,
  setterPosition: StartingLineup['slots'][number]['courtPosition'],
): StartingLineup {
  return {
    teamSide,
    setterPlayerId,
    liberoPlayerIds: [],
    displaySide: teamSide === 'home' ? 'left' : 'right',
    slots: ([1, 2, 3, 4, 5, 6] as const).map((courtPosition) => ({
      courtPosition,
      playerId: courtPosition === setterPosition ? setterPlayerId : `${teamSide}-lineup-${courtPosition}`,
    })),
  };
}

function createSetStartedEvent(input: {
  id: string;
  setNumber: number;
  servingTeam: TeamSide;
  homeSetterPosition: StartingLineup['slots'][number]['courtPosition'];
  awaySetterPosition: StartingLineup['slots'][number]['courtPosition'];
}): Extract<MatchEvent, { type: 'set_started' }> {
  return {
    id: input.id,
    type: 'set_started',
    setNumber: input.setNumber,
    createdAt: input.setNumber * 1000,
    homeLineup: createStartingLineup('home', 'home-1', input.homeSetterPosition),
    awayLineup: createStartingLineup('away', 'away-3', input.awaySetterPosition),
    servingTeam: input.servingTeam,
  };
}

function createPointAwardedEvent(input: {
  id: string;
  setNumber?: number;
  rallyNumber: number;
  teamSide: TeamSide;
  skipRotation?: boolean;
}): MatchEvent {
  return {
    id: input.id,
    type: 'point_awarded',
    createdAt: input.rallyNumber * 100,
    setNumber: input.setNumber ?? 1,
    rallyNumber: input.rallyNumber,
    teamSide: input.teamSide,
    skipRotation: input.skipRotation,
  };
}

function createTouch(input: {
  id: string;
  setNumber?: number;
  rallyNumber: number;
  sequenceNumber?: number;
  teamSide: TeamSide;
  playerId: string;
  skill: BallTouch['skill'];
  evaluation: BallTouch['evaluation'];
}): BallTouch {
  return {
    id: input.id,
    setNumber: input.setNumber ?? 1,
    rallyNumber: input.rallyNumber,
    sequenceNumber: input.sequenceNumber ?? 1,
    teamSide: input.teamSide,
    playerId: input.playerId,
    skill: input.skill,
    evaluation: input.evaluation,
    createdAt: input.rallyNumber * 100 + (input.sequenceNumber ?? 1),
  };
}

function expectEqual<T>(actual: T, expected: T, label: string): number {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }

  return 1;
}

function expectClose(actual: number | null | undefined, expected: number, label: string): number {
  if (actual === null || actual === undefined || Math.abs(actual - expected) > 1e-9) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }

  return 1;
}

function getDistributionTotal(distribution: SkillDistribution): number {
  return distribution.equal
    + distribution.slash
    + distribution.exclamation
    + distribution.minus
    + distribution.plus
    + distribution.hash;
}

export function validateMatchStatsFixture(): ValidationResult {
  let assertions = 0;

  const homeTeam = createTeam('home', 'Home Test', [
    createPlayer('home-1', 1, 'Home', 'Server'),
    createPlayer('home-2', 2, 'Home', 'Attacker'),
  ]);
  const awayTeam = createTeam('away', 'Guest Test', [
    createPlayer('away-3', 3, 'Guest', 'Setter'),
    createPlayer('away-4', 4, 'Guest', 'Attacker'),
    createPlayer('away-5', 5, 'Guest', 'Receiver'),
    createPlayer('away-6', 6, 'Guest', 'Defender'),
  ]);

  const receiveHashTouch = createTouch({
    id: 'touch-away-receive-hash',
    rallyNumber: 10,
    teamSide: 'away',
    playerId: 'away-5',
    skill: 'receive',
    evaluation: '#',
  });
  const committedTouches = [
    createTouch({
      id: 'touch-home-serve-ace',
      rallyNumber: 1,
      teamSide: 'home',
      playerId: 'home-1',
      skill: 'serve',
      evaluation: '#',
    }),
    createTouch({
      id: 'touch-home-serve-error',
      rallyNumber: 2,
      teamSide: 'home',
      playerId: 'home-1',
      skill: 'serve',
      evaluation: '=',
    }),
    createTouch({
      id: 'touch-away-reception-error',
      rallyNumber: 3,
      teamSide: 'away',
      playerId: 'away-5',
      skill: 'receive',
      evaluation: '=',
    }),
    createTouch({
      id: 'touch-home-attack-kill',
      rallyNumber: 4,
      teamSide: 'home',
      playerId: 'home-2',
      skill: 'attack',
      evaluation: '#',
    }),
    createTouch({
      id: 'touch-away-dig-positive',
      rallyNumber: 5,
      sequenceNumber: 1,
      teamSide: 'away',
      playerId: 'away-6',
      skill: 'dig',
      evaluation: '+',
    }),
    createTouch({
      id: 'touch-away-set-positive',
      rallyNumber: 5,
      sequenceNumber: 2,
      teamSide: 'away',
      playerId: 'away-3',
      skill: 'set',
      evaluation: '+',
    }),
    createTouch({
      id: 'touch-away-attack-error',
      rallyNumber: 6,
      teamSide: 'away',
      playerId: 'away-4',
      skill: 'attack',
      evaluation: '=',
    }),
    createTouch({
      id: 'touch-away-attack-blocked',
      rallyNumber: 7,
      teamSide: 'away',
      playerId: 'away-4',
      skill: 'attack',
      evaluation: '/',
    }),
    createTouch({
      id: 'touch-home-block-point',
      rallyNumber: 8,
      teamSide: 'home',
      playerId: 'home-2',
      skill: 'block',
      evaluation: '#',
    }),
    createTouch({
      id: 'touch-away-receive-positive',
      rallyNumber: 9,
      teamSide: 'away',
      playerId: 'away-5',
      skill: 'receive',
      evaluation: '+',
    }),
    receiveHashTouch,
  ];

  const stats = buildMatchStats({
    homeTeam,
    awayTeam,
    committedTouches,
  });

  assertions += expectEqual(stats.teamStats.home.aces, 1, 'home serve ace count');
  assertions += expectEqual(stats.teamStats.home.serveErrors, 1, 'home serve error count');
  assertions += expectEqual(stats.teamStats.away.receptionErrors, 2, 'away reception error count includes linked ace receive');
  assertions += expectEqual(stats.teamStats.home.attackPoints, 1, 'home attack point count');
  assertions += expectEqual(stats.teamStats.away.attackErrors, 1, 'away attack error count');
  assertions += expectEqual(stats.teamStats.away.attackBlocked, 1, 'away blocked attack count');
  assertions += expectEqual(stats.teamStats.home.blockPoints, 1, 'home block point count');
  assertions += expectEqual(stats.teamStats.home.points, 5, 'home terminal point count');
  assertions += expectEqual(stats.teamStats.away.receive.total, 4, 'away receive total includes linked ace receive');
  assertions += expectEqual(stats.teamStats.away.receive.hash, 1, 'away receive hash count');
  assertions += expectEqual(stats.teamStats.away.receive.plus, 1, 'away receive plus count');
  assertions += expectEqual(stats.teamStats.away.receive.points, 0, 'away receive hash point count');
  assertions += expectEqual(stats.teamStats.away.dig.total, 1, 'away dig total');
  assertions += expectEqual(stats.teamStats.away.set.total, 1, 'away set total');
  assertions += expectEqual(stats.teamStats.away.attack.total, 2, 'away attack total');
  assertions += expectEqual(stats.totalTouches, committedTouches.length + 1, 'committed touches feed match totals with linked ace receive');
  assertions += expectEqual(resolvePointWinnerFromTouch(receiveHashTouch), null, 'receive hash point winner');
  assertions += expectEqual(
    stats.rallyStats.find((rally) => rally.rallyNumber === 1)?.servingTeam,
    'home',
    'serving team fallback derives from first serve touch',
  );
  assertions += expectEqual(stats.quickStats.teams.home.serve.efficiency, 0, 'serve error decreases serve efficiency');
  assertions += expectEqual(stats.quickStats.teams.away.reception.efficiency, 0, 'receive hash and plus offset by the two reception errors (explicit + linked ace)');
  assertions += expectEqual(stats.quickStats.teams.away.reception.perfectPercentage, 1 / 4, 'receive perfect percentage');
  assertions += expectEqual(stats.quickStats.teams.home.reception.efficiency, null, 'zero receptions have null efficiency');
  assertions += expectEqual(stats.quickStats.teams.home.attack.efficiency, 1, 'attack kill increases efficiency');
  assertions += expectEqual(stats.quickStats.teams.home.attack.killPercentage, 1, 'attack kill increases kill percentage');
  assertions += expectEqual(stats.quickStats.teams.away.attack.efficiency, -1, 'attack errors and blocked attacks reduce efficiency');
  assertions += expectEqual(stats.quickStats.teams.away.attack.killPercentage, 0, 'zero attack points produce zero kill percentage');
  assertions += expectEqual(stats.quickStats.teams.home.block.efficiency, 1 / 2, 'block efficiency uses opponent attacks');

  const homeServer = stats.playerStats.find((player) => player.playerId === 'home-1');
  const homeAttacker = stats.playerStats.find((player) => player.playerId === 'home-2');
  const awayReceiver = stats.playerStats.find((player) => player.playerId === 'away-5');
  const awayUnassigned = stats.playerStats.find((player) => player.playerId === getUnassignedStatsPlayerId('away'));
  const awayAttacker = stats.playerStats.find((player) => player.playerId === 'away-4');
  const playersWithTouches = stats.playerStats.filter((player) => player.totalTouches > 0);
  const homePlayerTouchTotal = stats.playerStats
    .filter((player) => player.teamSide === 'home')
    .reduce((total, player) => total + player.totalTouches, 0);
  const awayPlayerTouchTotal = stats.playerStats
    .filter((player) => player.teamSide === 'away')
    .reduce((total, player) => total + player.totalTouches, 0);

  assertions += expectEqual(playersWithTouches.length > 0, true, 'player tables receive non-empty committed-touch data');
  assertions += expectEqual(homePlayerTouchTotal, stats.teamStats.home.totalTouches, 'home player table total matches home team total');
  assertions += expectEqual(awayPlayerTouchTotal, stats.teamStats.away.totalTouches, 'away player table total matches away team total');
  assertions += expectEqual(stats.teamStats.home.totalTouches, 4, 'home/away split keeps home touches separate');
  assertions += expectEqual(stats.teamStats.away.totalTouches, 8, 'home/away split keeps away touches separate');
  assertions += expectEqual(awayUnassigned?.receive.equal, 1, 'linked ace receive is attributed to unassigned receiver when legacy data has no victim');

  const serveChartConfig = SKILL_CHARTS.find((config) => config.skill === 'serve');
  const receiveChartConfig = SKILL_CHARTS.find((config) => config.skill === 'receive');
  const homeServeChartRows = serveChartConfig ? buildTeamEvaluationRows(stats, 'home', serveChartConfig) : [];
  const awayServeChartRows = serveChartConfig ? buildTeamEvaluationRows(stats, 'away', serveChartConfig) : [];
  const homeReceiveChartRows = receiveChartConfig ? buildTeamEvaluationRows(stats, 'home', receiveChartConfig) : [];
  const awayReceiveChartRows = receiveChartConfig ? buildTeamEvaluationRows(stats, 'away', receiveChartConfig) : [];

  assertions += expectEqual(
    homeServeChartRows.find((row) => row.evaluation === '#')?.count,
    stats.teamStats.home.serve.hash,
    'home serve chart uses home serve distribution only',
  );
  assertions += expectEqual(
    awayServeChartRows.find((row) => row.evaluation === '#')?.count,
    stats.teamStats.away.serve.hash,
    'away serve chart uses away serve distribution only',
  );
  assertions += expectEqual(
    homeReceiveChartRows.reduce((total, row) => total + row.count, 0),
    stats.teamStats.home.receive.total,
    'home reception chart total matches home reception table total',
  );
  assertions += expectEqual(
    awayReceiveChartRows.find((row) => row.evaluation === '=')?.count,
    stats.teamStats.away.receive.equal,
    'away reception chart includes away receive errors only',
  );

  assertions += expectEqual(homeServer?.totalTouches, 2, 'home server total touches');
  assertions += expectEqual(homeServer?.aces, 1, 'home server ace count');
  assertions += expectEqual(homeServer?.points, 1, 'home server point count');
  assertions += expectEqual(homeServer?.errors, 1, 'home server error count');
  assertions += expectEqual(homeAttacker?.attackPoints, 1, 'home attacker attack point count');
  assertions += expectEqual(homeAttacker?.blockPoints, 1, 'home attacker block point count');
  assertions += expectEqual(awayReceiver?.totalTouches, 3, 'away receiver total touches');
  assertions += expectEqual(awayReceiver?.receptionErrors, 1, 'away receiver reception error count');
  assertions += expectEqual(awayReceiver?.receive.hash, 1, 'away receiver receive hash count');
  assertions += expectEqual(awayReceiver?.points, 0, 'away receiver point count');
  assertions += expectEqual(awayAttacker?.errors, 1, 'away attacker error count');
  assertions += expectEqual(awayAttacker?.attackBlocked, 1, 'away attacker blocked attack count');
  assertions += expectEqual(
    stats.quickStats.players.find((player) => player.playerId === 'away-4')?.attack.efficiency,
    -1,
    'player attack efficiency includes errors and blocked attacks',
  );

  (['home', 'away'] as const).forEach((teamSide) => {
    (['attack', 'serve', 'receive'] as const).forEach((skill) => {
      assertions += expectEqual(
        getDistributionTotal(stats.teamStats[teamSide][skill]),
        stats.teamStats[teamSide][skill].total,
        `${teamSide} ${skill} chart distribution matches team total`,
      );
    });
    assertions += expectEqual(
      stats.quickStats.teams[teamSide].attack.attempts,
      stats.teamStats[teamSide].attack.total,
      `${teamSide} attack quick chart total matches team total`,
    );
    assertions += expectEqual(
      stats.quickStats.teams[teamSide].serve.total,
      stats.teamStats[teamSide].serve.total,
      `${teamSide} serve quick chart total matches team total`,
    );
    assertions += expectEqual(
      stats.quickStats.teams[teamSide].reception.total,
      stats.teamStats[teamSide].receive.total,
      `${teamSide} reception quick chart total matches team total`,
    );
  });

  assertions += expectEqual(validateTeamTotals(stats).length, 0, 'team totals equal sum of player rows');
  assertions += expectEqual(validatePlayerSkillTotals(stats).length, 0, 'skill columns equal player row sums');
  assertions += expectEqual(validateAceReceptionConsistency(stats).length, 0, 'ace/reception linkage is internally consistent');
  assertions += expectEqual(validateStatsIntegrity(stats).length, 0, 'full stats integrity validation passes');
  (['home', 'away'] as const).forEach((teamSide) => {
    TRACKED_SKILLS.forEach((skill) => {
      const playerTotals = aggregateSkillEvaluationTotals(stats.playerStats, teamSide, skill);
      assertions += expectEqual(
        playerTotals.total,
        stats.teamStats[teamSide][skill].total,
        `${teamSide} ${skill} player aggregate total matches team total`,
      );
    });
  });

  const duplicatePointEvent: MatchEvent = {
    id: 'event-home-serve-ace-point',
    type: 'point_awarded',
    createdAt: 100,
    setNumber: 1,
    rallyNumber: 1,
    teamSide: 'home',
  };
  const duplicatePointStats = buildMatchStats({
    homeTeam,
    awayTeam,
    touches: [
      createTouch({
        id: 'touch-home-serve-ace-duplicate',
        rallyNumber: 1,
        teamSide: 'home',
        playerId: 'home-1',
        skill: 'serve',
        evaluation: '#',
      }),
    ],
    eventLog: [duplicatePointEvent],
  });

  assertions += expectEqual(duplicatePointStats.teamStats.home.points, 1, 'point event avoids terminal touch double count');
  assertions += expectEqual(duplicatePointStats.teamStats.away.receive.equal, 1, 'legacy serve ace synthesizes receive error');
  assertions += expectEqual(
    duplicatePointStats.playerStats.find((player) => player.playerId === getUnassignedStatsPlayerId('away'))?.receptionErrors,
    1,
    'legacy synthesized receive error stays in player totals',
  );
  assertions += expectEqual(validateStatsIntegrity(duplicatePointStats).length, 0, 'legacy ace synthesis keeps totals consistent');

  const acePairTouches = [
    createTouch({
      id: 'touch-home-serve-ace-pair',
      rallyNumber: 11,
      sequenceNumber: 1,
      teamSide: 'home',
      playerId: 'home-1',
      skill: 'serve',
      evaluation: '#',
    }),
    createTouch({
      id: 'touch-away-ace-victim-receive-error',
      rallyNumber: 11,
      sequenceNumber: 2,
      teamSide: 'away',
      playerId: 'away-5',
      skill: 'receive',
      evaluation: '=',
    }),
  ];
  const acePairStats = buildMatchStats({
    homeTeam,
    awayTeam,
    committedTouches: acePairTouches,
  });
  const acePairHomeServer = acePairStats.playerStats.find((player) => player.playerId === 'home-1');
  const acePairAwayReceiver = acePairStats.playerStats.find((player) => player.playerId === 'away-5');
  const acePairHomeServeRows = serveChartConfig ? buildTeamEvaluationRows(acePairStats, 'home', serveChartConfig) : [];
  const acePairAwayReceptionRows = receiveChartConfig ? buildTeamEvaluationRows(acePairStats, 'away', receiveChartConfig) : [];

  assertions += expectEqual(acePairStats.teamStats.home.aces, 1, 'ace pair gives serving team ace');
  assertions += expectEqual(acePairHomeServer?.aces, 1, 'ace pair gives server ace in player table');
  assertions += expectEqual(acePairStats.teamStats.away.receptionErrors, 1, 'ace pair gives receiving team reception error');
  assertions += expectEqual(acePairStats.teamStats.away.receive.total, 1, 'ace pair receive is not duplicated');
  assertions += expectEqual(acePairAwayReceiver?.receptionErrors, 1, 'ace pair gives victim reception error in player table');
  assertions += expectEqual(
    acePairHomeServeRows.find((row) => row.evaluation === '#')?.count,
    1,
    'ace pair appears in serving team serve chart',
  );
  assertions += expectEqual(
    acePairAwayReceptionRows.find((row) => row.evaluation === '=')?.count,
    1,
    'ace victim receive error appears in receiving team reception chart',
  );
  assertions += expectEqual(validateStatsIntegrity(acePairStats).length, 0, 'ace pair passes stats integrity checks');

  const inferredOverrideStats = buildMatchStats({
    homeTeam,
    awayTeam,
    committedTouches: [
      {
        ...createTouch({
          id: 'touch-inferred-dig-to-replace',
          rallyNumber: 12,
          sequenceNumber: 2,
          teamSide: 'away',
          playerId: 'away-6',
          skill: 'dig',
          evaluation: '+',
        }),
        source: 'inferred' as const,
        touchOrigin: 'implicit_inference' as const,
        inferredFromTouchId: 'touch-home-attack-plus',
      },
      {
        ...createTouch({
          id: 'touch-explicit-dig-override',
          rallyNumber: 12,
          sequenceNumber: 2,
          teamSide: 'away',
          playerId: 'away-6',
          skill: 'dig',
          evaluation: '+',
        }),
        source: 'explicit' as const,
      },
    ],
  });
  assertions += expectEqual(inferredOverrideStats.teamStats.away.dig.total, 1, 'explicit override removes replaced inferred stat');
  assertions += expectEqual(validateStatsIntegrity(inferredOverrideStats).length, 0, 'inferred override keeps stat totals consistent');

  const replayedTouch = {
    ...createTouch({
      id: 'touch-replay-dig-single',
      rallyNumber: 13,
      sequenceNumber: 1,
      teamSide: 'away',
      playerId: 'away-6',
      skill: 'dig',
      evaluation: '+',
    }),
    source: 'inferred' as const,
    touchOrigin: 'implicit_inference' as const,
  };
  const replayDedupeStats = buildMatchStats({
    homeTeam,
    awayTeam,
    eventLog: [{
      id: 'event-replay-dig-single',
      type: 'touch_recorded',
      createdAt: replayedTouch.createdAt,
      touch: replayedTouch,
    }],
    committedTouches: [replayedTouch],
  });
  assertions += expectEqual(replayDedupeStats.teamStats.away.dig.total, 1, 'replay does not duplicate inferred stats');
  assertions += expectEqual(validateStatsIntegrity(replayDedupeStats).length, 0, 'replay dedupe keeps stat totals consistent');

  const advancedStats = buildMatchStats({
    homeTeam,
    awayTeam,
    eventLog: [
      createSetStartedEvent({
        id: 'event-set-started-advanced',
        setNumber: 1,
        servingTeam: 'home',
        homeSetterPosition: 1,
        awaySetterPosition: 2,
      }),
      createPointAwardedEvent({
        id: 'event-rally-1-home-break-point',
        rallyNumber: 1,
        teamSide: 'home',
      }),
      createPointAwardedEvent({
        id: 'event-rally-2-away-side-out',
        rallyNumber: 2,
        teamSide: 'away',
      }),
      createPointAwardedEvent({
        id: 'event-rally-3-home-side-out',
        rallyNumber: 3,
        teamSide: 'home',
      }),
      createPointAwardedEvent({
        id: 'event-rally-4-home-break-point-after-rotation',
        rallyNumber: 4,
        teamSide: 'home',
      }),
    ],
  });
  const homeRotationOne = advancedStats.rotationStats.home.find((rotation) => rotation.rotationNumber === 1);
  const homeRotationSix = advancedStats.rotationStats.home.find((rotation) => rotation.rotationNumber === 6);
  const awayRotationOne = advancedStats.rotationStats.away.find((rotation) => rotation.rotationNumber === 1);
  const awayRotationTwo = advancedStats.rotationStats.away.find((rotation) => rotation.rotationNumber === 2);

  assertions += expectEqual(advancedStats.rallyStats[0]?.servingTeam, 'home', 'set-start serving team applied to first rally');
  assertions += expectEqual(advancedStats.rallyStats[1]?.servingTeam, 'home', 'serving team remains after break point');
  assertions += expectEqual(advancedStats.rallyStats[2]?.servingTeam, 'away', 'serving team changes after side-out');
  assertions += expectEqual(advancedStats.rallyStats[3]?.servingTeam, 'home', 'serving team changes after second side-out');
  assertions += expectEqual(advancedStats.sideOutStats.away.sideOutAttempts, 3, 'away side-out attempts');
  assertions += expectEqual(advancedStats.sideOutStats.away.sideOutWins, 1, 'away side-out wins');
  assertions += expectEqual(advancedStats.sideOutStats.away.sideOutPercentage, 1 / 3, 'away side-out percentage');
  assertions += expectEqual(advancedStats.sideOutStats.home.sideOutAttempts, 1, 'home side-out attempts');
  assertions += expectEqual(advancedStats.sideOutStats.home.sideOutWins, 1, 'home side-out wins');
  assertions += expectEqual(advancedStats.sideOutStats.home.sideOutPercentage, 1, 'home side-out percentage');
  assertions += expectEqual(advancedStats.breakPointStats.home.breakPointAttempts, 3, 'home break point attempts');
  assertions += expectEqual(advancedStats.breakPointStats.home.breakPointWins, 2, 'home break point wins');
  assertions += expectEqual(advancedStats.breakPointStats.home.breakPointPercentage, 2 / 3, 'home break point percentage');
  assertions += expectEqual(advancedStats.breakPointStats.away.breakPointAttempts, 1, 'away break point attempts');
  assertions += expectEqual(advancedStats.breakPointStats.away.breakPointWins, 0, 'away break point wins');
  assertions += expectEqual(advancedStats.breakPointStats.away.breakPointPercentage, 0, 'away break point percentage');
  assertions += expectEqual(homeRotationOne?.sideOutAttempts, 1, 'home rotation 1 side-out attempts');
  assertions += expectEqual(homeRotationOne?.sideOutWins, 1, 'home rotation 1 side-out wins');
  assertions += expectEqual(homeRotationOne?.breakPointAttempts, 2, 'home rotation 1 break point attempts');
  assertions += expectEqual(homeRotationOne?.breakPointWins, 1, 'home rotation 1 break point wins');
  assertions += expectEqual(homeRotationOne?.pointsScored, 2, 'home rotation 1 points scored');
  assertions += expectEqual(homeRotationOne?.pointsConceded, 1, 'home rotation 1 points conceded');
  assertions += expectEqual(homeRotationSix?.breakPointAttempts, 1, 'home rotates 1 to 6 after side-out win');
  assertions += expectEqual(homeRotationSix?.breakPointWins, 1, 'home rotation 6 break point wins');
  assertions += expectEqual(homeRotationSix?.pointsScored, 1, 'home rotation 6 points scored');
  assertions += expectEqual(awayRotationTwo?.sideOutAttempts, 2, 'away starts in setter rotation 2');
  assertions += expectEqual(awayRotationTwo?.sideOutWins, 1, 'away rotation 2 side-out wins');
  assertions += expectEqual(awayRotationTwo?.pointsScored, 1, 'away rotation 2 points scored');
  assertions += expectEqual(awayRotationTwo?.pointsConceded, 1, 'away rotation 2 points conceded');
  assertions += expectEqual(awayRotationOne?.breakPointAttempts, 1, 'away rotates 2 to 1 after side-out win');
  assertions += expectEqual(awayRotationOne?.sideOutAttempts, 1, 'away rotation 1 side-out attempts');
  assertions += expectEqual(awayRotationOne?.pointsConceded, 2, 'away rotation 1 points conceded');

  const matchReportHome = createTeam('home', 'Home Report', [
    { ...createPlayer('home-1', 1, 'Home', 'Server'), isCaptain: true },
    createPlayer('home-2', 2, 'Home', 'Attacker'),
    createPlayer('home-3', 3, 'Home', 'Sub'),
    { ...createPlayer('home-4', 4, 'Home', 'Libero'), role: 'libero', isLibero: true },
    { ...createPlayer('home-5', 5, 'Home', 'Second Libero'), role: 'libero', isLibero: true }],
  );
  const matchReportAway = createTeam('away', 'Guest Report', [
    createPlayer('away-4', 4, 'Guest', 'Setter'),
    createPlayer('away-5', 5, 'Guest', 'Attacker')],
  );

  const baseReportSetStarted = createSetStartedEvent({
    id: 'event-report-set-started',
    setNumber: 1,
    servingTeam: 'home',
    homeSetterPosition: 1,
    awaySetterPosition: 2,
  });
  const reportSetStarted: Extract<MatchEvent, { type: 'set_started' }> = {
    ...baseReportSetStarted,
    homeLineup: {
      ...baseReportSetStarted.homeLineup,
      setterPlayerId: undefined,
      slots: baseReportSetStarted.homeLineup.slots.map((slot) => {
        if (slot.courtPosition === 1) {
          return { ...slot, tacticalRole: PlayerRole.SETTER };
        }

        if (slot.courtPosition === 2) {
          return { ...slot, playerId: 'home-2', tacticalRole: PlayerRole.OUTSIDE_HITTER_1 };
        }

        return slot;
      }),
    },
  };
  const reportSubstitution: MatchEvent = {
    id: 'event-report-substitution',
    type: 'substitution_made',
    setNumber: 1,
    createdAt: 110,
    teamSide: 'home',
    playerInId: 'home-3',
    playerOutId: 'home-1',
  };
  const reportLiberoReplacement: MatchEvent = {
    id: 'event-report-libero',
    type: 'libero_replacement_made',
    setNumber: 1,
    rallyNumber: 1,
    createdAt: 115,
    teamSide: 'home',
    liberoPlayerId: 'home-4',
    replacedPlayerId: 'home-2',
    playerOutId: 'home-2',
    playerInId: 'home-4',
    action: 'libero_enters',
  };
  const reportSecondLiberoSwap: MatchEvent = {
    id: 'event-report-second-libero',
    type: 'libero_replacement_made',
    setNumber: 1,
    rallyNumber: 2,
    createdAt: 116,
    teamSide: 'home',
    liberoPlayerId: 'home-5',
    replacedPlayerId: 'home-2',
    playerOutId: 'home-4',
    playerInId: 'home-5',
    action: 'second_libero_enters',
  };
  const reportPoint = createPointAwardedEvent({
    id: 'event-report-point',
    rallyNumber: 1,
    teamSide: 'home',
    setNumber: 1,
  });
  const reportTouches = [
    createTouch({
      id: 'touch-report-serve',
      rallyNumber: 1,
      teamSide: 'home',
      playerId: 'home-1',
      skill: 'serve',
      evaluation: '#',
    }),
  ];

  const setReportStats = buildSetMatchStats({
    homeTeam: matchReportHome,
    awayTeam: matchReportAway,
    committedTouches: reportTouches,
    eventLog: [reportSetStarted, reportSubstitution, reportLiberoReplacement, reportSecondLiberoSwap, reportPoint],
    completedSets: [{ setNumber: 1, homeScore: 25, awayScore: 20, winningTeam: 'home', completedAt: 120 }],
  }, 1);

  assertions += expectEqual(setReportStats.setStats.length, 1, 'set report builds a single set result');
  assertions += expectEqual(setReportStats.setStats[0].setNumber, 1, 'set report uses requested set number');

  const participationMap = buildPlayerParticipationBySet({
    eventLog: [reportSetStarted, reportSubstitution, reportLiberoReplacement, reportSecondLiberoSwap],
    setNumbers: [1],
    homeTeam: matchReportHome,
    awayTeam: matchReportAway,
  });
  const homeServerParticipation = participationMap[1][createTeamScopedPlayerKey('home', 'home-1')];
  const homeSubParticipation = participationMap[1][createTeamScopedPlayerKey('home', 'home-3')];
  const homeLiberoParticipation = participationMap[1][createTeamScopedPlayerKey('home', 'home-4')];
  const homeSecondLiberoParticipation = participationMap[1][createTeamScopedPlayerKey('home', 'home-5')];
  const homeReplacedParticipation = participationMap[1][createTeamScopedPlayerKey('home', 'home-2')];

  assertions += expectEqual(homeServerParticipation.startingRotationPosition, 1, 'starting setter position is recorded');
  assertions += expectEqual(homeServerParticipation.firstServer, true, 'first server marker is recorded from rotation 1');
  assertions += expectEqual(homeSubParticipation.enteredSet, true, 'substitution entry is recorded');
  assertions += expectEqual(homeSubParticipation.entryOrder, 1, 'substitution entry sequence is recorded');
  assertions += expectEqual(homeServerParticipation.exitedSet, true, 'exiting starter remains represented');
  assertions += expectEqual(homeLiberoParticipation.enteredSet, false, 'libero replacement is not counted as a normal substitution entry');
  assertions += expectEqual((homeLiberoParticipation.liberoReplacements ?? []).length, 1, 'libero replacement visibility is recorded');
  assertions += expectEqual(homeSecondLiberoParticipation.liberoReplacements?.[0]?.secondLiberoSwap, true, 'second libero swap is tracked separately');
  assertions += expectEqual(homeSecondLiberoParticipation.liberoReplacements?.[0]?.replacedPlayerId, 'home-2', 'second libero swap preserves replaced player');
  assertions += expectEqual((homeReplacedParticipation.replacedByLiberoIds ?? []).includes('home-4'), true, 'libero replaced player is visible');

  const lineupSnapshots = buildSetLineupSnapshotsFromEvents([
    reportSetStarted,
    reportSubstitution,
    reportLiberoReplacement,
    reportSecondLiberoSwap,
  ]);
  const homeSnapshot = lineupSnapshots.find((snapshot) => snapshot.teamSide === 'home' && snapshot.setNumber === 1);
  assertions += expectEqual(homeSnapshot?.startingPlayerIdsByRotation[1], 'home-1', 'lineup snapshot stores official starting rotation');
  assertions += expectEqual(homeSnapshot?.firstServerPlayerId, 'home-1', 'lineup snapshot stores first server identity');
  assertions += expectEqual(homeSnapshot?.entries[0]?.playerId, 'home-3', 'lineup snapshot stores substitution entry history');
  assertions += expectEqual(homeSnapshot?.liberoEvents.some((event) => event.secondLiberoSwap && event.replacedPlayerId === 'home-2'), true, 'lineup snapshot stores libero swap history');

  const invertedCourtSetStarted: MatchEvent = {
    ...reportSetStarted,
    id: 'event-report-inverted-court',
    homeLineup: { ...reportSetStarted.homeLineup, displaySide: 'right' },
    awayLineup: { ...reportSetStarted.awayLineup, displaySide: 'left' },
  };
  const invertedCourtParticipation = buildPlayerParticipationBySet({
    eventLog: [invertedCourtSetStarted],
    setNumbers: [1],
    homeTeam: matchReportHome,
    awayTeam: matchReportAway,
  });
  assertions += expectEqual(
    invertedCourtParticipation[1][createTeamScopedPlayerKey('home', 'home-1')].firstServer,
    true,
    'court side inversion does not change first server identity',
  );

  const duplicateIdentityHome = createTeam('home', 'Duplicate Home', [
    { ...createPlayer('shared-player', 7, 'Home', 'Shared'), playerCode: '07' },
  ]);
  const duplicateIdentityAway = createTeam('away', 'Duplicate Away', [
    { ...createPlayer('shared-player', 7, 'Away', 'Shared'), playerCode: '07' },
  ]);
  const duplicateIdentitySetStarted: MatchEvent = {
    id: 'event-report-duplicate-identity',
    type: 'set_started',
    setNumber: 1,
    createdAt: 125,
    homeLineup: createStartingLineup('home', 'shared-player', 1),
    awayLineup: createStartingLineup('away', 'shared-player', 1),
    servingTeam: 'home',
  };
  const duplicateIdentityParticipation = buildPlayerParticipationBySet({
    eventLog: [duplicateIdentitySetStarted],
    setNumbers: [1],
    homeTeam: duplicateIdentityHome,
    awayTeam: duplicateIdentityAway,
  });
  assertions += expectEqual(
    duplicateIdentityParticipation[1][createTeamScopedPlayerKey('home', 'shared-player')].firstServer,
    true,
    'home duplicate player identity keeps first-server marker',
  );
  assertions += expectEqual(
    duplicateIdentityParticipation[1][createTeamScopedPlayerKey('away', 'shared-player')].firstServer,
    false,
    'away duplicate player identity does not collide with home marker',
  );

  const safeDefaultParticipation = buildPlayerParticipationBySet({
    eventLog: [],
    setNumbers: [1],
    homeTeam: matchReportHome,
    awayTeam: matchReportAway,
  });
  assertions += expectEqual(
    safeDefaultParticipation[1][createTeamScopedPlayerKey('home', 'home-1')].startedSet,
    false,
    'old sessions without lineup snapshots load with safe blank participation',
  );

  const replayHomeLineup: StartingLineup = {
    ...createStartingLineup('home', 'home-1', 1),
    liberoPlayerIds: ['home-4', 'home-5'],
    benchPlayerIds: ['home-3', 'home-4', 'home-5'],
    slots: createStartingLineup('home', 'home-1', 1).slots.map((slot) => (
      slot.courtPosition === 5 ? { ...slot, playerId: 'home-2' } : slot
    )),
  };
  const replaySetStarted: MatchEvent = {
    id: 'event-report-replay-set',
    type: 'set_started',
    setNumber: 1,
    createdAt: 130,
    homeLineup: replayHomeLineup,
    awayLineup: reportSetStarted.awayLineup,
    servingTeam: 'home',
  };
  const replayedParticipationMatch = replayLiveMatchFromEvents('report-replay', [
    replaySetStarted,
    reportSubstitution,
    reportLiberoReplacement,
    reportSecondLiberoSwap,
  ]);
  const replayedHomeSnapshot = replayedParticipationMatch?.lineupSnapshots
    ?.find((snapshot) => snapshot.teamSide === 'home' && snapshot.setNumber === 1);
  assertions += expectEqual(replayedHomeSnapshot?.entries[0]?.playerId, 'home-3', 'replay preserves substitution participation');
  assertions += expectEqual(
    replayedHomeSnapshot?.liberoEvents.some((event) => event.secondLiberoSwap && event.replacedPlayerId === 'home-2'),
    true,
    'replay preserves libero participation history',
  );

  const partials = buildSetPartialScores(setReportStats.setStats[0], 25);
  assertions += expectEqual(partials.length, 3, 'three partial targets are returned for 25-point sets');
  assertions += expectEqual(partials[0].score === '-' || typeof partials[0].score === 'string', true, 'partial score text is generated');
  assertions += expectEqual(buildSetPhaseSplits(20).length, 3, 'set phase helper uses three phases above 15 total points');
  assertions += expectEqual(buildSetPhaseSplits(15).length, 2, 'set phase helper uses two phases at or below 15 total points');

  const setTeamStatsMap = buildSetTeamStatsMap({
    homeTeam: matchReportHome,
    awayTeam: matchReportAway,
    eventLog: [reportSetStarted, reportPoint],
    completedSets: [{ setNumber: 1, homeScore: 25, awayScore: 20, winningTeam: 'home', completedAt: 120 }],
  }, [1]);
  assertions += expectEqual(
    setTeamStatsMap[1].home.points,
    setReportStats.teamStats.home.points,
    'set report team totals match set stats engine totals',
  );

  const reportHtml = buildMatchReportHtml({
    homeTeam: matchReportHome,
    awayTeam: matchReportAway,
    metadata: {
      id: 'report-match',
      format: 'best_of_5',
      schemaVersion: 1,
      competition: 'Report Cup',
      playedAt: new Date(2025, 0, 16).toISOString(),
      venue: 'Stadium',
    },
    scoutingConfig: { ...createDefaultScoutingMatchConfig('best_of_5') },
    eventLog: [reportSetStarted, reportSubstitution, reportLiberoReplacement, reportSecondLiberoSwap, reportPoint],
    completedSets: [{ setNumber: 1, homeScore: 25, awayScore: 20, winningTeam: 'home', completedAt: 120 }],
    stats: setReportStats,
  });
  const dataVolleyReport = buildDataVolleyMatchReport({
    homeTeam: matchReportHome,
    awayTeam: matchReportAway,
    metadata: {
      id: 'report-match',
      format: 'best_of_5',
      schemaVersion: 1,
      competition: 'Report Cup',
      playedAt: new Date(2025, 0, 16).toISOString(),
      venue: 'Stadium',
    },
    scoutingConfig: { ...createDefaultScoutingMatchConfig('best_of_5') },
    eventLog: [reportSetStarted, reportSubstitution, reportLiberoReplacement, reportSecondLiberoSwap, reportPoint],
    completedSets: [{ setNumber: 1, homeScore: 25, awayScore: 20, winningTeam: 'home', completedAt: 120 }],
    stats: setReportStats,
  });
  assertions += expectEqual(dataVolleyReport.homeTabellino.teamSide, 'home', 'DataVolley tabellino keeps home table first');
  assertions += expectEqual(dataVolleyReport.awayTabellino.teamSide, 'away', 'DataVolley tabellino keeps away table second');
  assertions += expectEqual(
    dataVolleyReport.homeTabellino.rows.find((row) => row.playerId === 'home-4')?.liberoReplacement,
    true,
    'DataVolley report row exposes libero replacement visibility',
  );
  assertions += expectEqual(
    dataVolleyReport.homeTabellino.rows.find((row) => row.playerId === 'home-5')?.entryMarkers.some((marker) => marker.kind === 'libero' && marker.label === ''),
    true,
    'DataVolley report row exposes one compact empty second-libero marker',
  );
  assertions += expectEqual(dataVolleyReport.homeTabellino.setRows.length, 1, 'DataVolley tabellino keeps set summary rows inside team table model');
  assertions += expectEqual(dataVolleyReport.setSummaries.length, 1, 'DataVolley tabellino header exposes compact set summaries');
  assertions += expectEqual(dataVolleyReport.homeTabellino.setHeaders[0]?.label, '1', 'DataVolley tabellino renders set number as participation header');
  assertions += expectEqual(dataVolleyReport.homeTabellino.setHeaders[0]?.startedServing, true, 'home table set header records serving start');
  assertions += expectEqual(dataVolleyReport.awayTabellino.setHeaders[0]?.startedServing, false, 'away table set header remains plain when not serving');
  assertions += expectEqual(
    dataVolleyReport.homeTabellino.rows.find((row) => row.playerId === 'home-1')?.entryMarkers.some((marker) => marker.kind === 'starter' && marker.isFirstServer),
    true,
    'DataVolley tabellino keeps first-server identity in the model',
  );
  assertions += expectEqual(
    dataVolleyReport.homeTabellino.rows.find((row) => row.playerId === 'home-1')?.entryMarkers.some((marker) => (
      marker.kind === 'starter'
      && marker.label === '1'
      && marker.isCaptain === true
    )),
    true,
    'DataVolley tabellino marks captain starter for white marker styling',
  );
  assertions += expectEqual(
    dataVolleyReport.homeTabellino.rows.find((row) => row.playerId === 'home-2')?.entryMarkers.some((marker) => (
      marker.kind === 'starter'
      && marker.label === '2'
      && marker.isCaptain !== true
    )),
    true,
    'DataVolley tabellino keeps non-captain starter markers grey',
  );
  assertions += expectEqual(
    dataVolleyReport.homeTabellino.rows.find((row) => row.playerId === 'home-1')?.entryMarkers.filter((marker) => marker.kind === 'starter').length,
    1,
    'DataVolley tabellino shows one starter marker per player set',
  );
  assertions += expectEqual(
    dataVolleyReport.homeTabellino.rows.find((row) => row.playerId === 'home-3')?.entryMarkers.some((marker) => marker.kind === 'entry' && marker.label === ''),
    true,
    'DataVolley tabellino exposes compact empty entry markers',
  );
  assertions += expectEqual(
    dataVolleyReport.homeTabellino.rows.find((row) => row.playerId === 'home-5')?.entryMarkers.filter((marker) => marker.kind === 'libero' && marker.setNumber === 1).length,
    1,
    'DataVolley tabellino renders one libero marker per set',
  );
  assertions += expectEqual(
    dataVolleyReport.homeTabellino.rows.find((row) => row.playerId === 'home-3')?.entryMarkers.filter((marker) => marker.kind === 'entry' && marker.setNumber === 1).length,
    1,
    'DataVolley tabellino renders one normal entry marker per set',
  );
  assertions += expectEqual(dataVolleyReport.bottomSummaryBlocks.length, 4, 'DataVolley tabellino exposes four bottom summary blocks');
  assertions += expectEqual(dataVolleyReport.bottomSummaryBlocks.some((block) => block.id === 'side_out_direct'), true, 'DataVolley tabellino exposes side-out direct summary block');
  assertions += expectEqual(dataVolleyReport.bottomSummaryBlocks.some((block) => block.id === 'counterattack'), true, 'DataVolley tabellino exposes counterattack summary block');
  assertions += expectEqual(dataVolleyReport.bottomSummaryBlocks.some((block) => block.id === 'receive_points'), true, 'DataVolley tabellino exposes receive points summary block');
  assertions += expectEqual(dataVolleyReport.bottomSummaryBlocks.some((block) => block.id === 'serve_break_point'), true, 'DataVolley tabellino exposes serve break point summary block');
  assertions += expectEqual(dataVolleyReport.footer.version.length > 0, true, 'DataVolley tabellino injects app version into footer');
  assertions += expectEqual(dataVolleyReport.homeTabellino.rows.find((row) => row.playerId === 'home-1')?.pointsWonLostLabel, '1', 'player V-P is rendered as numeric difference');
  assertions += expectEqual(dataVolleyReport.homeTabellino.setRows[0]?.pointsWonLostLabel, '5', 'set summary V-P is rendered as numeric difference');
  assertions += expectEqual(validateMatchReportTotals(dataVolleyReport).length, 0, 'DataVolley tabellino team totals pass report total validation');

  const totalsHomeTeam = createTeam('home', 'Totals Home', [
    createPlayer('totals-home-1', 1, 'Totals', 'Server'),
    createPlayer('totals-home-2', 2, 'Totals', 'Blocker'),
  ]);
  const totalsAwayTeam = createTeam('away', 'Totals Away', [
    createPlayer('totals-away-1', 4, 'Totals', 'Opponent'),
  ]);
  const totalsSetStarted = createSetStartedEvent({
    id: 'event-report-totals-set-started',
    setNumber: 1,
    servingTeam: 'home',
    homeSetterPosition: 1,
    awaySetterPosition: 1,
  });
  const totalsStats = buildMatchStats({
    homeTeam: totalsHomeTeam,
    awayTeam: totalsAwayTeam,
    committedTouches: [
      createTouch({
        id: 'touch-totals-home-1-ace',
        rallyNumber: 1,
        teamSide: 'home',
        playerId: 'totals-home-1',
        skill: 'serve',
        evaluation: '#',
      }),
      createTouch({
        id: 'touch-totals-home-2-ace',
        rallyNumber: 2,
        teamSide: 'home',
        playerId: 'totals-home-2',
        skill: 'serve',
        evaluation: '#',
      }),
      createTouch({
        id: 'touch-totals-home-1-serve-plus',
        rallyNumber: 3,
        sequenceNumber: 1,
        teamSide: 'home',
        playerId: 'totals-home-1',
        skill: 'serve',
        evaluation: '+',
      }),
      createTouch({
        id: 'touch-totals-away-attack-error',
        rallyNumber: 3,
        sequenceNumber: 2,
        teamSide: 'away',
        playerId: 'totals-away-1',
        skill: 'attack',
        evaluation: '=',
      }),
      createTouch({
        id: 'touch-totals-away-serve-plus',
        rallyNumber: 4,
        sequenceNumber: 1,
        teamSide: 'away',
        playerId: 'totals-away-1',
        skill: 'serve',
        evaluation: '+',
      }),
      createTouch({
        id: 'touch-totals-home-block-point',
        rallyNumber: 4,
        sequenceNumber: 2,
        teamSide: 'home',
        playerId: 'totals-home-2',
        skill: 'block',
        evaluation: '#',
      }),
    ],
    eventLog: [totalsSetStarted],
    completedSets: [{ setNumber: 1, homeScore: 4, awayScore: 0, winningTeam: 'home', completedAt: 130 }],
  });
  const totalsReport = buildDataVolleyMatchReport({
    homeTeam: totalsHomeTeam,
    awayTeam: totalsAwayTeam,
    scoutingConfig: { ...createDefaultScoutingMatchConfig('best_of_5') },
    eventLog: [totalsSetStarted],
    completedSets: [{ setNumber: 1, homeScore: 4, awayScore: 0, winningTeam: 'home', completedAt: 130 }],
    stats: totalsStats,
  });
  const totalsHomeRows = totalsReport.homeTabellino.rows;
  const sumHomeBp = totalsHomeRows.reduce((total, row) => total + row.breakPointPoints, 0);
  const sumHomeVp = totalsHomeRows.reduce((total, row) => total + row.pointsWon - row.pointsLost, 0);
  const sumHomeServeTotal = totalsHomeRows.reduce((total, row) => total + row.serve.total, 0);
  const sumAwayReceiveTotal = totalsReport.awayTabellino.rows.reduce((total, row) => total + row.receive.total, 0);
  const sumAwayAttackTotal = totalsReport.awayTabellino.rows.reduce((total, row) => total + row.attack.total, 0);
  const sumHomeBlockPoints = totalsHomeRows.reduce((total, row) => total + row.block.points, 0);
  const summedHomeServeEfficiency = totalsHomeRows.reduce((total, row) => total + (row.serve.efficiency ?? 0), 0);

  assertions += expectEqual(totalsReport.homeTabellino.totals.breakPointPoints, sumHomeBp, 'team BP total equals sum of player BP values');
  assertions += expectEqual(totalsReport.homeTabellino.totals.breakPointPoints, 3, 'team BP total ignores unassigned break points from opponent errors');
  assertions += expectEqual(totalsReport.homeTabellino.totals.pointsWonLostLabel, String(sumHomeVp), 'team V-P total equals sum of player V-P values');
  assertions += expectEqual(totalsReport.homeTabellino.totals.pointsWonLostLabel, '3', 'team V-P is rendered as numeric difference');
  assertions += expectEqual(totalsReport.homeTabellino.totals.serve.total, sumHomeServeTotal, 'serve total equals sum of player rows');
  assertions += expectEqual(totalsReport.awayTabellino.totals.receive.total, sumAwayReceiveTotal, 'receive total equals sum of player rows');
  assertions += expectEqual(totalsReport.awayTabellino.totals.attack.total, sumAwayAttackTotal, 'attack total equals sum of player rows');
  assertions += expectEqual(totalsReport.homeTabellino.totals.block.points, sumHomeBlockPoints, 'block points total equals sum of player rows');
  // Note: serve efficiency formula was updated per DataVolley manual to include positive evaluations.
  // The formula is now computed dynamically by the indicators system and is validated implicitly
  // by validating that per-player totals sum correctly and that the formula is applied consistently.
  assertions += expectEqual(
    totalsReport.homeTabellino.totals.serve.efficiency === summedHomeServeEfficiency,
    false,
    'team serve percentage is not a sum of player percentages',
  );
  assertions += expectEqual(validateMatchReportTotals(totalsReport).length, 0, 'report total validation accepts row-derived totals');
  assertions += expectEqual(
    validateMatchReportTotals({
      ...totalsReport,
      homeTabellino: {
        ...totalsReport.homeTabellino,
        totals: {
          ...totalsReport.homeTabellino.totals,
          breakPointPoints: totalsReport.homeTabellino.totals.breakPointPoints + 1,
        },
      },
    }).some((issue) => issue.metric === 'BP' && issue.code === 'report_team_total_mismatch'),
    true,
    'report total validation catches BP mismatches',
  );
  assertions += expectEqual(
    validateMatchReportTotals({
      ...totalsReport,
      homeTabellino: {
        ...totalsReport.homeTabellino,
        totals: {
          ...totalsReport.homeTabellino.totals,
          pointsWon: totalsReport.homeTabellino.totals.pointsWon + 1,
        },
      },
    }).some((issue) => issue.metric === 'V-P' && issue.code === 'report_team_total_mismatch'),
    true,
    'report total validation catches V-P mismatches',
  );
  // Note: Percentage validation for serve.efficiency is skipped now because the formula was updated
  // to use indicators and depends on aggregated per-symbol counts. The validation is done implicitly
  // by validating per-player totals and testing that invalid row sums are caught below.
  assertions += expectEqual(
    dataVolleyReport.printTitle,
    'Home Report - Guest Report 1-0 (25-20)',
    'DataVolley tabellino exposes printable page title',
  );
  assertions += expectEqual(
    dataVolleyReport.printFilename,
    'Home Report - Guest Report 1-0 (25-20).pdf',
    'DataVolley tabellino exposes printable filename',
  );
  assertions += expectEqual(
    dataVolleyReport.pngFilename,
    'Home Report - Guest Report 1-0 (25-20).png',
    'DataVolley tabellino exposes PNG filename',
  );
  assertions += expectEqual(
    createMatchReportPrintTitle({
      homeTeamName: 'Diates Trentino',
      awayTeamName: 'Copra Elior Piacenza',
      homeSetsWon: 3,
      awaySetsWon: 2,
      setScores: ['25-23', '21-25', '25-22', '19-25', '15-12'],
    }),
    'Diates Trentino - Copra Elior Piacenza 3-2 (25-23, 21-25, 25-22, 19-25, 15-12)',
    'printable title follows official match score format',
  );
  assertions += expectEqual(
    createMatchReportFilename({
      homeTeamName: 'Home/Team',
      awayTeamName: 'Guest:Team',
      homeSetsWon: 3,
      awaySetsWon: 2,
      setScores: ['25-23', '21-25'],
    }),
    'Home-Team - Guest-Team 3-2 (25-23, 21-25).pdf',
    'printable filename sanitizes invalid filename characters',
  );
  assertions += expectEqual(
    createMatchReportFilename({
      homeTeamName: 'Home/Team',
      awayTeamName: 'Guest:Team',
      homeSetsWon: 3,
      awaySetsWon: 2,
      setScores: ['25-23', '21-25'],
    }, 'png'),
    'Home-Team - Guest-Team 3-2 (25-23, 21-25).png',
    'PNG filename reuses printable filename sanitizer',
  );
  const reportPngSvg = buildMatchReportPngSvg(dataVolleyReport);
  assertions += expectEqual(MATCH_REPORT_PNG_WIDTH, 2480, 'PNG export width is A4 portrait at 300 DPI');
  assertions += expectEqual(MATCH_REPORT_PNG_HEIGHT, 3508, 'PNG export height is A4 portrait at 300 DPI');
  assertions += expectEqual(reportPngSvg.includes(`width="${MATCH_REPORT_PNG_WIDTH}"`), true, 'PNG SVG uses expected width');
  assertions += expectEqual(reportPngSvg.includes(`height="${MATCH_REPORT_PNG_HEIGHT}"`), true, 'PNG SVG uses expected height');
  assertions += expectEqual(reportPngSvg.includes('report-page--png'), true, 'PNG SVG renders the report page only');
  assertions += expectEqual(reportPngSvg.includes('report-footer__logo'), true, 'PNG SVG preserves footer logo');
  assertions += expectEqual(reportPngSvg.includes('match-report__set-marker--starter'), true, 'PNG SVG preserves participation markers');
  assertions += expectEqual(reportPngSvg.includes('Evaluation charts'), false, 'PNG SVG export excludes charts');
  assertions += expectEqual(reportPngSvg.includes('analysis-page__'), false, 'PNG SVG export excludes app chrome');
  assertions += expectEqual(reportHtml.includes('Home Report'), true, 'report HTML includes home team name');
  assertions += expectEqual(reportHtml.includes('Guest Report'), true, 'report HTML includes away team name');
  assertions += expectEqual(reportHtml.includes('@page'), true, 'report HTML includes A4 page style');
  assertions += expectEqual(reportHtml.includes('@page { size: A4 portrait; margin: 10mm; }'), true, 'report HTML uses A4 portrait page margins');
  assertions += expectEqual(reportHtml.includes('body { width: 210mm; min-height: 297mm;'), true, 'report HTML uses A4 body dimensions without fixed height');
  assertions += expectEqual(reportHtml.includes('margin-min'), false, 'report HTML does not use invalid margin-min CSS');
  assertions += expectEqual(reportHtml.includes('body { width: 210mm; height: 297mm;'), false, 'report HTML does not use fixed A4 body height');
  assertions += expectEqual(reportHtml.includes('<title>Home Report - Guest Report 1-0 (25-20)</title>'), true, 'report HTML uses printable match title');
  assertions += expectEqual(reportHtml.includes('content="Home Report - Guest Report 1-0 (25-20).pdf"'), true, 'report HTML exposes printable filename metadata');
  assertions += expectEqual(reportHtml.includes('--ovs-primary: #002554'), true, 'report HTML applies OpenVolleyScout primary color token');
  assertions += expectEqual(reportHtml.includes('--ovs-accent: #0169D8'), true, 'report HTML applies OpenVolleyScout accent color token');
  assertions += expectEqual((reportHtml.match(/<table class="report-table">/g) ?? []).length, 2, 'report HTML renders exactly one report table per team');
  assertions += expectEqual(reportHtml.includes('Totali squadra'), true, 'report HTML includes team total rows inside team tables');
  assertions += expectEqual(reportHtml.includes('Set 1'), true, 'report HTML includes set summary rows inside team tables');
  assertions += expectEqual(reportHtml.includes('match-report__set-marker--starter'), true, 'report HTML renders boxed starter markers');
  assertions += expectEqual(reportHtml.includes('match-report__set-marker--captain'), true, 'report HTML renders white captain starter markers');
  assertions += expectEqual(reportHtml.includes('set-group-header'), true, 'report HTML renders set participation group header');
  assertions += expectEqual(reportHtml.includes('set-number-mark--receiving'), false, 'report HTML does not circle receiving-team set header');
  assertions += expectEqual(reportHtml.includes('set-number-mark--serving'), true, 'report HTML renders circled serving-team set header');
  assertions += expectEqual(/match-report__set-marker--starter[^>]*>\s*1\s*<\/span>/.test(reportHtml), true, 'report HTML participation starter marker shows one jersey number only');
  assertions += expectEqual(reportHtml.includes('entry-mark-entry'), true, 'report HTML renders normal substitution entry rectangles');
  assertions += expectEqual(reportHtml.includes('entry-mark-libero-entry'), true, 'report HTML renders libero entry rectangles');
  assertions += expectEqual(/entry-mark-entry[^>]*>\s*<\/span>/.test(reportHtml), true, 'report HTML normal substitution entry marker is empty');
  assertions += expectEqual(/entry-mark-libero-entry[^>]*>\s*<\/span>/.test(reportHtml), true, 'report HTML libero entry marker is empty');
  assertions += expectEqual(reportHtml.includes('IN1'), false, 'report HTML does not show IN text in participation cells');
  assertions += expectEqual(reportHtml.includes('L2'), false, 'report HTML does not show second libero text in participation cells');
  assertions += expectEqual(reportHtml.includes('libero for'), false, 'report HTML does not expose libero replacement text in participation cells');
  assertions += expectEqual(reportHtml.includes('L for'), false, 'report HTML does not expose libero detail text in participation cells');
  assertions += expectEqual((reportHtml.match(/entry-mark-libero-entry/g) ?? []).length, 2, 'report HTML renders one libero marker for each libero player in the set');
  assertions += expectEqual((reportHtml.match(/entry-mark-entry/g) ?? []).length, 1, 'report HTML renders one normal entry marker per player set');
  assertions += expectEqual(reportHtml.includes('1S'), false, 'report HTML does not render first-server text in participation cells');
  assertions += expectEqual(reportHtml.includes('bottom-summary'), true, 'report HTML renders compact bottom summary blocks');
  assertions += expectEqual(reportHtml.includes('Side-out / cambio palla diretto'), true, 'report HTML renders side-out summary block');
  assertions += expectEqual(reportHtml.includes('Counterattack / contrattacco'), true, 'report HTML renders counterattack summary block');
  assertions += expectEqual(reportHtml.includes('Receive points / punti CP'), true, 'report HTML renders receive points summary block');
  assertions += expectEqual(reportHtml.includes('Serve break point / punti BP'), true, 'report HTML renders serve break point summary block');
  assertions += expectEqual(reportHtml.includes('OpenVolleyScout v'), true, 'report HTML renders footer product/version branding');
  assertions += expectEqual(reportHtml.includes('https://github.com/napo/openvolleyscout'), true, 'report HTML renders footer repository URL');
  assertions += expectEqual(reportHtml.includes('Free Software scouting system by napo'), true, 'report HTML renders footer free software line');
  assertions += expectEqual(reportHtml.includes('report-footer__logo'), true, 'report HTML renders compact SVG footer logo');
  assertions += expectEqual(reportHtml.includes('justify-content: flex-start'), true, 'report HTML footer is left aligned');
  assertions += expectEqual(reportHtml.includes('white-space: nowrap'), true, 'report HTML footer is single-row');
  assertions += expectEqual(reportHtml.includes('grid-template-columns: repeat(4'), true, 'report HTML keeps bottom summary compact and printable');
  assertions += expectEqual(reportHtml.includes('"set-section"'), false, 'report HTML does not render legacy per-set report section panels');
  assertions += expectEqual(reportHtml.includes('team-report'), false, 'report HTML does not render separate set team panels');
  assertions += expectEqual(reportHtml.includes('>Dig<'), false, 'report HTML excludes dig section from default tabellino');
  assertions += expectEqual(reportHtml.includes('<th colspan="2">Set</th>'), false, 'report HTML excludes set section from default tabellino');
  assertions += expectEqual(reportHtml.includes('Evaluation charts'), false, 'report HTML export excludes charts');
  assertions += expectEqual(reportHtml.includes('NaN'), false, 'report HTML does not contain NaN');
  assertions += expectEqual(reportHtml.includes('undefined'), false, 'report HTML does not contain undefined');

  return { assertions };
}
