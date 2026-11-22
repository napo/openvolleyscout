// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import type { CourtPosition, TeamSide } from '@src/domain/common/enums';
import type { MatchEvent } from '@src/domain/events/types';
import type { StartingLineup } from '@src/domain/lineup/types';
import type { Team } from '@src/domain/roster/types';
import { DEFAULT_ROLE_SEQUENCE } from '@src/config/systems';
import { SCOUTING_SIDE_WIDTH } from '@src/domain/spatial';
import type { TeamTacticalPhase } from '../live/tactical/tactical-transition';
import { resolveTacticalCourtPlayers } from '../live/tactical/positioning/tactical-position-resolver';
import { replayLiveMatchFromEvents } from './replay';

const phases: TeamTacticalPhase[] = [
  'reception', 'serving_prepare', 'break_point_defense', 'break_point_setter_release',
  'after_reception_setter_release', 'side_out_defense', 'side_out_setter_release',
];
const playerId = (side: TeamSide, jersey: number) => `${side}-${jersey}`;
const homeTeam: Team = {
  id: 'home', name: 'Home', code: 'H', staff: { headCoach: '', assistantCoach: '' },
  players: [1, 8, 14, 4, 11, 26, 2].map((jerseyNumber) => ({
    id: playerId('home', jerseyNumber), jerseyNumber, firstName: '', lastName: '', shortName: '', playerCode: '',
    isLibero: jerseyNumber === 2,
  })),
};
const awayTeam: Team = {
  id: 'away', name: 'Away', code: 'A', staff: { headCoach: '', assistantCoach: '' },
  players: [10, 7, 16, 9, 21, 8, 26, 14, 22].map((jerseyNumber) => ({
    id: playerId('away', jerseyNumber), jerseyNumber, firstName: '', lastName: '', shortName: '', playerCode: '',
    isLibero: jerseyNumber === 22,
  })),
};
const startingLineup = (side: TeamSide): StartingLineup => ({
  teamSide: side, displaySide: side === 'home' ? 'left' : 'right',
  setterPlayerId: playerId(side, side === 'home' ? 1 : 8),
  liberoPlayerIds: [playerId(side, side === 'home' ? 2 : 22)],
  benchPlayerIds: side === 'away' ? [playerId(side, 14), playerId(side, 26)] : [],
  slots: (side === 'home' ? [1, 8, 14, 4, 11, 26] : [10, 7, 16, 9, 21, 8]).map((jersey, index) => ({
    playerId: playerId(side, jersey), courtPosition: (index + 1) as CourtPosition,
    tacticalRole: DEFAULT_ROLE_SEQUENCE[(index + (side === 'home' ? 0 : 1)) % 6],
  })),
});

function scenario() {
  let sequence = 0;
  const base = () => ({ id: `event-${++sequence}`, createdAt: sequence });
  const events: MatchEvent[] = [{
    ...base(), type: 'set_started', setNumber: 3, servingTeam: 'home',
    homeLineup: startingLineup('home'), awayLineup: startingLineup('away'),
  }];
  const replay = () => replayLiveMatchFromEvents('match', events)!;
  const point = (teamSide: TeamSide) => {
    const rallyNumber = replay().currentRallyNumber;
    events.push(
      { ...base(), type: 'rally_started' },
      { ...base(), type: 'point_awarded', setNumber: 3, rallyNumber, teamSide },
      { ...base(), type: 'rally_ended', setNumber: 3, rallyNumber },
    );
  };
  const libero = (side: TeamSide, regular: number, action: 'libero_enters' | 'regular_returns') => {
    const regularId = playerId(side, regular);
    const liberoPlayerId = playerId(side, side === 'home' ? 2 : 22);
    const slot = replay()[side === 'home' ? 'homeActiveLineup' : 'awayActiveLineup']!.slots
      .find((slot) => slot.playerId === (action === 'libero_enters' ? regularId : liberoPlayerId))!;
    events.push({
      ...base(), type: 'libero_replacement_made', setNumber: 3, rallyNumber: replay().currentRallyNumber,
      teamSide: side, liberoPlayerId, replacedPlayerId: regularId, replacedPlayerRole: slot.tacticalRole,
      playerOutId: action === 'libero_enters' ? regularId : liberoPlayerId,
      playerInId: action === 'libero_enters' ? liberoPlayerId : regularId, action,
    });
  };
  // Third-set point order and libero exchanges from the supplied export, up to 8-2.
  for (const [index, winner] of (['away', 'home', 'home', 'home', 'home', 'away', 'home', 'home', 'home', 'home'] as const).entries()) {
    point(winner);
    if (index === 0) libero('away', 21, 'regular_returns');
    if (index === 1) libero('away', 7, 'libero_enters');
    if (index === 6) libero('home', 26, 'regular_returns');
  }
  const doubleChange: MatchEvent[] = [
    { ...base(), type: 'substitution_made', setNumber: 3, rallyNumber: 11, teamSide: 'away', playerOutId: 'away-16', playerInId: 'away-26' },
    { ...base(), type: 'substitution_made', setNumber: 3, rallyNumber: 11, teamSide: 'away', playerOutId: 'away-8', playerInId: 'away-14' },
    { ...base(), type: 'setter_assigned', setNumber: 3, teamSide: 'away', setterPlayerId: 'away-26' },
  ];
  const markers = (phase: TeamTacticalPhase, displaySide: 'left' | 'right' = 'left') => resolveTacticalCourtPlayers({
    teamSide: 'home', team: homeTeam, lineup: replay().homeActiveLineup, phase, displaySide,
  });
  return { events, replay, point, libero, doubleChange, markers };
}

