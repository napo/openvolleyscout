// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import type { ActiveLineup } from '../../../domain/lineup/types';
import type { Player } from '../../../domain/roster/types';
import { getEligiblePlayersInForSubstitution, getNormalSubstitutionEligibility } from './personnel';

const ids = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
const roster = [...ids, 's1', 's2', 'L'].map((id) => ({ id, isLibero: id === 'L' })) as unknown as Player[];

function lineup(pairs: ActiveLineup['personnelState']['substitutionPairs'], onCourt = ids): ActiveLineup {
  return {
    teamSide: 'home',
    liberoPlayerIds: ['L'],
    slots: onCourt.map((playerId, i) => ({ courtPosition: (i + 1) as 1, playerId })),
    personnelState: {
      onCourtPlayerIds: onCourt,
      benchPlayerIds: roster.map((p) => p.id).filter((id) => !onCourt.includes(id)),
      liberoPlayerId: 'L',
      liberoAutoMiddleReplacement: false,
      substitutionPairs: pairs,
      substitutionHistory: pairs,
    },
  };
}
const pair = (playerOutId: string, playerInId: string, hasReentered = false) => ({
  teamSide: 'home' as const, playerOutId, playerInId, setNumber: 1, rallyNumber: 1,
  canReenterOnlyForPlayerId: playerOutId, hasReentered,
});

describe('substitution eligibility is permissive', () => {
  it('allows a regular first substitution without warning', () => {
    expect(getNormalSubstitutionEligibility({ lineup: lineup([]), playerOutId: 'p1', playerInId: 's1', rosterPlayers: roster }))
      .toEqual({ isEligible: true });
  });

  it('allows the regular re-entry without warning', () => {
    const l = lineup([pair('p1', 's1')], ['s1', 'p2', 'p3', 'p4', 'p5', 'p6']);
    expect(getNormalSubstitutionEligibility({ lineup: l, playerOutId: 's1', playerInId: 'p1', rosterPlayers: roster }))
      .toEqual({ isEligible: true });
  });

  it('records a re-entry for a different player, flagged with a warning', () => {
    const l = lineup([pair('p1', 's1')], ['s1', 'p2', 'p3', 'p4', 'p5', 'p6']);
    const result = getNormalSubstitutionEligibility({ lineup: l, playerOutId: 'p2', playerInId: 'p1', rosterPlayers: roster });
    expect(result).toEqual({ isEligible: true, warning: 'reentry_rule' });
    expect(getEligiblePlayersInForSubstitution({ lineup: l, playerOutId: 'p2', rosterPlayers: roster }).map((p) => p.id))
      .toContain('p1');
  });

  it('still blocks structurally impossible changes', () => {
    const l = lineup([]);
    expect(getNormalSubstitutionEligibility({ lineup: l, playerOutId: 'p1', playerInId: 'L', rosterPlayers: roster }).isEligible).toBe(false);
    expect(getNormalSubstitutionEligibility({ lineup: l, playerOutId: 'p1', playerInId: 'p2', rosterPlayers: roster }).isEligible).toBe(false);
  });
});
