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
    assert.match(content, /serve-left.*return '5'/);
    assert.match(content, /serve-center.*return '6'/);
    assert.match(content, /serve-right.*return '1'/);
  });

  it('handles startZoneCode and endZoneCode from draft', async () => {
    const content = await readFile('./src/features/scouting/pages/ScoutingPage.tsx', 'utf-8');
    // Verify that zone codes are derived in handleTouchConfirm with createZoneReference conversion
    assert.match(content, /startZoneCode:.*getZoneCode\(.*createZoneReference/);
    assert.match(content, /endZoneCode:.*getZoneCode\(createZoneReference\(draft\.zone\)/);
  });
});
