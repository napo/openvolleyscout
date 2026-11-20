// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import type { TeamSide } from '@src/domain/common/enums';
import type { MatchEvent } from '@src/domain/events/types';
import type { BallTouch } from '@src/domain/touch/types';
import type { StartingLineup } from '@src/domain/lineup';
import type { Team } from '@src/domain/roster/types';
import { buildPlayByPlay } from '@src/features/analytics/play-by-play/play-by-play';
import { buildMatchStats, buildSetMatchStats } from './match-stats';
import { replayLiveMatchFromEvents } from './replay';

function team(side: TeamSide): Team {
  return {
    id: side, code: side, name: side, staff: { headCoach: '', assistantCoach: '' },
    players: ['O1', 'H1', 'M1', 'S1', 'H2', 'M2', 'S2', 'O2'].map((id, index) => ({
      id: `${side}-${id}`, jerseyNumber: index + 1, firstName: id, lastName: '', shortName: id, playerCode: id,
      role: id.startsWith('S') ? 'setter' : id.startsWith('O') ? 'opposite' : id.startsWith('M') ? 'middle_blocker' : 'outside_hitter',
    })),
  };
}
const teams = { home: team('home'), away: team('away') };
const roleOf = (id: string) => [...teams.home.players, ...teams.away.players].find((player) => player.id === id)?.role;
function lineup(side: TeamSide): StartingLineup {
  return {
    teamSide: side, setterPlayerId: `${side}-S1`, liberoPlayerIds: [], displaySide: side === 'home' ? 'left' : 'right',
    slots: ['O1', 'H1', 'M1', 'S1', 'H2', 'M2'].map((id, index) => ({ playerId: `${side}-${id}`, courtPosition: (index + 1) as 1 })),
  };
}
const start: MatchEvent = {
  id: 'set', type: 'set_started', createdAt: 0, setNumber: 1, servingTeam: 'home',
  homeLineup: lineup('home'), awayLineup: lineup('away'),
};
const point = (rallyNumber: number, side: TeamSide, skipRotation = false): MatchEvent => ({
  id: `point-${rallyNumber}`, type: 'point_awarded', createdAt: rallyNumber * 10, setNumber: 1, rallyNumber, teamSide: side, skipRotation,
});
const sub = (side: TeamSide, out: string, incoming: string, order: number): MatchEvent => ({
  id: `${side}-${out}-${incoming}-${order}`, type: 'substitution_made', createdAt: order, setNumber: 1, rallyNumber: 2,
  teamSide: side, playerOutId: `${side}-${out}`, playerInId: `${side}-${incoming}`,
});
const stats = (events: MatchEvent[], perSet = false, withRoles = true) => {
  const input = { homeTeam: teams.home, awayTeam: teams.away, eventLog: events };
  if (!withRoles) {
    input.homeTeam = { ...teams.home, players: teams.home.players.map((player) => ({ ...player, role: undefined })) };
    input.awayTeam = { ...teams.away, players: teams.away.players.map((player) => ({ ...player, role: undefined })) };
  }
  return perSet ? buildSetMatchStats(input, 1) : buildMatchStats(input);
};

