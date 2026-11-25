// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { buildVideoEventIndex } from './video-event-index';
import { annotateVideoEntries, applyVideoChainFilters, createDefaultVideoChainFilters } from './video-chain-filters';

const roles: Record<string, string> = { S1: 'setter', S2: 'setter', O1: 'opposite', O2: 'opposite' };
const roleOf = (id: string) => roles[id];

const lineup = (teamSide: 'home' | 'away', ids: string[], setterPlayerId: string) => ({
  teamSide, setterPlayerId, liberoPlayerIds: [], displaySide: 'left',
  slots: ids.map((playerId, index) => ({ courtPosition: (index + 1) as 1, playerId })),
});
let n = 0;
const ev = (type: string, extra: Record<string, unknown> = {}) => { n += 1; return { id: `e${n}`, type, createdAt: n, ...extra }; };
const sub = (out: string, inn: string) => ev('substitution_made', { setNumber: 1, teamSide: 'away', playerOutId: out, playerInId: inn });
const attack = (rallyNumber: number) => ev('touch_recorded', { touch: { id: `t${n + 1}`, setNumber: 1, rallyNumber, sequenceNumber: 1, teamSide: 'away', skill: 'attack', evaluation: '+', createdAt: n } });

// Away: setter S1 in P1, opposite O1 in P4. The first rally is won by away (side out), so the team
// rotates once: S1 ends up in P6 and O1 in P3, where the two changes then take place.
const events = [
  ev('set_started', { setNumber: 1, servingTeam: 'home', homeLineup: lineup('home', ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'], 'h1'), awayLineup: lineup('away', ['S1', 'a2', 'a3', 'O1', 'a5', 'a6'], 'S1') }),
  attack(1), ev('point_awarded', { teamSide: 'away' }),
  sub('S1', 'O2'), sub('O1', 'S2'),
  attack(2), ev('point_awarded', { teamSide: 'away' }),
] as never;

const awayAttackSetterPositions = (index: ReturnType<typeof buildVideoEventIndex>) =>
  index.entries.filter((entry) => entry.teamSide === 'away').map((entry) => entry.setterPosition);

describe('setter position in the video index after a setter-opposite double change', () => {
  it('follows the real setter (now in P3) once both changes are made', () => {
    expect(awayAttackSetterPositions(buildVideoEventIndex(events, { roleOf }))).toEqual([1, 3]);
  });

  it('feeds the rotation filter', () => {
    const index = buildVideoEventIndex(events, { roleOf });
    const inP3 = applyVideoChainFilters(annotateVideoEntries(index.entries), { ...createDefaultVideoChainFilters(), rotations: [3] });
    expect(inP3.map((entry) => entry.rallyNumber)).toEqual([2]);
  });

  it('without roles the stand-in who took the setter slot keeps the job', () => {
    expect(awayAttackSetterPositions(buildVideoEventIndex(events))).toEqual([1, 6]);
  });

  it('a setter_assigned event settles it (the scout answered "who is the setter")', () => {
    const withAssignment = [...(events as never[]).slice(0, 5), ev('setter_assigned', { setNumber: 1, teamSide: 'away', setterPlayerId: 'S2' }), ...(events as never[]).slice(5)] as never;
    expect(awayAttackSetterPositions(buildVideoEventIndex(withAssignment))).toEqual([1, 3]);
  });
});
