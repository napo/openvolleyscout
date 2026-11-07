import type { ArchivedPlayer } from '@src/domain/team/types';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseDataVolleyFile } from '../parser/datavolley-parser';
import { mapDataVolleyMatchToOvsProject } from '../mapping/datavolley-to-ovs';
import { linkDataVolleyProjectToPersistedTeams, persistDataVolleyImportedTeams, previewDataVolleyTeamPersistence } from './datavolley-team-persistence';
import type { DataVolleyPersistedTeam, DataVolleyTeamPersistenceRepository, DataVolleyTeamRepositoryRecord } from './types';
import { getMatchRoster } from '@src/domain/match/helpers';
import { buildProjectMatchStats } from '@src/features/scouting/model/project-match-stats';
import { computeAttackingReportMetrics } from '@src/features/opponent-reports/model/attacking-metrics';

describe('DataVolley archive linking', () => {
  it('preserves both teams’ setter references and side-out distribution after replacing roster IDs', () => {
    const { project } = mapDataVolleyMatchToOvsProject(parseDataVolleyFile(readFileSync('public/samples/new_test.dvw')));
    const teams = (['home', 'away'] as const).map(side => ({
      side,
      team: { id: `archive-${side}`, name: project[`${side}Team`].name },
      playerIdMap: Object.fromEntries(getMatchRoster(project, side).map(player => [player.id, `archive-${side}-${player.jerseyNumber}`])),
    })) as DataVolleyPersistedTeam[];
    const linked = linkDataVolleyProjectToPersistedTeams(project, teams);
    for (let index = 0; index < project.events.length; index++) {
      const original = project.events[index], rewritten = linked.events[index];
      if (original.type !== 'touch_recorded' || rewritten.type !== 'touch_recorded') continue;
      for (const side of ['home', 'away'] as const) {
        const field = `${side}SetterPlayerId` as const;
        const id = original.touch[field];
        if (id) expect(rewritten.touch[field]).toBe(teams.find(team => team.side === side)!.playerIdMap[id]);
      }
    }
    const choices = (input: typeof project, side: 'home' | 'away') => {
      const stats = buildProjectMatchStats(input);
      return computeAttackingReportMetrics([{matchId: input.metadata.id, side, events: input.events, rallies: stats.rallyStats, rotationStats: stats.rotationStats[side], roster: getMatchRoster(input, side)}]).setters.map(setter => ({player: setter.player.jersey, rotations: setter.rotations}));
    };
    for (const side of ['home', 'away'] as const) {
      const before = choices(project, side);
      expect(before.length).toBeGreaterThan(0);
      const withoutArchiveKeys = (value: unknown) => JSON.parse(JSON.stringify(value, (key, entry) => key === 'key' ? undefined : entry));
      expect(withoutArchiveKeys(choices(linked, side))).toEqual(withoutArchiveKeys(before));
    }
  });
});

// The archive is in memory: reconciliation must finish before either team is written.
function reconciliationFixture() {
  const { project } = mapDataVolleyMatchToOvsProject(parseDataVolleyFile(readFileSync('public/samples/new_test.dvw')));
  const imported = project.homeSelection.roster[0];
  const players: ArchivedPlayer[] = project.homeSelection.roster.map(player => ({...player, id: `saved-${player.id}`}));
  players[0].jerseyNumber = 99;
  const originalId = players[0].id;
  // The new jersey is already occupied by somebody else in the historical roster.
  players.push({...players[0], id: 'another-person', jerseyNumber: imported.jerseyNumber, firstName: 'Another', lastName: 'Person'});
  const records: DataVolleyTeamRepositoryRecord[] = [{team: {id: 'saved-home', teamCode: 'HOME', rosterIds: ['roster-home'], createdAt: 0, name: project.homeSelection.teamName, updatedAt: 0, staff: {headCoach: '', assistantCoach: ''}}, roster: {id: 'roster-home', teamId: 'saved-home', players}}];
  let writes = 0;
  const repository: DataVolleyTeamPersistenceRepository = {
    list: async () => records.map(record => record.team),
    getById: async (id: string) => records.find(record => record.team.id === id) ?? null,
    update: async (id, changes) => {
      writes++;
      const record = records.find(record => record.team.id === id)!;
      if (changes.players) record.roster.players = changes.players;
      if (changes.staff) record.team.staff = changes.staff;
      return record;
    },
    create: async (input) => {
      writes++;
      const id = `team-${records.length}`;
      const record = {team: {id, teamCode: id, rosterIds: [`roster-${id}`], createdAt: 0, name: input.name, updatedAt: 0, staff: input.staff ?? {headCoach: '', assistantCoach: ''}}, roster: {id: `roster-${id}`, teamId: id, players: input.players ?? []}};
      records.push(record); return record;
    },
  };
  return {project, imported, originalId, repository, records, writes: () => writes};
}


