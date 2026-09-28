import { describe, expect, it } from 'vitest';
import type { ArchivedPlayer } from '../team/types';
import type { MatchRosterPlayer, MatchTeamSelection } from './types';
import {
  addJerseyPlayerToSelection,
  applyArchivedNamesToSelection,
  getMatchRosterPlayerKey,
  isSelectionForArchivedTeam,
} from './roster-sync';

function rosterPlayer(overrides: Partial<MatchRosterPlayer>): MatchRosterPlayer {
  return {
    id: 'p',
    jerseyNumber: 1,
    firstName: '',
    lastName: '',
    shortName: '',
    playerCode: '#1',
    source: 'manual_entry',
    ...overrides,
  };
}

function selection(roster: MatchRosterPlayer[], overrides: Partial<MatchTeamSelection> = {}): MatchTeamSelection {
  return {
    teamId: 'team',
    teamName: 'Opponents',
    source: 'manual_entry',
    staff: { headCoach: '', assistantCoach: '' },
    roster,
    ...overrides,
  };
}

function archived(overrides: Partial<ArchivedPlayer>): ArchivedPlayer {
  return { id: 'a', jerseyNumber: 1, firstName: '', lastName: '', playerCode: '---', ...overrides };
}

describe('addJerseyPlayerToSelection', () => {
  it('adds an unnamed player by jersey number', () => {
    const result = addJerseyPlayerToSelection(selection([]), { jerseyNumber: 12, isLibero: true });
    expect(result.status).toBe('added');
    if (result.status !== 'added') return;
    expect(result.selection.roster).toHaveLength(1);
    expect(result.player).toMatchObject({ jerseyNumber: 12, isLibero: true, role: 'libero', firstName: '', lastName: '' });
    expect(getMatchRosterPlayerKey(result.player)).toBe(result.player.id);
  });

  it('reuses the archive player (id and name) with the same jersey', () => {
    const result = addJerseyPlayerToSelection(selection([]), {
      jerseyNumber: 7,
      isLibero: false,
      archivedPlayer: archived({ id: 'arch-7', jerseyNumber: 7, firstName: 'Yuki', lastName: 'Sato', playerCode: 'YUK-SAT' }),
      archivedTeamId: 'arch-team',
    });
    if (result.status !== 'added') throw new Error('expected added');
    expect(result.player).toMatchObject({ id: 'arch-7', archivedPlayerId: 'arch-7', firstName: 'Yuki', lastName: 'Sato', shortName: 'Y. Sato' });
    expect(result.selection.archivedTeamId).toBe('arch-team');
  });

  it('refuses a jersey that is already in the roster', () => {
    const existing = rosterPlayer({ id: 'x', jerseyNumber: 5 });
    const result = addJerseyPlayerToSelection(selection([existing]), { jerseyNumber: 5, isLibero: false });
    expect(result).toEqual({ status: 'duplicate', player: existing });
  });
});

describe('applyArchivedNamesToSelection', () => {
  it('fills names of linked players and keeps ids', () => {
    const match = selection([rosterPlayer({ id: 'm1', archivedPlayerId: 'a1', jerseyNumber: 3 })]);
    const { selection: next, changed } = applyArchivedNamesToSelection(match, [
      archived({ id: 'a1', jerseyNumber: 3, firstName: 'Mai', lastName: 'Ito', playerCode: 'MAI-ITO' }),
    ]);
    expect(changed).toBe(true);
    expect(next.roster[0]).toMatchObject({ id: 'm1', archivedPlayerId: 'a1', firstName: 'Mai', lastName: 'Ito', playerCode: 'MAI-ITO' });
  });

  it('fills unnamed, unlinked players by jersey number without relinking them', () => {
    const match = selection([rosterPlayer({ id: 'm9', archivedPlayerId: 'm9', jerseyNumber: 9 })]);
    const { selection: next } = applyArchivedNamesToSelection(match, [
      archived({ id: 'other', jerseyNumber: 9, firstName: 'Rin', lastName: 'Kato', playerCode: 'RIN-KAT' }),
    ]);
    expect(next.roster[0]).toMatchObject({ id: 'm9', archivedPlayerId: 'm9', firstName: 'Rin', lastName: 'Kato' });
  });

  it('does not rename an already named, unlinked player by jersey', () => {
    const match = selection([rosterPlayer({ id: 'm9', archivedPlayerId: 'm9', jerseyNumber: 9, firstName: 'Aya', lastName: 'Mori' })]);
    const result = applyArchivedNamesToSelection(match, [
      archived({ id: 'other', jerseyNumber: 9, firstName: 'Rin', lastName: 'Kato' }),
    ]);
    expect(result.changed).toBe(false);
    expect(result.selection).toBe(match);
  });

  it('ignores archive players that are still unnamed', () => {
    const match = selection([rosterPlayer({ id: 'm1', archivedPlayerId: 'a1' })]);
    expect(applyArchivedNamesToSelection(match, [archived({ id: 'a1' })]).changed).toBe(false);
  });
});

describe('isSelectionForArchivedTeam', () => {
  it('matches by archive id, or by name when the match has no archive link', () => {
    expect(isSelectionForArchivedTeam(selection([], { archivedTeamId: 't1' }), { id: 't1', name: 'X' })).toBe(true);
    expect(isSelectionForArchivedTeam(selection([], { archivedTeamId: 't2', teamName: 'X' }), { id: 't1', name: 'X' })).toBe(false);
    expect(isSelectionForArchivedTeam(selection([], { teamName: ' opponents ' }), { id: 't1', name: 'Opponents' })).toBe(true);
  });
});
