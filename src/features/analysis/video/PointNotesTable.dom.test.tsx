// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '@src/i18n';
import { createEmptyMatchProject } from '@src/domain/match';
import { createPointNote } from '@src/domain/video/point-notes';
import type { MatchProject } from '@src/domain/match/types';
import { PointNotesTable } from './PointNotesTable';

afterEach(() => cleanup());

function projectWithNotes(): MatchProject {
  const project = createEmptyMatchProject();
  const notes = Array.from({ length: 12 }, (_, index) => createPointNote({
    id: `n-${index}`,
    touchId: index === 0 ? 't1' : undefined,
    setNumber: 1,
    rallyNumber: index + 1,
    homeScore: index + 1,
    awayScore: 0,
    tags: [index % 2 === 0 ? 'funny_gesture' : 'double_touch'],
    text: index === 3 ? 'Esultanza strana' : '',
    createdAt: 10_000 + index * 1000,
  }));
  const touchEvent = {
    id: 'e1',
    type: 'touch_recorded' as const,
    createdAt: 1000,
    touch: { id: 't1', setNumber: 1, rallyNumber: 1, sequenceNumber: 1, teamSide: 'home' as const, skill: 'serve' as const, evaluation: '+' as const, recordedAtTime: '00:00:01', createdAt: 1000 },
  };
  return { ...project, events: [touchEvent], videoAnalysis: { ...project.videoAnalysis!, syncPoints: [], starredTouchIds: [], notes } };
}

const renderTable = (props: Partial<Parameters<typeof PointNotesTable>[0]> = {}) => render(
  <I18nProvider><PointNotesTable project={projectWithNotes()} {...props} /></I18nProvider>,
);

describe('point notes table on the shared table', () => {
  it('lists the notes with search, sorting and pages, without row selection', async () => {
    const user = userEvent.setup();
    renderTable();
    const table = screen.getByRole('table');
    // 12 notes, 10 per page.
    expect(within(table).getAllByRole('row')).toHaveLength(1 + 10);
    expect(within(table).queryAllByRole('checkbox')).toHaveLength(0);
    await user.type(screen.getByRole('searchbox'), 'esultanza');
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(2);
  });

  it('sorts by score in both directions', async () => {
    const user = userEvent.setup();
    renderTable();
    const scoreHeader = screen.getAllByRole('button').find((button) => /S\d|Score|Punteggio|Risultato/i.test(button.textContent ?? '') && button.className.includes('sort'));
    expect(scoreHeader).toBeTruthy();
    await user.click(scoreHeader as HTMLElement);
    await user.click(scoreHeader as HTMLElement);
    const firstRow = within(screen.getByRole('table')).getAllByRole('row')[1];
    expect(firstRow.textContent).toContain('12-0');
  });

  it('a click on a row opens the video, a click on the star does not', async () => {
    const user = userEvent.setup();
    const onJumpToNote = vi.fn();
    const onToggleStar = vi.fn();
    renderTable({ videoMode: { starredTouchIds: [], onJumpToNote, onToggleStar } });
    const rows = within(screen.getByRole('table')).getAllByRole('row');
    // Sorted by time, the first row is the note of the recorded touch: it has a star that works.
    await user.click(rows[1]);
    expect(onJumpToNote).toHaveBeenCalledTimes(1);
    await user.click(within(rows[1]).getByRole('button', { pressed: false }));
    expect(onToggleStar).toHaveBeenCalledTimes(1);
    expect(onJumpToNote).toHaveBeenCalledTimes(1);
  });
});