describe('player identity reconciliation', () => {
  it('asks before merging names with different jerseys and writes nothing without a decision', async () => {
    const fixture = reconciliationFixture();
    const repository = fixture.repository;
    const preview = await previewDataVolleyTeamPersistence(fixture.project, repository);
    const item = preview.teamPreviews[0].playerReconciliations![0];
    expect(item.imported.jerseyNumber).toBe(fixture.imported.jerseyNumber);
    expect(item.candidates[0]).toMatchObject({id: fixture.originalId, jerseyNumber: 99});
    await expect(persistDataVolleyImportedTeams(fixture.project, repository)).rejects.toThrow('Player reconciliation required');
    expect(fixture.writes()).toBe(0);
  });

  it('links the chosen identity despite a jersey collision, preserving each match jersey', async () => {
    const fixture = reconciliationFixture();
    const repository = fixture.repository;
    const preview = await previewDataVolleyTeamPersistence(fixture.project, repository);
    const item = preview.teamPreviews[0].playerReconciliations![0];
    const result = await persistDataVolleyImportedTeams(fixture.project, repository, {[item.key]: {action: 'merge', playerId: fixture.originalId}});
    expect(result.project.homeSelection.roster[0]).toMatchObject({id: fixture.originalId, jerseyNumber: fixture.imported.jerseyNumber});
    expect(fixture.records[0].roster.players.find(player => player.id === fixture.originalId)?.jerseyNumber).toBe(99);
    expect(fixture.records[0].roster.players.filter(player => player.firstName === fixture.imported.firstName && player.lastName === fixture.imported.lastName)).toHaveLength(1);
  });

  it('keeps homonyms distinct and retains identifying details in subsequent proposals', async () => {
    const fixture = reconciliationFixture();
    const repository = fixture.repository;
    const preview = await previewDataVolleyTeamPersistence(fixture.project, repository);
    const item = preview.teamPreviews[0].playerReconciliations![0];
    await expect(persistDataVolleyImportedTeams(fixture.project, repository, {[item.key]: {action: 'distinct'}})).rejects.toThrow('Player reconciliation required');
    expect(fixture.writes()).toBe(0);
    const result = await persistDataVolleyImportedTeams(fixture.project, repository, {[item.key]: {action: 'distinct', birthYear: '2004', note: 'Youth team', role: 'outside_hitter'}});
    const newId = result.project.homeSelection.roster[0].id;
    expect(newId).not.toBe(fixture.originalId);
    const again = await previewDataVolleyTeamPersistence(fixture.project, repository);
    expect(again.teamPreviews[0].playerReconciliations![0].candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({id: fixture.originalId}),
      expect.objectContaining({id: newId, birthYear: 2004, notes: 'Youth team', role: 'outside_hitter'}),
    ]));
    const counts = fixture.records[0].roster.players.length;
    await persistDataVolleyImportedTeams(fixture.project, repository, {[item.key]: {action: 'merge', playerId: newId}});
    expect(fixture.records[0].roster.players).toHaveLength(counts);
  });
});
