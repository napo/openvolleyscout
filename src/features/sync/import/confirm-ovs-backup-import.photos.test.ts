// SPDX-License-Identifier: AGPL-3.0-or-later
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ArchivedPlayer, ArchivedRoster, ArchivedTeam } from '@src/domain/team/types';
import { matchProjectDb } from '@src/infrastructure/db/match-project-db';
import { teamRepository } from '@src/infrastructure/repositories/team-repository';
import { loadAthletePhotos, saveAthletePhoto } from '@src/features/branding/athlete-photo-storage';
import { athletePhotoAssetId } from '@src/features/branding/athlete-photos';
import type { OvsBackupImportPreview } from './build-ovs-backup-preview';
import { confirmOvsBackupImport } from './confirm-ovs-backup-import';

const PHOTO_A = 'data:image/jpeg;base64,QUFB';
const PHOTO_B = 'data:image/png;base64,QkJC';
const PHOTO_C = 'data:image/png;base64,Q0ND';

const player = (id: string, jerseyNumber: number, firstName: string, lastName: string): ArchivedPlayer =>
  ({ id, jerseyNumber, firstName, lastName, playerCode: '' });

function backupOf(team: ArchivedTeam, roster: ArchivedRoster, photos: Array<[string, string]>): OvsBackupImportPreview {
  const snapshot = { teams: [team], rosters: [roster], competitions: [], opponentReports: [] };
  return {
    peerDeviceId: 'device-a',
    matchPreviews: [],
    archivePreview: { local: { teams: [], rosters: [], competitions: [] }, remote: snapshot, result: { merged: snapshot, conflicts: [] } },
    systemsPreview: { receptionSystems: [], defenseSystems: [], added: 0, unchanged: 0 },
    appAssetsPreview: {
      records: photos.map(([id, value]) => ({ id: athletePhotoAssetId(id), kind: 'image', value, updatedAt: '2026-11-01T00:00:00.000Z' })),
      added: photos.length,
      unchanged: 0,
    },
  };
}

beforeEach(async () => {
  await Promise.all(matchProjectDb.tables.map((table) => table.clear()));
});

describe('athlete photos in a backup restored into a team that is here under another id', () => {
  it('gives the photo of a merged athlete to the athlete here, unless she has one', async () => {
    const local = await teamRepository.create({
      name: 'Volley X',
      staff: { headCoach: '', assistantCoach: '' },
      players: [player('here-rossi', 7, 'Anna', 'Rossi'), player('here-verdi', 9, 'Bea', 'Verdi')],
    });
    await saveAthletePhoto('here-verdi', PHOTO_C);
    const team: ArchivedTeam = { ...local.team, id: 'team-from-a', rosterIds: ['roster-from-a'] };
    const roster: ArchivedRoster = {
      id: 'roster-from-a',
      teamId: 'team-from-a',
      players: [player('a-rossi', 7, 'Anna', 'Rossi'), player('a-verdi', 9, 'Bea', 'Verdi'), player('a-neri', 4, 'Cia', 'Neri')],
    };

    await confirmOvsBackupImport(backupOf(team, roster, [['a-rossi', PHOTO_A], ['a-verdi', PHOTO_B], ['a-neri', PHOTO_A]]));

    const players = (await teamRepository.getById(local.team.id))!.roster.players.map((entry) => entry.id);
    expect(players).toEqual(['here-rossi', 'here-verdi', 'a-neri']);
    expect(await loadAthletePhotos(['here-rossi', 'here-verdi', 'a-neri', 'a-rossi', 'a-verdi'])).toEqual(new Map([
      // Rossi had no photo here: she gets the one of the backup.
      ['here-rossi', PHOTO_A],
      // Verdi keeps her own; the copy from the backup is not stored under an id no roster uses.
      ['here-verdi', PHOTO_C],
      // A new athlete keeps her id and her photo.
      ['a-neri', PHOTO_A],
    ]));
  });
});
