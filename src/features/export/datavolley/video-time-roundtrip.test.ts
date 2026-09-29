import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { mapDataVolleyMatchToOvsProject, parseDataVolleyFile } from '@src/features/import';
import { exportMatchToDataVolley } from './index';

// A real DataVolley file whose rows carry video positions (field 12).
const SOURCE = readFileSync(resolve(__dirname, '../../../../stuttgart-schwrein.dvw'), 'latin1');

function touchVideoTimes(text: string): number[] {
  const parsed = parseDataVolleyFile(text, { sourceName: 'x.dvw' } as never);
  const { project } = mapDataVolleyMatchToOvsProject(parsed, { sourceName: 'x.dvw' });
  return project.events
    .flatMap((event) => (event.type === 'touch_recorded' ? [event.touch.videoTimeSeconds] : []))
    .filter((seconds): seconds is number => typeof seconds === 'number');
}

describe('DVW export video times', () => {
  it('keeps the video position recorded with each touch', () => {
    const original = touchVideoTimes(SOURCE);
    expect(original.length).toBeGreaterThan(100);

    const parsed = parseDataVolleyFile(SOURCE, { sourceName: 'x.dvw' } as never);
    const { project } = mapDataVolleyMatchToOvsProject(parsed, { sourceName: 'x.dvw' });
    const roundTrip = touchVideoTimes(exportMatchToDataVolley(project).text);

    expect(roundTrip.length).toBe(original.length);
    expect(roundTrip).toEqual(original.map((seconds) => Math.round(seconds)));
  });
});
