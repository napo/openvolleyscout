import { describe, expect, it } from 'vitest';
import type { BallTouch } from '@src/domain/touch/types';
import { parseSingleCode } from '../expert/code-parser';
import { buildDataVolleyTouchCode, formatDataVolleyCodeTail, getDataVolleyCodeFields } from './datavolley-code';

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
    expect(code).toBe('*07AQ+X5~48BH2');
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

  it('writes a cover as a dig of type C, since DataVolley has no cover skill, and reads it back as a cover', () => {
    const code = buildDataVolleyTouchCode({ touch: touch({ skill: 'cover', evaluation: '+' }), jerseyNumber: 3 });
    expect(code).toBe('*03D~+~~~~~~C');
    expect(parseSingleCode(code)).toMatchObject({ valid: true, skill: 'cover', evaluation: '+' });
    expect(parseSingleCode('*03D~+')).toMatchObject({ valid: true, skill: 'dig' });
  });

  it('marks an unknown player with $$', () => {
    expect(buildDataVolleyTouchCode({ touch: touch({ skill: 'dig', evaluation: '#' }) })).toBe('*$$D~#');
  });

  it('writes and reads back the attack subtype (hard / placed / tip)', () => {
    const code = buildDataVolleyTouchCode({
      touch: touch({ skillTypeCode: 'H', startZoneCode: '4', endZoneCode: '6', attackSubtype: 'T', numBlockers: 2 }),
      jerseyNumber: 9,
    });
    expect(code).toBe('*09AH+~~~46~T2');
    expect(parseSingleCode(code)).toMatchObject({ skillSubtypeCode: 'T', playersCode: '2' });
  });
});

describe('one writer for the on-screen code and the .dvw export', () => {
  it('reads an older serve type from the advanced details, never its first letter', () => {
    const serve = touch({ skill: 'serve', evaluation: '-', advancedDetails: { serve: { type: 'jump_float' } } as never });
    expect(getDataVolleyCodeFields(serve).ballType).toBe('M');
    // "power" is how the ball was hit, not a ball type: it must not become the ball type P.
    const attack = touch({ advancedDetails: { attack: { type: 'power' } } as never });
    expect(getDataVolleyCodeFields(attack)).toMatchObject({ ballType: '', subtype: 'H' });
  });

  it('keeps the custom characters after the special position, with the evaluation in place', () => {
    const code = buildDataVolleyTouchCode({ touch: touch({ skill: 'dig', evaluation: '#', customCode: 'XY' }), jerseyNumber: 5 });
    expect(code).toBe('*05D~#~~~~~~~~~XY');
    expect(parseSingleCode(code)).toMatchObject({ valid: true, skill: 'dig', evaluation: '#', customCode: 'XY' });
  });

  it('writes the players at the net on attacks and blocks only', () => {
    expect(getDataVolleyCodeFields(touch({ skill: 'dig', numBlockers: 2 })).players).toBe('');
    expect(getDataVolleyCodeFields(touch({ skill: 'block', numBlockers: 2 })).players).toBe('2');
  });

  it('does not invent an end zone when the touch was recorded without one', () => {
    const grid = (row: number, column: number) => ({ teamSide: 'home' as const, zoneId: `home-r${row}c${column}`, gridCoordinate: { row, column } });
    // Recorded live on its own side: start zone from the court, end zone left empty on purpose.
    const sameSide = touch({ skill: 'dig', startZoneCode: '6D', endZoneCode: '', zone: grid(3, 5) as never, targetZone: grid(3, 5) as never });
    expect(getDataVolleyCodeFields(sameSide)).toMatchObject({ startZone: '6', endZone: '', endSubzone: '' });
    // An older touch without any code: the zones come from the court, with the 6x6 grid mapping.
    const older = touch({ originZone: grid(5, 1) as never, targetZone: grid(1, 6) as never });
    const fields = getDataVolleyCodeFields(older);
    expect(`${fields.startZone}${fields.endZone}${fields.endSubzone}`).toMatch(/^[1-9][1-9][A-D]$/);
  });

  it('takes the zone codes kept on the drawn direction when the touch has none', () => {
    const drawn = touch({ ballDirection: { start: { x: 1, y: 1 }, end: { x: 2, y: 2 }, courtZoneStart: '4', courtZoneEnd: '1D' } as never });
    expect(getDataVolleyCodeFields(drawn)).toMatchObject({ startZone: '4', endZone: '1', endSubzone: 'D' });
  });

  it('writes no zone for button input, unless the zones were picked on purpose', () => {
    const placeholder = touch({ withoutZones: true, startZoneCode: '8', endZoneCode: '8' });
    expect(getDataVolleyCodeFields(placeholder)).toMatchObject({ startZone: '', endZone: '' });
    expect(getDataVolleyCodeFields({ ...placeholder, zonesPicked: true })).toMatchObject({ startZone: '8', endZone: '8' });
  });

  it('the exported row is the on-screen code at fixed width', () => {
    const touches = [
      touch({ skillTypeCode: 'Q', combinationCode: 'X5', startZoneCode: '4', endZoneCode: '8B', numBlockers: 2, attackSubtype: 'T' }),
      touch({ skill: 'set', setterCallCode: 'K1', setType: 'F', evaluation: '#' }),
      touch({ skill: 'cover', evaluation: '+' }),
      touch({ skill: 'serve', skillTypeCode: 'M', evaluation: '-', startZoneCode: '1', endZoneCode: '5' }),
    ];
    for (const item of touches) {
      const onScreen = buildDataVolleyTouchCode({ touch: item, jerseyNumber: 7 });
      const exported = `*07${onScreen.charAt(3)}${formatDataVolleyCodeTail(getDataVolleyCodeFields(item), item.evaluation)}`;
      expect(exported.replace(/~+$/, '')).toBe(onScreen.replace(/~+$/, ''));
      expect(exported.length).toBeGreaterThanOrEqual(15);
    }
  });
});

