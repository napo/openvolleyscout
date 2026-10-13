import { describe, expect, it } from 'vitest';
import { parseDataVolleyFile } from '../parser';
import { mapDataVolleyMatchToOvsProject } from '../mapping';
import { validateImportedMatch, validateImportedStats } from './datavolley-import-validation';

// Many club scouts only track their own team: the opponent appears in
// [3TEAMS] by name, with no [3PLAYERS-V] rows, no lineup and no player codes.
const HOME_LINEUP = '1;2;3;4;5;6;;;;;;';
const TEAM_ONLY_OPPONENT_DVW = [
  '[3DATAVOLLEYSCOUT]',
  'FILEFORMAT: 2.0',
  '[3MATCH]',
  '01/01/2025;18.00.00;2024/2025;Friendly;;;6;37;;1;Z;0;',
  '[3TEAMS]',
  'HOM;Home Team;1;Coach H;;',
  'AWY;Away Team;0;;;',
  '[3PLAYERS-H]',
  '0;1;1;1;;;;;HOM-1;Uno;Home;;;5;False;;;',
  '0;2;2;2;;;;;HOM-2;Due;Home;;;2;False;;;',
  '0;3;3;3;;;;;HOM-3;Tre;Home;;;3;False;;;',
  '0;4;4;4;;;;;HOM-4;Quattro;Home;;;4;False;;;',
  '0;5;5;5;;;;;HOM-5;Cinque;Home;;;2;False;;;',
  '0;6;6;6;;;;;HOM-6;Sei;Home;;;3;False;;;',
  '[3PLAYERS-V]',
  '[3SET]',
  'True;;;;2-1;5;',
  'False;;;;;;',
  '[3SCOUT]',
  `*P01>LUp;;;;;;;18.00.00;1;1;1;;;;${HOME_LINEUP}`,
  `*z1>LUp;;;;;;;18.00.00;1;1;1;;;;${HOME_LINEUP}`,
  `*01SH#~~~15A;;;;;;;18.01.00;1;1;1;1;10;;${HOME_LINEUP}`,
  `*p01:00;;;;;;;18.01.05;1;1;1;1;15;;${HOME_LINEUP}`,
  `*01SH=~~~15A;;;;;;;18.01.20;1;1;1;1;30;;${HOME_LINEUP}`,
  `ap01:01;;;;;;;18.01.25;1;1;1;1;35;;${HOME_LINEUP}`,
  `*$$&H#;;;;;;;18.01.40;1;6;1;0;50;;${HOME_LINEUP}`,
  `*p02:01;;;;;;;18.01.45;1;6;1;0;55;;${HOME_LINEUP}`,
  '**1set;;;;;;;18.25.00;2;6;1;1;1500;;;;;;;;;;;;;;',
].join('\r\n');

describe('DataVolley import with a team-only opponent', () => {
  const parsed = parseDataVolleyFile(TEAM_ONLY_OPPONENT_DVW, { sourceName: 'team-only.dvw' });
  const mapped = mapDataVolleyMatchToOvsProject(parsed, { sourceName: 'team-only.dvw' });
  const diagnostics = [
    ...parsed.warnings,
    ...mapped.warnings,
    ...validateImportedMatch(mapped.project),
    ...validateImportedStats(mapped.project),
  ];

  it('keeps the scouted team and leaves the opponent without players', () => {
    expect(mapped.project.homeSelection.roster).toHaveLength(6);
    expect(mapped.project.awaySelection.roster).toHaveLength(0);
  });

  it('does not block the import', () => {
    expect(diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
  });

  it('warns that the opponent was imported by name only', () => {
    expect(diagnostics.some((diagnostic) => (
      diagnostic.severity === 'warning' && diagnostic.message.startsWith('Away Team has no players')
    ))).toBe(true);
  });

  it('still blocks a match where neither team has players', () => {
    const project = structuredClone(mapped.project);
    project.homeSelection.roster = [];
    project.events.forEach((event) => {
      if (event.type === 'set_started') event.homeLineup.slots = [];
    });
    expect(validateImportedMatch(project).some((diagnostic) => diagnostic.severity === 'error')).toBe(true);
  });
});
