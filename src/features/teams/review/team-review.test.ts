// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mapDataVolleyMatchToOvsProject, parseDataVolleyFile } from '@src/features/import';
import { DEMO_MATCH_FILE } from '@src/features/demo/demo-match';
import { buildTeamReviewData } from './team-review-model';
import { buildTeamReviewBooklet } from './team-review-booklet';

function demoProject() {
  const bytes = readFileSync(`public/${DEMO_MATCH_FILE}`);
  const parsed = parseDataVolleyFile(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), { sourceName: 'demo.dvw' });
  return mapDataVolleyMatchToOvsProject(parsed, { sourceName: 'demo.dvw' }).project;
}

const t = (key: string, params?: Record<string, unknown>) => `${key}${params ? JSON.stringify(params) : ''}`;

describe('team review booklet', () => {
  const project = demoProject();
  const data = buildTeamReviewData([project], { teamName: 'Melodic Spikers' }, { withVideoLinks: false });

  it('pools the focus team players and the record', () => {
    expect(data.teamName).toBe('Melodic Spikers');
    expect(data.matches).toHaveLength(1);
    expect(data.wins + data.losses).toBe(1);
    expect(data.players.length).toBeGreaterThan(5);
    expect(data.players.every((player) => player.matches === 1)).toBe(true);
    expect(data.players.reduce((sum, player) => sum + player.attack.total, 0)).toBeGreaterThan(0);
    expect(data.rotations).toHaveLength(6);
  });

  it('lays out whole booklet sheets with notes and attribution', () => {
    const plan = buildTeamReviewBooklet(data, t, { notes: 'Work on serve receive' });
    expect(plan.pages.length % 4).toBe(0);
    const all = plan.pages.join('\n');
    expect(all).toContain('Work on serve receive');
    expect(all).toContain('teamReviewPlayers');
    expect(all).toContain('tacticalAttributionFooter');
  });
});
