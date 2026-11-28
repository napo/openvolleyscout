// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it, vi } from 'vitest';
import { createEmptyMatchProject } from '@src/domain/match';
import type { ArchivedPlayer, ArchivedTeam } from '@src/domain/team/types';
import {
  buildCompetitionsByTeamId,
  compareTeamsForMerge,
  executeTeamMerge,
  findSimilarTeamGroups,
} from './team-merge';

function makeTeam(id: string, name: string, teamCode = id.toUpperCase()): ArchivedTeam {
  return {
    id,
    teamCode,
    name,
    staff: { headCoach: '', assistantCoach: '' },
    rosterIds: [`roster-${id}`],
    createdAt: 1,
    updatedAt: 1,
  };
}

function makePlayer(id: string, jerseyNumber: number, firstName: string, lastName: string): ArchivedPlayer {
  return {
    id,
    jerseyNumber,
    firstName,
    lastName,
    playerCode: `${lastName.toUpperCase()}-${jerseyNumber}`,
  };
}

describe('team merge', () => {
  it('groups teams with similar names and ignores unrelated names', () => {
    const t1 = makeTeam('t1', 'Volley Milano');
    const t2 = makeTeam('t2', 'Volley  Milano!');
    const t3 = makeTeam('t3', 'Trentino Volley');
    const groups = findSimilarTeamGroups([t1, t2, t3]);
    expect(groups).toHaveLength(1);
    expect(groups[0].teams.map((t) => t.id).sort()).toEqual(['t1', 't2']);
  });

  it('collects competitions per team from matches', () => {
    const demo = createEmptyMatchProject();
    demo.metadata.competition = 'Serie A1';
    demo.homeSelection.archivedTeamId = 'team-a';
    demo.awaySelection.archivedTeamId = 'team-b';

    const comps = buildCompetitionsByTeamId([demo]);
    expect(comps.get('team-a')).toEqual(['Serie A1']);
    expect(comps.get('team-b')).toEqual(['Serie A1']);
  });

  it('classifies matching roster and overlapping matches as duplicate, and different rosters as needs_info', () => {
    const tA = makeTeam('tA', 'Club Roma');
    const tB = makeTeam('tB', 'Club Roma A1');
    const rosterA = [makePlayer('p1', 1, 'Elena', 'Rossi'), makePlayer('p2', 7, 'Sara', 'Bianchi')];
    const rosterB = [makePlayer('p3', 1, 'Elena', 'Rossi'), makePlayer('p4', 7, 'Sara', 'Bianchi')];
    const rosterDifferent = [makePlayer('p5', 4, 'Giulia', 'Verdi'), makePlayer('p6', 9, 'Anna', 'Neri')];

    const mA = createEmptyMatchProject();
    mA.metadata.id = 'mA';
    mA.metadata.playedAt = '2026-10-12T18:00:00';
    mA.metadata.competition = 'Serie A1';
    mA.homeSelection.archivedTeamId = 'tA';
    mA.awaySelection.teamName = 'Modena';

    const mB = createEmptyMatchProject();
    mB.metadata.id = 'mB';
    mB.metadata.playedAt = '2026-10-12T18:00:00';
    mB.metadata.competition = 'Serie A1';
    mB.homeSelection.archivedTeamId = 'tB';
    mB.awaySelection.teamName = 'Modena';

    const dup = compareTeamsForMerge(tA, rosterA, tB, rosterB, [mA, mB]);
    expect(dup.verdict).toBe('duplicate');
    expect(dup.overlappingMatches).toHaveLength(1);

    const diff = compareTeamsForMerge(tA, rosterA, tB, rosterDifferent, [mA, mB]);
    expect(diff.verdict).toBe('needs_info');
  });

  it('merges teams, remaps matches, and deletes discarded team', async () => {
    const tA = makeTeam('tA', 'Club Roma');
    const tB = makeTeam('tB', 'Club Roma Copia');
    const rosters = new Map<string, ArchivedPlayer[]>([
      ['tA', [makePlayer('p1', 1, 'Elena', 'Rossi')]],
      ['tB', [makePlayer('p2', 1, 'Elena', 'Rossi'), makePlayer('p3', 5, 'Marta', 'Neri')]],
    ]);
    const teams = new Map<string, ArchivedTeam>([['tA', tA], ['tB', tB]]);
    const match = createEmptyMatchProject();
    match.homeSelection.archivedTeamId = 'tB';
    match.homeSelection.teamId = 'tB';
    const matches = [match];

    const res = await executeTeamMerge('tA', 'tB', {
      getTeamAggregate: async (id) => {
        const team = teams.get(id);
        return team ? { team, roster: { players: rosters.get(id) ?? [] } } : null;
      },
      updateTeam: async (id, updates) => {
        if (updates.players) rosters.set(id, updates.players);
      },
      deleteTeam: async (id) => {
        teams.delete(id);
      },
      listMatches: async () => matches,
      updateMatch: async (updated) => {
        matches[0] = updated;
      },
    });

    expect(res.updatedMatches).toBe(1);
    expect(res.mergedPlayers).toBe(2);
    expect(teams.has('tB')).toBe(false);
    expect(matches[0].homeSelection.archivedTeamId).toBe('tA');
  });

  it('gives the photo of a merged athlete to the kept athlete when that one has none', async () => {
    const teams = new Map<string, ArchivedTeam>([['tA', makeTeam('tA', 'Club Roma')], ['tB', makeTeam('tB', 'Club Roma Copia')]]);
    const rosters = new Map<string, ArchivedPlayer[]>([
      ['tA', [makePlayer('a1', 1, 'Elena', 'Rossi'), makePlayer('a2', 7, 'Sara', 'Bianchi')]],
      ['tB', [makePlayer('b1', 1, 'Elena', 'Rossi'), makePlayer('b2', 7, 'Sara', 'Bianchi'), makePlayer('b3', 5, 'Marta', 'Neri')]],
    ]);
    // a2 has her own photo: it stays. b3 is a new athlete of the kept team: she keeps her id and photo.
    const photos = new Map([['b1', 'data:image/png;base64,B1'], ['b2', 'data:image/png;base64,B2'], ['a2', 'data:image/png;base64,A2'], ['b3', 'data:image/png;base64,B3']]);
    const asked: string[][] = [];
    const written: Array<Map<string, string | null>> = [];
    await executeTeamMerge('tA', 'tB', {
      getTeamAggregate: async (id) => {
        const team = teams.get(id);
        return team ? { team, roster: { players: rosters.get(id) ?? [] } } : null;
      },
      updateTeam: async (id, updates) => { if (updates.players) rosters.set(id, updates.players); },
      deleteTeam: async (id) => { teams.delete(id); },
      listMatches: async () => [],
      updateMatch: async () => undefined,
      loadPhotos: async (ids) => { asked.push([...ids].sort()); return new Map(ids.flatMap((id) => (photos.has(id) ? [[id, photos.get(id)!] as const] : []))); },
      savePhotoChanges: async (changes) => { written.push(new Map(changes)); },
    });
    expect(asked).toEqual([['a1', 'a2', 'b1', 'b2']]);
    expect(written).toEqual([new Map<string, string | null>([['a1', 'data:image/png;base64,B1'], ['b1', null], ['b2', null]])]);
    expect(teams.has('tB')).toBe(false);
  });

  it('still merges when the photos cannot be moved', async () => {
    const teams = new Map<string, ArchivedTeam>([['tA', makeTeam('tA', 'Club Roma')], ['tB', makeTeam('tB', 'Club Roma Copia')]]);
    const rosters = new Map<string, ArchivedPlayer[]>([['tA', [makePlayer('a1', 1, 'Elena', 'Rossi')]], ['tB', [makePlayer('b1', 1, 'Elena', 'Rossi')]]]);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const res = await executeTeamMerge('tA', 'tB', {
      getTeamAggregate: async (id) => {
        const team = teams.get(id);
        return team ? { team, roster: { players: rosters.get(id) ?? [] } } : null;
      },
      updateTeam: async () => undefined,
      deleteTeam: async (id) => { teams.delete(id); },
      listMatches: async () => [],
      updateMatch: async () => undefined,
      loadPhotos: async () => { throw new Error('no database'); },
      savePhotoChanges: async () => undefined,
    });
    expect(res.mergedPlayers).toBe(1);
    expect(teams.has('tB')).toBe(false);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
