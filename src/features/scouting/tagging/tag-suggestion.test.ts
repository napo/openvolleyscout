import { describe, expect, it } from 'vitest';
import { PlayerRole as TacticalRole } from '@src/domain/systems/types';
import { parseDataVolleyInput } from '../expert/code-parser';
import { buildTagCode, resolvePlayerTagRole, suggestNextTag } from './tag-suggestion';

describe('suggestNextTag', () => {
  it('starts with the serving team serving', () => {
    expect(suggestNextTag({ servingTeam: 'away', currentRallyTouches: [] })).toEqual({ teamSide: 'away', skill: 'serve' });
    expect(suggestNextTag({ servingTeam: null, currentRallyTouches: [] })).toBeNull();
  });

  it('follows a normal side-out and transition', () => {
    const serve = { teamSide: 'home' as const, skill: 'serve' as const };
    const receive = { teamSide: 'away' as const, skill: 'receive' as const };
    const attack = { teamSide: 'away' as const, skill: 'attack' as const };
    const dig = { teamSide: 'home' as const, skill: 'dig' as const };
    expect(suggestNextTag({ servingTeam: 'home', currentRallyTouches: [serve] })).toEqual({ teamSide: 'away', skill: 'receive' });
    expect(suggestNextTag({ servingTeam: 'home', currentRallyTouches: [serve, receive] })).toEqual({ teamSide: 'away', skill: 'attack' });
    expect(suggestNextTag({ servingTeam: 'home', currentRallyTouches: [serve, receive, attack] })).toEqual({ teamSide: 'home', skill: 'dig' });
    expect(suggestNextTag({ servingTeam: 'home', currentRallyTouches: [serve, receive, attack, dig] })).toEqual({ teamSide: 'home', skill: 'attack' });
  });
});

describe('buildTagCode', () => {
  it('builds codes the DataVolley code parser accepts', () => {
    const code = buildTagCode({ teamSide: 'away', jerseyNumber: 7, skill: 'attack', evaluation: '#' });
    expect(code).toBe('a07A#');
    const [parsed] = parseDataVolleyInput(code);
    expect(parsed).toMatchObject({ valid: true, teamSide: 'away', jerseyNumber: 7, skill: 'attack', evaluation: '#' });
  });

  it('attaches setter calls to sets only', () => {
    expect(buildTagCode({ teamSide: 'home', jerseyNumber: 5, skill: 'set', evaluation: '+', combination: 'K1' })).toBe('*05EK1+');
    expect(buildTagCode({ teamSide: 'home', jerseyNumber: 7, skill: 'attack', evaluation: '#', combination: 'K1' })).toBe('*07A#');
  });

  it('covers every skill letter', () => {
    const skills = ['serve', 'receive', 'set', 'attack', 'block', 'dig', 'freeball', 'cover'] as const;
    for (const skill of skills) {
      const [parsed] = parseDataVolleyInput(buildTagCode({ teamSide: 'home', jerseyNumber: 12, skill, evaluation: '+' }));
      expect(parsed).toMatchObject({ valid: true, teamSide: 'home', jerseyNumber: 12, skill });
    }
  });
});

describe('resolvePlayerTagRole', () => {
  const players = [
    { id: 'p1', role: 'setter' as const, isLibero: false },
    { id: 'p2', role: 'outside_hitter' as const, isLibero: false },
    { id: 'p3', role: 'middle_blocker' as const, isLibero: false },
    { id: 'p4', role: 'opposite' as const, isLibero: false },
    { id: 'p5', role: 'outside_hitter' as const, isLibero: false },
    { id: 'p6', role: 'middle_blocker' as const, isLibero: false },
    { id: 'p7', role: 'libero' as const, isLibero: true },
  ];

  const lineup = {
    setterPlayerId: 'p1',
    liberoPlayerIds: ['p7'],
    slots: [
      { courtPosition: 1 as const, playerId: 'p1', tacticalRole: TacticalRole.SETTER },
      { courtPosition: 2 as const, playerId: 'p2' },
      { courtPosition: 3 as const, playerId: 'p3' },
      { courtPosition: 4 as const, playerId: 'p4' },
      { courtPosition: 5 as const, playerId: 'p5' },
      { courtPosition: 6 as const, playerId: 'p6' },
    ],
  };

  it('uses Italian role badges S1/S2, C1/C2, O, P, L based on proximity to the setter', () => {
    expect(resolvePlayerTagRole(lineup, players[0], 'it')).toEqual({ role: 'setter', badge: 'P' });
    expect(resolvePlayerTagRole(lineup, players[1], 'it')).toEqual({ role: 'outside_hitter', badge: 'S1' });
    expect(resolvePlayerTagRole(lineup, players[2], 'it')).toEqual({ role: 'middle_blocker', badge: 'C2' });
    expect(resolvePlayerTagRole(lineup, players[3], 'it')).toEqual({ role: 'opposite', badge: 'O' });
    expect(resolvePlayerTagRole(lineup, players[4], 'it')).toEqual({ role: 'outside_hitter', badge: 'S2' });
    expect(resolvePlayerTagRole(lineup, players[5], 'it')).toEqual({ role: 'middle_blocker', badge: 'C1' });
    expect(resolvePlayerTagRole(lineup, players[6], 'it')).toEqual({ role: 'libero', badge: 'L' });
  });
});
