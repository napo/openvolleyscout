// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import type { BallTouch } from '@src/domain/touch/types';
import { mapDataVolleyMatchToOvsProject, parseDataVolleyFile } from '@src/features/import';

function importTouches(text: string): BallTouch[] {
  const { project } = mapDataVolleyMatchToOvsProject(parseDataVolleyFile(text, { sourceName: 'm.dvw' } as never), { sourceName: 'm.dvw' });
  return project.events.flatMap((event) => (event.type === 'touch_recorded' ? [event.touch] : []));
}

function rallies(touches: readonly BallTouch[]): BallTouch[][] {
  const byRally = new Map<string, BallTouch[]>();
  touches.forEach((touch) => {
    const key = `${touch.setNumber}-${touch.rallyNumber}`;
    byRally.set(key, [...(byRally.get(key) ?? []), touch]);
  });
  return [...byRally.values()];
}

const demo = readFileSync(resolve(__dirname, '../../../../public/samples/demo-melodic-spikers-hollywood-blockers.dvw'), 'latin1');

describe('covers from DataVolley (DataVolley 4 handbook)', () => {
  it('turns the digs of the attacking team after a block into covers on the demo match', () => {
    const touches = importTouches(demo);
    const covers = touches.filter((touch) => touch.skill === 'cover');
    expect(covers.length).toBeGreaterThan(0);
    for (const rally of rallies(touches)) {
      rally.forEach((touch, index) => {
        const block = rally[index - 1];
        const attack = rally[index - 2];
        const afterBlock = block?.skill === 'block' && block.teamSide !== touch.teamSide
          && attack?.skill === 'attack' && attack.teamSide === touch.teamSide;
        if (touch.skill === 'cover') expect(afterBlock || touch.evaluation === '!').toBe(true);
        // No dig is left where the handbook sees a cover.
        if (touch.skill === 'dig') expect(afterBlock || touch.evaluation === '!').toBe(false);
      });
    }
  });

  it('reads the type of hit C and the rating "!" on a dig, and leaves other digs alone', () => {
    const header = demo.slice(0, demo.indexOf('[3SCOUT]') + '[3SCOUT]'.length);
    const lines = demo.slice(header.length).split(/\r?\n/);
    const firstDig = lines.findIndex((line) => /^[*a]\d{2}D/.test(line));
    expect(firstDig).toBeGreaterThan(-1);
    const original = lines[firstDig]!;
    const code = original.split(';')[0]!;
    // Pad the code to the type of hit (13th character, after the end subzone) and write the letter there.
    const padded = code.padEnd(13, '~');
    const asType = (type: string) => [...lines.slice(0, firstDig), [`${padded.slice(0, 12)}${type}${padded.slice(13)}`, ...original.split(';').slice(1)].join(';'), ...lines.slice(firstDig + 1)];
    const skillOf = (text: string) => importTouches(text).filter((touch) => touch.skill === 'dig' || touch.skill === 'cover');
    const baseline = skillOf(demo);
    const withC = skillOf(header + asType('C').join('\n'));
    const withS = skillOf(header + asType('S').join('\n'));
    expect(withC.filter((touch) => touch.skill === 'cover').length).toBe(baseline.filter((touch) => touch.skill === 'cover').length + 1);
    expect(withS.filter((touch) => touch.skill === 'cover').length).toBe(baseline.filter((touch) => touch.skill === 'cover').length);
  });
});
