// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import type { BallTouch } from '@src/domain/touch/types';
import { parseSingleCode } from '@src/features/scouting/expert/code-parser';
import { buildDataVolleyTouchCode } from '@src/features/scouting/model/datavolley-code';
import { applyParsedCodeToTouch } from './apply-code-edit';

const imported: BallTouch = {
  id: 't', setNumber: 1, rallyNumber: 1, sequenceNumber: 1, createdAt: 1, teamSide: 'home', playerId: 'p4',
  skill: 'attack', evaluation: '#', skillTypeCode: 'H', attackType: 'H', combinationCode: 'XA',
  startZoneCode: '4', endZoneCode: '3a', attackSubtype: 'T', numBlockers: 2,
  dataVolleySource: { skillSubtypeCode: 'T', playersCode: '2', specialCode: 'F', startCoordinate: '4912', endCoordinate: '6144' },
};
const edit = (code: string) => applyParsedCodeToTouch(imported, parseSingleCode(code), () => 'p4');

describe('editing the code of a touch read from a file', () => {
  it('keeps what the file said when the code is not changed', () => {
    const code = buildDataVolleyTouchCode({ touch: imported, jerseyNumber: 4 });
    expect(code).toBe('*04AH#XA~43AT2F');
    expect(edit(code)).toMatchObject({ dataVolleySource: imported.dataVolleySource, attackSubtype: 'T', numBlockers: 2 });
  });

  it('takes the subtype, the players and the special code typed in the code', () => {
    const next = edit('*04AH#XA~43AP3~');
    expect(next).toMatchObject({ attackSubtype: 'P', numBlockers: 3 });
    expect(next.dataVolleySource).toMatchObject({ skillSubtypeCode: 'P', playersCode: '3' });
    expect(next.dataVolleySource?.specialCode).toBeUndefined();
    expect(buildDataVolleyTouchCode({ touch: next, jerseyNumber: 4 })).toBe('*04AH#XA~43AP3');
  });

  it('drops the ball coordinates when the zones are changed, since they described the old ones', () => {
    const next = edit('*04AH#XA~42AT2F');
    expect(next.endZoneCode).toBe('2a');
    expect(next.dataVolleySource).toEqual({ skillSubtypeCode: 'T', playersCode: '2', specialCode: 'F' });
  });
});
