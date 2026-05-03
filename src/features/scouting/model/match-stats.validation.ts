import type { TeamSide } from '@src/domain/common/enums';
import type { MatchEvent } from '@src/domain/events/types';
import type { StartingLineup } from '@src/domain/lineup/types';
import type { Player, Team } from '@src/domain/roster/types';
import type { BallTouch } from '@src/domain/touch/types';
import { buildMatchStats } from './match-stats';
import { resolvePointWinnerFromTouch } from './scoring-rules';

type ValidationResult = {
  assertions: number;
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

  const stats = buildMatchStats({
    homeTeam,
    awayTeam,
    touches: [
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
    ],
  });

  assertions += expectEqual(stats.teamStats.home.aces, 1, 'home serve ace count');
  assertions += expectEqual(stats.teamStats.home.serveErrors, 1, 'home serve error count');
  assertions += expectEqual(stats.teamStats.away.receptionErrors, 1, 'away reception error count');
  assertions += expectEqual(stats.teamStats.home.attackPoints, 1, 'home attack point count');
  assertions += expectEqual(stats.teamStats.away.attackErrors, 1, 'away attack error count');
  assertions += expectEqual(stats.teamStats.away.attackBlocked, 1, 'away blocked attack count');
  assertions += expectEqual(stats.teamStats.home.blockPoints, 1, 'home block point count');
  assertions += expectEqual(stats.teamStats.home.points, 5, 'home terminal point count');
  assertions += expectEqual(stats.teamStats.away.receive.total, 3, 'away receive total');
  assertions += expectEqual(stats.teamStats.away.receive.hash, 1, 'away receive hash count');
  assertions += expectEqual(stats.teamStats.away.receive.plus, 1, 'away receive plus count');
  assertions += expectEqual(stats.teamStats.away.receive.points, 0, 'away receive hash point count');
  assertions += expectEqual(stats.teamStats.away.dig.total, 1, 'away dig total');
  assertions += expectEqual(stats.teamStats.away.set.total, 1, 'away set total');
  assertions += expectEqual(stats.teamStats.away.attack.total, 2, 'away attack total');
  assertions += expectEqual(resolvePointWinnerFromTouch(receiveHashTouch), null, 'receive hash point winner');
  assertions += expectEqual(
    stats.rallyStats.find((rally) => rally.rallyNumber === 1)?.servingTeam,
    'home',
    'serving team fallback derives from first serve touch',
  );
  assertions += expectEqual(stats.quickStats.teams.home.serve.efficiency, 0, 'serve error decreases serve efficiency');
  assertions += expectEqual(stats.quickStats.teams.away.reception.efficiency, 2 / 3, 'receive hash and plus increase efficiency');
  assertions += expectEqual(stats.quickStats.teams.away.reception.perfectPercentage, 1 / 3, 'receive perfect percentage');
  assertions += expectEqual(stats.quickStats.teams.home.reception.efficiency, null, 'zero receptions have null efficiency');
  assertions += expectEqual(stats.quickStats.teams.home.attack.efficiency, 1, 'attack kill increases efficiency');
  assertions += expectEqual(stats.quickStats.teams.home.attack.killPercentage, 1, 'attack kill increases kill percentage');
  assertions += expectEqual(stats.quickStats.teams.away.attack.efficiency, -1, 'attack errors and blocked attacks reduce efficiency');
  assertions += expectEqual(stats.quickStats.teams.away.attack.killPercentage, 0, 'zero attack points produce zero kill percentage');
  assertions += expectEqual(stats.quickStats.teams.home.block.efficiency, 1 / 2, 'block efficiency uses opponent attacks');

  const homeServer = stats.playerStats.find((player) => player.playerId === 'home-1');
  const homeAttacker = stats.playerStats.find((player) => player.playerId === 'home-2');
  const awayReceiver = stats.playerStats.find((player) => player.playerId === 'away-5');
  const awayAttacker = stats.playerStats.find((player) => player.playerId === 'away-4');

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

  return { assertions };
}
