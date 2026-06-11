import assert from 'node:assert';
import { describe, it } from 'node:test';
import { readFile } from 'node:fs/promises';

describe('datavolley-code.ts', () => {
  it('exports buildDataVolleyTouchCode function', async () => {
    const content = await readFile('./src/features/scouting/model/datavolley-code.ts', 'utf-8');
    assert.match(content, /export function buildDataVolleyTouchCode/);
  });

  it('exports getZoneCode function', async () => {
    const content = await readFile('./src/features/scouting/model/datavolley-code.ts', 'utf-8');
    assert.match(content, /export function getZoneCode/);
  });

  it('constructs code with direction before evaluation', async () => {
    const content = await readFile('./src/features/scouting/model/datavolley-code.ts', 'utf-8');
    // Verify the sequence: directionCode comes before evaluation in the return statement
    assert.match(content, /\$\{teamCode\}\$\{playerCode\}\$\{skillCode\}\$\{extraCode\}\$\{directionCode\}\$\{evaluation\}/);
  });

  it('maps zone codes correctly for serve positions', async () => {
    const content = await readFile('./src/features/scouting/model/datavolley-code.ts', 'utf-8');
    // serve-center is always zone 6 for both teams
    assert.match(content, /serve-center.*return '6'/);
    // serve-left and serve-right are mirrored: away-left=5/home-left=1, away-right=1/home-right=5
    assert.match(content, /serve-left.*teamSide.*away.*'5'.*'1'/s);
    assert.match(content, /serve-right.*teamSide.*away.*'1'.*'5'/s);
  });

  it('handles startZoneCode and endZoneCode from draft', async () => {
    const content = await readFile('./src/features/scouting/pages/ScoutingPage.tsx', 'utf-8');
    // Verify that zone codes are derived in handleTouchConfirm with createZoneReference conversion
    assert.match(content, /startZoneCode:.*getZoneCode\(.*createZoneReference/);
    assert.match(content, /endZoneCode:.*getZoneCode\(createZoneReference\(draft\.zone\)/);
  });
});
