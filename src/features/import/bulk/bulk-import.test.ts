import { filterAndSortTableRows } from '@src/components/InteractiveDataTable';
// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { MatchProject } from '@src/domain/match/types';
import type { ArchivedRoster, ArchivedTeam } from '@src/domain/team/types';
import type { DataVolleyTeamPersistenceRepository } from '../persistence/types';
import {
  resolveBulkProblemRow,
  runBulkImportPass,
  type BulkImportDeps,
  type BulkImportProblemRow,
} from './bulk-import';

function memoryDeps(initialMatches: MatchProject[] = []): BulkImportDeps & { matches: MatchProject[] } {
  const matches = [...initialMatches];
  const teams = new Map<string, ArchivedTeam>();
  const rosters = new Map<string, ArchivedRoster>();

  const teamRepo: DataVolleyTeamPersistenceRepository = {
    list: async () => [...teams.values()],
    getById: async (id) => {
      const team = teams.get(id);
      const roster = rosters.get(id);
      return team && roster ? { team, roster } : null;
    },
    create: async (input) => {
      const id = `team-${teams.size + 1}`;
      const rosterId = `roster-${teams.size + 1}`;
      const team: ArchivedTeam = {
        id,
        teamCode: `T${teams.size + 1}`,
        name: input.name,
        staff: input.staff ?? { headCoach: '', assistantCoach: '' },
        rosterIds: [rosterId],
        createdAt: 1,
        updatedAt: 1,
      };
      const roster: ArchivedRoster = {
        id: rosterId,
        teamId: team.id,
        players: input.players ?? [],
      };
      teams.set(team.id, team);
      rosters.set(team.id, roster);
      return { team, roster };
    },
    update: async (id, input) => {
      const prev = teams.get(id);
      const prevRoster = rosters.get(id);
      if (!prev || !prevRoster) {
        throw new Error(`Team not found: ${id}`);
      }
      const team: ArchivedTeam = {
        ...prev,
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.staff !== undefined ? { staff: input.staff } : {}),
        updatedAt: prev.updatedAt + 1,
      };
      const roster: ArchivedRoster = {
        ...prevRoster,
        players: input.players ?? prevRoster.players,
      };
      teams.set(id, team);
      rosters.set(id, roster);
      return { team, roster };
    },
  };

  return {
    matches,
    matchRepo: {
      list: async () => [...matches],
      create: async (project) => {
        matches.push(project);
        return project;
      },
      delete: async (id) => {
        const idx = matches.findIndex((m) => m.metadata.id === id);
        if (idx >= 0) matches.splice(idx, 1);
      },
    },
    teamRepo,
  };
}

function makeFile(name: string, bytes: Uint8Array | string): File {
  const buf = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes;
  const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return {
    name,
    arrayBuffer: async () => arrayBuffer,
  } as unknown as File;
}

describe('bulk import', () => {
  it('auto-imports clean files and puts duplicates and broken files into problems', async () => {
    const dvwBytes = readFileSync('public/samples/demo-melodic-spikers-hollywood-blockers.dvw');
    const f1 = makeFile('clean-1.dvw', dvwBytes);
    const f2 = makeFile('duplicate-2.dvw', dvwBytes);
    const f3 = makeFile('broken.dvw', 'not a valid dvw file');

    const deps = memoryDeps();
    const progressSteps: number[] = [];
    const res = await runBulkImportPass([f1, f2, f3], {
      ...deps,
      onProgress: (p) => progressSteps.push(p.processed),
    });

    expect(progressSteps[0]).toBe(0);
    expect(progressSteps[progressSteps.length - 1]).toBe(3);

    expect(res.total).toBe(3);
    expect(res.autoImportedCount).toBe(1);
    expect(deps.matches).toHaveLength(1);
    expect(res.problems).toHaveLength(2);
    expect(res.problems[0].issueKind).toBe('duplicate_match');
    expect(res.problems[1].issueKind).toBe('validation_error');

    // Resolving duplicate with 'copy' imports a second copy; 'overwrite' replaces it.
    const copied = await resolveBulkProblemRow(res.problems[0], 'copy', deps);
    expect(copied.imported).toBe(true);
    expect(deps.matches).toHaveLength(2);
  });

  it('filters across all columns and sorts ascending/descending', () => {
    const rows: BulkImportProblemRow[] = [
      {
        id: '1',
        file: makeFile('b.dvw', ''),
        fileName: 'b.dvw',
        format: 'dvw',
        matchLabel: 'Alpha - Beta',
        issueKind: 'duplicate_match',
        issueSummary: '1 duplicate(s)',
        decision: 'skip',
        availableDecisions: ['overwrite', 'copy', 'skip'],
      },
      {
        id: '2',
        file: makeFile('a.ovs', ''),
        fileName: 'a.ovs',
        format: 'ovs',
        matchLabel: 'Gamma - Delta',
        issueKind: 'ovs_conflict',
        issueSummary: 'No common base',
        decision: 'use_remote',
        availableDecisions: ['use_remote', 'keep_local', 'skip'],
      },
    ];

    // The table is the shared one: its search and sort read the columns' text.
    const columns = [
      { key: 'fileName', label: 'File', text: (row: (typeof rows)[number]) => row.fileName },
      { key: 'matchLabel', label: 'Match', text: (row: (typeof rows)[number]) => row.matchLabel },
    ];
    const filtered = filterAndSortTableRows(rows, columns, 'gamma', 'fileName', 'asc');
    expect(filtered.map((r) => r.id)).toEqual(['2']);

    const sortedDesc = filterAndSortTableRows(rows, columns, '', 'fileName', 'desc');
    expect(sortedDesc.map((r) => r.fileName)).toEqual(['b.dvw', 'a.ovs']);
  });
});
