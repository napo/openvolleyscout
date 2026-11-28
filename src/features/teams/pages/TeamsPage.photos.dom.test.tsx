// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-or-later
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@src/i18n';
import { matchProjectDb } from '@src/infrastructure/db/match-project-db';
import { teamRepository } from '@src/infrastructure/repositories';
import { loadAthletePhoto, loadAthletePhotos, saveAthletePhoto } from '@src/features/branding/athlete-photo-storage';
import { athletePhotoAssetId } from '@src/features/branding/athlete-photos';
import type { ArchivedPlayer } from '@src/domain/team/types';
import { TeamsPage } from './TeamsPage';

const ADA_PHOTO = 'data:image/jpeg;base64,QURB';
const NEW_PHOTO = 'data:image/png;base64,TkVX';

// jsdom cannot decode images: the square crop is tested on its own.
const prepare = vi.hoisted(() => vi.fn());
vi.mock('@src/lib/images/square-photo-file', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@src/lib/images/square-photo-file')>()),
  prepareSquarePhotoDataUrl: prepare,
}));
vi.mock('@src/components/confirm-dialog', () => ({ confirmAction: vi.fn(async () => true) }));
// Writing the photos can be made to fail once, to try saving again.
const photoWrite = vi.hoisted(() => ({ failNext: false }));
vi.mock('@src/features/branding/athlete-photo-storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@src/features/branding/athlete-photo-storage')>();
  return {
    ...actual,
    saveAthletePhotoChanges: async (changes: ReadonlyMap<string, string | null>) => {
      if (photoWrite.failNext) {
        photoWrite.failNext = false;
        throw new Error('The photos could not be written');
      }
      return actual.saveAthletePhotoChanges(changes);
    },
  };
});

function player(id: string, jerseyNumber: number, firstName: string, lastName: string, extra: Partial<ArchivedPlayer> = {}): ArchivedPlayer {
  return { id, jerseyNumber, firstName, lastName, playerCode: `${lastName.toUpperCase()}-${jerseyNumber}`, ...extra };
}

async function createTeam(name: string, players: ArchivedPlayer[]) {
  return (await teamRepository.create({ name, staff: { headCoach: '', assistantCoach: '' }, players })).team.id;
}

function showPage() {
  return render(<MemoryRouter><I18nProvider><TeamsPage /></I18nProvider></MemoryRouter>);
}

async function openTeam(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(await screen.findByRole('button', { name: `Edit ${name}` }));
  await screen.findByRole('heading', { name: 'Edit team' });
}

const rowOf = (name: string) => screen.getByDisplayValue(name).closest('tr') as HTMLElement;
const fileInputOf = (row: HTMLElement) => row.querySelector('input[type="file"]') as HTMLInputElement;

beforeEach(async () => {
  // jsdom has no layout.
  Element.prototype.scrollIntoView = () => undefined;
  window.scrollTo = () => undefined;
  await Promise.all(matchProjectDb.tables.map((table) => table.clear()));
  prepare.mockReset();
  photoWrite.failNext = false;
});

afterEach(cleanup);

