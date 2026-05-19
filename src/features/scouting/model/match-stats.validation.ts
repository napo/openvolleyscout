import type { TeamSide } from '@src/domain/common/enums';
import type { MatchEvent } from '@src/domain/events/types';
import type { StartingLineup } from '@src/domain/lineup/types';
import type { Player, Team } from '@src/domain/roster/types';
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
import {
  buildMatchReportHtml,
  buildDataVolleyMatchReport,
  buildPlayerParticipationBySet,
  buildSetPhaseSplits,
  buildSetPartialScores,
  buildSetTeamStatsMap,
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
}): MatchEvent {
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
  assertions += expectEqual(stats.quickStats.teams.away.reception.efficiency, 2 / 4, 'receive hash and plus increase efficiency');
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
    createPlayer('home-1', 1, 'Home', 'Server'),
    createPlayer('home-2', 2, 'Home', 'Attacker'),
    createPlayer('home-3', 3, 'Home', 'Sub'),
    { ...createPlayer('home-4', 4, 'Home', 'Libero'), role: 'libero', isLibero: true }],
  );
  const matchReportAway = createTeam('away', 'Guest Report', [
    createPlayer('away-4', 4, 'Guest', 'Setter'),
    createPlayer('away-5', 5, 'Guest', 'Attacker')],
  );

  const reportSetStarted = createSetStartedEvent({
    id: 'event-report-set-started',
    setNumber: 1,
    servingTeam: 'home',
    homeSetterPosition: 1,
    awaySetterPosition: 2,
  });
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
    eventLog: [reportSetStarted, reportSubstitution, reportLiberoReplacement, reportPoint],
    completedSets: [{ setNumber: 1, homeScore: 25, awayScore: 20, winningTeam: 'home', completedAt: 120 }],
  }, 1);

  assertions += expectEqual(setReportStats.setStats.length, 1, 'set report builds a single set result');
  assertions += expectEqual(setReportStats.setStats[0].setNumber, 1, 'set report uses requested set number');

  const participationMap = buildPlayerParticipationBySet({
    eventLog: [reportSetStarted, reportSubstitution, reportLiberoReplacement],
    setNumbers: [1],
    homeTeam: matchReportHome,
    awayTeam: matchReportAway,
  });

  assertions += expectEqual(participationMap[1]['home-1'].position, 1, 'starting setter position is recorded');
  assertions += expectEqual(participationMap[1]['home-3'].entered, true, 'substitution entry is recorded');
  assertions += expectEqual(participationMap[1]['home-4'].liberoReplacement, true, 'libero replacement visibility is recorded');
  assertions += expectEqual(participationMap[1]['home-2'].replacedByLiberoIds.includes('home-4'), true, 'libero replaced player is visible');

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
    eventLog: [reportSetStarted, reportSubstitution, reportLiberoReplacement, reportPoint],
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
    eventLog: [reportSetStarted, reportSubstitution, reportLiberoReplacement, reportPoint],
    completedSets: [{ setNumber: 1, homeScore: 25, awayScore: 20, winningTeam: 'home', completedAt: 120 }],
    stats: setReportStats,
  });
  assertions += expectEqual(dataVolleyReport.sets[0].home.teamSide, 'home', 'DataVolley report keeps home table first');
  assertions += expectEqual(dataVolleyReport.sets[0].away.teamSide, 'away', 'DataVolley report keeps away table second');
  assertions += expectEqual(
    dataVolleyReport.sets[0].home.rows.find((row) => row.playerId === 'home-4')?.liberoReplacement,
    true,
    'DataVolley report row exposes libero replacement visibility',
  );
  assertions += expectEqual(reportHtml.includes('Home Report'), true, 'report HTML includes home team name');
  assertions += expectEqual(reportHtml.includes('Guest Report'), true, 'report HTML includes away team name');
  assertions += expectEqual(reportHtml.includes('@page'), true, 'report HTML includes A4 page style');
  assertions += expectEqual(reportHtml.includes('Evaluation charts'), false, 'report HTML export excludes charts');
  assertions += expectEqual(reportHtml.includes('NaN'), false, 'report HTML does not contain NaN');
  assertions += expectEqual(reportHtml.includes('undefined'), false, 'report HTML does not contain undefined');

  return { assertions };
}
