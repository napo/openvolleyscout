// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { createEmptyMatchProject } from '@src/domain/match';
import type { MatchEvent } from '@src/domain/events/types';
import { POINT_NOTE_TAGS, createPointNote } from '@src/domain/video/point-notes';
import { normalizeCustomKeywordList } from '@src/domain/video/custom-point-note-keywords';
import type { BallTouch } from '@src/domain/touch/types';
import {
  POINT_NOTES_PAGE_SIZE,
  buildPointNoteDistribution,
  buildPointNoteTableRows,
  filterPointNoteRows,
  paginatePointNoteRows,
  sortPointNoteRows,
} from './point-notes-table-model';

const TAG_LABELS: Record<string, string> = {
  double_touch: 'Doppia',
  net_invasion: 'Rete / invasione',
  rotation_fault: 'Fallo di rotazione',
  formation_fault: 'Fallo di formazione',
  funny_gesture: 'Gesto buffo',
  to_review: 'Da rivedere',
};

describe('point-notes-table-model', () => {
  it('includes funny_gesture in POINT_NOTE_TAGS', () => {
    expect(POINT_NOTE_TAGS).toContain('funny_gesture');
  });

  it('builds distribution sorted alphabetically by label and groups tagless notes under otherLabel', () => {
    const notes = [
      createPointNote({ setNumber: 1, rallyNumber: 1, homeScore: 1, awayScore: 0, tags: ['to_review'], text: '' }),
      createPointNote({ setNumber: 1, rallyNumber: 2, homeScore: 2, awayScore: 0, tags: ['funny_gesture'], text: '' }),
      createPointNote({ setNumber: 1, rallyNumber: 3, homeScore: 3, awayScore: 0, tags: ['funny_gesture'], text: '' }),
      createPointNote({ setNumber: 1, rallyNumber: 4, homeScore: 4, awayScore: 0, tags: [], text: 'Solo testo' }),
    ];

    const dist = buildPointNoteDistribution(notes, (tag) => TAG_LABELS[tag] ?? tag, 'Altra nota');
    expect(dist.map((item) => item.label)).toEqual(['Altra nota', 'Da rivedere', 'Gesto buffo']);
    expect(dist.find((item) => item.key === 'funny_gesture')?.count).toBe(2);
    expect(dist.find((item) => item.key === '__other__')?.count).toBe(1);
  });

  it('joins notes with event timestamps, DVW codes, filters, sorts, and paginates in blocks of 5', () => {
    const project = createEmptyMatchProject();
    const homePlayer = project.homeTeam.players[0];
    const touch1: BallTouch = {
      id: 't1',
      setNumber: 1,
      rallyNumber: 1,
      sequenceNumber: 1,
      teamSide: 'home',
      playerId: homePlayer?.id,
      skill: 'serve',
      evaluation: '+',
      recordedAtTime: '18:05:10',
      createdAt: 1000,
    };
    const touch2: BallTouch = {
      id: 't2',
      setNumber: 1,
      rallyNumber: 1,
      sequenceNumber: 2,
      teamSide: 'away',
      skill: 'receive',
      evaluation: '#',
      recordedAtTime: '18:05:12',
      createdAt: 2000,
    };

    project.events = [
      {
        id: 'e1',
        type: 'touch_recorded',
        createdAt: 1000,
        touch: touch1,
      } as MatchEvent,
      {
        id: 'e2',
        type: 'touch_recorded',
        createdAt: 2000,
        touch: touch2,
      } as MatchEvent,
    ];

    const notes = Array.from({ length: 6 }, (_, idx) =>
      createPointNote({
        id: `n-${idx}`,
        touchId: idx === 0 ? 't1' : undefined,
        setNumber: 1,
        rallyNumber: idx + 1,
        homeScore: idx + 1,
        awayScore: 0,
        tags: [idx % 2 === 0 ? 'funny_gesture' : 'double_touch'],
        text: idx === 0 ? 'Esultanza strana' : '',
        createdAt: 10_000 + idx * 1000,
      }),
    );

    project.videoAnalysis = {
      ...project.videoAnalysis!,
      syncPoints: [],
      starredTouchIds: [],
      notes,
    };

    const rows = buildPointNoteTableRows(project, (tag) => TAG_LABELS[tag] ?? tag, 'Altra nota');
    expect(rows).toHaveLength(6);
    expect(rows[0]!.timeLabel).toBe('18:05:10');
    expect(rows[0]!.codes.map((c) => c.touchId)).toEqual(['t1', 't2']);
    expect(rows[0]!.codes[0]!.isTarget).toBe(true);

    const filtered = filterPointNoteRows(rows, 'Esultanza');
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.note.id).toBe('n-0');

    const sortedDesc = sortPointNoteRows(rows, 'score', 'desc');
    expect(sortedDesc[0]!.note.homeScore).toBe(6);

    const page1 = paginatePointNoteRows(rows, 1);
    const page2 = paginatePointNoteRows(rows, 2);
    expect(POINT_NOTES_PAGE_SIZE).toBe(5);
    expect(page1.items).toHaveLength(5);
    expect(page1.totalPages).toBe(2);
    expect(page2.items).toHaveLength(1);
  });

  it('normalizes custom keywords and includes them in distribution and table filtering', () => {
    expect(normalizeCustomKeywordList(['  Esultanza  ', 'esultanza', 'Muro   alto', ''])).toEqual([
      'Esultanza',
      'Muro alto',
    ]);

    const note = createPointNote({
      setNumber: 1,
      rallyNumber: 1,
      homeScore: 1,
      awayScore: 0,
      tags: [],
      customKeywords: ['Muro alto'],
      text: '',
    });

    const dist = buildPointNoteDistribution([note], (tag) => TAG_LABELS[tag] ?? tag, 'Altra nota');
    expect(dist).toEqual([{ key: 'kw:muro alto', label: 'Muro alto', count: 1 }]);
  });
});
