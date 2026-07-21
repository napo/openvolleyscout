/**
 * Team match-filter helper tests.
 * Runs under Node.js via ts-node/esm.
 */

import assert from 'node:assert';
import { describe, it } from 'node:test';
import type { MatchProject } from '@src/domain/match/types';
import { getFocusTeamSide, filterMatchesForTeam } from './team-match-filter';

function makeMatch(overrides: {
  id: string;
  homeName: string;
  awayName: string;
  homeArchivedTeamId?: string;
  awayArchivedTeamId?: string;
}): MatchProject {
  return {
    metadata: { id: overrides.id, format: 'best-of-5', schemaVersion: 4 },
    homeTeam: { id: 'h', code: 'H', name: overrides.homeName, players: [], staff: { headCoach: '', assistantCoach: '' } },
    awayTeam: { id: 'a', code: 'A', name: overrides.awayName, players: [], staff: { headCoach: '', assistantCoach: '' } },
    homeSelection: {
      teamId: 'h', archivedTeamId: overrides.homeArchivedTeamId, teamName: overrides.homeName,
      source: overrides.homeArchivedTeamId ? 'archived_team' : 'manual_entry',
      staff: { headCoach: '', assistantCoach: '' }, roster: [],
    },
    awaySelection: {
      teamId: 'a', archivedTeamId: overrides.awayArchivedTeamId, teamName: overrides.awayName,
      source: overrides.awayArchivedTeamId ? 'archived_team' : 'manual_entry',
      staff: { headCoach: '', assistantCoach: '' }, roster: [],
    },
    phase: 'not_started',
    events: [],
    createdAt: 0,
    updatedAt: 0,
  } as unknown as MatchProject;
}

describe('getFocusTeamSide', () => {
  it('resolves via archivedTeamId when provided', () => {
    const match = makeMatch({ id: '1', homeName: 'Home FC', awayName: 'Away FC', homeArchivedTeamId: 'team-1', awayArchivedTeamId: 'team-2' });
    assert.strictEqual(getFocusTeamSide(match, 'team-1'), 'home');
    assert.strictEqual(getFocusTeamSide(match, 'team-2'), 'away');
  });

  it('falls back to normalized name matching when no teamId is given', () => {
    const match = makeMatch({ id: '1', homeName: '  Home FC ', awayName: 'Away FC' });
    assert.strictEqual(getFocusTeamSide(match, undefined, 'home fc'), 'home');
    assert.strictEqual(getFocusTeamSide(match, undefined, 'AWAY FC'), 'away');
  });
});

describe('filterMatchesForTeam', () => {
  it('filters by archivedTeamId across both sides', () => {
    const m1 = makeMatch({ id: '1', homeName: 'A', awayName: 'B', homeArchivedTeamId: 'team-1' });
    const m2 = makeMatch({ id: '2', homeName: 'C', awayName: 'D', awayArchivedTeamId: 'team-1' });
    const m3 = makeMatch({ id: '3', homeName: 'E', awayName: 'F', homeArchivedTeamId: 'team-9' });
    const result = filterMatchesForTeam([m1, m2, m3], 'team-1');
    assert.deepStrictEqual(result.map((m) => m.metadata.id), ['1', '2']);
  });

  it('falls back to name matching when teamId is absent', () => {
    const m1 = makeMatch({ id: '1', homeName: 'Home FC', awayName: 'B' });
    const m2 = makeMatch({ id: '2', homeName: 'C', awayName: 'home fc' });
    const m3 = makeMatch({ id: '3', homeName: 'Other', awayName: 'Team' });
    const result = filterMatchesForTeam([m1, m2, m3], undefined, 'Home FC');
    assert.deepStrictEqual(result.map((m) => m.metadata.id), ['1', '2']);
  });
});
