// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mapDataVolleyMatchToOvsProject, parseDataVolleyFile } from '@src/features/import';
import { DEMO_MATCH_FILE, isDemoMatch } from './demo-match';

describe('demo match', () => {
  it('ships a DataVolley file that imports cleanly', () => {
    const bytes = readFileSync(`public/${DEMO_MATCH_FILE}`);
    const parsed = parseDataVolleyFile(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), { sourceName: 'demo.dvw' });
    const { project, warnings } = mapDataVolleyMatchToOvsProject(parsed, { sourceName: 'demo.dvw' });
    expect(warnings.filter((warning) => warning.severity === 'error')).toEqual([]);
    expect(project.homeTeam.name).toBe('Melodic Spikers');
    expect(project.awayTeam.name).toBe('Hollywood Blockers');
  });

  it('recognizes the demo flag', () => {
    expect(isDemoMatch({ metadata: { id: 'a', isDemo: true } } as never)).toBe(true);
    expect(isDemoMatch({ metadata: { id: 'a' } } as never)).toBe(false);
  });
});