describe('athlete photos in the roster of the Teams page', () => {
  it('shows the stored photo, or the drawing of the role, and saves a new photo and a removal with the team', async () => {
    const user = userEvent.setup();
    await createTeam('Volley Roma', [
      player('ada', 1, 'Ada', 'Rossi', { role: 'setter' }),
      player('bea', 2, 'Bea', 'Verdi', { isLibero: true }),
    ]);
    await saveAthletePhoto('ada', ADA_PHOTO);
    showPage();
    await openTeam(user, 'Volley Roma');

    const ada = rowOf('Ada');
    const bea = rowOf('Bea');
    expect(await within(ada).findByRole('img', { name: 'Photo of Ada Rossi' })).toHaveProperty('src', ADA_PHOTO);
    expect(within(ada).getByRole('button', { name: 'Change the photo - Ada Rossi' })).toBeTruthy();
    expect(within(bea).queryByRole('img')).toBeNull();
    expect(bea.querySelector('svg.athlete-silhouette')).not.toBeNull();
    expect(within(bea).getByRole('button', { name: 'Add a photo - Bea Verdi' }).getAttribute('title')).toMatch(/No photo: a drawing for the role is shown/);
    expect(fileInputOf(bea).accept).toBe('image/png,image/jpeg,image/webp');

    prepare.mockResolvedValueOnce(NEW_PHOTO);
    await user.upload(fileInputOf(bea), new File(['x'], 'bea.webp', { type: 'image/webp' }));
    expect(await within(bea).findByRole('img', { name: 'Photo of Bea Verdi' })).toHaveProperty('src', NEW_PHOTO);
    expect(screen.getByText('The photo is saved when you save the team.')).toBeTruthy();
    await user.click(within(ada).getByRole('button', { name: 'Remove the photo - Ada Rossi' }));
    expect(within(ada).queryByRole('img')).toBeNull();

    // Nothing is written before the team is saved.
    expect(await loadAthletePhotos(['ada', 'bea'])).toEqual(new Map([['ada', ADA_PHOTO]]));
    await user.click(screen.getByRole('button', { name: 'Save team' }));
    await screen.findByText(/Team saved/);
    expect(await loadAthletePhotos(['ada', 'bea'])).toEqual(new Map([['bea', NEW_PHOTO]]));
    // The removal is remembered for cloud sync.
    expect(await matchProjectDb.syncDeletions.get(`appAssets:${athletePhotoAssetId('ada')}`)).toBeTruthy();
  });

  it('drops the photo changes when the edit is cancelled', async () => {
    const user = userEvent.setup();
    await createTeam('Volley Roma', [player('ada', 1, 'Ada', 'Rossi')]);
    showPage();
    await openTeam(user, 'Volley Roma');
    prepare.mockResolvedValueOnce(NEW_PHOTO);
    await user.upload(fileInputOf(rowOf('Ada')), new File(['x'], 'ada.png', { type: 'image/png' }));
    await within(rowOf('Ada')).findByRole('img');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await openTeam(user, 'Volley Roma');
    expect(rowOf('Ada').querySelector('svg.athlete-silhouette')).not.toBeNull();
    expect(await loadAthletePhoto('ada')).toBeNull();
  });

  it('says when a file is not an image, and keeps the drawing', async () => {
    const user = userEvent.setup();
    await createTeam('Volley Roma', [player('ada', 1, 'Ada', 'Rossi')]);
    showPage();
    await openTeam(user, 'Volley Roma');
    prepare.mockResolvedValueOnce(null);
    await user.upload(fileInputOf(rowOf('Ada')), new File(['x'], 'notes.png', { type: 'image/png' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Ada Rossi: This file is not an image that can be used.');
    const thumb = within(rowOf('Ada')).getByRole('button', { name: 'Add a photo - Ada Rossi' });
    expect(thumb.className).toContain('is-error');
    expect(thumb.getAttribute('title')).toMatch(/^This file is not an image that can be used\./);
    expect(within(rowOf('Ada')).queryByRole('img')).toBeNull();
    // A good file clears the message.
    prepare.mockResolvedValueOnce(NEW_PHOTO);
    await user.upload(fileInputOf(rowOf('Ada')), new File(['x'], 'ada.png', { type: 'image/png' }));
    await within(rowOf('Ada')).findByRole('img');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('gives a photo to an athlete added in the same edit, and removes the photo of an athlete taken off the roster', async () => {
    const user = userEvent.setup();
    const teamId = await createTeam('Volley Roma', [player('ada', 1, 'Ada', 'Rossi'), player('bea', 2, 'Bea', 'Verdi')]);
    await saveAthletePhoto('bea', ADA_PHOTO);
    showPage();
    await openTeam(user, 'Volley Roma');
    await within(rowOf('Bea')).findByRole('img');
    await user.click(within(rowOf('Bea')).getByRole('button', { name: 'Remove player' }));

    await user.click(within(document.querySelector('.teams-roster__actions') as HTMLElement).getByRole('button', { name: 'Add' }));
    const rows = screen.getAllByRole('row');
    const added = rows[rows.length - 1];
    await user.type(within(added).getByRole('spinbutton'), '9');
    prepare.mockResolvedValueOnce(NEW_PHOTO);
    await user.upload(fileInputOf(added), new File(['x'], 'new.png', { type: 'image/png' }));
    await within(added).findByRole('img');
    await user.click(screen.getByRole('button', { name: 'Save team' }));
    await screen.findByText(/Team saved/);

    const roster = (await teamRepository.getById(teamId))!.roster.players;
    const newId = roster.find((entry) => entry.jerseyNumber === 9)!.id;
    expect(roster.map((entry) => entry.id)).toEqual(['ada', newId]);
    expect(await loadAthletePhotos(['ada', 'bea', newId])).toEqual(new Map([[newId, NEW_PHOTO]]));
  });

  it('saving again after the photos could not be written still removes the photo of an athlete taken off the roster', async () => {
    const user = userEvent.setup();
    const teamId = await createTeam('Volley Roma', [player('ada', 1, 'Ada', 'Rossi'), player('bea', 2, 'Bea', 'Verdi')]);
    await saveAthletePhoto('ada', ADA_PHOTO);
    showPage();
    await openTeam(user, 'Volley Roma');
    await within(rowOf('Ada')).findByRole('img');
    await user.click(within(rowOf('Ada')).getByRole('button', { name: 'Remove player' }));
    prepare.mockResolvedValueOnce(NEW_PHOTO);
    await user.upload(fileInputOf(rowOf('Bea')), new File(['x'], 'bea.png', { type: 'image/png' }));
    await within(rowOf('Bea')).findByRole('img');

    photoWrite.failNext = true;
    await user.click(screen.getByRole('button', { name: 'Save team' }));
    await screen.findByText('Unable to save this team right now.');
    expect((await teamRepository.getById(teamId))!.roster.players.map((entry) => entry.id)).toEqual(['bea']);
    expect(await loadAthletePhotos(['ada', 'bea'])).toEqual(new Map([['ada', ADA_PHOTO]]));

    await user.click(screen.getByRole('button', { name: 'Save team' }));
    await screen.findByText(/Team saved/);
    expect(await loadAthletePhotos(['ada', 'bea'])).toEqual(new Map([['bea', NEW_PHOTO]]));
    expect(await matchProjectDb.syncDeletions.get(`appAssets:${athletePhotoAssetId('ada')}`)).toBeTruthy();
  });

  it('removes the photos of the athletes of a deleted team', async () => {
    const user = userEvent.setup();
    const romaId = await createTeam('Volley Roma', [player('ada', 1, 'Ada', 'Rossi')]);
    // An older roster of the same team (from a backup or another device): deleting the team removes it too.
    await teamRepository.restoreRoster({ id: '0000-older', teamId: romaId, players: [player('old', 5, 'Ola', 'Bianchi')] });
    expect((await teamRepository.getById(romaId))!.roster.players.map((entry) => entry.id)).toEqual(['ada']);
    await createTeam('Volley Pisa', [player('cia', 3, 'Cia', 'Neri')]);
    await saveAthletePhoto('ada', ADA_PHOTO);
    await saveAthletePhoto('old', ADA_PHOTO);
    await saveAthletePhoto('cia', NEW_PHOTO);
    showPage();
    await user.click(await screen.findByRole('button', { name: 'Delete Volley Roma' }));
    await waitFor(async () => expect(await loadAthletePhoto('ada')).toBeNull());
    expect(await loadAthletePhoto('old')).toBeNull();
    expect(await loadAthletePhoto('cia')).toBe(NEW_PHOTO);
  });
});
