import { describe, expect, it } from 'vitest';
import { parseDataVolleyInput } from '../expert/code-parser';
import { buildTagCode, suggestNextTag } from './tag-suggestion';

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

  it('covers every skill letter', () => {
    const skills = ['serve', 'receive', 'set', 'attack', 'block', 'dig', 'freeball', 'cover'] as const;
    for (const skill of skills) {
      const [parsed] = parseDataVolleyInput(buildTagCode({ teamSide: 'home', jerseyNumber: 12, skill, evaluation: '+' }));
      expect(parsed).toMatchObject({ valid: true, teamSide: 'home', jerseyNumber: 12, skill });
    }
  });
});
