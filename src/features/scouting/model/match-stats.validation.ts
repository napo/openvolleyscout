import type { TeamSide } from '@src/domain/common/enums';
import type { MatchEvent } from '@src/domain/events/types';
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
    rallyNumber: 6,
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
        id: 'touch-away-reception-error',
        rallyNumber: 2,
        teamSide: 'away',
        playerId: 'away-5',
        skill: 'receive',
        evaluation: '=',
      }),
      createTouch({
        id: 'touch-home-attack-kill',
        rallyNumber: 3,
        teamSide: 'home',
        playerId: 'home-2',
        skill: 'attack',
        evaluation: '#',
      }),
      createTouch({
        id: 'touch-away-dig-positive',
        rallyNumber: 4,
        sequenceNumber: 1,
        teamSide: 'away',
        playerId: 'away-6',
        skill: 'dig',
        evaluation: '+',
      }),
      createTouch({
        id: 'touch-away-set-positive',
        rallyNumber: 4,
        sequenceNumber: 2,
        teamSide: 'away',
        playerId: 'away-3',
        skill: 'set',
        evaluation: '+',
      }),
      createTouch({
        id: 'touch-away-attack-error',
        rallyNumber: 5,
        teamSide: 'away',
        playerId: 'away-4',
        skill: 'attack',
        evaluation: '=',
      }),
      receiveHashTouch,
    ],
  });

  assertions += expectEqual(stats.teamStats.home.aces, 1, 'home serve ace count');
  assertions += expectEqual(stats.teamStats.away.receptionErrors, 1, 'away reception error count');
  assertions += expectEqual(stats.teamStats.home.attackPoints, 1, 'home attack point count');
  assertions += expectEqual(stats.teamStats.away.attackErrors, 1, 'away attack error count');
  assertions += expectEqual(stats.teamStats.home.points, 4, 'home terminal point count');
  assertions += expectEqual(stats.teamStats.away.receive.total, 2, 'away receive total');
  assertions += expectEqual(stats.teamStats.away.receive.hash, 1, 'away receive hash count');
  assertions += expectEqual(stats.teamStats.away.receive.points, 0, 'away receive hash point count');
  assertions += expectEqual(stats.teamStats.away.dig.total, 1, 'away dig total');
  assertions += expectEqual(stats.teamStats.away.set.total, 1, 'away set total');
  assertions += expectEqual(stats.teamStats.away.attack.total, 1, 'away attack total');
  assertions += expectEqual(resolvePointWinnerFromTouch(receiveHashTouch), null, 'receive hash point winner');

  const homeServer = stats.playerStats.find((player) => player.playerId === 'home-1');
  const homeAttacker = stats.playerStats.find((player) => player.playerId === 'home-2');
  const awayReceiver = stats.playerStats.find((player) => player.playerId === 'away-5');
  const awayAttacker = stats.playerStats.find((player) => player.playerId === 'away-4');

  assertions += expectEqual(homeServer?.totalTouches, 1, 'home server total touches');
  assertions += expectEqual(homeServer?.aces, 1, 'home server ace count');
  assertions += expectEqual(homeServer?.points, 1, 'home server point count');
  assertions += expectEqual(homeAttacker?.attackPoints, 1, 'home attacker attack point count');
  assertions += expectEqual(awayReceiver?.totalTouches, 2, 'away receiver total touches');
  assertions += expectEqual(awayReceiver?.receptionErrors, 1, 'away receiver reception error count');
  assertions += expectEqual(awayReceiver?.receive.hash, 1, 'away receiver receive hash count');
  assertions += expectEqual(awayReceiver?.points, 0, 'away receiver point count');
  assertions += expectEqual(awayAttacker?.errors, 1, 'away attacker error count');

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

  return { assertions };
}