describe('rotation statistics after a setter change', () => {
  it.each([['home', false], ['home', true], ['away', false], ['away', true]] as const)('follows a %s double change (reverse order: %s), side-out and return substitutions', (side, reverseOrder) => {
    const other = side === 'home' ? 'away' : 'home';
    const changes = reverseOrder
      ? [sub(side, 'O1', 'S2', 11), sub(side, 'S1', 'O2', 12)]
      : [sub(side, 'S1', 'O2', 11), sub(side, 'O1', 'S2', 12)];
    const events = [
      start, point(1, 'home'), ...changes,
      point(2, side), point(3, side),
      sub(side, 'S2', 'O1', 31), sub(side, 'O2', 'S1', 32),
      point(4, side),
    ];
    // Away makes a side-out on rally 2, so its new setter moves P1 to P6 for rally 3.
    const afterSideOut = side === 'home' ? 1 : 6;
    const afterReturn = side === 'home' ? 4 : 3;
    for (const perSet of [false, true]) {
      const result = stats(events, perSet);
      const rotations = result.advancedStats.rotations[side];
      expect(buildPlayByPlay(result, events, roleOf)[0].rows.map((row) => row.rotations[side]))
        .toEqual([4, 1, afterSideOut, afterReturn]);
      expect(rotations.find((rotation) => rotation.rotationNumber === 4)?.pointsScored).toBe(side === 'home' ? 2 : 0);
      expect(rotations.find((rotation) => rotation.rotationNumber === 1)?.pointsScored).toBe(side === 'home' ? 2 : 1);
      if (side === 'away') {
        expect(rotations.find((rotation) => rotation.rotationNumber === afterSideOut)?.pointsScored).toBe(1);
        expect(rotations.find((rotation) => rotation.rotationNumber === afterReturn)?.pointsScored).toBe(1);
      }
      // Both breakdowns must agree, including the point played before a side-out.
      for (const rotation of rotations) {
        expect(result.crossRotationStats.bySide[side].rowTotals[rotation.rotationNumber].attempts).toBe(rotation.breakPointAttempts);
        expect(result.crossRotationStats.bySide[other].columnTotals[rotation.rotationNumber].attempts).toBe(rotation.sideOutAttempts);
      }
    }
    const replayEvents: MatchEvent[] = events.flatMap((event): MatchEvent[] => event.type === 'point_awarded' ? [
      { id: `start-${event.id}`, type: 'rally_started', createdAt: event.createdAt - 1 },
      event,
      { id: `end-${event.id}`, type: 'rally_ended', createdAt: event.createdAt + 1, setNumber: 1, rallyNumber: event.rallyNumber },
    ] : [event]);
    const live = replayLiveMatchFromEvents('test', replayEvents, roleOf)!;
    const active = side === 'home' ? live.homeActiveLineup : live.awayActiveLineup;
    expect(active?.slots.find((slot) => slot.playerId === active.setterPlayerId)?.courtPosition).toBe(afterReturn);
  });

  it('uses the explicit setter assignment when roster roles are missing, including set-only statistics', () => {
    const events: MatchEvent[] = [start, point(1, 'home'), sub('away', 'S1', 'O2', 11), sub('away', 'O1', 'S2', 12), {
      id: 'assign', type: 'setter_assigned', createdAt: 13, setNumber: 1, teamSide: 'away', setterPlayerId: 'away-S2',
    }, point(2, 'home')];
    for (const perSet of [false, true]) {
      const result = stats(events, perSet, false);
      expect(result.advancedStats.rotations.away.find((rotation) => rotation.rotationNumber === 4)?.pointsConceded).toBe(1);
      expect(result.advancedStats.rotations.away.find((rotation) => rotation.rotationNumber === 1)?.pointsConceded).toBe(1);
      expect(result.crossRotationStats.bySide.home.cells[4][1].attempts).toBe(1);
    }
  });

  it('keeps legacy terminal-touch-only matches rotating after a derived side-out', () => {
    const touch = (rallyNumber: number, teamSide: TeamSide): BallTouch => ({
      id: `touch-${rallyNumber}`, createdAt: rallyNumber * 10, setNumber: 1, rallyNumber, sequenceNumber: 1,
      teamSide, playerId: `${teamSide}-H1`, skill: 'attack', evaluation: '#',
    });
    const touches = [touch(1, 'away'), touch(2, 'away')];
    const events: MatchEvent[] = [start, ...touches.map((touch): MatchEvent => ({
      id: `event-${touch.id}`, type: 'touch_recorded', createdAt: touch.createdAt, touch,
    }))];
    const result = stats(events);
    expect(result.advancedStats.rotations.away.find((rotation) => rotation.rotationNumber === 4)?.sideOutWins).toBe(1);
    expect(result.advancedStats.rotations.away.find((rotation) => rotation.rotationNumber === 3)?.breakPointWins).toBe(1);
  });

  it('uses imported setter positions for both teams ahead of inferred lineup positions', () => {
    const touch: BallTouch = {
      id: 'imported', createdAt: 1, setNumber: 1, rallyNumber: 1, sequenceNumber: 1,
      teamSide: 'home', playerId: 'home-H1', skill: 'serve', evaluation: '#', homeSetterPosition: 6, awaySetterPosition: 2,
    };
    const result = stats([start, { id: 'recorded', type: 'touch_recorded', createdAt: 1, touch }, point(1, 'home')]);
    expect(result.advancedStats.rotations.home.find((rotation) => rotation.rotationNumber === 6)?.breakPointWins).toBe(1);
    expect(result.crossRotationStats.bySide.home.cells[6][2].attempts).toBe(1);
  });

  it('honours a skipped side-out rotation after the double change', () => {
    const result = stats([start, sub('away', 'S1', 'O2', 1), sub('away', 'O1', 'S2', 2),
      point(1, 'away', true), point(2, 'away')]);
    const rotation = result.advancedStats.rotations.away.find((row) => row.rotationNumber === 1)!;
    expect(rotation.sideOutWins).toBe(1);
    expect(rotation.breakPointWins).toBe(1);
  });

  it('keeps P4 for a like-for-like setter substitution', () => {
    const result = stats([start, point(1, 'home'), sub('away', 'S1', 'S2', 11), point(2, 'home')]);
    expect(result.advancedStats.rotations.away.find((rotation) => rotation.rotationNumber === 4)?.sideOutAttempts).toBe(2);
  });
});