describe('opposing libero after a double change', () => {
  it('leaves the other team lineup and Base drawing unchanged after each substitution and setter assignment', () => {
    const s = scenario();
    expect([s.replay().homeScore, s.replay().awayScore]).toEqual([8, 2]);
    const before = structuredClone(s.replay().homeActiveLineup);
    const beforeMarkers = phases.map((phase) => s.markers(phase));
    for (const event of s.doubleChange) {
      s.events.push(event);
      expect(s.replay().homeActiveLineup).toEqual(before);
      expect(phases.map((phase) => s.markers(phase))).toEqual(beforeMarkers);
    }
    expect(s.replay().awayActiveLineup?.setterPlayerId).toBe('away-26');
    // The 15:17 photo shows the original bug on the team making the change:
    // #22 drawn at the net and #21 behind, despite their slots being Z6 and Z3.
    // Reassign all roles around #26 so that #22 takes the back-row middle's point.
    const awayMarkers = resolveTacticalCourtPlayers({
      teamSide: 'away', team: awayTeam, lineup: s.replay().awayActiveLineup,
      phase: 'reception', displaySide: 'right',
    });
    const awayLibero = awayMarkers.find((marker) => marker.playerId === 'away-22')!;
    const awayMiddle = awayMarkers.find((marker) => marker.playerId === 'away-21')!;
    expect(awayMarkers).toHaveLength(6);
    expect(awayLibero.courtPosition).toBe(6);
    expect(Math.abs(awayLibero.x - 50)).toBeGreaterThan(SCOUTING_SIDE_WIDTH / 3);
    expect(awayMiddle.courtPosition).toBe(3);
    expect(Math.abs(awayMiddle.x - 50)).toBeLessThan(SCOUTING_SIDE_WIDTH / 3);
  });

  it('keeps the opposing libero behind the attack line when that team reaches P3', () => {
    const s = scenario();
    s.events.push(...s.doubleChange);
    s.point('away');
    s.libero('home', 14, 'libero_enters');
    expect([s.replay().homeScore, s.replay().awayScore]).toEqual([8, 3]);
    // The export ends here. This is a possible continuation matching the photo's
    // score, rally number, home P3 and away server #14, not recovered match data.
    for (const winner of ['home', 'home', 'away', 'away', 'home', 'home', 'home', 'away'] as const) s.point(winner);
    const live = s.replay();
    expect([live.homeScore, live.awayScore, live.currentRallyNumber]).toEqual([13, 6, 20]);
    expect(live.homeActiveLineup?.slots.find((slot) => slot.playerId === 'home-1')?.courtPosition).toBe(3);
    expect(live.awayActiveLineup?.slots.find((slot) => slot.courtPosition === 1)?.playerId).toBe('away-14');
    for (const displaySide of ['left', 'right'] as const) {
      for (const phase of phases) {
        const markers = s.markers(phase, displaySide);
        expect(markers).toHaveLength(6);
        const libero = markers.find((marker) => marker.playerId === 'home-2')!;
        expect(libero.isLibero).toBe(true);
        expect(libero.courtPosition).toBe(5);
        expect(Math.abs(libero.x - 50)).toBeGreaterThan(SCOUTING_SIDE_WIDTH / 3);
        expect(markers.find((marker) => marker.playerId === 'home-26')?.courtPosition).toBe(2);
      }
    }
  });
});
