import { describe, expect, it } from 'vitest';
import { parseDataVolleyFile } from '../parser/datavolley-parser';
import { mapDataVolleyMatchToOvsProject } from './datavolley-to-ovs';

const header = [
  '[3DATAVOLLEYSCOUT]', 'FILEFORMAT: 2.0', '[3MATCH]',
  '01/01/2025;18.00.00;2024/2025;Test League;Regular season;;6;37;;1;Z;0;',
  '[3TEAMS]', 'HOM;Home Team;1;Coach H;;', 'AWY;Away Team;0;Coach A;;',
  '[3PLAYERS-H]', '0;1;1;1;;;;;HOM-1;Uno;Home;;;5;False;;;', '0;2;2;2;;;;;HOM-2;Due;Home;;;2;False;;;',
  '[3PLAYERS-V]', '1;1;3;1;;;;;AWY-1;Uno;Away;;;5;False;;;', '1;2;4;2;;;;;AWY-2;Due;Away;;;2;False;;;',
];
const row = (code: string) => `${code};;;;;;;18.01.00;1;1;1;1;10;;1;2;3;4;5;6;1;2;3;4;5;6;`;

function importScout(summary: string, scout: string[]) {
  const text = [...header, '[3SET]', `True;;;;${summary};25;`, 'False;;;;;;', '[3SCOUT]', ...scout.map(row), '**1set;;;;;;;18.25.00;2;1;1;1;1500;;;;;;;;;;;;;;'].join('\r\n');
  const parsed = parseDataVolleyFile(text, { sourceName: 't.dvw' } as never);
  return mapDataVolleyMatchToOvsProject(parsed, { sourceName: 't.dvw' });
}
const pointsWon = (events: { type: string; teamSide?: string }[], side: string) => events.filter((e) => e.type === 'point_awarded' && e.teamSide === side).length;

describe('DVW score jumps and repeated points', () => {
  it('adds points the file counts without scouted rallies (e.g. awarded by the referee)', () => {
    const mapped = importScout('2-1', ['*01SH#~~~15A', '*p01:00', 'a01SH=', 'ap01:01', '*p02:01']);
    expect(pointsWon(mapped.project.events, 'home')).toBe(2);
    expect(pointsWon(mapped.project.events, 'away')).toBe(1);
    expect(mapped.warnings.some((w) => /without scouted rallies/.test(w.message) && w.severity === 'info')).toBe(false);
    const jumped = importScout('3-0', ['*01SH#~~~15A', '*p01:00', '*01SH#~~~15A', '*p03:00']);
    expect(pointsWon(jumped.project.events, 'home')).toBe(3);
    expect(jumped.warnings.some((w) => /without scouted rallies/.test(w.message) && w.severity === 'info')).toBe(true);
    expect(jumped.warnings.some((w) => /differs from replayed/.test(w.message))).toBe(false);
  });

  it('does not count a rally whose point row repeats the score (annulled and replayed)', () => {
    const mapped = importScout('2-0', ['*01SH#~~~15A', '*p01:00', 'a01SH#~~~15A', 'ap01:00', '*01SH#~~~15A', '*p02:00']);
    expect(pointsWon(mapped.project.events, 'home')).toBe(2);
    expect(pointsWon(mapped.project.events, 'away')).toBe(0);
    expect(mapped.warnings.some((w) => /annulled and replayed/.test(w.message))).toBe(true);
  });
});