describe('a touch read from a file keeps what the file said', () => {
  it('writes back the subtype, the players and the special code of any skill', () => {
    const reception = touch({ skill: 'receive', skillTypeCode: 'M', evaluation: '!', startZoneCode: '1', endZoneCode: '6D', dataVolleySource: { skillSubtypeCode: 'L', playersCode: '4' } });
    expect(buildDataVolleyTouchCode({ touch: reception, jerseyNumber: 4 })).toBe('*04RM!~~~16DL4');
    const attack = touch({ skillTypeCode: 'H', evaluation: '#', combinationCode: 'XA', startZoneCode: '4', endZoneCode: '3A', attackSubtype: 'T', numBlockers: 2, dataVolleySource: { skillSubtypeCode: 'T', playersCode: '2', specialCode: 'F' } });
    expect(buildDataVolleyTouchCode({ touch: attack, jerseyNumber: 4 })).toBe('*04AH#XA~43AT2F');
  });

  it('adds nothing the file did not hold: no default subtype, no cover mark', () => {
    const attack = touch({ skillTypeCode: 'T', evaluation: '!', dataVolleySource: {} });
    expect(buildDataVolleyTouchCode({ touch: attack, jerseyNumber: 3 })).toBe('*03AT!');
    const cover = touch({ skill: 'cover', skillTypeCode: 'H', evaluation: '!', dataVolleySource: {} });
    expect(buildDataVolleyTouchCode({ touch: cover, jerseyNumber: 3 })).toBe('*03DH!');
  });

  it('does not write the ball type of a set in the target attack position', () => {
    const set = touch({ skill: 'set', skillTypeCode: 'H', setType: 'H', evaluation: '+' });
    expect(getDataVolleyCodeFields(set)).toMatchObject({ ballType: 'H', targetAttack: '' });
  });

  it('writes the attack cone back in the file, the subzone letter on screen', () => {
    const attack = touch({ startZoneCode: '4', endZoneCode: '6b', dataVolleySource: { endCone: '5', endConeSubzone: 'b' } });
    const fields = getDataVolleyCodeFields(attack);
    expect(formatDataVolleyCodeTail(fields, '+', { cones: true })).toContain('465');
    expect(formatDataVolleyCodeTail(fields, '+')).toContain('46B');
    // Once the end zone is edited the cone no longer describes it.
    expect(getDataVolleyCodeFields({ ...attack, endZoneCode: '6c' }).endCone).toBe('');
  });
});
