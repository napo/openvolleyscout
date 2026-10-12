import { describe, expect, it } from 'vitest';
import type { BallTouch } from '@src/domain/touch/types';
import { parseSingleCode } from '../expert/code-parser';
import { buildDataVolleyTouchCode } from './datavolley-code';

function touch(overrides: Partial<BallTouch>): BallTouch {
  return {
    id: 't', setNumber: 1, rallyNumber: 1, sequenceNumber: 1, createdAt: 1,
    teamSide: 'home', skill: 'attack', evaluation: '+', source: 'explicit',
    ...overrides,
  } as BallTouch;
}

describe('live DataVolley code format', () => {
  it('writes the DataVolley positional layout (evaluation right after the ball type)', () => {
    const code = buildDataVolleyTouchCode({
      touch: touch({ skillTypeCode: 'Q', combinationCode: 'X5', startZoneCode: '4', endZoneCode: '8B', numBlockers: 2 }),
      jerseyNumber: 7,
    });
    expect(code).toBe('*07AQ+X5~48B~2');
  });

  it('is read back field by field by the code parser', () => {
    const cases: Array<[Partial<BallTouch>, Record<string, unknown>]> = [
      [{ skill: 'serve', skillTypeCode: 'M', evaluation: '-', startZoneCode: '1', endZoneCode: '5' },
        { skill: 'serve', skillType: 'M', evaluation: '-', startZone: '1', endZone: '5' }],
      [{ skillTypeCode: 'Q', combinationCode: 'X5', startZoneCode: '4', endZoneCode: '8B', numBlockers: 3 },
        { skill: 'attack', skillType: 'Q', evaluation: '+', actionCode: 'X5', startZone: '4', endZone: '8', endSubzone: 'B', playersCode: '3' }],
      [{ skill: 'set', setterCallCode: 'K1', setType: 'F', evaluation: '#' },
        { skill: 'set', evaluation: '#', actionCode: 'K1', setTypeCode: 'F' }],
      [{ skill: 'block', skillTypeCode: 'Q', evaluation: '-', startZoneCode: '2', numBlockers: 4 },
        { skill: 'block', evaluation: '-', startZone: '2', playersCode: '4' }],
    ];
    cases.forEach(([overrides, expected]) => {
      const parsed = parseSingleCode(buildDataVolleyTouchCode({ touch: touch(overrides), jerseyNumber: 12 }));
      expect(parsed.valid).toBe(true);
      expect(parsed).toMatchObject({ jerseyNumber: 12, ...expected });
    });
  });

  it('writes a cover as a dig, since DataVolley has no cover skill', () => {
    expect(buildDataVolleyTouchCode({ touch: touch({ skill: 'cover', evaluation: '+' }), jerseyNumber: 3 })).toBe('*03D~+');
  });

  it('marks an unknown player with $$', () => {
    expect(buildDataVolleyTouchCode({ touch: touch({ skill: 'dig', evaluation: '#' }) })).toBe('*$$D~#');
  });
});
